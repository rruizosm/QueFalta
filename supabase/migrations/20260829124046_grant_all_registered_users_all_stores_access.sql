-- Versión alineada con el historial productivo 20260829124046.
-- Tras el despliegue de QuéFalta 1.3, "Todos" pasa a estar incluido para
-- cualquier cuenta registrada. El DEFAULT mantiene compatibles los clientes
-- 1.3 ya publicados, que todavía leen legacy_all_stores_access para decidir si
-- muestran el selector conjunto.

alter table public.profiles
  alter column legacy_all_stores_access set default true;

update public.profiles
set legacy_all_stores_access = true
where legacy_all_stores_access = false;

comment on column public.profiles.legacy_all_stores_access is
  'Compatibilidad con clientes 1.3: permite usar Todos en Catálogo, Novedades, Ofertas y Cambios de precio a cualquier cuenta registrada.';
