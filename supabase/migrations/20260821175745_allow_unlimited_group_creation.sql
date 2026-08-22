-- Crear grupos deja de ser una función Plus. El cliente ya no aplica límite y
-- esta migración retira el enforcement de instalaciones que ejecutaron
-- paywall_gates.sql antes de este cambio.
drop trigger if exists groups_enforce_limit on public.groups;
drop function if exists public.enforce_group_limit();
