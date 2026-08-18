-- Refuerza el comparador híbrido con señales deterministas que los embeddings
-- no deben decidir por sí solos. El score semántico sigue recuperando candidatos,
-- pero una alternativa no se muestra si cambia la familia esencial o una
-- variante explícita del producto. Un GTIN global idéntico y una revisión humana
-- aprobada conservan prioridad sobre estas reglas.

-- Variantes ortográficas y comerciales del mismo concepto. Se normalizan antes
-- de calcular tokens/trigramas, no como una familia genérica: "burger" también
-- se usa para salsa, carne y queso, que los filtros de identidad deben mantener
-- separados del pan para hamburguesa.
create or replace function public.catalog_embedding_semantic_name_v1(p_name text)
returns text
language sql
stable
set search_path = ''
as $function$
  with normalized as (
    select regexp_replace(
      lower(public.f_unaccent(coalesce(p_name, ''))),
      '\m(burger|burguer|hamburguesas?)\M',
      'hamburguesa',
      'g'
    ) as value
  )
  select trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                normalized.value,
                '\([^)]*\)', ' ', 'g'
              ),
              '\m[0-9]+([.,][0-9]+)?[[:space:]]*(kg|g|gr|ml|cl|l|ud|uds|u)\M', ' ', 'g'
            ),
            '\m(hacendado|bonpreu|bonarea|carrefour|consum|dia|deliplus|aliada|eroski|caprabo|sorli|ametller|alcampo|auchan|plusfresc)\M', ' ', 'g'
          ),
          '\m(brik|brick|carton|botella|garrafa|lata|tarro|bote|bolsa|paquete|bandeja|envase|granel)\M', ' ', 'g'
        ),
        '[^a-z0-9]+', ' ', 'g'
      ),
      '[[:space:]]+', ' ', 'g'
    )
  )
  from normalized;
$function$;

