-- Fase 4 de MONETIZACION.md — QuéFalta Plus de regalo para los early testers.
-- ⚠️ SOLO ANTES DEL LANZAMIENTO: la opción A da Plus a TODOS los usuarios
-- existentes (que pre-lanzamiento son únicamente los testers de TestFlight).
-- Después del lanzamiento usar SIEMPRE la opción B con ids concretos.
--
-- Ejecutar en: Supabase → SQL Editor (el trigger profiles_protect_premium
-- bloquea a los clientes, pero el SQL Editor corre como postgres y pasa).

-- Opción A — todos los usuarios actuales (pre-lanzamiento):
update public.profiles set premium_until = '2099-01-01T00:00:00Z';

-- Opción B — solo usuarios concretos (post-lanzamiento):
-- update public.profiles
--   set premium_until = '2099-01-01T00:00:00Z'
--   where id in ('<uuid-1>', '<uuid-2>');
