-- Historial de compras: al "finalizar" una lista se archiva aquí un resumen
-- (grupo, total estimado, nº de artículos, fecha y quién la finalizó).
--
-- Ejecutar en: Supabase → SQL Editor.

create table if not exists public.purchases (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid references public.groups(id) on delete cascade,
  completed_by uuid,
  total        numeric not null default 0,
  item_count   int not null default 0,
  completed_at timestamptz not null default now()
);

alter table public.purchases enable row level security;

-- Ver compras de grupos donde eres miembro.
drop policy if exists "purchases select: group members" on public.purchases;
create policy "purchases select: group members"
on public.purchases for select to authenticated
using (public.is_group_member(group_id));

-- Registrar una compra al finalizar (miembro del grupo).
drop policy if exists "purchases insert: group members" on public.purchases;
create policy "purchases insert: group members"
on public.purchases for insert to authenticated
with check (public.is_group_member(group_id) and completed_by = auth.uid());

-- Vaciar el carrito al finalizar: permitir a miembros borrar items de la lista.
-- (Aditiva: si ya existe otra policy DELETE, ambas se combinan con OR.)
drop policy if exists "list_items delete: group members" on public.list_items;
create policy "list_items delete: group members"
on public.list_items for delete to authenticated
using (
  exists (
    select 1 from public.shopping_lists sl
    where sl.id = list_items.list_id and public.is_group_member(sl.group_id)
  )
);
