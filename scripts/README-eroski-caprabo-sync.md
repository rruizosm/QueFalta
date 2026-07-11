# Sync de los catálogos de Eroski y Caprabo

Espeja los catálogos de **Eroski** (nacional) y **Caprabo** (Cataluña, enseña
catalana de Eroski) en Supabase para el catálogo y la búsqueda de la app.

## Cómo funciona

Eroski y Caprabo comparten backend (framework **Apache Tapestry**): mismos ids de
categoría, mismo markup, misma paginación. Toda la lógica vive en
`scripts/lib/eroski-tapestry.mjs`; `scripts/sync-eroski.mjs` y
`scripts/sync-caprabo.mjs` solo fijan la base URL y las tablas.

1. **GET home** (`/es/`) → el mega-menú trae el árbol de categorías completo como
   enlaces `/es/supermercado/{n1}/{n2}/{n3}[/{n4}]/`. De ahí se derivan las HOJAS
   (categorías sin hijas) y el mapa hijo→padre. Se excluyen los N1 no-alimentación
   (papelería, hogar/bricolaje, electrónica, descanso, electrohogar).
2. **GET de cada hoja** con `?pageNumber=1,2,…` (paginación clásica, SIN sesión ni
   el endpoint stateful `loadpage`; 20 productos/página) hasta que una página no
   aporta ids nuevos.
3. Cada "tile" trae un JSON `data-metrics` (evento `select_item`) con **id, nombre,
   marca, categoría y precio**. El parser tolera comillas simples y dobles +
   HTML-escapado. Imagen grande = `/images/{id}_x.jpg`.
4. Normaliza + **upsert** en `{eroski,caprabo}_products` / `_categories`, con
   soft-delete (`markStale`) de lo ausente.

**Limitaciones (v1):** el listado NO trae precio por unidad (€/L) ni EAN —solo la
ficha—, así que `price_per_unit` queda null. Solo castellano (Caprabo `/ca/`
redirige y no traduce los nombres de producto).

## Requisitos previos (una vez)

Ejecutar en el SQL Editor de Supabase **`supabase/migrations/eroski_catalog.sql`**
y **`supabase/migrations/caprabo_catalog.sql`** (crean las tablas con búsqueda
insensible a acentos, novedades y cambios de precio) y re-ejecutar
**`supabase/migrations/similar_products.sql`** (ya incluye los brazos de ambos).

## Variables de entorno

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` — destino de la escritura.
- `CONCURRENCY=6` — hojas rastreadas en paralelo.
- `DRY_RUN=1` — no escribe; imprime un resumen.
- `MAX_LEAVES=N` — limita nº de hojas (pruebas rápidas).
- `EMPTY_ABORT_PCT=20` — umbral del guardarraíl (ver abajo).

## Guardarraíl anti-throttling

Cuando el servidor va cargado, sirve la página de categoría COMPLETA (200, título
correcto) pero SIN los tiles de producto — indistinguible de una categoría vacía
mirando una sola página. Para no despublicar productos vivos por un pico de carga:

1. La página 1 de cada hoja con 0 productos se **reintenta** (3× con backoff).
2. Se cuenta la fracción de **hojas que acaban vacías**; si supera `EMPTY_ABORT_PCT`
   (20% por defecto) el run **aborta sin escribir** (ni upsert ni markStale).

En CI cada workflow corre con IP limpia y separados en el tiempo, así que el % de
hojas vacías es bajo. Ejecutar dos crawls grandes seguidos desde la misma IP
(p. ej. en local) sí dispara throttling: espaciarlos o usar `MAX_LEAVES`.

## Ejecutar

- **GitHub Actions:** `sync-eroski.yml` (lunes 07:00 UTC) y `sync-caprabo.yml`
  (lunes 07:20 UTC), o botón *Run workflow*. Solo `node` (sin navegador).
- **Prueba en seco:** `DRY_RUN=1 MAX_LEAVES=10 node scripts/sync-eroski.mjs`
  (o `sync-caprabo.mjs`).
