set statement_timeout = '10s';
set lock_timeout = '5s';

alter table public.recipes
  add column servings smallint;

alter table public.recipes
  add constraint recipes_servings_range
  check (servings is null or servings between 1 and 99);

comment on column public.recipes.servings is
  'Number of people the ingredient quantities are intended to serve. Null for legacy recipes.';

grant update (servings) on table public.recipes to authenticated;
