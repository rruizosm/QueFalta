# Sync de Plusfresc

Ejecuta `supabase/migrations/plusfresc_catalog.sql` antes del primer sync. El
script usa el centro 12 (Lleida) como base y barre los ocho centros online; une
el surtido por `item_id`, guarda `centers` cuando el producto no está en todos y
`center_prices` para precios distintos. La app resuelve el centro con el CP
exacto del perfil, a partir del mapa de `zones/zipcodes` incluido en
`src/constants/retailerZones.ts`.

```powershell
$env:DRY_RUN='1'; $env:SKIP_DETAIL='1'; node scripts/sync-plusfresc.mjs
```

Usa el centro de referencia por defecto (`12`) en ejecuciones reales, para que
coincida con el fallback cliente.
