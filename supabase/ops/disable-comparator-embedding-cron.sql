-- Detiene todos los caminos de despacho. Los mensajes permanecen en pgmq y se
-- pueden reanudar en modo canario con enable-comparator-embedding-cron.sql.

select public.catalog_set_embedding_pipeline_mode(
  'paused',
  'Pausa operativa solicitada desde disable-comparator-embedding-cron.sql'
);

select cron.alter_job(job_id => jobid, active => false)
from cron.job
where jobname = 'catalog-embedding-dispatch';
