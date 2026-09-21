# Sync de Hipercor

`sync-hipercor.mjs` carga en Supabase el catálogo público de Hipercor mediante
Chrome/Playwright. Recorre las diez categorías raíz públicas y todas sus páginas
SSR; deduplica por el id público `B…` y conserva precio, precio por unidad,
disponibilidad, novedad y promociones explícitas.

Desde el 14-09-2026 Akamai bloquea de forma sostenida los runners alojados de
GitHub al terminar las ~204 páginas de Alimentación. El último éxito remoto fue
el 13-09-2026. La vía productiva es ahora el runner local de Windows; el workflow
de GitHub conserva únicamente el disparo manual para diagnóstico.

## Preparación

1. Ejecutar `supabase/migrations/hipercor_catalog.sql` en Supabase SQL Editor.
2. Ejecutar de nuevo `supabase/migrations/similar_products.sql` cuando se añada
   Hipercor también a la comparativa y al cliente.
3. Añadir `SUPABASE_SERVICE_ROLE` a `.env.local` para las publicaciones locales.
   Las validaciones sin `-Publish` no leen esa credencial ni escriben Supabase.

## Ejecución local en Windows

Desde la raíz del repositorio:

```powershell
# Validación completa, sin escribir en Supabase
.\scripts\run-hipercor-sync.ps1

# Publicación completa
.\scripts\run-hipercor-sync.ps1 -Publish

# Continuar desde la última categoría terminada después de una interrupción
.\scripts\run-hipercor-sync.ps1 -Resume -Publish
```

El runner usa el Chrome instalado, guarda logs en `scripts/logs/` y conserva
solo los 14 últimos. Por defecto espera 1,5–3 segundos entre páginas y 15
segundos entre categorías. Si Akamai responde `Access Denied`, registra HTTP,
URL y referencia cuando existen y espera 90 segundos antes de reintentar.

Tras cada categoría terminada se escribe atómicamente
`scripts/logs/hipercor-sync-checkpoint.json`. Una ejecución interrumpida conserva
el catálogo acumulado; `-Resume` continúa en la categoría siguiente. Las filas
se vuelven a sellar con la fecha de la publicación final, por lo que la limpieza
de obsoletos no descarta los productos recuperados del checkpoint. El fichero se
elimina después de un `DRY_RUN` completo o una publicación completa correcta.
Por seguridad, un checkpoint de más de 24 horas se rechaza y exige empezar un
recorrido nuevo.

Para ver Chrome durante una ejecución manual:

```powershell
.\scripts\run-hipercor-sync.ps1 -Visible
```

Para el Programador de tareas, usar `powershell.exe` con estos argumentos y
configurar como directorio inicial la raíz del repositorio:

```text
-NoProfile -ExecutionPolicy Bypass -File "C:\ruta\QueFalta\scripts\run-hipercor-sync.ps1" -Publish
```

No se debe solapar una ejecución con otra. Si falla, la publicación no marca
productos como obsoletos ni actualiza `catalog_sync_status`.

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
| `PAGE_DELAY_MIN_MS` | `1500` | Pausa aleatoria mínima entre páginas. |
| `PAGE_DELAY_MAX_MS` | `3000` | Pausa aleatoria máxima entre páginas. |
| `CATEGORY_DELAY_MS` | `15000` | Pausa entre categorías raíz. |
| `WAF_COOLDOWN_MS` | `90000` | Espera antes de reintentar un bloqueo WAF. |
| `MAX_ATTEMPTS` | `3` | Intentos máximos por página. |
| `RESUME` | `0` | `1` reanuda el checkpoint existente. |
| `HIPERCOR_CHECKPOINT` | `scripts/logs/hipercor-sync-checkpoint.json` | Ruta del checkpoint. |
| `HIPERCOR_CHECKPOINT_MAX_AGE_HOURS` | `24` | Antigüedad máxima reanudable. |

## Alcance de ubicación

Hipercor determina surtido, precio y oferta según el centro de entrega. Esta
primera sincronización no usa CP, dirección, cuenta ni carrito: sólo refleja el
centro público que la web proporciona. El id de centro queda en `raw.centerId`
para una futura normalización por zona; no se deben presentar estos precios como
personalizados para la ubicación del usuario.