create or replace function public.catalog_product_family_v1(
  p_name text,
  p_category text default null
)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_name text := lower(public.f_unaccent(coalesce(p_name, '')));
begin
  -- Se clasifica por el nombre, no por el árbol de categorías: las categorías
  -- no están homologadas entre cadenas y algunas contienen ramas paraguas o
  -- asignaciones erróneas. Las marcas incluidas aquí son inequívocas dentro de
  -- su familia y cubren títulos que omiten el sustantivo.
  return case
    when v_name ~ '\m(pizza)\M' then 'pizza'
    when v_name ~ '\m(helado|sorbete)\M' then 'ice_cream'
    when v_name ~ '\m(chorizo|mortadela|salchichon|fuet)\M' then 'charcuterie'
    when v_name ~ '\m(chipiron|calamar|pulpo)\M' then 'cephalopod'
    when v_name ~ '\m(hojaldre)\M' then 'pastry'
    when v_name ~ '\m(yogur|yogurt|skyr|kefir|activia)\M' then 'yogurt'
    when v_name ~ '\m(queso|formatge|provolone|mozzarella|emmental|gouda|cheddar|brie|camembert|philadelphia)\M' then 'cheese'
    when v_name ~ '\m(mantequilla|mantega)\M' then 'butter'
    when v_name ~ '\m(kombucha)\M' then 'kombucha'
    when v_name ~ '\m(te|tea|te[[:space:]-]*frio|ice[[:space:]-]*tea|nestea|fuze[[:space:]-]*tea|lipton)\M' then 'tea'
    when v_name ~ '\m(cafe|coffee|espresso|cappuccino|capuchino)\M' then 'coffee'
    when v_name ~ '\m(chocolate[[:space:]]+(a[[:space:]]+la[[:space:]]+taza|bebida)|cacao[[:space:]]+(soluble|instantaneo)|batido[[:space:]]+de[[:space:]]+chocolate)\M' then 'cocoa_drink'
    when v_name ~ '\m(bebida[[:space:]]+(vegetal|de[[:space:]]+(avena|soja|almendra|arroz|coco))|leche[[:space:]]+de[[:space:]]+(avena|soja|almendra|arroz|coco)|begetal)\M' then 'plant_drink'
    when v_name ~ '\m(leche)\M' then 'milk'
    when v_name ~ '\m(horchata)\M' then 'horchata'
    when v_name ~ '\m(agua)\M' and v_name !~ '\magua[[:space:]]+de[[:space:]]+colonia\M' then 'water'
    when v_name ~ '\m(zumo|jugo|nectar|smoothie|bifrutas)\M' then 'juice'
    when v_name ~ '\m(isotonico|isotonica|aquarius|powerade)\M' then 'isotonic_drink'
    when v_name ~ '\m(energetic[oa]|energy[[:space:]]+drink|red[[:space:]]+bull|monster)\M' then 'energy_drink'
    when v_name ~ '\m(tonica|tonic[[:space:]]+water)\M' then 'tonic'
    when v_name ~ '\m(cerveza|beer)\M' then 'beer'
    when v_name ~ '\m(sidra|cider)\M' then 'cider'
    when v_name ~ '\m(cava|champan|champagne|espumoso)\M' then 'sparkling_wine'
    when v_name ~ '\m(vino|vermut|vermouth|sangria)\M' then 'wine'
    when v_name ~ '\m(ginebra|gin|ron|whisky|whiskey|vodka|tequila|licor)\M' then 'spirit'
    when v_name ~ '\m(refresco|gaseosa|soda|cola|coca[[:space:]-]*cola|pepsi|fanta|sprite|seven[[:space:]-]*up|7up)\M' then 'soft_drink'

    when v_name ~ '\m(nata|crema[[:space:]]+de[[:space:]]+leche)\M' then 'cream'
    when v_name ~ '^[^a-z0-9]*(huevo|huevos|ous)\M' then 'eggs'

    when v_name ~ '\m(mayonesa|maionesa)\M' then 'mayonnaise'
    when v_name ~ '\m(ketchup|catsup)\M' then 'ketchup'
    when v_name ~ '\m(mostaza)\M' then 'mustard'
    when v_name ~ '\m(pesto)\M' then 'pesto'
    when v_name ~ '\m(salsa[[:space:]]+de[[:space:]]+soja)\M' then 'soy_sauce'
    when v_name ~ '\m(tomate[[:space:]]+(frito|triturado)|salsa[[:space:]]+de[[:space:]]+tomate)\M' then 'tomato_sauce'
    when v_name ~ '\m(aceite)\M' then 'oil'
    when v_name ~ '\m(vinagre)\M' then 'vinegar'

    when v_name ~ '\m(pasta|espagueti|spaghetti|macarron|tallarin|fideo|ravioli|tortellini)\M' then 'pasta'
    when v_name ~ '\m(arroz)\M' then 'rice'
    when v_name ~ '\m(pan|baguette|chapata|molde)\M' then 'bread'
    when v_name ~ '\m(harina)\M' then 'flour'
    when v_name ~ '\m(cereal|muesli|granola)\M' then 'breakfast_cereal'
    when v_name ~ '\m(galleta|cookie)\M' then 'biscuits'

    when v_name ~ '\m(pollo)\M' then 'chicken'
    when v_name ~ '\m(pavo)\M' then 'turkey'
    when v_name ~ '\m(ternera|vacuno|buey)\M' then 'beef'
    when v_name ~ '\m(cerdo|porcino)\M' then 'pork'
    when v_name ~ '\m(cordero)\M' then 'lamb'
    when v_name ~ '\m(conejo)\M' then 'rabbit'
    when v_name ~ '\m(salmon)\M' then 'salmon'
    when v_name ~ '\m(atun|bonito)\M' then 'tuna'
    when v_name ~ '\m(merluza)\M' then 'hake'
    when v_name ~ '\m(bacalao)\M' then 'cod'
    when v_name ~ '\m(sardina)\M' then 'sardine'
    when v_name ~ '\m(gamba|langostino|camaron)\M' then 'prawn'

    when v_name ~ '\m(detergente[[:space:]]+(ropa|lavadora)|capsulas[[:space:]]+lavadora)\M' then 'laundry_detergent'
    when v_name ~ '\m(lavavajillas|rentavaixelles)\M' then 'dishwasher'
    when v_name ~ '\m(suavizante)\M' then 'fabric_softener'
    when v_name ~ '\m(champu|shampoo)\M' then 'shampoo'
    when v_name ~ '\m(gel[[:space:]]+(de[[:space:]]+ducha|bano)|gel[[:space:]]+corporal)\M' then 'shower_gel'
    when v_name ~ '\m(pasta[[:space:]]+de[[:space:]]+dientes|dentifrico)\M' then 'toothpaste'
    when v_name ~ '\m(desodorante)\M' then 'deodorant'
    when v_name ~ '\m(panal|panales)\M' then 'nappies'

    else null
  end;
end;
$function$;

