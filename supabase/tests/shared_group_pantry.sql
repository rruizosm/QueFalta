-- Integration smoke test against an existing group with >= 2 members.
-- All writes roll back, including the stock used by this test.
begin;
do $$
declare
  gid uuid;
  first_member uuid;
  second_member uuid;
  outsider uuid;
  result integer;
  inventory jsonb := '{"version":1,"shelfCount":3,"items":[]}';
begin
  select group_id into gid from public.group_members group by group_id having count(*) >= 2 limit 1;
  if gid is null then raise exception 'Test needs a group with two members'; end if;
  select user_id into first_member from public.group_members where group_id = gid order by user_id limit 1;
  select user_id into second_member from public.group_members where group_id = gid and user_id <> first_member limit 1;
  select id into outsider from auth.users where not exists (
    select 1 from public.group_members where group_id = gid and user_id = auth.users.id
  ) limit 1;
  if outsider is null then raise exception 'Test needs a nonmember'; end if;

  -- Delete within this rolled-back transaction so the fixture always starts empty.
  delete from public.group_pantry where group_id = gid;
  perform set_config('request.jwt.claim.sub', first_member::text, true);
  execute 'set local role authenticated';
  result := public.save_group_pantry(gid, 'pantry', 0, inventory);
  if result is distinct from 1 then raise exception 'First member cannot create'; end if;
  result := public.save_group_pantry(gid, 'pantry', 0, inventory);
  if result is not null then raise exception 'Concurrent initialization overwrites stock'; end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', second_member::text, true);
  execute 'set local role authenticated';
  if (select count(*) from public.group_pantry where group_id = gid) <> 1 then raise exception 'Second member cannot read'; end if;
  result := public.save_group_pantry(gid, 'pantry', 1, inventory || '{"shelfCount":4}');
  if result is distinct from 2 then raise exception 'Second member cannot edit'; end if;
  result := public.save_group_pantry(gid, 'pantry', 1, inventory);
  if result is not null then raise exception 'Stale revision overwrites stock'; end if;
  result := public.save_group_pantry(gid, 'fridge', 0, inventory);
  if result is distinct from 1 then raise exception 'Fridge not independent'; end if;
  if (select layout->>'shelfCount' from public.group_pantry where group_id = gid and section='pantry') <> '4' then
    raise exception 'Fridge changed pantry';
  end if;
  execute 'reset role';

  perform set_config('request.jwt.claim.sub', outsider::text, true);
  execute 'set local role authenticated';
  if exists(select 1 from public.group_pantry where group_id = gid) then raise exception 'Nonmember can read'; end if;
  begin
    perform public.save_group_pantry(gid, 'pantry', 2, inventory);
    raise exception 'Nonmember can write';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.group_pantry(group_id, section, layout) values (gid, 'pantry', inventory);
    raise exception 'Nonmember can bypass RPC';
  exception when insufficient_privilege then null;
  end;
  execute 'reset role';
  if has_table_privilege('anon', 'public.group_pantry', 'SELECT') then raise exception 'Anonymous read privilege'; end if;
  if has_function_privilege('anon', 'public.save_group_pantry(uuid,text,integer,jsonb)', 'EXECUTE') then
    raise exception 'Anonymous RPC privilege';
  end if;
  if has_column_privilege('authenticated', 'public.group_pantry', 'group_id', 'UPDATE') then
    raise exception 'Group ownership can be changed';
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='group_pantry') then
    raise exception 'Missing realtime publication';
  end if;
end $$;
rollback;
select 'Shared pantry: member read/write, CAS, section isolation, RLS and grants passed (writes rolled back)' as result;
