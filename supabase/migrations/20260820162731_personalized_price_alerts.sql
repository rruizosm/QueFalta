-- QuéFalta Plus: alertas personalizadas de bajadas de precio y nuevas ofertas.
--
-- Arquitectura:
--   1. price_alert_rules: reglas del usuario, protegidas por RLS.
--   2. price_alerts_internal.catalog_products: proyección unificada para preview.
--   3. price_alerts_internal.catalog_events: eventos duraderos de cada sync.
--   4. price_alert_deliveries: outbox deduplicada (regla + evento).
--   5. process-price-alerts: Edge Function que reclama la outbox, agrupa y envía.
--
-- Esta migración NO programa el Cron: el job necesita secretos de Vault propios
-- de cada proyecto. Ver supabase/ops/schedule_price_alerts.sql.

set lock_timeout = '5s';
set statement_timeout = '120s';

create schema if not exists price_alerts_internal;
revoke all on schema price_alerts_internal from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Reglas y entregas visibles por su propietario
-- ---------------------------------------------------------------------------

create table if not exists public.price_alert_rules (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.profiles(id) on delete cascade,
  kind               text not null check (kind in ('exact', 'keyword')),
  emoji              text not null default '🛒'
                       check (char_length(emoji) between 1 and 16),
  label              text not null check (char_length(btrim(label)) between 1 and 100),
  query              text,
  query_norm         text,
  exact_store        text,
  exact_product_id   text,
  stores             text[] not null default '{}',
  location_ids       jsonb not null default '{}'::jsonb,
  notify_price_drop  boolean not null default true,
  notify_new_offer   boolean not null default true,
  min_drop_pct       numeric(5,1) not null default 5
                       check (min_drop_pct between 0 and 100),
  active             boolean not null default true,
  active_since       timestamptz not null default now(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (notify_price_drop or notify_new_offer),
  check (
    (kind = 'exact' and exact_store is not null and exact_product_id is not null)
    or
    (kind = 'keyword' and query is not null and char_length(btrim(query)) >= 2
      and cardinality(stores) > 0)
  )
);

create index if not exists price_alert_rules_user_updated_idx
  on public.price_alert_rules (user_id, updated_at desc);
create index if not exists price_alert_rules_active_stores_idx
  on public.price_alert_rules using gin (stores)
  where active;
create unique index if not exists price_alert_rules_exact_unique_idx
  on public.price_alert_rules (user_id, exact_store, exact_product_id)
  where kind = 'exact';

create table if not exists public.price_alert_deliveries (
  id              uuid primary key default gen_random_uuid(),
  rule_id         uuid not null references public.price_alert_rules(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  event_id        uuid not null,
  status          text not null default 'pending'
                    check (status in ('pending', 'processing', 'sent', 'failed', 'paused')),
  attempt_count   integer not null default 0 check (attempt_count >= 0),
  next_retry_at   timestamptz,
  claimed_at      timestamptz,
  sent_at         timestamptz,
  notification_id uuid references public.notifications(id) on delete set null,
  last_error      text,
  created_at      timestamptz not null default now(),
  unique (rule_id, event_id)
);

create index if not exists price_alert_deliveries_user_created_idx
  on public.price_alert_deliveries (user_id, created_at desc);
create index if not exists price_alert_deliveries_ready_idx
  on public.price_alert_deliveries (status, next_retry_at, created_at)
  where status in ('pending', 'failed', 'processing');
create index if not exists price_alert_deliveries_notification_idx
  on public.price_alert_deliveries (notification_id)
  where notification_id is not null;

alter table public.price_alert_rules enable row level security;
alter table public.price_alert_deliveries enable row level security;

drop policy if exists "price alerts select: mine" on public.price_alert_rules;
create policy "price alerts select: mine"
  on public.price_alert_rules for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "price alerts insert: mine" on public.price_alert_rules;
create policy "price alerts insert: mine"
  on public.price_alert_rules for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "price alerts update: mine" on public.price_alert_rules;
create policy "price alerts update: mine"
  on public.price_alert_rules for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "price alerts delete: mine" on public.price_alert_rules;
create policy "price alerts delete: mine"
  on public.price_alert_rules for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "price alert deliveries select: mine" on public.price_alert_deliveries;
create policy "price alert deliveries select: mine"
  on public.price_alert_deliveries for select to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.price_alert_rules to authenticated;
grant select on public.price_alert_deliveries to authenticated;
grant all on public.price_alert_rules, public.price_alert_deliveries to service_role;

-- ---------------------------------------------------------------------------
-- Proyección unificada y eventos duraderos (sin acceso desde Data API)
-- ---------------------------------------------------------------------------

create table if not exists price_alerts_internal.catalog_products (
  store             text not null,
  product_id        text not null,
  display_name      text not null,
  display_name_norm text not null,
  thumbnail         text,
  category_name     text,
  unit_price        numeric,
  promo_name        text,
  promo_price       numeric,
  published         boolean not null default true,
  regions           text[],
  centers           text[],
  updated_at        timestamptz not null default now(),
  primary key (store, product_id)
);

create index if not exists price_alert_catalog_store_published_idx
  on price_alerts_internal.catalog_products (store, published, product_id);
create index if not exists price_alert_catalog_name_trgm_idx
  on price_alerts_internal.catalog_products using gin (display_name_norm gin_trgm_ops)
  where published;

create table if not exists price_alerts_internal.catalog_events (
  id                uuid primary key default gen_random_uuid(),
  event_fingerprint text not null unique,
  batch_key         text not null,
  event_type        text not null check (event_type in ('price_drop', 'new_offer')),
  store             text not null,
  product_id        text not null,
  display_name      text not null,
  display_name_norm text not null,
  thumbnail         text,
  category_name     text,
  previous_price    numeric,
  current_price     numeric,
  price_delta_pct   numeric(7,2),
  promo_name        text,
  promo_price       numeric,
  location_id       text,
  locations         text[],
  regions           text[],
  detected_at       timestamptz not null default now()
);

-- Un lote de una regla solo puede originar una entrada de bandeja. La Edge
-- Function accede a esta tabla exclusivamente mediante una RPC transaccional.
create table if not exists price_alerts_internal.notification_batches (
  rule_id         uuid not null references public.price_alert_rules(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  batch_key       text not null,
  notification_id uuid references public.notifications(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (rule_id, batch_key)
);

create index if not exists price_alert_notification_batches_user_idx
  on price_alerts_internal.notification_batches (user_id);
create index if not exists price_alert_notification_batches_notification_idx
  on price_alerts_internal.notification_batches (notification_id)
  where notification_id is not null;

create index if not exists price_alert_events_detected_idx
  on price_alerts_internal.catalog_events (detected_at, id);
create index if not exists price_alert_events_store_type_idx
  on price_alerts_internal.catalog_events (store, event_type, detected_at desc);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'price_alert_deliveries_event_id_fkey'
      and conrelid = 'public.price_alert_deliveries'::regclass
  ) then
    alter table public.price_alert_deliveries
      add constraint price_alert_deliveries_event_id_fkey
      foreign key (event_id) references price_alerts_internal.catalog_events(id)
      on delete cascade;
  end if;
end $$;
create index if not exists price_alert_deliveries_event_idx
  on public.price_alert_deliveries (event_id);

revoke all on all tables in schema price_alerts_internal from public, anon, authenticated;
grant usage on schema price_alerts_internal to service_role;
grant all on all tables in schema price_alerts_internal to service_role;

-- ---------------------------------------------------------------------------
-- Helpers internos y enforcement Plus
-- ---------------------------------------------------------------------------

create or replace function price_alerts_internal.store_for_table(p_table text)
returns text language sql immutable parallel safe
set search_path = ''
as $$
  select case p_table
    when 'mercadona_products' then 'mercadona'
    when 'bonpreu_products' then 'esclat'
    when 'carrefour_products' then 'carrefour'
    when 'bonarea_products' then 'bonarea'
    when 'consum_products' then 'consum'
    when 'dia_products' then 'dia'
    when 'sorli_products' then 'sorli'
    when 'eroski_products' then 'eroski'
    when 'caprabo_products' then 'caprabo'
    when 'condis_products' then 'condis'
    when 'ametller_products' then 'ametller'
    when 'aldi_products' then 'aldi'
    when 'hiperdino_products' then 'hiperdino'
    when 'alcampo_products' then 'alcampo'
    when 'plusfresc_products' then 'plusfresc'
    when 'gadis_products' then 'gadis'
    when 'froiz_products' then 'froiz'
    when 'ahorramas_products' then 'ahorramas'
  end
$$;

create or replace function price_alerts_internal.text_array(p_row jsonb, p_key text)
returns text[] language sql immutable parallel safe
set search_path = ''
as $$
  select case when jsonb_typeof(p_row -> p_key) = 'array'
    then coalesce(array(select jsonb_array_elements_text(p_row -> p_key)), '{}'::text[])
    else null end
$$;

create or replace function price_alerts_internal.offer_name(p_row jsonb)
returns text language sql stable parallel safe
set search_path = ''
as $$
  select case
    when nullif(p_row ->> 'promo_start', '') is not null
      and (p_row ->> 'promo_start')::date > current_date then null
    when nullif(p_row ->> 'promo_end', '') is not null
      and (p_row ->> 'promo_end')::date < current_date then null
    else coalesce(
      nullif(btrim(p_row ->> 'promo_name'), ''),
      case when nullif(p_row ->> 'strikethrough_price', '') is not null then 'Precio rebajado' end,
      case when nullif(p_row ->> 'promo_offer_price', '') is not null then 'Oferta' end,
      case when jsonb_typeof(p_row -> 'offer_zones') = 'array'
        and jsonb_array_length(p_row -> 'offer_zones') > 0 then 'Oferta' end
    )
  end
$$;

create or replace function price_alerts_internal.offer_price(p_row jsonb)
returns numeric language plpgsql immutable parallel safe
set search_path = ''
as $$
declare v text;
begin
  v := coalesce(nullif(p_row ->> 'promo_price', ''), nullif(p_row ->> 'promo_offer_price', ''));
  return case when v is null then null else v::numeric end;
exception when invalid_text_representation then
  return null;
end
$$;

create or replace function price_alerts_internal.normalize_rule()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare caller uuid := (select auth.uid());
begin
  if caller is not null then
    new.user_id := caller;
    if new.active and not public.is_premium(caller) then
      raise exception 'plus_required_for_price_alerts';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.active_since := now();
  elsif new.active and not old.active then
    new.active_since := now();
  else
    new.active_since := coalesce(old.active_since, old.created_at);
  end if;

  new.label := btrim(new.label);
  new.query := nullif(regexp_replace(btrim(coalesce(new.query, '')), '\s+', ' ', 'g'), '');
  new.query_norm := case when new.query is null then null
    else lower(public.f_unaccent(new.query)) end;
  new.exact_store := nullif(btrim(coalesce(new.exact_store, '')), '');
  new.exact_product_id := nullif(btrim(coalesce(new.exact_product_id, '')), '');
  new.stores := array(
    select distinct s from unnest(coalesce(new.stores, '{}'::text[])) s
    where s = any(array[
      'mercadona','esclat','carrefour','bonarea','consum','dia','sorli','eroski',
      'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc','gadis',
      'froiz','ahorramas'
    ]) order by s
  );
  new.location_ids := coalesce(new.location_ids, '{}'::jsonb);
  if jsonb_typeof(new.location_ids) <> 'object' then
    new.location_ids := '{}'::jsonb;
  end if;
  if new.kind = 'exact' then
    if new.exact_store is null or not (new.exact_store = any(array[
      'mercadona','esclat','carrefour','bonarea','consum','dia','sorli','eroski',
      'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc','gadis',
      'froiz','ahorramas'
    ])) then
      raise exception 'invalid_alert_store';
    end if;
    new.stores := array[new.exact_store];
    new.query := null;
    new.query_norm := null;
  else
    new.exact_store := null;
    new.exact_product_id := null;
  end if;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists normalize_price_alert_rule on public.price_alert_rules;
create trigger normalize_price_alert_rule
  before insert or update on public.price_alert_rules
  for each row execute function price_alerts_internal.normalize_rule();

revoke execute on all functions in schema price_alerts_internal from public, anon, authenticated;
grant execute on all functions in schema price_alerts_internal to service_role;

-- ---------------------------------------------------------------------------
-- Captura común instalada sobre los 18 espejos
-- ---------------------------------------------------------------------------

create or replace function price_alerts_internal.capture_catalog_change()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  store_key text := price_alerts_internal.store_for_table(tg_table_name);
  old_row jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  new_row jsonb := to_jsonb(new);
  product_name text := coalesce(nullif(new_row ->> 'display_name', ''), new_row ->> 'id');
  product_name_norm text;
  old_price numeric;
  new_price numeric;
  old_offer text;
  new_offer text;
  current_promo_price numeric;
  sync_time timestamptz;
  event_batch text;
  delta numeric;
begin
  if store_key is null or product_name is null then return new; end if;
  product_name_norm := lower(public.f_unaccent(product_name));
  new_price := nullif(new_row ->> 'unit_price', '')::numeric;
  new_offer := price_alerts_internal.offer_name(new_row);
  current_promo_price := price_alerts_internal.offer_price(new_row);
  sync_time := coalesce(nullif(new_row ->> 'synced_at', '')::timestamptz, now());
  event_batch := store_key || ':' || to_char(
    sync_time at time zone 'UTC', 'YYYYMMDD"T"HH24MISS.US'
  );

  insert into price_alerts_internal.catalog_products (
    store, product_id, display_name, display_name_norm, thumbnail, category_name,
    unit_price, promo_name, promo_price, published, regions, centers, updated_at
  ) values (
    store_key, new_row ->> 'id', product_name, product_name_norm,
    nullif(new_row ->> 'thumbnail', ''), nullif(new_row ->> 'category_name', ''),
    new_price, new_offer, current_promo_price,
    coalesce(nullif(new_row ->> 'published', '')::boolean, true),
    price_alerts_internal.text_array(new_row, 'regions'),
    price_alerts_internal.text_array(new_row, 'centers'), sync_time
  )
  on conflict (store, product_id) do update set
    display_name = excluded.display_name,
    display_name_norm = excluded.display_name_norm,
    thumbnail = excluded.thumbnail,
    category_name = excluded.category_name,
    unit_price = excluded.unit_price,
    promo_name = excluded.promo_name,
    promo_price = excluded.promo_price,
    published = excluded.published,
    regions = excluded.regions,
    centers = excluded.centers,
    updated_at = excluded.updated_at;

  if tg_op <> 'UPDATE' then return new; end if;

  old_price := nullif(old_row ->> 'unit_price', '')::numeric;
  if old_price is not null and old_price > 0 and new_price is not null and new_price < old_price then
    delta := round((new_price - old_price) / old_price * 100, 2);
    insert into price_alerts_internal.catalog_events (
      event_fingerprint, batch_key, event_type, store, product_id, display_name,
      display_name_norm, thumbnail, category_name, previous_price, current_price,
      price_delta_pct, promo_name, promo_price, regions, detected_at
    ) values (
      md5(concat_ws('|', store_key, new_row ->> 'id', 'price_drop', event_batch, old_price, new_price)),
      event_batch, 'price_drop', store_key, new_row ->> 'id', product_name,
      product_name_norm, nullif(new_row ->> 'thumbnail', ''),
      nullif(new_row ->> 'category_name', ''), old_price, new_price, delta,
      new_offer, current_promo_price, price_alerts_internal.text_array(new_row, 'regions'), sync_time
    ) on conflict (event_fingerprint) do nothing;
  end if;

  old_offer := price_alerts_internal.offer_name(old_row);
  if new_offer is not null
     and (old_offer is null or concat_ws('|', old_offer, price_alerts_internal.offer_price(old_row),
          old_row -> 'offer_zones', old_row -> 'offer_centers', old_row -> 'offer_regions')
       is distinct from concat_ws('|', new_offer, current_promo_price,
          new_row -> 'offer_zones', new_row -> 'offer_centers', new_row -> 'offer_regions')) then
    insert into price_alerts_internal.catalog_events (
      event_fingerprint, batch_key, event_type, store, product_id, display_name,
      display_name_norm, thumbnail, category_name, current_price, promo_name,
      promo_price, locations, regions, detected_at
    ) values (
      md5(concat_ws('|', store_key, new_row ->> 'id', 'new_offer', event_batch,
        new_offer, current_promo_price, new_row -> 'offer_zones',
        new_row -> 'offer_centers', new_row -> 'offer_regions')),
      event_batch, 'new_offer', store_key, new_row ->> 'id', product_name,
      product_name_norm, nullif(new_row ->> 'thumbnail', ''),
      nullif(new_row ->> 'category_name', ''), new_price, new_offer,
      current_promo_price,
      coalesce(
        price_alerts_internal.text_array(new_row, 'offer_zones'),
        price_alerts_internal.text_array(new_row, 'offer_centers')
      ),
      coalesce(
        price_alerts_internal.text_array(new_row, 'offer_regions'),
        price_alerts_internal.text_array(new_row, 'regions')
      ), sync_time
    ) on conflict (event_fingerprint) do nothing;
  end if;
  return new;
exception when invalid_text_representation then
  -- Un dato defectuoso del retailer nunca debe abortar el sync completo.
  return new;
end
$$;

-- El catálogo inicial supera los 200.000 productos. Se expone un backfill
-- acotado por tabla para poder ejecutarlo y reintentarlo por supermercado sin
-- mantener una única transacción larga ni generar alertas históricas.
create or replace function price_alerts_internal.backfill_catalog(p_table text)
returns bigint language plpgsql security definer
set search_path = ''
as $$
declare
  store_key text;
  affected bigint;
begin
  if not (p_table = any(array[
    'mercadona_products','bonpreu_products','carrefour_products','bonarea_products',
    'consum_products','dia_products','sorli_products','eroski_products','caprabo_products',
    'condis_products','ametller_products','aldi_products','hiperdino_products',
    'alcampo_products','plusfresc_products','gadis_products','froiz_products','ahorramas_products'
  ])) or to_regclass('public.' || p_table) is null then
    raise exception 'invalid_price_alert_catalog_table';
  end if;

  store_key := price_alerts_internal.store_for_table(p_table);
  execute format($sql$
    insert into price_alerts_internal.catalog_products (
      store, product_id, display_name, display_name_norm, thumbnail, category_name,
      unit_price, promo_name, promo_price, published, regions, centers, updated_at
    )
    select %L, j->>'id', coalesce(nullif(j->>'display_name',''), j->>'id'),
      lower(public.f_unaccent(coalesce(nullif(j->>'display_name',''), j->>'id'))),
      nullif(j->>'thumbnail',''), nullif(j->>'category_name',''),
      nullif(j->>'unit_price','')::numeric,
      price_alerts_internal.offer_name(j), price_alerts_internal.offer_price(j),
      coalesce(nullif(j->>'published','')::boolean, true),
      price_alerts_internal.text_array(j, 'regions'),
      price_alerts_internal.text_array(j, 'centers'),
      coalesce(nullif(j->>'synced_at','')::timestamptz, now())
    from (select to_jsonb(p) j from public.%I p) source
    where j->>'id' is not null
    on conflict (store, product_id) do update set
      display_name=excluded.display_name, display_name_norm=excluded.display_name_norm,
      thumbnail=excluded.thumbnail, category_name=excluded.category_name,
      unit_price=excluded.unit_price, promo_name=excluded.promo_name,
      promo_price=excluded.promo_price, published=excluded.published,
      regions=excluded.regions, centers=excluded.centers, updated_at=excluded.updated_at
  $sql$, store_key, p_table);
  get diagnostics affected = row_count;
  return affected;
end
$$;

-- Los triggers se instalan sin esperar al backfill. Cada sync posterior mantiene
-- la proyección al día aunque un backfill concreto tenga que reintentarse.
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'mercadona_products','bonpreu_products','carrefour_products','bonarea_products',
    'consum_products','dia_products','sorli_products','eroski_products','caprabo_products',
    'condis_products','ametller_products','aldi_products','hiperdino_products',
    'alcampo_products','plusfresc_products','gadis_products','froiz_products','ahorramas_products'
  ] loop
    if to_regclass('public.' || tbl) is null then continue; end if;
    execute format('drop trigger if exists capture_price_alert_change on public.%I', tbl);
    execute format(
      'create trigger capture_price_alert_change after insert or update on public.%I '
      'for each row execute function price_alerts_internal.capture_catalog_change()', tbl
    );
  end loop;
end $$;

-- Los eventos de precio zonal existentes también alimentan el sistema. No se
-- recrean ofertas zonales: esas las captura la actualización del espejo.
create or replace function price_alerts_internal.capture_location_price_change()
returns trigger language plpgsql security definer
set search_path = ''
as $$
declare
  p price_alerts_internal.catalog_products%rowtype;
  sync_time timestamptz;
  batch text;
begin
  if new.price_delta_pct >= 0 then return new; end if;
  select * into p from price_alerts_internal.catalog_products
    where store = new.store and product_id = new.product_id;
  if not found then return new; end if;
  select lp.synced_at into sync_time
  from public.catalog_location_prices lp
  where lp.store = new.store and lp.product_id = new.product_id
    and lp.location_id = new.location_id;
  batch := new.store || ':' || to_char(
    coalesce(sync_time, new.changed_at) at time zone 'UTC', 'YYYYMMDD"T"HH24MISS.US'
  );
  insert into price_alerts_internal.catalog_events (
    event_fingerprint, batch_key, event_type, store, product_id, display_name,
    display_name_norm, thumbnail, category_name, previous_price, current_price,
    price_delta_pct, promo_name, promo_price, location_id, regions, detected_at
  ) values (
    md5(concat_ws('|', new.store, new.product_id, 'price_drop', new.location_id,
      new.changed_at, new.prev_unit_price, new.new_unit_price)),
    batch, 'price_drop', new.store, new.product_id, p.display_name,
    p.display_name_norm, p.thumbnail, p.category_name, new.prev_unit_price,
    new.new_unit_price, new.price_delta_pct, p.promo_name, p.promo_price,
    new.location_id, p.regions, new.changed_at
  ) on conflict (event_fingerprint) do nothing;
  return new;
end
$$;

drop trigger if exists capture_price_alert_location_change on public.catalog_location_price_changes;
create trigger capture_price_alert_location_change
  after insert on public.catalog_location_price_changes
  for each row execute function price_alerts_internal.capture_location_price_change();

-- ---------------------------------------------------------------------------
-- RPC de vista previa (cliente) y reclamación de outbox (solo service_role)
-- ---------------------------------------------------------------------------

create or replace function price_alerts_internal.region_name(p_region text)
returns text language sql immutable parallel safe
set search_path = ''
as $$
  select case p_region
    when 'ES-CT' then 'Catalunya' when 'ES-VC' then 'Comunitat Valenciana'
    when 'ES-IB' then 'Illes Balears' when 'ES-PV' then 'Euskadi'
    when 'ES-AN' then 'Andalucía' when 'ES-CM' then 'Castilla-La Mancha'
    when 'ES-CL' then 'Castilla y León' when 'ES-AR' then 'Aragón'
    when 'ES-GA' then 'Galicia' when 'ES-CN' then 'Canarias'
    when 'ES-MD' then 'Comunidad de Madrid' when 'ES-MC' then 'Región de Murcia'
    when 'ES-NC' then 'Navarra' when 'ES-AS' then 'Asturias'
    when 'ES-CB' then 'Cantabria' when 'ES-EX' then 'Extremadura'
    when 'ES-RI' then 'La Rioja' when 'ES-CE' then 'Ceuta' when 'ES-ML' then 'Melilla'
  end
$$;

create or replace function public.preview_price_alert(
  p_kind text,
  p_query text default null,
  p_stores text[] default '{}',
  p_exact_store text default null,
  p_exact_product_id text default null,
  p_region text default null,
  p_location_ids jsonb default '{}'::jsonb,
  p_limit integer default 12
)
returns table (
  store text, product_id text, display_name text, thumbnail text,
  category_name text, unit_price numeric, promo_name text, total_count bigint
)
language plpgsql security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  needle text := lower(public.f_unaccent(regexp_replace(btrim(coalesce(p_query,'')), '\s+', ' ', 'g')));
  community text := price_alerts_internal.region_name(p_region);
begin
  if caller is null then raise exception 'authentication_required'; end if;
  if not public.is_premium(caller) then raise exception 'plus_required_for_price_alerts'; end if;
  if p_kind not in ('exact','keyword') then raise exception 'invalid_alert_kind'; end if;
  if p_kind = 'keyword' and char_length(needle) < 2 then raise exception 'query_too_short'; end if;

  return query
  select p.store, p.product_id, p.display_name, p.thumbnail, p.category_name,
         p.unit_price, p.promo_name, count(*) over()
  from price_alerts_internal.catalog_products p
  where p.published
    and (
      (p_kind = 'exact' and p.store = p_exact_store and p.product_id = p_exact_product_id)
      or
      (p_kind = 'keyword' and p.store = any(coalesce(p_stores, '{}'::text[]))
        and not exists (
          select 1 from unnest(string_to_array(needle, ' ')) token
          where token <> '' and p.display_name_norm not like '%' || token || '%'
        ))
    )
    and (community is null or p.regions is null or cardinality(p.regions) = 0 or community = any(p.regions))
    and (
      nullif(coalesce(p_location_ids, '{}'::jsonb) ->> p.store, '') is null
      or p.centers is null or cardinality(p.centers) = 0
      or (coalesce(p_location_ids, '{}'::jsonb) ->> p.store) = any(p.centers)
    )
  order by p.store, p.display_name_norm, p.product_id
  limit greatest(1, least(coalesce(p_limit, 12), 24));
end
$$;

revoke all on function public.preview_price_alert(text,text,text[],text,text,text,jsonb,integer)
  from public, anon;
grant execute on function public.preview_price_alert(text,text,text[],text,text,text,jsonb,integer)
  to authenticated, service_role;

create or replace function public.claim_price_alert_deliveries(p_limit integer default 200)
returns table (
  delivery_id uuid, user_id uuid, rule_id uuid, rule_label text,
  event_id uuid, batch_key text, event_type text, store text, product_id text,
  display_name text, thumbnail text, previous_price numeric, current_price numeric,
  price_delta_pct numeric, promo_name text, promo_price numeric
)
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.price_alert_deliveries
    set status = 'pending', claimed_at = null
    where status = 'processing' and claimed_at < now() - interval '15 minutes';

  insert into public.price_alert_deliveries (rule_id, user_id, event_id, status)
  select r.id, r.user_id, e.id,
         case when p.premium_until > now() then 'pending' else 'paused' end
  from price_alerts_internal.catalog_events e
  join public.price_alert_rules r
    on r.active and e.detected_at >= greatest(r.created_at, r.active_since)
   and e.store = any(r.stores)
   and ((r.kind = 'exact' and r.exact_store = e.store and r.exact_product_id = e.product_id)
     or (r.kind = 'keyword' and not exists (
       select 1 from unnest(string_to_array(r.query_norm, ' ')) token
       where token <> '' and e.display_name_norm not like '%' || token || '%'
     )))
   and ((e.event_type = 'price_drop' and r.notify_price_drop
          and abs(coalesce(e.price_delta_pct, 0)) >= r.min_drop_pct)
     or (e.event_type = 'new_offer' and r.notify_new_offer))
  join public.profiles p on p.id = r.user_id
    and (
      price_alerts_internal.region_name(p.region) is null
      or e.regions is null or cardinality(e.regions) = 0
      or price_alerts_internal.region_name(p.region) = any(e.regions)
    )
  where e.detected_at >= now() - interval '90 days'
    and (
      (e.event_type = 'price_drop' and (
        (e.location_id is null and not (r.location_ids ? e.store))
        or e.location_id = r.location_ids ->> e.store
      ))
      or
      (e.event_type = 'new_offer' and (
        e.locations is null or cardinality(e.locations) = 0
        or not (r.location_ids ? e.store)
        or (r.location_ids ->> e.store) = any(e.locations)
      ))
    )
  on conflict on constraint price_alert_deliveries_rule_id_event_id_key do nothing;

  return query
  with picked_groups as (
    select d.rule_id, e.batch_key, min(d.created_at) as first_created
    from public.price_alert_deliveries d
    join price_alerts_internal.catalog_events e on e.id = d.event_id
    where (d.status = 'pending' or (d.status = 'failed' and coalesce(d.next_retry_at, now()) <= now()))
      and d.attempt_count < 5
    group by d.rule_id, e.batch_key
    order by min(d.created_at), d.rule_id, e.batch_key
    limit greatest(1, least(coalesce(p_limit, 50), 100))
  ), picked as (
    select d.id
    from public.price_alert_deliveries d
    join price_alerts_internal.catalog_events e on e.id = d.event_id
    join picked_groups g on g.rule_id = d.rule_id and g.batch_key = e.batch_key
    where (d.status = 'pending' or (d.status = 'failed' and coalesce(d.next_retry_at, now()) <= now()))
      and d.attempt_count < 5
    for update of d skip locked
  ), claimed as (
    update public.price_alert_deliveries d
      set status = 'processing', claimed_at = now(), attempt_count = attempt_count + 1
    from picked where d.id = picked.id
    returning d.*
  )
  select c.id, c.user_id, c.rule_id, r.label, e.id, e.batch_key, e.event_type,
         e.store, e.product_id, e.display_name, e.thumbnail, e.previous_price,
         e.current_price, e.price_delta_pct, e.promo_name, e.promo_price
  from claimed c
  join public.price_alert_rules r on r.id = c.rule_id
  join price_alerts_internal.catalog_events e on e.id = c.event_id
  order by c.created_at, c.id;
end
$$;

revoke all on function public.claim_price_alert_deliveries(integer)
  from public, anon, authenticated;
grant execute on function public.claim_price_alert_deliveries(integer) to service_role;

-- Crea (o recupera) atómicamente la única notificación de bandeja de un
-- lote. Así un reinicio entre la inserción y el marcado de entregas no duplica
-- la notificación visible al usuario.
create or replace function public.create_price_alert_notification(
  p_user_id uuid,
  p_rule_id uuid,
  p_batch_key text,
  p_title text,
  p_body text,
  p_data jsonb
)
returns table (notification_id uuid, created boolean)
language plpgsql security definer
set search_path = ''
as $$
declare
  v_notification_id uuid;
  v_created boolean := false;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'service_role_required';
  end if;
  if not exists (
    select 1 from public.price_alert_rules r
    where r.id = p_rule_id and r.user_id = p_user_id
  ) then
    raise exception 'invalid_price_alert_batch';
  end if;

  insert into price_alerts_internal.notification_batches (rule_id, user_id, batch_key)
  values (p_rule_id, p_user_id, p_batch_key)
  on conflict (rule_id, batch_key) do nothing;

  select b.notification_id into v_notification_id
  from price_alerts_internal.notification_batches b
  where b.rule_id = p_rule_id and b.batch_key = p_batch_key
  for update;

  if v_notification_id is null then
    insert into public.notifications (user_id, type, title, body, data)
    values (p_user_id, 'price_alert', p_title, p_body, coalesce(p_data, '{}'::jsonb))
    returning id into v_notification_id;

    update price_alerts_internal.notification_batches
    set notification_id = v_notification_id
    where rule_id = p_rule_id and batch_key = p_batch_key;
    v_created := true;
  end if;

  return query select v_notification_id, v_created;
end
$$;

revoke all on function public.create_price_alert_notification(uuid,uuid,text,text,text,jsonb)
  from public, anon, authenticated;
grant execute on function public.create_price_alert_notification(uuid,uuid,text,text,text,jsonb)
  to service_role;

comment on table public.price_alert_rules is
  'Reglas personalizadas de QuéFalta Plus. Al caducar Plus se conservan y el procesador las pausa.';
comment on table public.price_alert_deliveries is
  'Outbox durable y deduplicada por regla+evento para alertas de precio/oferta.';

-- Las funciones internas creadas después del primer REVOKE también quedan
-- cerradas. Los triggers siguen pudiendo ejecutarlas y service_role conserva
-- acceso para operaciones y diagnóstico.
revoke execute on all functions in schema price_alerts_internal
  from public, anon, authenticated;
grant execute on all functions in schema price_alerts_internal to service_role;
