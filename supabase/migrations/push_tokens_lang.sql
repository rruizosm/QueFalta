-- Idioma por dispositivo para las notificaciones push.
--   El texto de las push se genera en SERVIDOR (Edge Function send-push). Para
--   enviarlas en el idioma que el usuario tiene elegido en CADA dispositivo,
--   guardamos su idioma ('es' | 'ca') junto al token. send-push agrupa los
--   tokens de cada destinatario por idioma y traduce el mensaje por grupo.
--   NULL = castellano (default histórico de las filas ya existentes).
--
-- Aditiva: no toca filas ni policies existentes. La app rellena `lang` en el
-- upsert al registrar el token y lo actualiza al cambiar de idioma.
--
-- Ejecutar en: Supabase → SQL Editor.

alter table public.push_tokens
  add column if not exists lang text;
