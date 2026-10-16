-- Add a veg / non-veg marker to dishes (defaults to veg so existing rows stay valid).
alter table public.dishes
  add column diet text not null default 'veg'
  check (diet in ('veg', 'non_veg'));
