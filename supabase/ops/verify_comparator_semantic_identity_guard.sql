-- Ejecutar después de 20260817124758_comparator_semantic_identity_guard.sql.
-- No modifica datos; falla con una lista de casos si alguna regla regresa.

begin;

do $test$
declare
  failed text[];
begin
  select array_agg(label order by label)
  into failed
  from (values
    ('tea_same_flavour',
      public.catalog_product_identity_compatible_v1(
        'Refresco té sabor limón Fuze Tea', 'Refresco de té y sin gas',
        'NESTEA Refresco de té con limón', 'Refrescos'
      )),
    ('tea_vs_lemon_soda',
      not public.catalog_product_identity_compatible_v1(
        'Refresco té sabor limón Fuze Tea', 'Refresco de té y sin gas',
        'FANTA Refresco de limón', 'Bebidas'
      )),
    ('tea_vs_generic_still_drink',
      not public.catalog_product_identity_compatible_v1(
        'Refresco té sabor limón Fuze Tea', 'Refresco de té y sin gas',
        'Refresco sin gas Enjoy limón', 'Lima / limón'
      )),
    ('tea_flavour_mismatch',
      not public.catalog_product_identity_compatible_v1(
        'Refresco té sabor limón Fuze Tea', 'Refresco de té y sin gas',
        'Fuze Tea sabor melocotón e hibisco', 'Refrescos'
      )),
    ('tea_sugar_variant_mismatch',
      not public.catalog_product_identity_compatible_v1(
        'Refresco té sabor limón Fuze Tea', 'Refrescos',
        'Refresco té limón zero', 'Refrescos'
      )),
    ('juice_flavour_mismatch',
      not public.catalog_product_identity_compatible_v1(
        'Zumo de naranja', 'Zumos',
        'Zumo de manzana', 'Zumos'
      )),
    ('yogurt_same_flavour',
      public.catalog_product_identity_compatible_v1(
        'Yogur sabor fresa', 'Yogures',
        'Yogurt de fresa', 'Yogures'
      )),
    ('yogurt_plain_vs_flavoured',
      not public.catalog_product_identity_compatible_v1(
        'Yogur natural', 'Yogures',
        'Yogur de fresa', 'Yogures'
      )),
    ('coffee_synonym',
      public.catalog_product_identity_compatible_v1(
        'Café molido natural', 'Café',
        'Espresso molido', 'Café'
      )),
    ('burger_spelling_synonym',
      public.catalog_validated_lexical_score_v1(
        'Maxi pan de burger',
        'Pan maxi para hamburguesas'
      ) >= 0.70),
    ('burger_bread_vs_meat',
      not public.catalog_product_identity_compatible_v1(
        'Maxi pan de burger', 'Pan de molde',
        'Burger de pollo', 'Preparados de pollo'
      )),
    ('burger_bread_vs_sauce',
      not public.catalog_product_identity_compatible_v1(
        'Maxi pan de burger', 'Pan de molde',
        'Salsa burger', 'Salsas'
      )),
    ('burger_bread_vs_cheese',
      not public.catalog_product_identity_compatible_v1(
        'Maxi pan de burger', 'Pan de molde',
        'Lonchas de queso burger', 'Quesos'
      )),
    ('cleaning_family_mismatch',
      not public.catalog_product_identity_compatible_v1(
        'Champú hidratante', 'Cabello',
        'Gel de ducha hidratante', 'Higiene'
      ))
  ) as cases(label, passed)
  where not passed;

  if failed is not null then
    raise exception 'Semantic identity tests failed: %', failed;
  end if;
end
$test$;

select
  public.catalog_product_family_v1(
    'Refresco té sabor limón Fuze Tea',
    'Refresco de té y sin gas'
  ) as expected_tea_family,
  public.catalog_product_variants_v1(
    'Refresco té sabor limón Fuze Tea'
  ) as expected_lemon_variant;

rollback;
