# Sync de bonÀrea — espejo del catálogo en Supabase

bonÀrea expone una **API JSON propia** (no hace falta navegador headless ni parsear
HTML, a diferencia de Bonpreu/Carrefour) y **no está tras Cloudflare**, así que el sync
corre en **GitHub Actions** como Mercadona/Bonpreu (no hace falta tu PC, a diferencia de
Carrefour, que sí está tras Cloudflare y por eso va en local).

- **Vía recomendada:** workflow [`.github/workflows/sync-bonarea.yml`](../.github/workflows/sync-bonarea.yml)
  (cron diario 06:00 UTC + botón "Run workflow"). Usa los secrets `SUPABASE_URL` y
  `SUPABASE_SERVICE_ROLE` que ya existen en el repo. Sin Playwright: solo `curl` + node.
- **Local (opcional):** `scripts/run-bonarea-sync.ps1`, útil para probar a mano. Único
  caveat de CI: si bonÀrea geobloqueara IPs de fuera de España (runners en EE.UU.), habría
  que volver a local — se comprueba lanzando el workflow una vez.

## Cómo funciona (la API descubierta)

- **Catálogo + navegación:** `POST /es/shop/ShoppingBody` con body `reference=<idNivell>`
  (form-urlencoded) → JSON con:
  - `articles[]`: productos ya estructurados (`identifier`, `description`, `priceToPay`,
    `image`, `unitPrice` "€/kg", `itsOnStock`, `maximumStock`, `urlFriendly`…).
  - `nivells[]`: el **árbol de categorías anidado completo** (idNivell, descripcio, children, url).
- Los **nodos contenedores** devuelven 0 (o un agregado) y las **hojas** su propio listado,
  así que el sync recorre solo las hojas (≈730) → partición limpia del catálogo.
- **Ids con asterisco** (`13*5304`, `13*300*010`). La web los muestra con guion bajo en las
  URLs (`13_5304`). Guardamos el asterisco porque es lo que pide el carrito.
- **Añadir al carrito** (no lo usa el sync, pero queda documentado): `POST /es/shop/ModifGetCart`
  con `idArticle=13*5304&actionUnits=1` (`+1`/`-1`/`+0` para sumar/restar/refrescar).
- El prefijo `13` es el **centro** (Guissona, el por defecto). El catálogo es de ese centro.

## 1. Crear las tablas en Supabase (una vez)

En Supabase → **SQL Editor**, ejecuta
[`supabase/migrations/bonarea_catalog.sql`](../supabase/migrations/bonarea_catalog.sql).
Crea `bonarea_products` y `bonarea_categories`. Sin esto, el sync falla al escribir.

## 2. Service_role key en `.env.local`

Igual que Carrefour: añade en `MercaAppMobile/.env.local` (gitignored) la línea
`SUPABASE_SERVICE_ROLE=eyJhbGciOi...` (Supabase → Project Settings → API → service_role).

## 3. Probar a mano

```powershell
# Prueba rápida sin escribir en Supabase (12 hojas):
$env:DRY_RUN='1'; $env:MAX_CATEGORIES='12'; node scripts/sync-bonarea.mjs

# Run real (escribe en Supabase, lee secretos de .env.local):
& "C:\Users\ruben\OneDrive\Escritorio\MercaApp\MercaAppMobile\scripts\run-bonarea-sync.ps1"
```

Debe terminar con `[bonarea] OK`. El log queda en `scripts/logs/bonarea-sync-<fecha>.log`.

### Variables de entorno

| Var | Por defecto | Uso |
|-----|-------------|-----|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE` | — | destino (obligatorias salvo DRY_RUN) |
| `LOCALE` | `es` | idioma de los nombres (`es` o `ca`) |
| `CONCURRENCY` | `5` | hojas en paralelo |
| `DRY_RUN` | — | `1` = no escribe, imprime resumen |
| `MAX_CATEGORIES` | ∞ | limita nº de hojas (pruebas) |
| `KEEP_N1` | `13*300,13*310,13*320` | categorías raíz a incluir (whitelist). Por defecto **solo comida y bebida** (Alimentació, Cuinats, Begudes); `all` = todas; CSV de ids para otra selección |

## 4. Programarlo 1×/día (Tarea Programada de Windows)

```powershell
$ps1 = "C:\Users\ruben\OneDrive\Escritorio\MercaApp\MercaAppMobile\scripts\run-bonarea-sync.ps1"
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`""
$trigger  = New-ScheduledTaskTrigger -Daily -At 9:15am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName 'QueFalta - Sync bonArea' -Action $action -Trigger $trigger -Settings $settings -Description 'Sincroniza el catalogo de bonArea a Supabase' -Force
```

(Como no hay Cloudflare, también vale moverlo a GitHub Actions junto a Mercadona/Bonpreu.)

## Notas / pendiente

- **Cobertura:** se recorren las hojas. Si algún producto vive solo en un nodo
  intermedio "destacado" (los N1 devuelven ~50 ítems propios), podría no capturarse;
  para el prototipo es marginal.
- **App (pendiente):** falta cablear la lectura en `src/api/catalog.ts`
  (`searchBonareaProducts`, `fetchBonareaCategoryTree`, `fetchBonareaProductsByCategory`),
  añadir `bonarea` a `CatalogStore`/`CATALOG_STORES` en `src/constants/stores.ts`, y una
  pantalla/modal como los de Carrefour. El árbol tiene 4 niveles (vs 2 de las otras).
