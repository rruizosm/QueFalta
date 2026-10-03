begin;
-- Uses an existing account only inside this rolled-back transaction. No login or user mutation.
select set_config('request.jwt.claim.sub',(select id::text from auth.users limit 1),true);
insert into public.sponsor_campaigns(id,slug,sponsor_name,image_path,accessibility_label_es,accessibility_label_ca,destination_ios,enabled,starts_at)
values('00000000-0000-4000-8000-000000000010','__metrics_test','Test','test/banner.jpg','test','test','https://example.com',true,now()-interval '1 hour');
set local role authenticated;
do $$
declare v boolean; i integer;
begin
  if auth.uid() is null then raise exception 'Test requires an existing user'; end if;
  v:=public.record_sponsor_banner_event('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000012','impression','ios','1.3.3');
  if v is not true then raise exception 'Valid impression rejected'; end if;
  -- Retry same event, and rerender with different event but same visit.
  perform public.record_sponsor_banner_event('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000012','impression','ios','1.3.3');
  perform public.record_sponsor_banner_event(gen_random_uuid(),'00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000012','impression','ios','1.3.3');
  perform public.record_sponsor_banner_event('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000012','click','ios','1.3.3');
  perform public.record_sponsor_banner_event('00000000-0000-4000-8000-000000000013','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000012','click','ios','1.3.3');
  if public.record_sponsor_banner_event(gen_random_uuid(),'00000000-0000-4000-8000-000000000010',gen_random_uuid(),'click','android','1.3.3') then raise exception 'Unsupported platform accepted'; end if;
  if public.record_sponsor_banner_event(gen_random_uuid(),'00000000-0000-4000-8000-000000000010',gen_random_uuid(),'fake','ios','1.3.3') then raise exception 'Invalid type accepted'; end if;
  begin perform * from public.sponsor_banner_daily_stats; raise exception 'Stats exposed'; exception when insufficient_privilege then null; end;
  begin perform * from sponsor_metrics_private.events; raise exception 'Events exposed'; exception when insufficient_privilege then null; end;
  begin delete from sponsor_metrics_private.events; raise exception 'Delete allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from sponsor_metrics_private.events where campaign_id='00000000-0000-4000-8000-000000000010')<>2 then raise exception 'Dedup failed'; end if;
  if not exists(select 1 from public.sponsor_banner_daily_stats where slug='__metrics_test' and impressions=1 and clicks=1 and ctr_percent=100) then raise exception 'Aggregation failed'; end if;
end $$;
update public.sponsor_campaigns set enabled=false where slug='__metrics_test';
set local role authenticated;
do $$ begin
  if public.record_sponsor_banner_event(gen_random_uuid(),'00000000-0000-4000-8000-000000000010',gen_random_uuid(),'click','ios','1.3.3') then raise exception 'Disabled campaign accepted'; end if;
end $$;
reset role;
update public.sponsor_campaigns set enabled=true,ends_at=now()-interval '1 second' where slug='__metrics_test';
set local role authenticated;
do $$ begin
  if public.record_sponsor_banner_event(gen_random_uuid(),'00000000-0000-4000-8000-000000000010',gen_random_uuid(),'click','ios','1.3.3') then raise exception 'Expired campaign accepted'; end if;
end $$;
reset role;
update public.sponsor_campaigns set ends_at=null where slug='__metrics_test';
-- Test rate limit using 60 synthetic recent rows for this account, all rolled back.
insert into sponsor_metrics_private.events(event_id,campaign_id,visit_id,event_type,platform,app_version,user_id)
select gen_random_uuid(),'00000000-0000-4000-8000-000000000010',gen_random_uuid(),'click','ios','1.3.3',auth.uid() from generate_series(1,60);
set local role authenticated;
do $$ begin
  if public.record_sponsor_banner_event(gen_random_uuid(),'00000000-0000-4000-8000-000000000010',gen_random_uuid(),'click','ios','1.3.3') then raise exception 'Rate limit failed'; end if;
end $$;
set local role anon;
do $$ begin
  begin perform public.record_sponsor_banner_event(gen_random_uuid(),'00000000-0000-4000-8000-000000000010',gen_random_uuid(),'click','ios','1.3.3'); raise exception 'Anonymous RPC allowed'; exception when insufficient_privilege then null; end;
  begin perform * from public.sponsor_banner_daily_stats; raise exception 'Anonymous stats allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
