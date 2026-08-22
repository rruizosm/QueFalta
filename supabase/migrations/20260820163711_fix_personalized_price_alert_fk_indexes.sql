-- Índices de cobertura para las claves foráneas de la outbox de alertas.

create index if not exists price_alert_deliveries_notification_idx
  on public.price_alert_deliveries (notification_id)
  where notification_id is not null;

create index if not exists price_alert_notification_batches_user_idx
  on price_alerts_internal.notification_batches (user_id);

create index if not exists price_alert_notification_batches_notification_idx
  on price_alerts_internal.notification_batches (notification_id)
  where notification_id is not null;
