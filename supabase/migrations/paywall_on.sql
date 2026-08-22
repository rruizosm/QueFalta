-- Fase 4 de MONETIZACION.md — ENCENDIDO del paywall en SERVIDOR.
-- Activa el recorte del comparador (similar_products → locked). Crear y
-- unirse a grupos permanece ilimitado para todas las cuentas.
--
-- Ejecutar en: Supabase → SQL Editor, en el lanzamiento, DESPUÉS de regalar
-- Plus a los testers (ops/grant_plus_testers.sql) y a la vez que sale el build
-- con PAYWALL_ENABLED = true (src/constants/limits.ts): los dos flags deben
-- estar igual.
--
-- Apagado de emergencia: re-ejecutar esta función con `select false`
-- (desactiva los gates de servidor al instante, sin esperar build nuevo).

create or replace function public.paywall_enabled()
returns boolean language sql immutable as $$ select true $$;
