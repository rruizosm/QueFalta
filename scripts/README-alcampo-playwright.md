# Sync local de Alcampo: catálogo Playwright y ofertas API

Actualización 15-10-2026: el runner integra el cliente JSON anónimo de
[README-alcampo-api.md](README-alcampo-api.md) para las ofertas. Playwright se
utiliza únicamente para el catálogo ordinario de alimentación, cuyo listado
general por API sigue respondiendo 403.

Para el catálogo se mantiene Chromium visible, un perfil persistente y el estado
SSR de las páginas de categoría. La paginación y la decoración del catálogo
siguen realizándose dentro de esa sesión. El navegador se cierra al terminar
esta fase.

Después, mediante peticiones HTTP de Node y cookies anónimas en memoria:

1. Recorre `/api/product-listing-pages/v1/pages/promotions` y las hojas de
   `Folletos y Promociones` y `Campañas` usando `retailerCategoryId`.
2. Solicita 300 productos decorados por página y sigue cada `nextPageToken`
   hasta agotarlo. No confirma un listado truncado ni referencias sin datos.
3. Consulta `/api/webproductpagews/v4/promotion/retailer-id/{id}` para cada
   campaña descubierta, incluidas las encontradas en otras campañas.
4. Fusiona únicamente productos alimentarios, conservando condiciones, precios
   promocionales, €/unidad, exclusividad online y vigencia estructurada.

No abre `/promotions` ni `/offers/x/{id}` en el navegador. Un 403, una campaña
incorrecta, un detalle incompleto o un cursor no soportado detienen el proceso
sin publicar; no hay fallback de ofertas a Playwright. Las fechas estructuradas
UTC se convierten a fecha local de España (`Europe/Madrid`).

La región anónima de la API debe coincidir con la región del catálogo SSR y del
checkpoint, si este la guarda. Una diferencia aborta antes de mezclar precios.
Esto no implementa ofertas multirregión ni equipara los folletos Canarias/resto.

Cada producto conserva un resumen compatible en `promo_*` y el array completo
en `promo_details`. Cada entrada incluye identificador, texto, tipo, vigencia,
cantidad requerida, rutas de origen y `online_only`. La columna
`promo_online_only` indica que el producto tiene al menos una promoción
exclusiva online. Requiere aplicar antes la migración
`20260924072152_alcampo_complete_promotions.sql`.

Desde `MercaAppMobile`:

```powershell
# Piloto seguro: dos hojas de catálogo y dos promocionales por API, sin publicar
.\scripts\run-alcampo-playwright.ps1 -MaxLeaves 2 -MaxPromotionLeaves 2 -DelayMs 1500

# Validación completa, todavía sin publicar
.\scripts\run-alcampo-playwright.ps1

# Publicación completa; solo después de revisar el resultado DRY_RUN
.\scripts\run-alcampo-playwright.ps1 -Publish
```

Cuando una publicación completa termina con código 0, el runner actualiza a
continuación la capa del comparador para Alcampo y arranca el procesamiento de
los embeddings nuevos. Las validaciones sin `-Publish` omiten este postproceso.

La ejecución completa mantiene una sola pestaña durante el catálogo y espera
entre categorías. La fase API conserva pausas entre páginas, directorios y
campañas. `-MaxPromotionLeaves` limita los directorios API y omite el directorio
global en el piloto; los recorridos limitados no se pueden publicar. Si el navegador muestra
`Human Verification`, hay que resolverla manualmente en la ventana visible; si
no se resuelve, el proceso termina sin escribir.

El runner no publica nada hasta haber recorrido todas las hojas seleccionadas y
superar `MIN_PRODUCTS` (por defecto, 8.000). En modo publicación actualiza las
categorías y productos y solo después marca como no publicados los elementos no
vistos. No descarga fichas PDP en esta primera fase, porque esas llamadas tienen
el mismo bloqueo; los campos de ficha existentes no se pisan al hacer merge.

El perfil se guarda en `C:\tmp\alcampo-playwright-profile`. Para usar otro:

```powershell
$env:ALCAMPO_PROFILE = 'C:\ruta\perfil-alcampo'
.\scripts\run-alcampo-playwright.ps1 -MaxLeaves 2
```

El runner guarda un checkpoint versionado en
`logs/alcampo-playwright-checkpoint.json` después de cada hoja de catálogo,
directorio API completo y detalle de campaña validado. Guarda también la región;
las cookies y tokens de sesión permanecen en memoria. Los marcadores de ofertas
son `api:promotion:*` y `api:offer:*`.
Si se cierra accidentalmente la pestaña o se interrumpe el proceso, se puede
continuar desde el último punto guardado:

```powershell
.\scripts\run-alcampo-playwright.ps1 -Resume
```

Para publicar una ejecución reanudada, usar `-Resume -Publish` únicamente tras
comprobar que el checkpoint corresponde al mismo catálogo y recorrido.

La primera reanudación de un checkpoint con promociones de navegador conserva
los productos guardados, pero revalida el recorrido y redescubre campañas: sus
marcadores antiguos no acreditan cobertura de la API nueva. El cambio de código
no modifica el checkpoint existente por sí solo. Para un piloto independiente,
usar `ALCAMPO_RESUME_FILE` con otra ruta y no pasar `-Resume`.

Validación local del cambio: pruebas API, ofertas, crawl y normalización;
55 pruebas dirigidas, TypeScript y sintaxis correctos. Piloto real del módulo
de ofertas: directorio de Plátanos y Bananas (2 productos) y sus 2 campañas,
con 864 productos únicos combinados. En ese piloto se limitó la cola a las
campañas del directorio; no se expandieron las campañas adicionales descubiertas
en los detalles. Evidencia en `tmp/alcampo-offers-smoke-20261015.json`.
No se ha ejecutado el barrido híbrido completo ni publicado en Supabase. La
migración de promociones continúa siendo un requisito previo al futuro `-Publish`.
