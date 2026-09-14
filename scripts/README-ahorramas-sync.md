# Sync Ahorramás

`sync-ahorramas.mjs` replica el catálogo público de Ahorramás desde sus páginas
Demandware/SFCC. No inicia sesión ni añade productos a ninguna cesta. La primera
versión usa el surtido de referencia sin CP: no afirmar que el precio sea el de
la tienda local hasta incorporar variantes por `commerceId`.

## Antes del primer run

1. Ejecutar `supabase/migrations/ahorramas_catalog.sql` en Supabase SQL Editor.
2. Añadir Ahorramás a `similar_products.sql` y volver a ejecutar esa migración
   para que aparezca en la comparativa automática.
3. Lanzar **Sync Ahorramás catalog** manualmente y revisar su resumen.

## Variables

| Variable | Uso |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` | Destino (obligatorias salvo DRY_RUN) |
| `DRY_RUN=1` | Descarga y resume sin escribir |
| `MAX_CATEGORIES=N` | Limita categorías para pruebas |
| `MIN_PRODUCTS=5000` | Guardarraíl contra una descarga parcial |
| `AHORRAMAS_PAGE_SIZE=40` | Productos solicitados por página de continuación (20–200) |
| `AHORRAMAS_REQUEST_DELAY_MS=3000` | Separación mínima entre peticiones (≈20 inicios/minuto) |
| `AHORRAMAS_MAX_REQUEST_ATTEMPTS=6` | Intentos ante `408`, `425`, `429`, `5xx` o error de red |
| `AHORRAMAS_BASE_RETRY_DELAY_MS=60000` | Espera inicial del backoff exponencial |
| `AHORRAMAS_MAX_RETRY_DELAY_MS=300000` | Tope por espera; también limita `Retry-After` |
| `AHORRAMAS_REQUEST_TIMEOUT_MS=60000` | Timeout por página, incluidas páginas ampliadas |

El cliente conserva las cookies de SFCC, respeta `Retry-After` y añade jitter
al backoff. Los `4xx` no transitorios fallan sin insistir. El workflow dispone
de 120 minutos para absorber una ventana de rate limit sin permitir escrituras
parciales: Supabase solo se modifica después de descargar y validar todo el
catálogo.

El árbol contiene categorías padre que repiten productos de sus descendientes,
pero también productos que no aparecen en ninguna hoja. Para no perderlos se
pagina por completo cada categoría raíz y cada hoja; de las ramas intermedias se
lee la primera página para descubrir hijos y conservar sus productos directos.
Las páginas siguientes de SFCC se amplían de 20 a 40 productos, el máximo que
la tienda sirve de forma estable. El sync avanza el offset aunque SFCC devuelva
el anterior, termina una categoría si el servidor repite su último bloque y
falla si se repite la URL efectiva. Así evita tanto peticiones innecesarias como
ciclos silenciosos sin recortar la cobertura del surtido.

El workflow corre diariamente a las 06:00 UTC. Si cambia el HTML o la
paginación, el guardarraíl evita despublicar el catálogo anterior.
