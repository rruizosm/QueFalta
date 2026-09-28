-- Retirada solicitada del experimento de búsqueda. No borra catálogos fuente.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $remove$
declare r record; targets text; before_hash text; after_hash text;
begin
  select md5(string_agg(p.oid::text||pg_get_functiondef(p.oid),'' order by p.oid))
  into before_hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind='f'
    and not(p.proname like '%search%v2%' or p.proname in('catalog_search_engine_variant','catalog_search_app_variant'));

  -- Refuse to remove a trigger attached to a source catalogue.
  for r in select t.tgname,n.nspname,c.relname from pg_trigger t
    join pg_proc p on p.oid=t.tgfoid join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace where p.proname like '%search%v2%'
  loop
    if r.nspname <> 'private' or r.relname not like 'search_v2_%' then
      raise exception 'Unexpected source trigger: %.%',r.nspname,r.relname;
    end if;
    execute format('drop trigger %I on %I.%I',r.tgname,r.nspname,r.relname);
  end loop;

  for r in select p.polname,n.nspname,c.relname from pg_policy p
    join pg_class c on c.oid=p.polrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='private' and (c.relname like 'search_v2_%' or c.relname='catalog_search_testers')
  loop execute format('drop policy %I on %I.%I',r.polname,r.nspname,r.relname); end loop;
  if to_regclass('private.search_v2_source_capabilities') is not null then
    alter table private.search_v2_source_capabilities drop constraint if exists search_v2_territorial_languages;
  end if;

  select string_agg(format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),',')
  into targets from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private')
    and (p.proname like '%search%v2%' or p.proname in('catalog_search_engine_variant','catalog_search_app_variant'));
  -- RESTRICT: unexpected dependencies abort the entire transaction.
  if targets is not null then execute 'drop function '||targets||' restrict'; end if;

  select string_agg(format('%I.%I',n.nspname,c.relname),',')
  into targets from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='private' and c.relkind='r'
    and (c.relname like 'search_v2_%' or c.relname='catalog_search_testers');
  if targets is not null then execute 'drop table '||targets||' restrict'; end if;

  if exists(select 1 from pg_roles where rolname='catalog_search_v2_index_reader') then
    if exists(select 1 from pg_shdepend d join pg_roles role_entry on role_entry.oid=d.refobjid
      where role_entry.rolname='catalog_search_v2_index_reader' and d.deptype='o') then
      raise exception 'Reader still owns objects; refusing DROP OWNED';
    end if;
    -- No owned objects remain: this revokes only the deleted reader's grants.
    execute 'drop owned by catalog_search_v2_index_reader restrict';
    execute 'drop role catalog_search_v2_index_reader';
  end if;

  select md5(string_agg(p.oid::text||pg_get_functiondef(p.oid),'' order by p.oid))
  into after_hash from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private') and p.prokind='f'
    and not(p.proname like '%search%v2%' or p.proname in('catalog_search_engine_variant','catalog_search_app_variant'));
  if after_hash is distinct from before_hash then raise exception 'Unrelated functions changed'; end if;
end $remove$;
notify pgrst, 'reload schema';
commit;
