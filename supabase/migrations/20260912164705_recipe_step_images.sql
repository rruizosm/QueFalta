-- Preserve legacy steps as strings; null slots mean no photo for that step.
alter table public.recipes
  add column step_image_paths text[] not null default '{}';

alter table public.recipes
  add constraint recipes_step_image_paths_shape check (
    cardinality(step_image_paths) = 0
    or (
      array_ndims(step_image_paths) = 1
      and array_lower(step_image_paths, 1) = 1
      and cardinality(step_image_paths) = jsonb_array_length(steps)
    )
  );

comment on column public.recipes.step_image_paths is
  'Optional paths in recipe-images, aligned with steps. NULL entries have no photo; empty array supports older clients. Same author RLS and storage policies apply.';
