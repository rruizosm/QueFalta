-- REPARACIÓN one-off: precio del envase mal guardado en bonpreu_products.
--
-- Bug (sync-bonpreu.mjs, corregido 2026-06-12): el extractor buscaba
-- price.current.amount, pero el JSON real de Bonpreu trae price.amount (plano),
-- así que TODAS las filas caían al fallback unitPrice.price.amount = el €/kg|€/L
-- de REFERENCIA. Resultado: ~50% del catálogo con el precio del envase mal
-- (todo producto cuyo envase ≠ 1 unidad de medida): "BONKA Café molido mezcla"
-- (0,4 kg) mostraba 14,88 € (su €/kg) en vez de 5,95 €.
--
-- El raw jsonb ya contiene el precio correcto → se repara desde ahí, sin
-- re-scrapear. El sync corregido mantiene el dato bien a partir de ahora.
-- price_per_unit (canónico) y price_format (referencia) NO estaban afectados.
-- Ejecutar en: Supabase → SQL Editor. Es idempotente.

update public.bonpreu_products
set unit_price = (raw->'price'->>'amount')::numeric
where raw->'price'->>'amount' ~ '^[0-9]+(\.[0-9]+)?$'
  and unit_price is distinct from (raw->'price'->>'amount')::numeric;

-- Verificación rápida (debe devolver 5.95):
-- select unit_price from public.bonpreu_products where display_name = 'BONKA Café molido mezcla';
