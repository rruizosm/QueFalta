-- Cierra grupos heredados que conservan miembros pero ninguna cuenta con rol
-- administrativo. Se promociona al miembro más antiguo disponible; no se toca
-- groups.created_by, por lo que el borrado continúa reservado al creador.
with adminless_groups as (
  select gm.group_id
  from public.group_members gm
  group by gm.group_id
  having count(*) filter (where gm.role = 'admin') = 0
), first_members as (
  select distinct on (gm.group_id)
    gm.group_id,
    gm.user_id
  from public.group_members gm
  join adminless_groups ag on ag.group_id = gm.group_id
  order by gm.group_id, gm.joined_at asc nulls last, gm.user_id
)
update public.group_members gm
set role = 'admin'
from first_members fm
where gm.group_id = fm.group_id
  and gm.user_id = fm.user_id
  and gm.role = 'member';
