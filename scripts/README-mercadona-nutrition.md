# Nota de salud de Mercadona (estilo Yuka) — extracción

Calcula una **nota 0-100 con puntos fuertes/débiles** para el catálogo de Mercadona
(función QuéFalta Plus). **Solo Mercadona**: los demás súper no exponen la etiqueta
nutricional. Descubrimiento y diseño en la memoria `health-score-nutricional`.

## De dónde sale el dato (verificado 2026-06-13)

La tabla nutricional **no viene como campo** en la API de Mercadona: está en la
**foto de la etiqueta trasera**. El extractor:

1. `GET /api/products/{id}/?lang=es&wh=mad1` → `photos[1].zoom` (la `[0]` es el
   frontal), `ean`, y `nutrition_information.ingredients` (HTML → texto).
2. Lee la foto (reducida a ~1100px vía imgix) con **visión de Claude** (Haiku 4.5
   por defecto) y salida **JSON estructurada** → los 7 números por 100g.
3. `scripts/lib/health-score.mjs` calcula el score: **Nutri-Score 2023** (60%) +
   **aditivos** desde los ingredientes (30%) + **bonus ecológico** (10%), con
   puntos fuertes/débiles. Cobertura de la etiqueta: 100% en alimentación envasada
   (medido); el fresco/no-alimentación queda sin nota.
4. Guarda en `mercadona_products` los valores + el score ya calculado (la app solo lee).

**Cobertura del Nutri-Score:** exacto cuando la etiqueta trae fibra; **estimado**
(fibra=0, peor caso) cuando no — se marca `health.estimated=true` para avisarlo en la UI.

## Incremental (coste casi nulo en régimen permanente)

Cada ejecución procesa solo los productos `published` con
`nutrition_status IS NULL` (nunca leídos) o `='failed'` (reintento). La **1ª
ejecución es el backfill** (~miles de productos, varios minutos, coste de visión
de **unos pocos €** con Haiku); las siguientes solo tocan productos nuevos.
La nutrición es estable, así que no se reprocesa.

`nutrition_status`: `ok` (leída) · `no_label` (sin etiqueta/no-alimentación) · `failed` (reintentar).

**Reformulaciones:** el `nutrition_image_id` guarda la foto leída. Para refrescar
un producto reformulado, basta re-encolarlo poniendo su `nutrition_status` a NULL
(o `failed`); un PATCH masivo periódico podría comparar el imageId actual, pero no
es necesario para el MVP.

## 1. Migración (una vez)

Supabase → SQL Editor → ejecuta
[`supabase/migrations/mercadona_health.sql`](../supabase/migrations/mercadona_health.sql).
Añade a `mercadona_products`: `ean13`, `ingredients`, `nutrition` (jsonb),
`health_score`, `health_grade`, `health` (jsonb) y las columnas de control.

## 2. Secretos

- En **`.env.local`** (local): además de los de siempre, añade
  `ANTHROPIC_API_KEY=sk-ant-...` (clave de la API de Anthropic — la consola de
  Anthropic, no la de Supabase).
- En **GitHub** (para el workflow): añade el secret `ANTHROPIC_API_KEY` al repo.

## 3. Probar / lanzar

```powershell
# Prueba sin escribir (20 productos):
$env:DRY_RUN='1'; $env:MAX_PRODUCTS='20'; node scripts/extract-mercadona-nutrition.mjs

# Backfill real (lee secretos de .env.local). La 1ª vez tarda y cuesta unos € de visión:
& "C:\Users\ruben\OneDrive\Escritorio\MercaApp\MercaAppMobile\scripts\run-mercadona-nutrition.ps1"
```

O en la nube: workflow [`mercadona-nutrition.yml`](../.github/workflows/mercadona-nutrition.yml)
(cron 05:00 UTC + "Run workflow"). El primer run hace el backfill dentro de la
ventana de 60 min.

### Variables de entorno

| Var | Por defecto | Uso |
|-----|-------------|-----|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE` | — | destino (obligatorias) |
| `ANTHROPIC_API_KEY` | — | clave de la API de Anthropic (visión) — obligatoria |
| `MODEL` | `claude-haiku-4-5` | modelo de visión |
| `MERCADONA_WH` | `mad1` | almacén para el GET de detalle |
| `CONCURRENCY` | `4` | productos en paralelo |
| `MAX_PRODUCTS` | ∞ | limita (pruebas / backfill por tandas) |
| `DRY_RUN` | — | `1` = no escribe, imprime |

## Coste estimado

~3.500 productos de alimentación × (≈1.700 tok entrada + 150 salida) con Haiku 4.5
($1/$5 por millón) ≈ **unos pocos €, una sola vez**. Régimen permanente: céntimos/día.

## Pendiente

- **UI (Fase 3):** sección de salud en `ProductDetailModal` (anillo 0-100 + 👍/👎 +
  valores por 100g + aviso "estimado"), gateada a Plus, con "sin datos" para
  fresco/no-alimentación. Aún no implementada.
- **No es un clon de Yuka:** su fórmula y clasificación de aditivos son suyas; esto
  es un equivalente sobre Nutri-Score oficial + lista pública de aditivos.
