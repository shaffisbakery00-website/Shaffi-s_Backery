-- Atomic operations and aggregate stats.
-- These run inside a single statement so concurrent admin actions cannot race,
-- and so the app never needs more than one round trip for multi-step work.

create or replace function public.fn_stats()
returns json
language sql
stable
as $$
  select json_build_object(
    'sections',  (select count(*) from public.sections),
    'dishes',    (select count(*) from public.dishes),
    'available', (select count(*) from public.dishes where is_available),
    'popular',   (select count(*) from public.dishes where is_popular)
  );
$$;

create or replace function public.fn_move_section(p_id uuid, p_direction text)
returns void
language plpgsql
as $$
declare
  ids uuid[];
  pos int;
  n int;
  tmp uuid;
  i int;
begin
  if p_direction not in ('up', 'down') then
    raise exception 'invalid direction';
  end if;

  select array_agg(id order by display_order asc, created_at asc)
    into ids
    from public.sections;

  pos := array_position(ids, p_id);
  if pos is null then
    raise exception 'section not found';
  end if;

  n := array_length(ids, 1);
  if p_direction = 'up' then
    if pos = 1 then return; end if;
    tmp := ids[pos - 1]; ids[pos - 1] := ids[pos]; ids[pos] := tmp;
  else
    if pos = n then return; end if;
    tmp := ids[pos + 1]; ids[pos + 1] := ids[pos]; ids[pos] := tmp;
  end if;

  for i in 1..n loop
    update public.sections set display_order = i, updated_at = now() where id = ids[i];
  end loop;
end;
$$;

create or replace function public.fn_reassign_and_delete_section(p_from uuid, p_to uuid)
returns integer
language plpgsql
as $$
declare
  moved int;
begin
  if p_from = p_to then
    raise exception 'target section must differ';
  end if;
  if not exists (select 1 from public.sections where id = p_to) then
    raise exception 'target section not found';
  end if;

  update public.dishes set section_id = p_to, updated_at = now() where section_id = p_from;
  get diagnostics moved = row_count;

  delete from public.sections where id = p_from;
  return moved;
end;
$$;

create or replace function public.fn_record_rate_event(p_action text, p_ip text, p_limit integer, p_window_ms bigint)
returns boolean
language plpgsql
as $$
declare
  inserted int;
begin
  insert into public.rate_events(action, ip)
  select p_action, p_ip
  where (
    select count(*)
      from public.rate_events
     where action = p_action
       and ip = p_ip
       and created_at > now() - (p_window_ms || ' milliseconds')::interval
  ) < p_limit;

  get diagnostics inserted = row_count;

  -- Opportunistic cleanup keeps the table small without a scheduled job.
  if random() < 0.05 then
    delete from public.rate_events where created_at < now() - interval '2 days';
  end if;

  return inserted > 0;
end;
$$;

revoke execute on function public.fn_stats() from public, anon, authenticated;
revoke execute on function public.fn_move_section(uuid, text) from public, anon, authenticated;
revoke execute on function public.fn_reassign_and_delete_section(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.fn_record_rate_event(text, text, integer, bigint) from public, anon, authenticated;

grant execute on function public.fn_stats() to service_role;
grant execute on function public.fn_move_section(uuid, text) to service_role;
grant execute on function public.fn_reassign_and_delete_section(uuid, uuid) to service_role;
grant execute on function public.fn_record_rate_event(text, text, integer, bigint) to service_role;
