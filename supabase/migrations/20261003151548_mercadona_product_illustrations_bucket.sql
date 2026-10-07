-- Recursos ilustrados aprobados para productos Mercadona. La lectura es pública
-- para que la app pueda usar la URL; solo procesos administrativos suben archivos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-illustrations',
  'product-illustrations',
  true,
  3145728,
  array['image/png', 'image/webp']::text[]
)
on conflict (id) do nothing;

-- No se crea política de escritura para anon/authenticated.
