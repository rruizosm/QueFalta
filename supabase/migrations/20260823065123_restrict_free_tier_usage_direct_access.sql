-- Defensa en profundidad para el contador privado. La tabla no está expuesta y
-- tampoco concede privilegios a authenticated, pero esta policy hace explícito
-- que ninguna sesión de cliente puede leerla o escribirla si esos permisos
-- cambiasen en el futuro. Las funciones SECURITY DEFINER y service_role siguen
-- accediendo como propietarios/bypass RLS.

drop policy if exists "free tier usage: no direct client access"
  on private.free_tier_usage;
create policy "free tier usage: no direct client access"
  on private.free_tier_usage
  as restrictive
  for all
  to authenticated
  using (false)
  with check (false);
