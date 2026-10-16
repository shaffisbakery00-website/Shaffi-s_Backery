-- Dish badges: replace the boolean is_popular with a single badge choice
-- (none / popular / best choice / chef's choice). Existing popular dishes
-- keep their badge. Offers also gain their own heading + description that
-- show on the customer menu.

alter table public.dishes
  add column badge text not null default 'none'
  check (badge in ('none', 'popular', 'best_choice', 'chefs_choice'));

update public.dishes set badge = 'popular' where is_popular;

alter table public.dishes drop column is_popular;

create or replace function public.fn_stats()
returns json
language sql
stable
as $$
  select json_build_object(
    'sections',     (select count(*) from public.sections),
    'dishes',       (select count(*) from public.dishes),
    'available',    (select count(*) from public.dishes where is_available),
    'popular',      (select count(*) from public.dishes where badge = 'popular'),
    'best_choice',  (select count(*) from public.dishes where badge = 'best_choice'),
    'chefs_choice', (select count(*) from public.dishes where badge = 'chefs_choice')
  );
$$;

alter function public.fn_stats() set search_path = '';

revoke execute on function public.fn_stats() from public, anon, authenticated;
grant execute on function public.fn_stats() to service_role;

alter table public.ads
  add column heading text not null default 'From our counter'
    check (char_length(trim(heading)) between 1 and 60),
  add column description text
    check (description is null or char_length(description) <= 160);
