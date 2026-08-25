-- Apagado reversible de QuéFalta Plus.
-- Conserva todos los productos, webhook y gates para una futura reactivación;
-- solo devuelve false para que el servidor no limite grupos ni comparador.
create or replace function public.paywall_enabled()
returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$ select false $$;
