-- Mantiene la función privilegiada fuera del esquema expuesto por PostgREST.
-- La API pública conserva la misma firma, pero pasa a SECURITY INVOKER.
create schema if not exists private;

revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

alter function public.general_purchase_statistics() set schema private;
alter function private.general_purchase_statistics() rename to general_purchase_statistics_data;

revoke all on function private.general_purchase_statistics_data() from public;
revoke all on function private.general_purchase_statistics_data() from anon;
grant execute on function private.general_purchase_statistics_data() to authenticated;

create function public.general_purchase_statistics()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.general_purchase_statistics_data();
$$;

comment on function private.general_purchase_statistics_data() is
  'Implementación privada y privilegiada de los agregados globales; exige auth.uid() y Plus.';

comment on function public.general_purchase_statistics() is
  'Frontera SECURITY INVOKER para consultar estadísticas generales agregadas.';

revoke all on function public.general_purchase_statistics() from public;
revoke all on function public.general_purchase_statistics() from anon;
grant execute on function public.general_purchase_statistics() to authenticated;
