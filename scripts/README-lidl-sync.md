# Sync Lidl

`sync-lidl.mjs` replica semanalmente el catálogo público de Lidl Plus para una
tienda española de referencia. Recorre el árbol completo de categorías y
guarda nombre, marca, precio, precio canónico por kg/L/ud, imagen,
disponibilidad, tipo de producto y promociones visibles.

## Fuente y alcance

- API: `product-catalog.lidlplus.com/api/app/v1/ES/store/{storeId}`.
- Tienda por defecto: `ES3572`. Precio, disponibilidad y surtido pertenecen a
  esa tienda; no deben presentarse como nacionales sin contrastar más centros.
- No se inicia sesión y no se consulta Scan&Go.
- Los ids como `8807709681515_ES` son identificadores internos. El sync guarda
  `ean=NULL`; no intenta deducir el código de barras.
- La pasada semanal descarga el catálogo base (~2.800 productos), no las fichas
  de detalle una a una. Ingredientes, alérgenos y `productCodes` quedan para una
  fase de enriquecimiento incremental.

Antes de usar los datos con una finalidad comercial debe revisarse la
autorización de Lidl: las condiciones publicadas de Lidl Plus describen el
programa para consumidores privados y excluyen la participación comercial.

## Despliegue y operación

1. Las migraciones de tablas y búsqueda ya están aplicadas en Supabase.
2. El primer sync productivo se validó el 2026-09-04: 2.811 productos y 43
   categorías, sin hojas vacías. El cliente ya incluye navegación, búsqueda,
   favoritos, carrito y ficha básica de Lidl.
3. Comparar al menos dos o tres tiendas antes de decidir si `ES3572` representa
   el alcance que se mostrará en la app.
4. Tras la validación y la revisión de autorización, crear la variable de
   repositorio `LIDL_SYNC_ENABLED=true`. El cron queda preparado para los lunes
   a las 11:20 UTC, pero los runs programados se omiten mientras falte esa
   variable.

Lidl ya está integrado en el catálogo del cliente. El comparador semántico se
mantiene fuera hasta validar cobertura multi-tienda y disponer de EAN reales.

## Variables

| Variable | Uso |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` | destino; obligatorias salvo DRY_RUN |
| `LIDL_STORE_ID=ES3572` | tienda de referencia |
| `LIDL_COUNTRY=ES`, `LIDL_LANGUAGE=es` | país e idioma de la API |
| `DRY_RUN=1` | descarga y valida sin escribir |
| `MAX_LEAVES=N` | limita ramas solo en DRY_RUN |
| `MIN_PRODUCTS=2200`, `MIN_LEAVES=35` | guardarraíles absolutos contra catálogos parciales |
| `MIN_NONEMPTY_LEAVES=40`, `EMPTY_LEAF_RETRIES=3` | reintenta y bloquea la publicación si una rama desaparece temporalmente |
| `MIN_COVERAGE_RATIO=0.85` | exige al menos el 85 % del catálogo publicado anterior |
| `CONCURRENCY=4`, `PAGE_SIZE=100` | ritmo de descarga |

Prueba local completa, sin escritura:

```powershell
$env:DRY_RUN='1'
node scripts/sync-lidl.mjs
Remove-Item Env:DRY_RUN
```
