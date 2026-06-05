-- Invitaciones por enlace: permitir que un usuario se una a sí mismo a un grupo.
--
-- Sin esta policy, joinGroup() falla con 42501 (RLS) al tocar un enlace de
-- invitación, y luego fetchGroupDetail devuelve 0 filas (PGRST116) porque el
-- usuario no llega a ser miembro.
--
-- Modelo de seguridad: el UUID del grupo es la "invitación". Conocerlo (porque
-- te han compartido el enlace) es lo que te permite unirte. Los UUID no son
-- adivinables, así que es aceptable para invitaciones por enlace.
--
-- Ejecutar en: Supabase → SQL Editor.

drop policy if exists "Users can join groups via invite" on public.group_members;

create policy "Users can join groups via invite"
on public.group_members
for insert
to authenticated
with check (user_id = auth.uid());
