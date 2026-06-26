# Sync de Carrefour — tarea programada en tu PC

Carrefour está detrás de **Cloudflare**, que bloquea con un **403** las IPs de
datacenter de GitHub Actions. Tu IP residencial española **sí** pasa, así que el
sync de Carrefour se ejecuta desde tu PC con una Tarea Programada de Windows
(Mercadona y Bonpreu siguen en GitHub Actions; solo Carrefour va en local).

## 1. Crear las tablas en Supabase (una vez)

En Supabase → **SQL Editor**, ejecuta
[`supabase/migrations/carrefour_catalog.sql`](../supabase/migrations/carrefour_catalog.sql).
Crea `carrefour_products` y `carrefour_categories`. Sin esto, el sync falla al
escribir.

## 2. Poner la service_role key en `.env.local`

`MercaAppMobile/.env.local` (gitignored) ya tiene `EXPO_PUBLIC_SUPABASE_URL`.
Añade una línea con la **service_role key** (la misma que el secret
`SUPABASE_SERVICE_ROLE` de GitHub — Supabase → Project Settings → API → service_role):

```
SUPABASE_SERVICE_ROLE=eyJhbGciOi...la-clave-secreta...
```

> La service_role salta RLS: trátala como secreta. `.env.local` no se sube a git.

## 3. Probar a mano

Desde PowerShell:

```powershell
& "C:\Users\ruben\OneDrive\Escritorio\MercaApp\MercaAppMobile\scripts\run-carrefour-sync.ps1"
```

Debe terminar con `[carrefour] OK` y poblar ~16.000 productos. El log queda en
`scripts/logs/carrefour-sync-<fecha>.log`.

## 4. Programarlo 1×/semana (lunes 08:00)

Pega esto en PowerShell (crea la tarea "QueFalta - Sync Carrefour", semanal los lunes a las 08:00):

```powershell
$ps1 = "C:\Users\ruben\OneDrive\Escritorio\MercaApp\MercaAppMobile\scripts\run-carrefour-sync.ps1"
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$ps1`""
$trigger  = New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At 8:00am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 40)
Register-ScheduledTask -TaskName 'QueFalta - Sync Carrefour' -Action $action -Trigger $trigger -Settings $settings -Description 'Sincroniza el catalogo de Carrefour a Supabase' -Force
```

- **`-StartWhenAvailable`**: si el PC estaba apagado a las 09:00, la tarea corre
  en cuanto se encienda.
- Corre **solo cuando tu usuario ha iniciado sesión** (no guarda contraseña). Si
  quieres que corra aunque no estés logueado, en el Programador de tareas marca
  "Ejecutar tanto si el usuario inició sesión como si no".
- Necesita `node` en el PATH (ya lo tienes).

### Comprobar / lanzar / quitar la tarea

```powershell
Start-ScheduledTask  -TaskName 'QueFalta - Sync Carrefour'   # lanzarla ahora
Get-ScheduledTaskInfo -TaskName 'QueFalta - Sync Carrefour'  # última ejecución y resultado
Unregister-ScheduledTask -TaskName 'QueFalta - Sync Carrefour' -Confirm:$false  # borrarla
```

## Notas

- Tope de Carrefour: ~1008 productos por categoría N2; las secciones enormes
  (Alimentación, Desayuno, Conservas…) quedan truncadas ahí.
- Si algún día Cloudflare empieza a bloquear también tu IP residencial, las
  alternativas son un proxy residencial en CI o un runner self-hosted.
