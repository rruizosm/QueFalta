# Sync local de Alcampo con Playwright

El endpoint JSON de Alcampo responde correctamente a la primera petición y
después devuelve una página de verificación. Este runner usa Chromium visible,
un perfil persistente y el estado SSR de las páginas de categoría.

Además del catálogo ordinario de alimentación, el runner recorre las hojas de
`Folletos y Promociones` y `Campañas`, descubre sus identificadores de oferta y
abre la landing canónica `/offers/x/{id}` de cada una. Esa landing contiene el
conjunto completo de productos de la campaña, por lo que no se limita a las
primeras tarjetas de una categoría. Solo se publican productos pertenecientes
al catálogo de alimentación de QuéFalta; las páginas promocionales se usan para
completar y contrastar todas sus promociones.

Cada producto conserva un resumen compatible en `promo_*` y el array completo
en `promo_details`. Cada entrada incluye identificador, texto, tipo, vigencia,
cantidad requerida, rutas de origen y `online_only`. La columna
`promo_online_only` indica que el producto tiene al menos una promoción
exclusiva online. Requiere aplicar antes la migración
`20260924072152_alcampo_complete_promotions.sql`.

Desde `MercaAppMobile`:

```powershell
# Piloto seguro: dos hojas, sin escribir en Supabase
.\scripts\run-alcampo-playwright.ps1 -MaxLeaves 2 -MaxPromotionLeaves 2 -DelayMs 1500

# Validación completa, todavía sin publicar
.\scripts\run-alcampo-playwright.ps1

# Publicación completa; solo después de revisar el resultado DRY_RUN
.\scripts\run-alcampo-playwright.ps1 -Publish
```

Cuando una publicación completa termina con código 0, el runner actualiza a
continuación la capa del comparador para Alcampo y arranca el procesamiento de
los embeddings nuevos. Las validaciones sin `-Publish` omiten este postproceso.

La ejecución completa es deliberadamente larga: mantiene una sola pestaña y
espera entre categorías, hojas promocionales y landings para reducir la
probabilidad de activar de nuevo la verificación. Si el navegador muestra
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
`logs/alcampo-playwright-checkpoint.json` después de cada hoja y landing. Incluye
por separado el avance del catálogo, el directorio promocional y las landings.
Si se cierra accidentalmente la pestaña o se interrumpe el proceso, se puede
continuar desde el último punto guardado:

```powershell
.\scripts\run-alcampo-playwright.ps1 -Resume
```

Para publicar una ejecución reanudada, usar `-Resume -Publish` únicamente tras
comprobar que el checkpoint corresponde al mismo catálogo y recorrido.
