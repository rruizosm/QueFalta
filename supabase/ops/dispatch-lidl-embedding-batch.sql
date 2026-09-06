-- Operación explícita para el backfill Lidl con el pipeline global pausado.
-- Ejecutar un lote y esperar su HTTP 200 antes de repetir. No programar en cron.
begin;
set local lock_timeout = '1s';
set local statement_timeout = '10s';
do $batch$
declare
  payload jsonb;
  endpoint text;
  token text;
  request_id bigint;
begin
  perform 1 from comparator_internal.catalog_embedding_pipeline_control
    where singleton and mode='paused' for update;
  if not found then raise exception 'Requiere pipeline pausado'; end if;
  if exists(select 1 from pgmq.q_catalog_embedding_jobs where message->>'store'='lidl' and vt>now()) then
    raise exception 'Hay un lote Lidl en vuelo';
  end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name='catalog_embed_project_url';
  select decrypted_secret into token from vault.decrypted_secrets where name='catalog_embed_worker_token';
  if endpoint is null or token is null then raise exception 'Faltan secretos del worker'; end if;
  with chosen as (
    select msg_id from pgmq.q_catalog_embedding_jobs
    where message->>'store'='lidl' and vt<=now() and read_ct<5
    order by msg_id limit 100 for update skip locked
  ), claimed as (
    update pgmq.q_catalog_embedding_jobs q
    set read_ct=q.read_ct+1, vt=now()+interval '180 seconds'
    from chosen where chosen.msg_id=q.msg_id returning q.*
  )
  select jsonb_agg(message || jsonb_build_object('msgId',msg_id,'readCount',read_ct) order by msg_id)
    into payload from claimed;
  if payload is null then
    perform set_config('quefalta.lidl_request_id','',true);
    return;
  end if;
  select net.http_post(
    url=>rtrim(endpoint,'/')||'/functions/v1/catalog-embed',
    headers=>jsonb_build_object('Content-Type','application/json','X-Embedding-Worker-Token',token),
    body=>payload, timeout_milliseconds=>60000
  ) into request_id;
  perform set_config('quefalta.lidl_request_id',request_id::text,true);
end
$batch$;
select nullif(current_setting('quefalta.lidl_request_id',true),'')::bigint as request_id;
commit;
