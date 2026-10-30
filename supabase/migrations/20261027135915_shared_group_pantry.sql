-- Shared stock and shelf layout, independently for pantry/fridge in each group.
create table public.group_pantry (
  group_id uuid not null references public.groups(id) on delete cascade,
  section text not null check (section in ('pantry', 'fridge')),
  layout jsonb not null check (
    jsonb_typeof(layout) = 'object' and layout ?& array['version', 'items', 'shelfCount']
    and layout->>'version' = '1'
    and jsonb_typeof(layout->'items') = 'array'
    and jsonb_typeof(layout->'shelfCount') = 'number'
  ),
  revision integer not null default 1 check (revision > 0),
  primary key (group_id, section)
);
alter table public.group_pantry enable row level security;
revoke all on public.group_pantry from public, anon, authenticated;
grant select, insert on public.group_pantry to authenticated;
grant update (layout, revision) on public.group_pantry to authenticated;
create policy "Members read pantry" on public.group_pantry for select to authenticated
  using ((select public.is_group_member(group_id)));
create policy "Members create pantry" on public.group_pantry for insert to authenticated
  with check ((select public.is_group_member(group_id)));
create policy "Members edit pantry" on public.group_pantry for update to authenticated
  using ((select public.is_group_member(group_id)))
  with check ((select public.is_group_member(group_id)));

-- Compare-and-set: concurrent first writes and updates cannot lose a revision.
-- Invoker preserves RLS; no client can write a group they do not belong to.
create function public.save_group_pantry(p_group_id uuid, p_section text, p_revision integer, p_layout jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare saved integer;
begin
  if auth.uid() is null or not public.is_group_member(p_group_id) then
    raise exception 'Group unavailable' using errcode = '42501';
  end if;
  if p_revision = 0 then
    insert into public.group_pantry (group_id, section, layout)
      values (p_group_id, p_section, p_layout)
      on conflict (group_id, section) do nothing
      returning revision into saved;
  else
    update public.group_pantry set layout = p_layout, revision = revision + 1
      where group_id = p_group_id and section = p_section and revision = p_revision
      returning revision into saved;
  end if;
  return saved;
end;
$$;
revoke all on function public.save_group_pantry(uuid, text, integer, jsonb) from public, anon;
grant execute on function public.save_group_pantry(uuid, text, integer, jsonb) to authenticated;
alter publication supabase_realtime add table public.group_pantry;
