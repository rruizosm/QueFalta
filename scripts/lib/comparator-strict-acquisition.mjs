// CE-200 only. Pure SQL generator, no network, credentials, app RPC or arbitrary SQL.
// Two transactions: durable reservation first; bounded catalogue SELECT + receipt
// second. A failed/uncertain payload leaves a blocking audit job, never a free retry.
import { createHash } from 'node:crypto';
export const ACQUISITION_REF = 'gkffvigcnsesbaihycay';
export const ACQUISITION_STORES = ['carrefour', 'consum', 'mercadona', 'plusfresc'];
const hash = (x) => createHash('sha256').update(x).digest('hex');
const quote = (x) => `'${String(x).replaceAll("'", "''")}'`;
export const FRAME_PATTERN = '(agua|aigua|water|yogu|yogh|iogur|patat|papat)';
const lexicalPredicate = `published IS TRUE AND (display_name ~* '${FRAME_PATTERN}' OR category_name ~* '${FRAME_PATTERN}')`;
// Pre-label census review: bifidus without 'yogur' and Plusfresc category-only
// water/dairy must not disappear from the acquisition frame. Not equivalence.
function framePredicate(store) {
  const extra = store === 'plusfresc' ? " OR category_id IN ('020101','020102') OR category_id LIKE '0404%'" : '';
  return `published IS TRUE AND (display_name ~* '${FRAME_PATTERN}' OR category_name ~* '${FRAME_PATTERN}|b[ií]fidus'${extra})`;
}
const fields = {
  mercadona: 'id,display_name,packaging,category_id,category_name,unit_price,price_per_unit,price_per_unit_unit,published,synced_at,ean,ingredients,nutrition,source_wh,regions,raw',
  carrefour: 'id,display_name,ean,category_id,category_name,category_ids,unit_price,price_format,available,published,synced_at,price_per_unit,price_per_unit_unit,ingredients,allergens,nutrition,conservation,preparation,denomination,origin,detail_synced_at,promo_name,promo_text,promo_start,promo_end,strikethrough_price,regions,regional_prices,raw',
  consum: 'id,display_name,brand,packaging,ean,category_id,category_name,category_ids,unit_price,price_format,price_per_unit,price_per_unit_unit,available,published,synced_at,regions,regional_prices,promo_base_price,offer_zones,raw',
  plusfresc: 'id,display_name,display_name_ca,brand,category_id,category_name,category_ids,unit_price,price_format,price_per_unit,price_per_unit_unit,available,published,description,ingredients,allergens,nutrition,conservation,description_ca,ingredients_ca,allergens_ca,nutrition_ca,detail_synced_at,synced_at,centers,center_prices,promo_name,promo_name_ca,promo_offer_price,promo_base_price,promo_end,offer_centers,raw',
};
export function acquisitionPlan({ kind, store, cursor = '', limit = 100, round = 'initial' }) {
  if (!['taxonomy', 'census', 'profile', 'products', 'supplement', 'fingerprints', 'locations', 'location-fingerprints', 'health'].includes(kind)) throw Error('ce200_kind');
  if (kind !== 'health' && !ACQUISITION_STORES.includes(store)) throw Error('ce200_store');
  if (kind === 'taxonomy' && store === 'mercadona') throw Error('ce200_taxonomy_scope');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw Error('ce200_page');
  if (typeof cursor !== 'string' || cursor.length > 180 || /[\u0000-\u001f$]/.test(cursor)) throw Error('ce200_cursor');
  if (!/^[a-z0-9-]{1,30}$/.test(round)) throw Error('ce200_round');
  const table = `public.${store}_products`;
  const predicate = framePredicate(store);
  let select;
  if (kind === 'taxonomy') {
    select = `SELECT id,name,parent_id,published,synced_at FROM public.${store}_categories
      WHERE id COLLATE "C" > ${quote(cursor)} COLLATE "C" ORDER BY id COLLATE "C" LIMIT ${limit}`;
  } else if (kind === 'census') {
    select = `SELECT category_id,category_name,count(*)::int AS n,
      count(*) FILTER (WHERE (${predicate}))::int AS frame_n
      FROM ${table} p WHERE published IS TRUE
      AND (category_id::text||':'||coalesce(category_name,'')) COLLATE "C" > ${quote(cursor)} COLLATE "C"
      GROUP BY category_id,category_name ORDER BY (category_id::text||':'||coalesce(category_name,'')) COLLATE "C" LIMIT 500`;
  } else if (kind === 'profile') {
    select = `SELECT id,display_name,category_id,category_name,pg_column_size(raw) AS raw_bytes,
      (SELECT jsonb_agg(k) FROM jsonb_object_keys(raw) k) AS raw_keys
      FROM ${table} WHERE (${predicate}) ORDER BY id COLLATE "C" LIMIT ${limit}`;
  } else if (kind === 'products' || kind === 'supplement') {
    select = `SELECT ${fields[store]},md5(to_jsonb(p)::text) AS source_row_md5 FROM ${table} p WHERE (${predicate})
      ${kind === 'supplement' ? `AND NOT (${lexicalPredicate})` : ''}
      AND id COLLATE "C" > ${quote(cursor)} COLLATE "C" ORDER BY id COLLATE "C" LIMIT ${limit}`;
  } else if (kind === 'fingerprints') {
    select = `SELECT id,md5(to_jsonb(p)::text) AS source_row_md5 FROM ${table} p WHERE (${predicate})
      AND id COLLATE "C" > ${quote(cursor)} COLLATE "C" ORDER BY id COLLATE "C" LIMIT ${limit}`;
  } else if (kind === 'locations' || kind === 'location-fingerprints') {
    select = `SELECT ${kind === 'locations' ? 'l.*' : 'l.id'},md5(to_jsonb(l)::text) AS source_row_md5 FROM public.catalog_location_prices l
      WHERE l.store=${quote(store)} AND l.product_id IN (SELECT id FROM ${table} WHERE ${predicate})
      AND l.id COLLATE "C" > ${quote(cursor)} COLLATE "C" ORDER BY l.id COLLATE "C" LIMIT ${limit}`;
  } else {
    select = `SELECT clock_timestamp() AS checked_at,
      (SELECT count(*)::int FROM pg_stat_activity) AS connections,
      (SELECT count(*)::int FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid))>0) AS blocked,
      (SELECT count(*)::int FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND state='active' AND query_start<clock_timestamp()-interval '30 seconds') AS active_older_30s,
      (SELECT to_jsonb(b) FROM comparator_strict.execution_budget b WHERE budget_date=DATE '2026-09-03' AND project_ref='${ACQUISITION_REF}') AS budget,
      (SELECT jsonb_agg(jsonb_build_object('name',conname,'definition',pg_get_constraintdef(oid))) FROM pg_constraint WHERE conrelid='comparator_strict.execution_budget'::regclass) AS constraints,
      (SELECT bool_and(relrowsecurity) FROM pg_class WHERE relnamespace='comparator_strict'::regnamespace AND relkind='r') AS private_rls,
      has_schema_privilege('anon','comparator_strict','USAGE') AS anon_usage,
      has_schema_privilege('authenticated','comparator_strict','USAGE') AS authenticated_usage,
      has_schema_privilege('service_role','comparator_strict','USAGE') AS service_usage`;
  }
  const descriptor = { version: 'ce200-read-v3', kind, store: store ?? null, cursor, limit, round, select };
  const operationHash = hash(JSON.stringify(descriptor));
  const job = `ce1-ce200-${operationHash.slice(0, 28)}`;
  const maxRows = kind === 'census' ? 500 : kind === 'health' ? 1 : limit;
  const maxBytes = ['health','census','profile','fingerprints','location-fingerprints','taxonomy'].includes(kind) ? 131072 : 1048576;
  const reservation = JSON.stringify({ sqlMs: 10000, readRows: maxRows, writeRows: 3, responseBytes: maxBytes });
  const sql = `-- ${job}: ${kind}; CE-BU-002; no app writes.
BEGIN;
SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='500ms';
DO $reserve$
DECLARE job_started timestamptz:=clock_timestamp();
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('comparator_strict:atomic-v1',0))
    OR EXISTS(SELECT 1 FROM comparator_strict.execution_jobs WHERE status IN ('planned','running','halted','unknown'))
    OR EXISTS(SELECT 1 FROM comparator_strict.execution_jobs WHERE job_key='${job}') THEN RAISE EXCEPTION 'ce200_exclusive_or_replay'; END IF;
  IF EXISTS(SELECT 1 FROM pg_stat_activity WHERE cardinality(pg_blocking_pids(pid))>0
    OR (pid<>pg_backend_pid() AND state='active' AND query_start<clock_timestamp()-interval '30 seconds')) THEN RAISE EXCEPTION 'ce200_health_stop'; END IF;
  UPDATE comparator_strict.execution_budget SET
    sql_ms_reserved=sql_ms_reserved+10000,read_rows_reserved=read_rows_reserved+${maxRows},
    bytes_reserved=bytes_reserved+${maxBytes},write_rows_reserved=write_rows_reserved+3,updated_at=clock_timestamp()
    WHERE project_ref='${ACQUISITION_REF}' AND budget_date=DATE '2026-09-03'
      AND approval_reference='CE-200-corpus-v1' AND bytes_limit=134217728 AND read_rows_limit=50000
      AND bytes_reserved+${maxBytes}<=bytes_limit AND read_rows_reserved+${maxRows}<=read_rows_limit AND write_rows_reserved+3<=2000;
  IF NOT FOUND THEN RAISE EXCEPTION 'ce200_budget'; END IF;
  INSERT INTO comparator_strict.execution_jobs(id,project_ref,operation_key,sql_sha256,status,started_at,deadline_at,job_key,operation_hash,budget_date,reservation)
    VALUES(gen_random_uuid(),'${ACQUISITION_REF}','ce200-${kind}','${hash(select)}','running',job_started,job_started+interval '20 minutes','${job}','${operationHash}',DATE '2026-09-03',${quote(reservation)}::jsonb);
END $reserve$;
COMMIT;
BEGIN;
SET LOCAL statement_timeout='5s'; SET LOCAL lock_timeout='500ms';
DO $payload$
DECLARE payload jsonb; data jsonb; started timestamptz:=clock_timestamp();
BEGIN
  IF NOT pg_try_advisory_xact_lock(hashtextextended('comparator_strict:atomic-v1',0))
    OR NOT EXISTS(SELECT 1 FROM comparator_strict.execution_jobs WHERE job_key='${job}' AND status='running' AND operation_hash='${operationHash}' AND deadline_at>clock_timestamp()) THEN RAISE EXCEPTION 'ce200_lease'; END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) INTO data FROM (${select}) q;
  payload:=jsonb_build_object('job_key','${job}','operation_hash','${operationHash}',
    'project_ref','${ACQUISITION_REF}','captured_at',started,'kind',${quote(kind)},'store',${store ? quote(store) : 'null'},
    'cursor',${quote(cursor)},'rows',data,'row_count',jsonb_array_length(data),'elapsed_ms',extract(epoch FROM clock_timestamp()-started)*1000);
  IF jsonb_array_length(data)>${maxRows} OR octet_length(payload::text)>${maxBytes - 8192} THEN RAISE EXCEPTION 'ce200_result_limit'; END IF;
  UPDATE comparator_strict.execution_jobs SET status='succeeded',finished_at=clock_timestamp(),
    receipt=jsonb_build_object('payload_sha256',encode(sha256(convert_to(payload::text,'UTF8')),'hex'),'row_count',jsonb_array_length(data),'payload_bytes',octet_length(payload::text),'elapsed_ms',payload->'elapsed_ms') WHERE job_key='${job}';
  PERFORM set_config('comparator_strict.ce200_response',payload::text,true);
END $payload$;
SELECT current_setting('comparator_strict.ce200_response')::jsonb AS evidence;
COMMIT;`;
  return { ...descriptor, job, operationHash, maxRows, maxBytes, sql };
}
