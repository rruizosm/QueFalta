-- The Data API defaults to an 8 second statement timeout. Finalizing a
-- 20-product embedding write also updates HNSW and can legitimately exceed
-- that limit under catalog load, so give this bounded RPC the project-wide
-- maximum used by other heavy database operations.

alter function public.catalog_finalize_embedding_batch(jsonb)
  set statement_timeout = '60s';

