-- Politica explicita de defensa en profundidad para la cola privada. Aunque
-- service_role ignora RLS en Supabase, declarar la politica documenta el unico
-- actor admitido y mantiene limpio el asesor de seguridad.

set lock_timeout = '5s';
set statement_timeout = '30s';

create policy "service role manages Lidl catalog sync queue"
on private.lidl_catalog_sync_queue
for all
to service_role
using (true)
with check (true);
