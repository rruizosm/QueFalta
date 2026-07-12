# Sync del catálogo de Condis — espejo en Supabase

Espeja el catálogo de **Condis (Condisline)** en Supabase para el catálogo y la
búsqueda de la app. Súper catalán (Cataluña + Madrid), **bilingüe es/ca**.

## Cómo funciona (API JSON abierta de Empathy)

compraonline.condis.es es una SPA **Next.js (App Router/RSC)**. Su API de catálogo
propia (`catalog-api.condis.es`) está **protegida** (403: exige API keys que van
server-side), pero su **buscador usa Empathy.co**, que expone una **API JSON
ABIERTA** (sin auth ni cookies, no hay Cloudflare) y sirve el catálogo entero
categoría a categoría. No hay que parsear HTML ni usar navegador headless.

- **Categorías hoja (N2, nivel "family"):** del sitemap público
  `https://compraonline.condis.es/sitemap.xml` → 94 urls `/…/c/{cXX__cat########}/es_ES`.
  El **N1** (sección) es el prefijo `cXX` del id (11 en total). Los **nombres** los
  ponen los propios productos (`section` = N1, `family` = N2); el slug del sitemap
  no es presentable.
- **Listado por categoría:**
  ```
  GET https://api.empathy.co/search/v1/query/condis/browse
      ?browseField=parentCategory&browseValue={N2}&lang={es|ca}&store={STORE}
      &start={N}&rows=400
  → { catalog: { numFound, content:[producto], pagination } }
  ```
  `browseField=parentCategory` **particiona** el catálogo: cada producto cae en UNA
  sola categoría → membership trivial (como Dia). `rows` debe ser **< 500** (la
  categoría mayor ronda 274, cabe en una página). El árbol es de 2 niveles
  (N1 sección → N2 family), como Bonpreu/Dia.
- **Producto:** `id`, `description` (nombre), `brand`, `price{current,regular,
  discounted}` (`current` ya lleva la oferta aplicada), `pum` ("0,87€/Litro" →
  €/unidad canónico l/kg/ud vía `lib/price.mjs`), `category:[N1,N2,N3]`,
  `on_sale`/`on_promotion`, `is_novelty`, `without_gluten`/`without_lactose`,
  `isEco`, `state`. Todo se conserva en `raw`.
- **Bilingüe es/ca** (param `lang`): la 1ª pasada (es) fija el conjunto de productos
  y los nombres castellanos; la 2ª (ca) añade `display_name_ca` por id (mismos ids).
- **Imágenes:** el CDN público `cdn.condis.es/fit-in/600x600/es/products/{id}.jpg`
  (las de la app privada `/images/catalog/…` piden sesión → 404).
- **Precio POR TIENDA:** `STORE=718` por defecto (área Barcelona). Otras tiendas
  cambian precios/surtido; se fija una para tener precios consistentes (como Dia con
  el CP de Madrid o Sorli con idTienda).

### Sin ficha en v1

La **ficha** (ingredientes/nutrición/conservación/fabricante) SÍ existe, estructurada,
en el `productInformation` del payload RSC del PDP (`/{slug}/p/{id}/{es|ca}_ES`,
slug-agnóstico + bilingüe). **Pero** el PDP redirige por un flujo **OAuth de invitado**
(`/api/anonymous/oauth2/authorize`) que hay que reproducir en CADA petición (el
`fetch` de node entra en bucle de redirección; una sola cookie `anonymous-user-sub-cookie`
"fría" vuelve a dar 307) → frágil y pesado para ~15k páginas (es+ca). Se deja como
**mejora futura**. Como Sorli/Eroski/Caprabo, el listado ya trae precio, €/unidad,
marca y categoría; lo único que falta es la ficha.

## Requisitos previos (una vez)

Ejecutar en el **SQL Editor** de Supabase
[`supabase/migrations/condis_catalog.sql`](../supabase/migrations/condis_catalog.sql).
Crea `condis_products` y `condis_categories` (búsqueda insensible a acentos bilingüe,
novedades y cambios de precio ya incluidos; es AUTOCONTENIDA). Sin esto, el sync falla
al escribir. Re-ejecutar también
[`supabase/migrations/similar_products.sql`](../supabase/migrations/similar_products.sql)
(ya incluye el brazo de Condis) — solo relevante si se reactiva el comparador.

## Ejecutar

- **GitHub Actions:** workflow
  [`.github/workflows/sync-condis.yml`](../.github/workflows/sync-condis.yml)
  (lunes 07:40 UTC, tras Caprabo; o botón *Run workflow*). Usa los secrets
  `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE`. Solo `node` (sin navegador).
- **Local (opcional):** `scripts/run-condis-sync.ps1` (lee los secretos de
  `.env.local`).
- **Prueba en seco:**
  ```powershell
  $env:DRY_RUN='1'; $env:MAX_CATEGORIES='5'; node scripts/sync-condis.mjs
  ```

## Variables de entorno

| Var | Por defecto | Uso |
|-----|-------------|-----|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE` | — | destino (obligatorias salvo DRY_RUN) |
| `CONCURRENCY` | `6` | categorías en paralelo |
| `STORE` | `718` | id de tienda (precio por tienda; 718 = área Barcelona) |
| `DRY_RUN` | — | `1` = no escribe, imprime resumen |
| `MAX_CATEGORIES` | ∞ | limita nº de categorías (pruebas) |
| `SKIP_N1` | — | ids de N1 (`cXX`) a excluir (CSV) |

## Notas

- **Geobloqueo:** la API de Empathy responde desde fuera de España → Actions va bien.
- **Marca propia Condis:** productos "CONDIS …". El `catalog_clean_name` del comparador
  ya limpia marcas blancas del needle (ver similar_products.sql).
- **Carrito (futuro):** la app solo espeja catálogo+búsqueda; no hay integración de
  carrito con Condis.
