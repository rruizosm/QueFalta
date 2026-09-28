# Sync de Hipercor

El estado completo de la integración, las tablas y las decisiones de arquitectura
están en [`HIPERCOR.md`](../HIPERCOR.md).

`sync-hipercor.mjs` carga en Supabase el catálogo público de Hipercor mediante
Chrome/Playwright. Primero resuelve cada código postal público configurado a su
`page.store_id`; después recorre las diez categorías raíz una sola vez por centro
único. La ficha vive en `hipercor_product_master` y precio, oferta, disponibilidad
y surtido viven en `hipercor_center_products`.

La unidad autoritativa es el **centro de preparación**. Dos CP que resuelven al
mismo centro solo generan un crawl, pero antes se compara una huella de la primera
página (productos, precios y disponibilidad). Si difiere, el proceso falla en vez
de asumir que son equivalentes.

Desde el 14-09-2026 Akamai bloquea de forma sostenida los runners alojados de
GitHub al terminar las ~204 páginas de Alimentación. El último éxito remoto fue
el 13-09-2026. La vía productiva es ahora el runner local de Windows; el workflow
de GitHub conserva únicamente el disparo manual para diagnóstico.

## Preparación

1. Tener aplicadas `20260923104530_hipercor_multicenter_catalog.sql` y
   `20260923104854_hipercor_multicenter_hardening.sql`.
2. Añadir `SUPABASE_SERVICE_ROLE` a `.env.local` para las publicaciones locales.
   Las validaciones sin `-Publish` no leen esa credencial ni escriben Supabase.
3. Preparar una lista pública de CP, uno por línea o separados por coma/espacio.
   Se admiten comentarios desde `#`. No se leen CP de perfiles de usuario.

## Ejecución local en Windows

Desde la raíz del repositorio:

```powershell
# Validación completa, sin escribir en Supabase
.\scripts\run-hipercor-sync.ps1

# Publicación completa
.\scripts\run-hipercor-sync.ps1 -PostalCodesFile .\datos\cp-hipercor.txt -Publish

# Piloto: resolver dos CP y descargar como máximo dos centros
.\scripts\run-hipercor-sync.ps1 -PostalCodes '28050,28051' -MaxCenters 2

# Solo publicar CP → centro, sin descargar catálogos
.\scripts\run-hipercor-sync.ps1 -PostalCodesFile .\datos\cp-hipercor.txt -LocationOnly -Publish

# Exploración: prueba siete sufijos por provincia (364 CP candidatos)
.\scripts\run-hipercor-sync.ps1 -DiscoverProvinces -LocationOnly

# Continuar desde la última categoría terminada después de una interrupción
.\scripts\run-hipercor-sync.ps1 -PostalCodesFile .\datos\cp-hipercor.txt -Resume -Publish
```

El runner usa el Chrome instalado, guarda logs en `scripts/logs/` y conserva
solo los 14 últimos. Por defecto espera 1,5–3 segundos entre páginas y 15
segundos entre categorías. Si Akamai responde `Access Denied`, registra HTTP,
URL y referencia cuando existen y espera 90 segundos antes de reintentar.

La resolución postal usa `scripts/logs/hipercor-location-checkpoint.json` y cada
centro usa un fichero independiente
`scripts/logs/hipercor-sync-checkpoint-<centro>.json`. Una ejecución interrumpida
conserva tanto los CP ya resueltos como los centros terminados; `-Resume` continúa
sin repetir sus páginas. Los checkpoints solo se eliminan cuando termina todo el
lote, de modo que un fallo en el último centro no obliga a descargar de nuevo los
anteriores.

Cada resolución, también en `DRY_RUN`, deja
`scripts/logs/hipercor-location-report.json` con el mapa CP→centro, CP agrupados
por centro y huellas comparadas. Este informe no contiene cookies de sesión. La
exploración provincial sirve para descubrir centros candidatos; no sustituye una
lista pública exhaustiva de CP cuando la app necesite resolver cualquier CP exacto.
Por seguridad, un checkpoint de más de siete días se rechaza y exige empezar un
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

