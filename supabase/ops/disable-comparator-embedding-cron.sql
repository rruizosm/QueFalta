-- Detiene nuevas invocaciones. Los mensajes permanecen en pgmq y se pueden
-- reanudar volviendo a ejecutar enable-comparator-embedding-cron.sql.

select cron.unschedule(jobid)
from cron.job
where jobname = 'catalog-embedding-dispatch';
