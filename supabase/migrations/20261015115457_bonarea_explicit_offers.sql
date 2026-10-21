-- El sync ya conserva la insignia oficial BAIXADA_PREU en raw.caracteristiques.
-- Habilita únicamente el brazo Ofertas del RPC bilingüe existente; conserva
-- Novedades, ranking, filtros previos a LIMIT/OFFSET, firma, ACL y SECURITY INVOKER.
do $migration$
declare
  signature regprocedure := 'public.search_bonarea_feed_products(text,text,text,text,text,text,timestamptz,date,text[],numeric,numeric,text,integer,integer)'::regprocedure;
  definition text := pg_get_functiondef(signature);
  old_predicate text := $old$(lower(coalesce(p_feed, '')) = 'offer' and false)$old$;
  new_predicate text := $new$(lower(coalesce(p_feed, '')) = 'offer' and p.raw @> '{"caracteristiques":[{"descripcio":"BAIXADA_PREU"}]}'::jsonb)$new$;
  occurrences integer;
begin
  -- Cuatro ramas: FTS/trigram × ES/CA. Si cambia la función de origen,
  -- aborta en lugar de publicar una búsqueda parcialmente habilitada.
  occurrences := (length(definition) - length(replace(definition, old_predicate, ''))) / length(old_predicate);
  if occurrences = 4 then
    execute replace(definition, old_predicate, new_predicate);
  elsif occurrences <> 0 or
    (length(definition) - length(replace(definition, new_predicate, ''))) / length(new_predicate) <> 4 then
    raise exception 'search_bonarea_feed_products: definición inesperada; revisar las cuatro ramas de Ofertas';
  end if;
end;
$migration$;

notify pgrst, 'reload schema';
