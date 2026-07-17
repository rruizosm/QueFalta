-- profiles.region + profiles.postal_code — zona del usuario.
--
-- La app pide el CÓDIGO POSTAL (onboarding paso 3 / gate / Ajustes) y deriva la
-- comunidad autónoma de sus 2 primeros dígitos (provincia → CCAA, mapeo fijo en
-- src/constants/regions.ts). Se guardan AMBOS:
--
--  · region       — código ISO 3166-2:ES; es la clave que filtra qué
--                   supermercados se muestran (regionales solo en su zona).
--  · postal_code  — el CP tal cual (5 dígitos). Hoy solo se almacena; es la
--                   clave nativa de todas las APIs que regionalizan (Mercadona
--                   almacén, Carrefour werks, Dia zona, Consum X-TOL-ZONE,
--                   Plusfresc centro) → habilita precios/disponibilidad de zona
--                   exacta sin volver a preguntar (MULTIZONA-CONSUM-PLUSFRESC.md).
--
-- Estados de region:
-- NULL   = aún no ha respondido → la app pide el CP (paso de onboarding para
--          nuevos; gate de una sola pregunta para usuarios ya registrados).
-- 'ES'   = "toda España" (no filtrar): eligió no dar el CP; se muestran todos
--          los súpers, no se vuelve a preguntar. postal_code queda NULL.
-- 'ES-CT', 'ES-CN'… = comunidad concreta derivada del CP (19 códigos).
--
-- Decisión de producto: SIN backfill. Todos los usuarios actuales nacen con
-- region NULL → verán el gate una vez. (Si algún día se quisiera saltar a los
-- existentes:  update public.profiles set region = 'ES';)
--
-- ⚠️ IMPRESCINDIBLE ejecutar antes de arrancar la app tras este cambio:
-- `fetchProfile` (src/api/profile.ts) ya selecciona ambas columnas y falla si
-- no existen (mismo patrón que onboarded_at / catalog_stores).
--
-- RLS: sin cambios. La policy UPDATE de profiles (el usuario edita su propia
-- fila) ya cubre las columnas nuevas, igual que catalog_stores. El CP es algo
-- más sensible que la CCAA: NO exponerlo nunca en vistas públicas de perfil
-- (hoy ninguna lo selecciona; solo fetchProfile de la propia fila).
--
-- Ejecutar en: Supabase → SQL Editor. Aditivo. No se valida con CHECK para no
-- acoplar la BD a la lista de códigos/formato (los valida el cliente).

alter table public.profiles
  add column if not exists region text;

alter table public.profiles
  add column if not exists postal_code text;

comment on column public.profiles.region is
  'Comunidad autónoma del usuario (ISO 3166-2:ES), derivada del CP. NULL = sin '
  'responder; ''ES'' = toda España (sin filtro).';

comment on column public.profiles.postal_code is
  'Código postal del usuario (5 dígitos). NULL si eligió "toda España". Clave '
  'para futuras features de zona exacta (precios regionales, disponibilidad).';
