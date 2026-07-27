-- Ofertas de BonpreuEsclat a partir de la categoría "Ofertas" (bilingüe "Ofertes").
--
-- Bonpreu tiene una N1 "Ofertas" cuyas subcategorías ("Precio rebajado", "2ª
-- unidad con descuento", "Lotes oferta", "Bonificaciones", "Unidades regalo",
-- "Otras ofertas") agrupan productos que YA están en su categoría real pero en
-- promoción. La usamos como fuente de la pantalla "Ofertas" del Home (el nombre
-- de la subcategoría es el tipo de promo) y la SACAMOS del árbol del catálogo.
--
-- Esta migración: (1) añade las columnas promo_name/promo_name_ca, (2) crea los
-- índices para el keyset de la pantalla de Ofertas y (3) hace BACKFILL instantáneo
-- desde lo ya sincronizado (marca las promos, saca los ids de oferta de
-- category_ids y despublica las categorías de oferta) para no esperar al próximo
-- sync. scripts/sync-bonpreu.mjs mantiene todo esto en cada run (detecta la N1
-- "Ofertas" por nombre, no por uuid).
--
-- Las ofertas se filtran a ALIMENTACIÓN: solo se marcan productos de las ramas N1
-- de OFFER_FOOD_N1 (quedan fuera "Para el hogar", "Espacio mascotas" y "Acción
-- solidaria"). El catálogo normal sigue conteniéndolo todo.
--
-- Requiere catalog_unaccent_search.sql + bonpreu_catalog_ca.sql previas
-- (display_name_norm / display_name_ca_norm). Idempotente. Ejecutar en Supabase → SQL Editor.

alter table public.bonpreu_products add column if not exists promo_name    text;
alter table public.bonpreu_products add column if not exists promo_name_ca text;
alter table public.bonpreu_products add column if not exists promo_price numeric;
alter table public.bonpreu_products add column if not exists promo_base_price numeric;
alter table public.bonpreu_products add column if not exists promo_text text;

-- Recupera la rebaja ya presente en raw para que el detalle no tenga que esperar
-- al próximo sync. Algunas fichas llevan promoPrice; otras solo "Antes X€".
with raw_promo as (
  select
    id,
    nullif(raw #>> '{promoPrice,amount}', '')::numeric as promo_price,
    coalesce(raw #>> '{promotions,description}', raw #>> '{promotions,0,description}') as promo_text
  from public.bonpreu_products
), parsed as (
  select
    p.id,
    rp.promo_price,
    rp.promo_text,
    case
      when rp.promo_price is not null and rp.promo_price < p.unit_price then p.unit_price
      when rp.promo_text ~* '\\mantes\\M\\s*[0-9]+([,.][0-9]{1,2})?\\s*(€|eur)'
        then replace((regexp_match(rp.promo_text, '\\mantes\\M\\s*([0-9]+(?:[,.][0-9]{1,2})?)\\s*(?:€|eur)', 'i'))[1], ',', '.')::numeric
      else null
    end as promo_base_price
  from public.bonpreu_products p
  join raw_promo rp on rp.id = p.id
)
update public.bonpreu_products p
set
  promo_price = case when parsed.promo_price < p.unit_price then parsed.promo_price else null end,
  promo_base_price = case when parsed.promo_base_price > coalesce(parsed.promo_price, p.unit_price) then parsed.promo_base_price else null end,
  promo_text = parsed.promo_text
from parsed
where p.id = parsed.id;

-- Keyset de la pantalla de Ofertas: solo las filas en promoción, en orden alfabético.
create index if not exists bonpreu_products_offers_idx
  on public.bonpreu_products (display_name_norm)
  where promo_name is not null;
create index if not exists bonpreu_products_offers_ca_idx
  on public.bonpreu_products (display_name_ca_norm)
  where promo_name is not null;

-- ── Backfill one-off desde lo ya sincronizado ────────────────────────────────
-- La N1 "Ofertas" se detecta por nombre (el uuid puede cambiar). Sus hijas son
-- las subcategorías de oferta.
create temporary table _bp_offer_cats on commit drop as
with roots as (
  select id from public.bonpreu_categories
  where parent_id is null and name ~* '^\s*ofert(a|e)s\s*$'
)
select c.id, c.name, c.name_ca,
  case
    when c.name ~* 'rebaj'                     then 0  -- Precio rebajado
    when c.name ~* '2|seg[oa]n|unitat|unidad'  then 1  -- 2as unidades con descuento
    when c.name ~* 'lot'                       then 2  -- Lotes oferta
    when c.name ~* 'bonif'                     then 3  -- Bonificaciones
    when c.name ~* 'regal'                     then 4  -- Unidades regalo
    else 5                                             -- Otras ofertas
  end as rank
from public.bonpreu_categories c
where c.id in (select id from roots) or c.parent_id in (select id from roots);

-- Ofertas SOLO de alimentación: N2 que cuelgan de una N1 incluida. Quedan fuera
-- "Para el hogar", "Espacio mascotas" y "Acción solidaria". (Debe coincidir con
-- OFFER_FOOD_N1 en scripts/sync-bonpreu.mjs.)
create temporary table _bp_food_n2 on commit drop as
select c.id
from public.bonpreu_categories c
join public.bonpreu_categories n1 on n1.id = c.parent_id and n1.parent_id is null
where n1.name in (
  'Frescos', 'Alimentación', 'Bebidas', 'Congelados', 'Lácteos y huevos',
  'Dietas, intolerancias y estilos de vida', 'Productos Km0', 'Bodega',
  'Cuidado personal', 'Limpieza del hogar', 'Parafarmacia', 'Bebés',
  'Prepárate para el verano'
);

-- Promo de cada producto = la subcategoría de oferta de mayor prioridad (rank).
-- Solo si el producto pertenece (por categoría real) a alguna rama de alimentación.
with food as (select coalesce(array_agg(id), '{}') as ids from _bp_food_n2),
prod_promo as (
  select distinct on (p.id) p.id, oc.name, oc.name_ca
  from public.bonpreu_products p
  join _bp_offer_cats oc on p.category_ids && array[oc.id]
  where p.category_ids && (select ids from food)
  order by p.id, oc.rank
)
update public.bonpreu_products p
set promo_name = pp.name, promo_name_ca = coalesce(pp.name_ca, pp.name)
from prod_promo pp
where p.id = pp.id;

-- Sacar los ids de oferta de category_ids y repuntar la categoría primaria a una
-- categoría real (o NULL si el producto solo estaba en Ofertas).
update public.bonpreu_products p
set category_ids  = sub.ids,
    category_id   = sub.ids[1],
    category_name = c.name
from (
  select p2.id,
    array(select unnest(p2.category_ids)
          except
          select id from _bp_offer_cats) as ids
  from public.bonpreu_products p2
) sub
left join public.bonpreu_categories c on c.id = sub.ids[1]
where p.id = sub.id
  and p.category_ids is distinct from sub.ids;

-- Despublicar las categorías del árbol Ofertas: la app filtra published = true,
-- así desaparecen del catálogo al instante (el sync ya no las vuelve a emitir).
update public.bonpreu_categories
set published = false
where id in (select id from _bp_offer_cats);
