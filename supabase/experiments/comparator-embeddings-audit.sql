-- Auditoría de solo lectura para la fase 1 del comparador con embeddings.
-- Ejecutar contra producción antes y después de cualquier cambio de matching.
-- No crea objetos ni modifica datos.

-- Extensiones realmente instaladas.
select e.extname, e.extversion, n.nspname as schema_name
from pg_extension e
join pg_namespace n on n.oid = e.extnamespace
where e.extname in ('vector', 'pg_trgm', 'pgmq', 'pg_cron', 'pg_net')
order by e.extname;

-- Firma, seguridad y permisos de las funciones del comparador.
select
  p.oid::regprocedure::text as signature,
  p.prosecdef as security_definer,
  p.provolatile,
  p.proconfig,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'similar_products',
    'catalog_clean_name',
    'catalog_family_match'
  )
order by p.proname, p.oid::regprocedure::text;

-- Objetos previstos por la arquitectura de embeddings.
select table_schema, table_name
from information_schema.tables
where table_name in (
  'catalog_product_embeddings',
  'catalog_product_matches'
)
order by table_schema, table_name;

-- Prueba funcional reproducible del baseline remoto.
select *
from public.similar_products(
  'Leche entera Hacendado 1 L',
  array[
    'mercadona', 'esclat', 'carrefour', 'bonarea', 'consum', 'dia',
    'sorli', 'eroski', 'caprabo', 'condis', 'ametller', 'aldi',
    'hiperdino', 'alcampo', 'plusfresc'
  ]::text[]
);
