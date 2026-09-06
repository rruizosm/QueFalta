-- Restaura la segmentación original de «Todos tus supermercados»: las cuentas
-- creadas antes del lanzamiento de QuéFalta 1.3 conservan el acceso heredado;
-- las posteriores necesitan Plus. La migración del 2026-08-29 puso el flag a
-- true globalmente, por lo que hay que reconstruirlo desde profiles.created_at.

alter table public.profiles
  alter column legacy_all_stores_access set default false;

update public.profiles
set legacy_all_stores_access = (
  created_at < timestamptz '2026-08-29T12:38:05Z'
)
where legacy_all_stores_access is distinct from (
  created_at < timestamptz '2026-08-29T12:38:05Z'
);

comment on column public.profiles.legacy_all_stores_access is
  'Permite usar Todos tus supermercados sin Plus únicamente a cuentas creadas antes del lanzamiento de la versión 1.3 (2026-08-29T12:38:05Z).';
