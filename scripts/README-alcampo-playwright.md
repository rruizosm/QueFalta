# Sync local de Alcampo con Playwright

El endpoint JSON de Alcampo responde correctamente a la primera petición y
después devuelve una página de verificación. Este runner usa Chromium visible,
un perfil persistente y el estado SSR de las páginas de categoría.

Desde `MercaAppMobile`:

```powershell
# Piloto seguro: dos hojas, sin escribir en Supabase
.\scripts\run-alcampo-playwright.ps1 -MaxLeaves 2 -DelayMs 1500

# Validación completa, todavía sin publicar
.\scripts\run-alcampo-playwright.ps1

# Publicación completa; solo después de revisar el resultado DRY_RUN
.\scripts\run-alcampo-playwright.ps1 -Publish
```

Cuando una publicación completa termina con código 0, el runner actualiza a
continuación la capa del comparador para Alcampo y arranca el procesamiento de
los embeddings nuevos. Las validaciones sin `-Publish` omiten este postproceso.

La ejecución completa es deliberadamente larga: mantiene una sola pestaña y
espera entre categorías para reducir la probabilidad de activar de nuevo la
verificación. Si el navegador muestra `Human Verification`, hay que resolverla
manualmente en la ventana visible; si no se resuelve, el proceso termina sin
escribir.

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

El runner guarda un checkpoint en `logs/alcampo-playwright-checkpoint.json`
después de cada hoja. Si se cierra accidentalmente la pestaña o se interrumpe
el proceso, se puede continuar desde el último punto guardado:

```powershell
.\scripts\run-alcampo-playwright.ps1 -Resume
```

Para publicar una ejecución reanudada, usar `-Resume -Publish` únicamente tras
comprobar que el checkpoint corresponde al mismo catálogo y recorrido.