No se debe solapar una ejecución con otra. La limpieza de obsoletos está acotada
al centro que acaba de validarse; un centro nuevo permanece `selectable=false`
hasta que su catálogo completo ha sido publicado. El catálogo legacy solo se
actualiza cuando el lote incluye el centro `010130`.

## Prueba sin escrituras

```bash
DRY_RUN=1 HIPERCOR_POSTAL_CODES=28050 PW_CHANNEL=chrome MIN_PRODUCTS=1 MAX_PAGES_PER_CATEGORY=1 node scripts/sync-hipercor.mjs
```

Variables principales:

| Variable | Por defecto | Uso |
|---|---:|---|
| `MIN_PRODUCTS` | `10000` | Guardarraíl previo a escritura/despublicación. |
| `MAX_PAGES_PER_CATEGORY` | sin límite | Limita páginas por raíz para pruebas. |
| `HIPERCOR_POSTAL_CODES` | vacío | CP públicos separados por coma, espacio, `;` o salto de línea. |
| `HIPERCOR_POSTAL_CODES_FILE` | vacío | Fichero público de CP; admite comentarios `#`. |
| `HIPERCOR_DISCOVER_PROVINCES` | `0` | `1` prueba siete CP candidatos por provincia. |
| `HIPERCOR_LOCATION_ONLY` | `0` | `1` solo resuelve y publica CP → centro. |
| `HIPERCOR_MAX_POSTAL_CODES` | sin límite | Limita CP del plan para un piloto. |
| `HIPERCOR_MAX_CENTERS` | sin límite | Limita centros cuyo catálogo se descarga. |
| `HIPERCOR_REQUIRE_SHARED_CENTER_PARITY` | `1` | Exige la misma huella a CP que comparten centro. |
| `HIPERCOR_MIN_CATEGORY_COVERAGE` | `0.85` | Cobertura mínima frente al recuento SSR en crawls completos. |
| `HIPERCOR_LOCATION_DELAY_MS` | `2000` | Pausa entre resoluciones postales. |
| `PW_CHANNEL` | `chrome` | Canal de navegador de Playwright. |
| `HEADLESS` | `1` | `0` muestra el navegador. |
| `NAV_TIMEOUT_MS` | `45000` | Timeout por página. |
| `PAGE_DELAY_MIN_MS` | `1500` | Pausa aleatoria mínima entre páginas. |
| `PAGE_DELAY_MAX_MS` | `3000` | Pausa aleatoria máxima entre páginas. |
| `CATEGORY_DELAY_MS` | `15000` | Pausa entre categorías raíz. |
| `WAF_COOLDOWN_MS` | `90000` | Espera antes de reintentar un bloqueo WAF. |
| `MAX_ATTEMPTS` | `3` | Intentos máximos por página. |
| `RESUME` | `0` | `1` reanuda el checkpoint existente. |
| `HIPERCOR_CHECKPOINT` | `scripts/logs/hipercor-sync-checkpoint.json` | Ruta base; se añade el id de centro. |
| `HIPERCOR_LOCATION_CHECKPOINT` | `scripts/logs/hipercor-location-checkpoint.json` | Checkpoint de resolución postal. |
| `HIPERCOR_LOCATION_REPORT` | `scripts/logs/hipercor-location-report.json` | Informe persistente CP→centro y paridad. |
| `HIPERCOR_CHECKPOINT_MAX_AGE_HOURS` | `168` | Antigüedad máxima reanudable. |

## Alcance de ubicación

La modalidad canónica de este sync es `home_delivery`. El CP se introduce en el
selector público «Envío» y el `store_id` observado en el catálogo decide el centro.
Los CP sin cobertura y los catálogos vacíos se guardan de forma explícita. Los
errores técnicos también se auditan, pero hacen fallar el lote.

Sin `HIPERCOR_POSTAL_CODES`, fichero ni exploración provincial, el script conserva
el modo anterior y sincroniza únicamente el centro público por defecto. Este modo
existe para compatibilidad; no crea cobertura postal nueva.
