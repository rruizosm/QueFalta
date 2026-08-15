# Sync de Hipercor

`sync-hipercor.mjs` carga en Supabase el catálogo público de Hipercor mediante
Chrome/Playwright. Recorre las once categorías raíz públicas y todas sus páginas
SSR; deduplica por el id público `B…` y conserva precio, precio por unidad,
disponibilidad, novedad y promociones explícitas.

## Preparación

1. Ejecutar `supabase/migrations/hipercor_catalog.sql` en Supabase SQL Editor.
2. Ejecutar de nuevo `supabase/migrations/similar_products.sql` cuando se añada
   Hipercor también a la comparativa y al cliente.
3. Lanzar manualmente el workflow **Sync Hipercor catalog** antes de habilitarlo
   en la app. El workflow necesita los secretos existentes `SUPABASE_URL` y
   `SUPABASE_SERVICE_ROLE`.

El workflow usa el Chrome del runner (`PW_CHANNEL=chrome`). Chromium de
Playwright recibió `Access Denied` de Akamai durante la POC.

## Prueba sin escrituras

```bash
DRY_RUN=1 PW_CHANNEL=chrome MIN_PRODUCTS=1 MAX_PAGES_PER_CATEGORY=1 node scripts/sync-hipercor.mjs
```

Variables principales:

| Variable | Por defecto | Uso |
|---|---:|---|
| `MIN_PRODUCTS` | `10000` | Guardarraíl previo a escritura/despublicación. |
| `MAX_PAGES_PER_CATEGORY` | sin límite | Limita páginas por raíz para pruebas. |
| `PW_CHANNEL` | `chrome` | Canal de navegador de Playwright. |
| `HEADLESS` | `1` | `0` muestra el navegador. |
| `NAV_TIMEOUT_MS` | `45000` | Timeout por página. |

## Alcance de ubicación

Hipercor determina surtido, precio y oferta según el centro de entrega. Esta
primera sincronización no usa CP, dirección, cuenta ni carrito: sólo refleja el
centro público que la web proporciona. El id de centro queda en `raw.centerId`
para una futura normalización por zona; no se deben presentar estos precios como
personalizados para la ubicación del usuario.
