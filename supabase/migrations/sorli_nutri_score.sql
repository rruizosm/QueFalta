-- Separates Nutri-Score from the raw JSON so catalog listings stay lightweight.
alter table public.sorli_products
  add column if not exists nutri_score text;

alter table public.sorli_products
  drop constraint if exists sorli_products_nutri_score_check;

alter table public.sorli_products
  add constraint sorli_products_nutri_score_check
  check (nutri_score is null or nutri_score in ('A', 'B', 'C', 'D', 'E'));

-- Backfill the existing catalog. The weekly sync maintains this value afterwards.
update public.sorli_products
set nutri_score = upper(coalesce(raw->>'nutriScore', raw->>'nutriscore', raw->>'nutri_score'))
where nutri_score is null
  and upper(coalesce(raw->>'nutriScore', raw->>'nutriscore', raw->>'nutri_score')) in ('A', 'B', 'C', 'D', 'E');

create index if not exists sorli_products_nutri_score_idx
  on public.sorli_products (nutri_score)
  where nutri_score is not null;
