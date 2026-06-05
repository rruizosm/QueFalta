-- Transferencia de administración: permitir que el admin actual de un grupo
-- (groups.created_by) actualice la fila del grupo (incluido cambiar created_by
-- a otro miembro).
--
-- USING comprueba que quien actualiza es el admin actual.
-- WITH CHECK (true) permite que el nuevo created_by sea otro usuario; la app
-- solo ofrece miembros existentes como destino.
--
-- Ejecutar en: Supabase → SQL Editor.

drop policy if exists "groups update: admin" on public.groups;

create policy "groups update: admin"
on public.groups
for update
to authenticated
using (created_by = auth.uid())
with check (true);
