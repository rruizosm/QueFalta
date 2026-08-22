-- Emoji de clasificación para reglas personalizadas. Los clientes nuevos lo
-- infieren con el mismo clasificador usado por los productos del carrito.

alter table public.price_alert_rules
  add column emoji text;

update public.price_alert_rules
set emoji = case
  when lower(public.f_unaccent(concat_ws(' ', label, query))) like '%aceite%'
    or lower(public.f_unaccent(concat_ws(' ', label, query))) like '%oliva%'
    then '🫒'
  else '🛒'
end;

alter table public.price_alert_rules
  alter column emoji set default '🛒',
  alter column emoji set not null;

alter table public.price_alert_rules
  add constraint price_alert_rules_emoji_length
  check (char_length(emoji) between 1 and 16);
