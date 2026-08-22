-- Icono compartido opcional para identificar visualmente el carrito del grupo.
-- La policy UPDATE existente de groups mantiene la edición limitada al admin.
alter table public.groups
  add column if not exists icon_emoji text;

alter table public.groups
  drop constraint if exists groups_icon_emoji_length;

alter table public.groups
  add constraint groups_icon_emoji_length
  check (icon_emoji is null or char_length(icon_emoji) between 1 and 16);

comment on column public.groups.icon_emoji is
  'Emoji elegido para identificar el grupo y su carrito activo.';
