# Sync local de Froiz

Froiz bloquea o degrada las ejecuciones desde GitHub Actions. El proceso
productivo se lanza desde Windows mediante el wrapper local:

```powershell
.\scripts\run-froiz-sync.ps1
```

El wrapper carga indirectamente las credenciales de `.env.local`, conserva los
14 logs más recientes en `scripts/logs/` y, si el sync termina con código 0,
ejecuta `sync-comparator-embedding-catalog.mjs` limitado a `STORES=froiz`.
Este segundo paso materializa los productos nuevos o semánticamente modificados
y da el impulso inicial a los workers de embeddings.

La tarea semanal ejecuta este wrapper después de DIA cada lunes a las 09:50,
hora local de Windows. La configuración está documentada en
[`README-dia-sync.md`](README-dia-sync.md#4-programarlo-1semana-en-windows).

Para probar el origen sin escribir en Supabase ni arrancar embeddings:

```powershell
$env:DRY_RUN = '1'
node scripts/sync-froiz.mjs
Remove-Item Env:DRY_RUN
```
