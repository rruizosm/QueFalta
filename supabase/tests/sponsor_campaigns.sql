begin;
insert into public.sponsor_campaigns(slug,sponsor_name,image_path,accessibility_label_es,accessibility_label_ca,destination_ios,enabled,starts_at,ends_at)
values
('__test_active','Test','test/banner.jpg','test','test','https://example.com',true,now()-interval '1 hour',now()+interval '1 hour'),
('__test_disabled','Test','test/banner.jpg','test','test','https://example.com',false,now()-interval '1 hour',null),
('__test_future','Test','test/banner.jpg','test','test','https://example.com',true,now()+interval '1 hour',null),
('__test_expired','Test','test/banner.jpg','test','test','https://example.com',true,now()-interval '2 hours',now()-interval '1 hour');
set local role authenticated;
do $$ begin
  if (select count(*) from public.sponsor_campaigns where slug like '__test_%') <> 1 then
    raise exception 'RLS must return only the active campaign';
  end if;
  begin
    update public.sponsor_campaigns set enabled=false where slug='__test_active';
    raise exception 'Unexpected write permission';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.sponsor_campaigns where slug='__test_active';
    raise exception 'Unexpected delete permission';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.sponsor_campaigns(slug) values ('__test_forbidden');
    raise exception 'Unexpected insert permission';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin
    perform 1 from public.sponsor_campaigns;
    raise exception 'Unexpected anonymous read permission';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
