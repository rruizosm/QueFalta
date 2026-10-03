-- Completar un run grande revalida todo el manifiesto antes de pasarlo a
-- draining. Usa el mismo margen que el cierre de registro.
alter function public.catalog_complete_embedding_run(uuid, boolean, text)
  set statement_timeout = '60s';

comment on function public.catalog_complete_embedding_run(uuid, boolean, text) is
  'Completa o falla un run durable; dispone de 60 s para revalidar manifiestos grandes antes del drenaje.';
