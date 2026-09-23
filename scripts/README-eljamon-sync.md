# Sync de Supermercados El Jamón

`sync-eljamon.mjs` extrae el catálogo público de
`supermercadoseljamon.com` mediante Playwright.

## Por qué usa navegador

La web renderiza las tarjetas de producto en HTML, pero la paginación de
Liferay/Comerzzia se ejecuta mediante JavaScript. Abrir directamente la URL que
aparece en `onclick` no reproduce la petición de la página y puede devolver la
portada. El sync pulsa `Siguiente` y comprueba que cambien el número de página y
el primer SKU antes de aceptar el resultado.

El catálogo se recorre una vez por cada una de las 11 categorías raíz. Así se
evitan los duplicados que produciría recorrer también todas las subcategorías.
El árbol completo de subcategorías sí se descubre y se guarda.

## Datos extraídos

Por producto:

- SKU estable de El Jamón.
- Nombre, marca, imagen y URL de detalle.
- Precio vigente y, cuando existe, precio anterior tachado.
- Precio por kilo, litro, 100 ml, 100 g o unidad.
- Oferta, tipo de promoción visible, producto nuevo y demás distintivos.
- Categoría raíz y nombre de categoría que Comerzzia incluye al añadir a cesta.

Las fichas de detalle se pueden consultar para recuperar la ruta exacta de
categorías y campos descriptivos si la web los publica. En las fichas muestreadas
durante la implementación no aparecieron bloques de ingredientes, alérgenos o
información nutricional, por lo que el sync no inventa esos datos y los deja a
`null`.

## Centro de referencia

El script selecciona recogida en tienda y usa por defecto el centro Comerzzia
`268`. Se puede cambiar con `ELJAMON_REFERENCE_STORE`. El resultado se almacena
como un catálogo común porque el análisis previo no encontró diferencias de
surtido, precio u oferta entre las ubicaciones comparadas.

## Ejecución

Prueba pequeña, sin escribir en Supabase:

```bash
DRY_RUN=1 MAX_CATEGORIES=1 MAX_PAGES=2 node scripts/sync-eljamon.mjs
```

Extracción completa, todavía sin publicar:

```bash
DRY_RUN=1 node scripts/sync-eljamon.mjs
```

El resultado se guarda en `logs/eljamon-catalog.json`. Puede cambiarse con
`ELJAMON_OUTPUT=/ruta/catalogo.json`.

Validación completa del 23 de septiembre de 2026 con el centro 268:

- 346/346 páginas de las 11 raíces.
- 6.857 SKU únicos y 525 categorías.
- 1.336 productos con oferta y 40 marcados como nuevos.
- 0 productos sin precio y 0 sin imagen.
- 6.749 precios por unidad normalizados; por ejemplo, `1,36 €/100gr` se guarda
  como `13,60 €/kg`.

Para inspeccionar rutas de categoría y posibles datos adicionales en fichas:

```bash
DRY_RUN=1 ELJAMON_DETAILS_LIMIT=100 node scripts/sync-eljamon.mjs
```

## Variables

| Variable | Valor por defecto | Uso |
| --- | --- | --- |
| `DRY_RUN` | `1` implícito | Solo publica si vale `0`. |
| `HEADLESS` | `1` implícito | Usa `0` para mostrar Chromium. |
| `MAX_CATEGORIES` | `11` | Limita raíces durante pruebas. |
| `MAX_PAGES` | sin límite | Limita páginas por raíz. |
| `ELJAMON_REFERENCE_STORE` | `268` | Centro de recogida de referencia. |
| `ELJAMON_SELECT_STORE` | `1` | Usa `0` para no seleccionar centro. |
| `ELJAMON_DETAILS_LIMIT` | `0` | Número de fichas que se enriquecen. |
| `ELJAMON_DETAIL_CONCURRENCY` | `2` | Pestañas simultáneas para fichas. |
| `ELJAMON_PAGE_DELAY_MS` | `250` | Pausa entre páginas y fichas. |
| `ELJAMON_OUTPUT` | `logs/eljamon-catalog.json` | Snapshot JSON. |
| `MIN_PRODUCTS` | `5000` | Guardia mínima antes de publicar. |

## Publicación

Las tablas `eljamon_categories` y `eljamon_products` están creadas en Supabase
mediante `20260923141000_eljamon_catalog.sql`. El modo de publicación incluye
despublicación de filas no vistas y registro en `catalog_sync_status`.

El workflow manual `.github/workflows/sync-eljamon.yml` permite lanzar la carga
desde GitHub Actions mediante **Run workflow**. Instala Chromium, usa el centro
de referencia 268 y exige al menos 6.000 productos antes de publicar.

Además de exigir credenciales de servicio, la publicación se bloquea cuando la
ejecución usa `MAX_CATEGORIES` o `MAX_PAGES`, o cuando no alcanza
`MIN_PRODUCTS`. Esto impide que una prueba parcial despublique el catálogo real.
