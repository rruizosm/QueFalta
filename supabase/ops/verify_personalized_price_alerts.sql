-- Verificación transaccional del MVP de alertas. No deja cambios (ROLLBACK).
-- Ejecutar después de 20260820162731_personalized_price_alerts.sql.

begin;

do $$
declare
  missing_tables text[];
  missing_triggers integer;
begin
  select array_agg(name) into missing_tables
  from unnest(array[
    'public.price_alert_rules',
    'public.price_alert_deliveries',
    'price_alerts_internal.catalog_products',
    'price_alerts_internal.catalog_events',
    'price_alerts_internal.notification_batches'
  ]) name
  where to_regclass(name) is null;
  if missing_tables is not null then
    raise exception 'Faltan tablas: %', missing_tables;
  end if;

  select count(*) into missing_triggers
  from unnest(array[
    'mercadona_products','bonpreu_products','carrefour_products','bonarea_products',
    'consum_products','dia_products','sorli_products','eroski_products','caprabo_products',
    'condis_products','ametller_products','aldi_products','hiperdino_products',
    'alcampo_products','plusfresc_products','gadis_products','froiz_products','ahorramas_products'
  ]) tbl
  where to_regclass('public.' || tbl) is not null
    and not exists (
      select 1 from pg_trigger
      where tgrelid = to_regclass('public.' || tbl)
        and tgname = 'capture_price_alert_change' and not tgisinternal
    );
  if missing_triggers > 0 then
    raise exception 'Faltan % triggers de captura', missing_triggers;
  end if;
end $$;

do $$
declare
  test_user uuid;
  test_product text;
  test_price numeric;
  test_rule uuid;
  novelty_rule uuid;
  novelty_event uuid;
  novelty_product_id text := 'verify-new-arrival-' || gen_random_uuid()::text;
  novelty_source jsonb;
  insert_columns text;
  select_columns text;
  claimed integer;
  test_batch text;
  notification_one uuid;
  notification_two uuid;
  was_created boolean;
  result_products integer;
  linked_deliveries integer;
begin
  select id into test_user from public.profiles order by created_at limit 1;
  select id, unit_price into test_product, test_price
    from public.mercadona_products
    where published and unit_price >= 0.20
    order by id limit 1;
  if test_user is null or test_product is null then
    raise exception 'La verificación necesita al menos un perfil y un producto con precio';
  end if;

  update public.profiles set premium_until = now() + interval '1 day' where id = test_user;
  insert into public.price_alert_rules (
    user_id, kind, label, exact_store, exact_product_id, stores,
    notify_price_drop, notify_new_offer, min_drop_pct
  ) values (
    test_user, 'exact', 'Verificación alertas', 'mercadona', test_product,
    array['mercadona'], true, false, 0
  ) returning id into test_rule;

  if (select emoji from public.price_alert_rules where id = test_rule) <> '🛒' then
    raise exception 'El emoji por defecto de la regla no es válido';
  end if;

  update public.mercadona_products
    set unit_price = test_price - 0.01, synced_at = now()
    where id = test_product;

  select count(*) into claimed
  from public.claim_price_alert_deliveries(10)
  where rule_id = test_rule and product_id = test_product and event_type = 'price_drop';
  if claimed <> 1 then
    raise exception 'Deduplicación/matching incorrecto: se esperó 1 entrega y se obtuvo %', claimed;
  end if;

  if (select count(*) from public.price_alert_deliveries where rule_id = test_rule) <> 1 then
    raise exception 'La outbox no contiene exactamente una entrega';
  end if;

  insert into public.price_alert_rules (
    user_id, kind, emoji, label, query, exact_store, exact_product_id, stores,
    notify_price_drop, notify_new_offer, min_drop_pct
  ) values (
    test_user, 'new_arrival', '🆕', 'Verificación novedades', 'se limpia',
    'mercadona', 'se-limpia', array['mercadona'], true, true, 25
  ) returning id into novelty_rule;

  if exists (
    select 1 from public.price_alert_rules
    where id = novelty_rule
      and (query is not null or query_norm is not null or exact_store is not null
        or exact_product_id is not null or notify_price_drop or notify_new_offer
        or min_drop_pct <> 0)
  ) then
    raise exception 'La regla de novedades no se normalizó como modo exclusivo';
  end if;

  select to_jsonb(p) into novelty_source
  from public.mercadona_products p
  where id = test_product;
  novelty_source := novelty_source || jsonb_build_object(
    'id', novelty_product_id,
    'display_name', 'Producto nuevo de verificación',
    'synced_at', now(),
    'first_seen_at', now(),
    'published', true
  );
  select
    string_agg(format('%I', column_name), ', ' order by ordinal_position),
    string_agg(format('r.%I', column_name), ', ' order by ordinal_position)
  into insert_columns, select_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'mercadona_products'
    and is_generated = 'NEVER';
  execute format(
    'insert into public.mercadona_products (%s) select %s '
      || 'from jsonb_populate_record(null::public.mercadona_products, $1) r',
    insert_columns, select_columns
  ) using novelty_source;

  select id into novelty_event
  from price_alerts_internal.catalog_events
  where store = 'mercadona'
    and product_id = novelty_product_id
    and event_type = 'new_arrival';
  if novelty_event is null then
    raise exception 'El trigger no capturó la inserción como novedad';
  end if;

  perform * from public.claim_price_alert_deliveries(100);
  if not exists (
    select 1 from public.price_alert_deliveries
    where rule_id = novelty_rule and event_id = novelty_event
  ) then
    raise exception 'La novedad no generó una entrega para su regla';
  end if;

  select e.batch_key into test_batch
  from public.price_alert_deliveries d
  join price_alerts_internal.catalog_events e on e.id = d.event_id
  where d.rule_id = test_rule;

  perform set_config('request.jwt.claim.role', 'service_role', true);
  select notification_id, created into notification_one, was_created
  from public.create_price_alert_notification(
    test_user, test_rule, test_batch, 'Verificación alertas',
    'Un producto ha bajado de precio', '{"type":"price_alert"}'::jsonb
  );
  if notification_one is null or not was_created then
    raise exception 'La primera notificación agrupada no se creó';
  end if;

  select notification_id, created into notification_two, was_created
  from public.create_price_alert_notification(
    test_user, test_rule, test_batch, 'Texto de reintento',
    'Este texto no debe crear otra fila', '{"type":"price_alert"}'::jsonb
  );
  if notification_two is distinct from notification_one or was_created then
    raise exception 'El reintento ha duplicado la notificación agrupada';
  end if;

  select count(*) into linked_deliveries
  from public.price_alert_deliveries
  where rule_id = test_rule and notification_id = notification_one;
  if linked_deliveries <> 1 then
    raise exception 'La creación no enlazó atómicamente la entrega: %', linked_deliveries;
  end if;

  -- El cliente solo recibe el id de la notificación y resuelve sus productos
  -- con una sesión autenticada del propietario.
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', test_user::text, true);
  select count(*) into result_products
  from public.get_price_alert_notification_products(notification_one);
  if result_products <> 1 then
    raise exception 'La notificación no resolvió exactamente un producto: %', result_products;
  end if;
end $$;

rollback;
