-- «Todos tus supermercados» pasa a ser exclusivo de QuéFalta Plus. Conservamos
-- la columna para que las builds antiguas sigan leyendo un valor válido, pero
-- retiramos la concesión a todos los perfiles y a todas las altas futuras.

alter table public.profiles
  alter column legacy_all_stores_access set default false;

update public.profiles
set legacy_all_stores_access = false
where legacy_all_stores_access = true;

comment on column public.profiles.legacy_all_stores_access is
  'Compatibilidad con clientes antiguos. Siempre false: Todos tus supermercados requiere QuéFalta Plus.';