create or replace function public.catalog_product_variants_v1(p_name text)
returns text[]
language sql
immutable
set search_path = ''
as $function$
  with normalized as (
    select lower(public.f_unaccent(coalesce(p_name, ''))) as value
  ),
  rules(marker, pattern) as (
    values
      ('lemon', '\mlimon\M'),
      ('lime', '\mlima\M'),
      ('orange', '\mnaranja\M'),
      ('peach', '\m(melocoton|durazno)\M'),
      ('apple', '\mmanzana\M'),
      ('pear', '\mpera\M'),
      ('strawberry', '\mfresa\M'),
      ('raspberry', '\mframbuesa\M'),
      ('blueberry', '\marandano\M'),
      ('berries', '\mfrutos[[:space:]]+rojos\M'),
      ('mango', '\mmango\M'),
      ('pineapple', '\mpina\M'),
      ('passion_fruit', '\m(maracuya|fruta[[:space:]]+de[[:space:]]+la[[:space:]]+pasion)\M'),
      ('banana', '\m(platano|banana)\M'),
      ('coconut', '\mcoco\M'),
      ('vanilla', '\mvainilla\M'),
      ('chocolate', '\m(chocolates?|choco|cacao)\M'),
      ('coffee', '\m(cafe|coffee|espresso)\M'),
      ('mint', '\m(menta|hierbabuena)\M'),
      ('ginger', '\mjengibre\M'),
      ('olive', '\moliva\M'),
      ('sunflower', '\mgirasol\M'),
      ('basmati', '\mbasmati\M'),
      ('jasmine', '\mjazmin\M'),
      ('wholegrain', '\m(integral|wholegrain)\M'),
      ('decaf', '\m(descafeinado|decaf)\M'),
      ('sugar_free', '\m(sin[[:space:]]+azucar(es)?|0[[:space:]]*%[[:space:]]*azucar(es)?|zero|cero)\M'),
      ('alcohol_free', '\m(sin[[:space:]]+alcohol|0[.,]0)\M'),
      ('low_salt', '\m(sin[[:space:]]+sal|baj[oa][[:space:]]+en[[:space:]]+sal)\M'),
      ('still', '\msin[[:space:]]+gas\M'),
      ('sparkling', '\mcon[[:space:]]+gas\M'),
      ('spicy', '\m(picante|spicy|chili|guindilla)\M'),
      ('smoked', '\m(ahumado|fumado)\M')
  )
  select coalesce(array_agg(rules.marker order by rules.marker), array[]::text[])
  from normalized
  join rules on normalized.value ~ rules.pattern;
$function$;

