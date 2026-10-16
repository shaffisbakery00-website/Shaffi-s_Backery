-- Shaffi's Backery — initial schema (applied to Supabase via migration `init_menu_schema`)

create extension if not exists pgcrypto;

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dishes (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 600),
  price numeric(10,2) not null check (price >= 0),
  image_path text,
  is_popular boolean not null default false,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dishes_section_idx on public.dishes(section_id);
create index dishes_updated_idx on public.dishes(updated_at desc);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  author_name text not null check (char_length(trim(author_name)) between 2 and 40),
  content text not null check (char_length(trim(content)) between 5 and 500),
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now()
);

create table public.ads (
  id uuid primary key default gen_random_uuid(),
  image_path text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);

create table public.rate_events (
  id bigserial primary key,
  action text not null,
  ip text not null,
  created_at timestamptz not null default now()
);
create index rate_events_idx on public.rate_events(action, ip, created_at);

alter table public.sections enable row level security;
alter table public.dishes enable row level security;
alter table public.reviews enable row level security;
alter table public.ads enable row level security;
alter table public.sessions enable row level security;
alter table public.rate_events enable row level security;

create policy "public read sections" on public.sections for select using (true);
create policy "public read dishes" on public.dishes for select using (true);
create policy "public read reviews" on public.reviews for select using (true);
create policy "public read ads" on public.ads for select using (true);

insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;
