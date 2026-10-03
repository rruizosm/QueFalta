-- Una primera tienda grande puede cerrar más de 10.000 dependencias en el
-- manifiesto durable. La Data API usa 8 s por defecto y el cierre autoritativo
-- necesita algo más de margen para revalidar todas las identidades enlazadas.
alter function public.catalog_register_embedding_run_jobs(uuid, jsonb, integer, boolean)
  set statement_timeout = '60s';

comment on function public.catalog_register_embedding_run_jobs(uuid, jsonb, integer, boolean) is
  'Registra por bloques el manifiesto durable de un run; dispone de 60 s para cerrar y revalidar cargas iniciales grandes.';
