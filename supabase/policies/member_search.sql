-- Añadir miembros a un grupo buscando por @usuario.
--
-- El admin (owner) puede añadir a otros usuarios, PERO solo si el destinatario
-- es `discoverable = true` (igual que la búsqueda de la UI, que solo devuelve
-- perfiles visibles). Esto evita que un admin malicioso añada a alguien por su
-- UUID sin consentimiento — lo que, además, expondría el perfil de la víctima a
-- todos los miembros del grupo vía la policy "profiles select: co-member".
-- El alta por ENLACE de invitación es independiente (policy "Users can join
-- groups via invite", with check user_id = auth.uid()) y no exige discoverable.
--
-- NOTA: la policy de lectura de perfiles discoverable se movió a
-- policies/profiles_visibility.sql (fuente de verdad única de SELECT en profiles).
--
-- Ejecutar en: Supabase → SQL Editor.

-- Helper SECURITY DEFINER: ¿es `uid` un perfil que se deja encontrar?
-- Bypassa RLS para no depender de qué ve el llamante.
create or replace function public.is_discoverable(uid uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select discoverable from public.profiles where id = uid), false);
$$;

drop policy if exists "group_members insert: admin adds" on public.group_members;
create policy "group_members insert: admin adds"
on public.group_members for insert to authenticated
with check (
  public.is_group_admin(group_id)
  and public.is_discoverable(user_id)
);
