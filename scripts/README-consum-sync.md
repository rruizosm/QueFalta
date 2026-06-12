# Sync de Consum — espejo del catálogo en Supabase

Consum expone una **API REST JSON abierta** (sin auth, sin cookies, sin Cloudflare):
la integración más limpia de los cinco súpers. Es además el **único que da EAN y
marca estructurados**, y trae el **precio de oferta** separado del normal.

- **Vía recomendada:** workflow [`.github/workflows/sync-consum.yml`](../.github/workflows/sync-consum.yml)
  (cron diario 06:30 UTC + botón "Run workflow"). Usa los secrets `SUPABASE_URL` y
  `SUPABASE_SERVICE_ROLE` que ya existen en el repo. Solo node (fetch nativo).
- **Local (opcional):** `scripts/run-consum-sync.ps1`, útil para probar a mano.

## Cómo funciona (la API descubierta, verificada 2026-06-12)

- **Árbol de categorías:** `GET https://tienda.consum.es/api/rest/V1.0/shopping/category/menu`
  → 13 N1 con `subcategories` anidadas hasta nivel 4 (~810 categorías). La N1
  **"Ahora más barato" (id 99999) se excluye**: es promocional y duplica productos.
- **Catálogo completo:** `GET /api/rest/V1.0/catalog/product?offset=N&limit=100`
  → `{ totalCount, hasMore, products[] }`. El límite real por página es **100**
  (~94 peticiones para los ~9.400 productos). No hace falta recorrer hojas como en
  bonÀrea/Carrefour: **cada producto trae sus categorías hoja en `categories[]`**.
- **Producto:** `code` (id público, en URL e imagen), `ean`, `productData`
  (`name`, `brand.name`, `imageURL`, `description`, `availability`),
  `priceData.prices[]` con `PRICE` y, si hay oferta, `OFFER_PRICE` (se guarda el
  de oferta = lo que paga el cliente). **OJO:** `centAmount` viene en EUROS pese
  al nombre (1.45 = 1,45 €). `centUnitAmount` + `unitPriceUnitType` ("1 Kg") dan
  el €/unidad → `price_per_unit` canónico (l/kg/ud) vía `lib/price.mjs`.
- **Búsqueda** (no la usa el sync; documentada para el futuro):
  `GET /api/rest/V1.0/catalog/searcher/products?q=<texto>&limit=10`.
- Los precios son los de la **zona por defecto** (sesión anónima, sin código postal).

## 1. Crear las tablas en Supabase (una vez)

En Supabase → **SQL Editor**, ejecuta
[`supabase/migrations/consum_catalog.sql`](../supabase/migrations/consum_catalog.sql).
Crea `consum_products` y `consum_categories`. Sin esto, el sync falla al escribir.

## 2. Service_role key en `.env.local`

Igual que Carrefour/bonÀrea: añade en `MercaAppMobile/.env.local` (gitignored) la línea
`SUPABASE_SERVICE_ROLE=eyJhbGciOi...` (Supabase → Project Settings → API → service_role).

## 3. Probar a mano

```powershell
# Prueba rápida sin escribir en Supabase (5 páginas = 500 productos):
$env:DRY_RUN='1'; $env:MAX_PAGES='5'; node scripts/sync-consum.mjs

# Run real (escribe en Supabase, lee secretos de .env.local):
& "C:\Users\ruben\OneDrive\Escritorio\MercaApp\MercaAppMobile\scripts\run-consum-sync.ps1"
```

Debe terminar con `[consum] OK`. El log queda en `scripts/logs/consum-sync-<fecha>.log`.

Resultado del DRY_RUN completo (2026-06-12): 9.351 productos, 0 sin precio,
0 sin imagen, 148 sin €/unidad (1,6 %), 74 sin EAN, 1.249 con oferta.

### Variables de entorno

| Var | Por defecto | Uso |
|-----|-------------|-----|
| `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE` | — | destino (obligatorias salvo DRY_RUN) |
| `CONCURRENCY` | `4` | páginas en paralelo |
| `DRY_RUN` | — | `1` = no escribe, imprime resumen |
| `MAX_PAGES` | ∞ | limita nº de páginas (pruebas) |
| `SKIP_N1` | `99999` | N1 a excluir (CSV). Por defecto solo la promo "Ahora más barato" |

## 4. Programarlo 1×/día (si se prefiere local en vez de Actions)

```powershell
$ps1 = "C:\Users\ruben\OneDrive\Escritorio\MercaApp\MercaAppMobile\scripts\run-consum-sync.ps1"
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`""
$trigger  = New-ScheduledTaskTrigger -Daily -At 9:30am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 30)
Register-ScheduledTask -TaskName 'QueFalta - Sync Consum' -Action $action -Trigger $trigger -Settings $settings -Description 'Sincroniza el catalogo de Consum a Supabase' -Force
```

## Notas

- **Carrito (futuro):** no investigado aún; la web tiene carrito pero seguramente
  exija login. No bloquea nada de lo actual (catálogo + búsqueda + comparativa).
- **Geobloqueo:** las pruebas desde fuera de España funcionaron → GitHub Actions
  debería ir bien; si algún día falla con 403, mover a local como Carrefour.
- **EAN:** `consum_products.ean13` abre la puerta a matching EXACTO de productos
  entre súpers en la comparativa (hoy se hace por nombre); Mercadona/Bonpreu/
  Carrefour/bonÀrea no lo dan, pero si se añade otra fuente con EAN, ya está aquí.