create or replace function public.catalog_product_identity_compatible_v1(
  p_left_name text,
  p_left_category text,
  p_right_name text,
  p_right_category text
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  with signals as (
    select
      public.catalog_product_family_v1(p_left_name, p_left_category) as left_family,
      public.catalog_product_family_v1(p_right_name, p_right_category) as right_family,
      public.catalog_product_variants_v1(p_left_name) as left_variants,
      public.catalog_product_variants_v1(p_right_name) as right_variants
  ), normalized as (
    select
      left_family,
      right_family,
      case when left_family = 'coffee'
        then array_remove(left_variants, 'coffee')
        when left_family = 'cocoa_drink'
        then array_remove(left_variants, 'chocolate')
        when left_family = any (array['beer', 'wine', 'sparkling_wine', 'spirit'])
        then array_remove(left_variants, 'sugar_free')
        else left_variants
      end as left_variants,
      case when right_family = 'coffee'
        then array_remove(right_variants, 'coffee')
        when right_family = 'cocoa_drink'
        then array_remove(right_variants, 'chocolate')
        when right_family = any (array['beer', 'wine', 'sparkling_wine', 'spirit'])
        then array_remove(right_variants, 'sugar_free')
        else right_variants
      end as right_variants
    from signals
  )
  select
    -- Si una sola parte tiene familia reconocible, el par es ambiguo y se
    -- descarta. En comparación de precios se prioriza precisión sobre cobertura.
    left_family is not distinct from right_family
    and left_variants = right_variants
  from normalized;
$function$;

revoke all on function public.catalog_product_family_v1(text, text)
  from public, anon, authenticated;
revoke all on function public.catalog_product_variants_v1(text)
  from public, anon, authenticated;
revoke all on function public.catalog_product_identity_compatible_v1(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.catalog_product_family_v1(text, text) to service_role;
grant execute on function public.catalog_product_variants_v1(text) to service_role;
grant execute on function public.catalog_product_identity_compatible_v1(text, text, text, text)
  to service_role;

-- v5 fuerza el filtro antes del top-2 por tienda. Primero deja que v3 rellene o
-- invalide su caché; después vuelve a ordenar exclusivamente los matches que
-- conservan familia y variante. Así un refresco barato no puede desplazar a un
-- té correcto antes de que se aplique el filtro.
create or replace function comparator_internal.catalog_cheaper_products_v5(
  p_source_store text,
  p_source_product_id text,
  p_stores text[]
)
returns table(
  store text,
  id text,
  display_name text,
  thumbnail text,
  price_total numeric,
  price_per_unit numeric,
  price_per_unit_unit text,
  match_kind text,
  match_score real,
  vector_score real,
  lexical_score real,
  quantity_ratio numeric,
  is_cheaper boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_match_version constant text := 'embedding_hybrid_v3_0_60';
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  -- Ejecuta la carga/invalidez perezosa existente antes de leer todos los
  -- candidatos aceptados de la caché.
  perform 1
  from comparator_internal.catalog_cheaper_products_v3(
    p_source_store,
    p_source_product_id,
    p_stores
  )
  limit 1;

  return query
  with requested_stores as (
    select requested.store, min(requested.ordinality) as store_order
    from unnest(coalesce(p_stores, array[]::text[])) with ordinality
      as requested(store, ordinality)
    where requested.store = any (array[
      'mercadona','esclat','carrefour','bonarea','consum','dia','sorli','eroski',
      'caprabo','condis','ametller','aldi','hiperdino','alcampo','plusfresc'
    ])
      and requested.store <> p_source_store
    group by requested.store
  ),
  source_embedding as (
    select source.display_name, source.category
    from public.catalog_product_embeddings as source
    where source.store = p_source_store
      and source.product_id = p_source_product_id
      and source.published
      and source.embedding is not null
  ),
  source_price as (
    select case
      when source.store = any (array['caprabo','eroski','hiperdino'])
        then source.price_total
      else source.price_per_unit
    end as comparison_price
    from public.catalog_public_product_v1(
      p_source_store,
      p_source_product_id
    ) as source
  ),
  compatible as (
    select
      requested.store_order,
      match.target_store,
      match.target_product_id,
      match.relation,
      match.confidence,
      match.vector_score,
      match.lexical_score,
      nullif(match.evidence ->> 'quantity_ratio', '')::numeric as quantity_ratio,
      detail.display_name,
      detail.thumbnail,
      detail.price_total,
      detail.price_per_unit,
      detail.price_per_unit_unit
    from requested_stores as requested
    cross join source_embedding as source
    join public.catalog_product_matches as match
      on match.source_store = p_source_store
     and match.source_product_id = p_source_product_id
     and match.target_store = requested.store
     and match.match_version = v_match_version
     and match.relation in ('identico', 'comparable')
     and match.review_decision is distinct from 'rechazado'
    join public.catalog_product_embeddings as target
      on target.store = match.target_store
     and target.product_id = match.target_product_id
     and target.published
    cross join lateral public.catalog_public_product_v1(
      match.target_store,
      match.target_product_id
    ) as detail
    where match.relation = 'identico'
       or match.review_decision = 'aprobado'
       or public.catalog_product_identity_compatible_v1(
         source.display_name,
         source.category,
         target.display_name,
         target.category
       )
  ),
  ranked as (
    select
      compatible.*,
      row_number() over (
        partition by compatible.target_store
        order by
          case
            when compatible.target_store = any (array['caprabo','eroski','hiperdino'])
              then compatible.price_total
            else compatible.price_per_unit
          end asc nulls last,
          case
            when compatible.target_store = any (array['caprabo','eroski','hiperdino'])
              then null
            else compatible.price_total
          end asc nulls last,
          (compatible.relation = 'identico') desc,
          compatible.confidence desc,
          compatible.target_product_id
      ) as store_rank
    from compatible
  )
  select
    ranked.target_store,
    ranked.target_product_id,
    ranked.display_name,
    ranked.thumbnail,
    ranked.price_total,
    ranked.price_per_unit,
    ranked.price_per_unit_unit,
    case when ranked.relation = 'identico' then 'exact_gtin' else 'semantic' end,
    ranked.confidence,
    ranked.vector_score,
    ranked.lexical_score,
    ranked.quantity_ratio,
    coalesce(
      case
        when ranked.target_store = any (array['caprabo','eroski','hiperdino'])
          then ranked.price_total
        else ranked.price_per_unit
      end < source_price.comparison_price,
      false
    ) as is_cheaper
  from ranked
  cross join source_price
  where ranked.store_rank <= 2
  order by ranked.store_order, ranked.store_rank;
end;
$function$;

revoke all on function comparator_internal.catalog_cheaper_products_v5(text, text, text[])
  from public, anon;
grant execute on function comparator_internal.catalog_cheaper_products_v5(text, text, text[])
  to authenticated, service_role;

create or replace function public.catalog_cheaper_products_v5(
  p_source_store text,
  p_source_product_id text,
  p_stores text[]
)
returns table(
  store text,
  id text,
  display_name text,
  thumbnail text,
  price_total numeric,
  price_per_unit numeric,
  price_per_unit_unit text,
  match_kind text,
  match_score real,
  vector_score real,
  lexical_score real,
  quantity_ratio numeric,
  is_cheaper boolean
)
language sql
volatile
security invoker
set search_path = ''
as $function$
  select *
  from comparator_internal.catalog_cheaper_products_v5(
    p_source_store,
    p_source_product_id,
    p_stores
  );
$function$;

revoke all on function public.catalog_cheaper_products_v5(text, text, text[])
  from public, anon;
grant execute on function public.catalog_cheaper_products_v5(text, text, text[])
  to authenticated, service_role;
