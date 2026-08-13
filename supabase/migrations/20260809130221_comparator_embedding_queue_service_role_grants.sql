-- pgmq.delete y pgmq.archive son SECURITY INVOKER y operan sobre las tablas
-- físicas de cada cola. El worker solo necesita completar o archivar mensajes.
grant delete on table pgmq.q_catalog_embedding_jobs to service_role;
grant insert on table pgmq.a_catalog_embedding_jobs to service_role;
