-- Froiz expone un indicador de novedad en su API pública. Conservarlo permite
-- enseñar novedades reales incluso durante el primer llenado del espejo.
alter table public.froiz_products
  add column if not exists is_new boolean not null default false;

-- Conserva también el indicador de las filas ya sincronizadas: la API viene
-- guardándose completa en raw y no hace falta esperar al siguiente sync diario.
update public.froiz_products
set is_new = coalesce((raw ->> 'is_new')::boolean, false)
  or case jsonb_typeof(raw -> 'novelty')
    when 'boolean' then coalesce((raw ->> 'novelty')::boolean, false)
    when 'string' then coalesce(nullif(btrim(raw ->> 'novelty'), ''), '') <> ''
    else false
  end;

comment on column public.froiz_products.is_new is
  'Indicador explícito de novedad publicado por la API de Froiz.';
