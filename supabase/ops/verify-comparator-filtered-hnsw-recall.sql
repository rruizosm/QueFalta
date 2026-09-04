-- Ejecutar después de 20260902122234_fix_comparator_filtered_hnsw_recall.sql.
-- Verifica la regresión reportada con ROLLBACK: no conserva caché ni matches.
begin;

do $verify$
declare
  v_candidate_count integer;
  v_inserted integer;
begin
  if current_setting('hnsw.iterative_scan', true) is distinct from 'off' then
    raise exception 'El smoke debe comenzar con el valor de sesión por defecto';
  end if;

  if public.catalog_product_identity_family_v1(
    'BONPREU Huevos frescos clase L/XL',
    'Huevos'
  ) is distinct from 'eggs' then
    raise exception 'La marca propia sigue ocultando la familia eggs';
  end if;

  if not public.catalog_product_identity_compatible_v1(
    'Huevos grandes L',
    'Huevos',
    'BONPREU Huevos frescos clase L/XL',
    'Huevos'
  ) then
    raise exception 'Los huevos equivalentes de Bonpreu se consideran incompatibles';
  end if;

  if public.catalog_product_identity_compatible_v1(
    'Huevos grandes L',
    'Huevos',
    'Huevos de codorniz',
    'Huevos'
  ) then
    raise exception 'Los huevos de codorniz no deben compararse con huevos de gallina';
  end if;

  if public.catalog_product_identity_compatible_v1(
    'Huevos grandes L',
    'Huevos',
    'Huevos cocidos de gallina',
    'Huevos'
  ) then
    raise exception 'Los huevos cocidos no deben compararse con huevos frescos';
  end if;

  select count(*)::integer
  into v_candidate_count
  from public.catalog_embedding_candidates_v3(
    'mercadona',
    '31504',
    array['bonarea'],
    20,
    -1
  );

  if v_candidate_count < 10 then
    raise exception 'Recall HNSW insuficiente para bonArea: % candidatos', v_candidate_count;
  end if;

  v_inserted := comparator_internal.refresh_catalog_match_cache_pair_v3(
    'mercadona',
    '31504',
    'bonarea'
  );

  if not exists (
    select 1
    from public.catalog_product_matches as match
    where match.source_store = 'mercadona'
      and match.source_product_id = '31504'
      and match.target_store = 'bonarea'
      and match.target_product_id = '13*6252'
      and match.match_version = 'embedding_hybrid_v3_0_60'
  ) then
    raise exception 'No se recuperó Huevos L de bonArea; insertados=%', v_inserted;
  end if;

  v_inserted := comparator_internal.refresh_catalog_match_cache_pair_v3(
    'mercadona',
    '31504',
    'esclat'
  );

  if not exists (
    select 1
    from public.catalog_product_matches as match
    where match.source_store = 'mercadona'
      and match.source_product_id = '31504'
      and match.target_store = 'esclat'
      and match.target_product_id = '2cdd8a43-4ab3-4ac5-a454-1a6f586845a8'
      and match.match_version = 'embedding_hybrid_v3_0_60'
  ) then
    raise exception 'No se recuperó Huevos L/XL de Bonpreu; insertados=%', v_inserted;
  end if;
end;
$verify$;

rollback;

select 'COMPARATOR_FILTERED_HNSW_RECALL_OK' as result;
