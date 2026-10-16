-- Pin the search_path on the helper functions so they cannot be hijacked by a
-- caller-controlled path. Every object they touch is already schema-qualified
-- with `public.`, and built-ins live in pg_catalog (always available).

alter function public.fn_stats() set search_path = '';
alter function public.fn_move_section(uuid, text) set search_path = '';
alter function public.fn_reassign_and_delete_section(uuid, uuid) set search_path = '';
alter function public.fn_record_rate_event(text, text, integer, bigint) set search_path = '';
