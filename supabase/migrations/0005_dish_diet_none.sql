-- Allow a third "none" diet option for items (e.g. drinks) that are neither veg nor non-veg.
alter table public.dishes drop constraint if exists dishes_diet_check;
alter table public.dishes
  add constraint dishes_diet_check check (diet in ('veg', 'non_veg', 'none'));
