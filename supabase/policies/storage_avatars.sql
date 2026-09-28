-- ─────────────────────────────────────────────────────────────
-- Bucket `avatars` + policies de Storage (scoping por usuario).
-- ─────────────────────────────────────────────────────────────
-- src/api/profile.ts → uploadAvatar() sube a `{userId}/avatar.jpg` con
-- upsert:true y luego usa getPublicUrl(). Sin estas policies, el control de
-- quién puede escribir queda solo en el dashboard (fácil de olvidar): si la
-- policy de escritura no fuerza que la primera carpeta del path == auth.uid(),
-- cualquier usuario autenticado podría SOBREESCRIBIR el avatar de otro o subir
-- ficheros arbitrarios al bucket.
--
-- Modelo: lectura pública, escritura solo en TU carpeta. La migración
-- 20260924143007_private_friend_avatars.sql añade el bucket privado opcional.
-- La comprobación con to_jsonb mantiene este fichero compatible tanto antes
-- como después de añadir avatar_friends_only. Supabase → SQL Editor.

-- ── Bucket público con límites de tamaño y tipo (anti-abuso) ───
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true,
  5242880,                                              -- 5 MB
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update
  set public             = true,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Lectura: pública (bucket público; avatares visibles por URL) ─
drop policy if exists "avatars read" on storage.objects;
create policy "avatars read"
on storage.objects for select
  using (bucket_id = 'avatars');

-- ── Subir: solo a tu propia carpeta {uid}/... ─────────────────
drop policy if exists "avatars insert own" on storage.objects;
create policy "avatars insert own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce((to_jsonb(p)->>'avatar_friends_only')::boolean, false) = false
    )
  );

-- ── Actualizar (upsert sobreescribe → UPDATE): solo lo tuyo ────
drop policy if exists "avatars update own" on storage.objects;
create policy "avatars update own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce((to_jsonb(p)->>'avatar_friends_only')::boolean, false) = false
    )
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and coalesce((to_jsonb(p)->>'avatar_friends_only')::boolean, false) = false
    )
  );

-- ── Borrar: solo lo tuyo ──────────────────────────────────────
drop policy if exists "avatars delete own" on storage.objects;
create policy "avatars delete own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ── Verificación ──────────────────────────────────────────────
--   select policyname, cmd, qual, with_check from pg_policies
--   where schemaname = 'storage' and tablename = 'objects'
--     and policyname like 'avatars%';
