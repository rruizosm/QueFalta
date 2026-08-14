# Sync Ahorramás

`sync-ahorramas.mjs` replica el catálogo público de Ahorramás desde sus páginas
Demandware/SFCC. No inicia sesión ni añade productos a ninguna cesta. La primera
versión usa el surtido de referencia sin CP: no afirmar que el precio sea el de
la tienda local hasta incorporar variantes por `commerceId`.

## Antes del primer run

1. Ejecutar `supabase/migrations/ahorramas_catalog.sql` en Supabase SQL Editor.
2. Añadir Ahorramás a `similar_products.sql` y volver a ejecutar esa migración
   para que aparezca en la comparativa automática.
3. Lanzar **Sync Ahorramás catalog** manualmente y revisar su resumen.

## Variables

| Variable | Uso |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE` | Destino (obligatorias salvo DRY_RUN) |
| `DRY_RUN=1` | Descarga y resume sin escribir |
| `MAX_CATEGORIES=N` | Limita categorías para pruebas |
| `MIN_PRODUCTS=5000` | Guardarraíl contra una descarga parcial |

El workflow corre diariamente a las 06:00 UTC. Si cambia el HTML o la
paginación, el guardarraíl evita despublicar el catálogo anterior.
