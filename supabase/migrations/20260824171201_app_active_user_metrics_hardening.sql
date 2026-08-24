-- Hace explícita la denegación de acceso directo y cubre la FK usada al
-- eliminar una cuenta. La única escritura cliente continúa siendo la RPC.

create index app_daily_activity_user_id_idx
  on private.app_daily_activity (user_id);

create policy "No direct client access to app activity"
  on private.app_daily_activity
  for all
  to anon, authenticated
  using (false)
  with check (false);
