-- Privacidad opcional sin romper las versiones publicadas: los avatares
-- normales siguen en el bucket público `avatars`; los restringidos se mueven
-- a `avatars-private`. El cliente borra la copia pública antes de confirmar
-- que ha activado la preferencia.

alter table public.profiles
  add column if not exists avatar_friends_only boolean not null default false;

comment on column public.profiles.avatar_friends_only is
  'Si es true, la foto de perfil solo puede verla el titular o una amistad aceptada.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars-private', 'avatars-private', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_view_private_avatar(object_name text)
returns boolean
language plpgsql
security invoker
stable
set search_path = pg_catalog, public
as $$
declare
  viewer_id uuid := auth.uid();
  owner_id uuid;
begin
  if viewer_id is null or object_name !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/avatar[.]jpg$' then
    return false;
  end if;
  owner_id := split_part(object_name, '/', 1)::uuid;
  if owner_id = viewer_id then return true; end if;
  return exists (
    select 1 from public.friendships f
    where f.status = 'accepted'
      and ((f.requester_id = viewer_id and f.addressee_id = owner_id)
        or (f.addressee_id = viewer_id and f.requester_id = owner_id))
  );
end;
$$;

revoke execute on function public.can_view_private_avatar(text) from public, anon;
grant execute on function public.can_view_private_avatar(text) to authenticated, service_role;

drop policy if exists "avatars private read" on storage.objects;
create policy "avatars private read"
  on storage.objects for select to authenticated
  using (bucket_id = 'avatars-private' and public.can_view_private_avatar(name));

drop policy if exists "avatars private insert own" on storage.objects;
create policy "avatars private insert own"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars-private'
    and name = (select auth.uid()::text) || '/avatar.jpg');

drop policy if exists "avatars private update own" on storage.objects;
create policy "avatars private update own"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars-private'
    and name = (select auth.uid()::text) || '/avatar.jpg')
  with check (bucket_id = 'avatars-private'
    and name = (select auth.uid()::text) || '/avatar.jpg');

drop policy if exists "avatars private delete own" on storage.objects;
create policy "avatars private delete own"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars-private'
    and name = (select auth.uid()::text) || '/avatar.jpg');

-- Hay dos juegos de policies de escritura públicas en producción. Al ser
-- permisivas se combinan con OR: hay que sustituir AMBOS para impedir que una
-- versión antigua vuelva a subir una foto pública mientras la opción está ON.
drop policy if exists "Users can upload their own avatar" on storage.objects;
drop policy if exists "Users can update their own avatar" on storage.objects;
drop policy if exists "avatars insert own" on storage.objects;
drop policy if exists "avatars update own" on storage.objects;

create policy "avatars insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and not p.avatar_friends_only
    )
  );

create policy "avatars update own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and not p.avatar_friends_only
    )
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and not p.avatar_friends_only
    )
  );
