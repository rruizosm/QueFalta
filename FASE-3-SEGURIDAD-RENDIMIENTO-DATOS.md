# Fase 3 — Seguridad y rendimiento de datos

> Estado: desplegada y verificada en Supabase el 2026-08-14.
> Auditoría de referencia: 2026-08-14.

## Objetivo

Reducir la superficie de ataque de las funciones Postgres y el coste de las
políticas RLS sin cambiar los permisos funcionales de QuéFalta.

## Línea base observada

- Seguridad: 44 avisos (33 `WARN`, 11 `INFO`).
- Rendimiento: 121 avisos (52 `WARN`, 69 `INFO`).
- Bloques relevantes: 12 funciones sin `search_path` fijo, 9 funciones
  `SECURITY DEFINER` ejecutables por `anon`, 36 policies que reevaluaban
  `auth.uid()` por fila, 16 solapamientos de policies y 6 claves foráneas sin
  índice de cobertura.

## Cambios preparados

La migración
`supabase/migrations/20260814141719_phase_3_security_performance_hardening.sql`:

1. Fija el `search_path` de las funciones señaladas por el advisor.
2. Impide que `anon` invoque helpers `SECURITY DEFINER` y bloquea la llamada
   directa por roles cliente a las tres funciones que solo deben actuar como
   triggers.
3. Limita a `authenticated` las policies colaborativas que antes estaban
   declaradas para `public`.
4. Consolida policies permisivas solapadas conservando la unión de sus reglas.
5. Sustituye `auth.uid()` por `(select auth.uid())` en RLS para que Postgres lo
   evalúe una vez por consulta.
6. Añade índices a las seis claves foráneas detectadas por el advisor.

Resultado después del despliegue y de volver a ejecutar los advisors:

- Seguridad: de 44 a 20 avisos. Permanecen 11 tablas cerradas
  deliberadamente sin policies, `pg_trgm` en `public`, 7 helpers privilegiados
  requeridos por RLS/RPC y la protección de contraseñas filtradas hasta activar
  el ajuste manual.
- Rendimiento: de 121 a 69 avisos. Permanecen 68 índices sin uso observado y la
  configuración absoluta de conexiones de Auth. Los seis índices nuevos entran
  temporalmente en esa categoría porque todavía no acumulan uso desde su creación.

## Decisiones conservadoras

- No se mueven extensiones entre esquemas: `pg_trgm` tiene dependencias en
  funciones, operadores e índices de catálogo.
- No se elimina ningún índice marcado como «sin uso»: el contador puede haberse
  reiniciado y no prueba por sí solo que el índice sea prescindible.
- Los helpers `SECURITY DEFINER` usados desde RLS mantienen `EXECUTE` para
  `authenticated`; retirarlo rompería las políticas. Moverlos fuera del esquema
  expuesto requiere una migración coordinada de todos sus consumidores.
- Las tablas internas con RLS y sin policies permanecen cerradas. En este caso,
  «sin policy» equivale a denegar acceso de cliente y es el comportamiento
  buscado.

## Ajustes manuales pendientes

1. Activar **Leaked password protection** en Auth → Password Security.
2. Cambiar la asignación de conexiones de Auth de un valor absoluto a un
   porcentaje cuando se revise o aumente el tamaño de la instancia.

Ninguno de esos dos ajustes forma parte de una migración SQL.

## Verificación realizada

- Preflight de funciones y policies correcto antes del DDL.
- Migración registrada como `20260814141719_phase_3_security_performance_hardening`.
- 0 funciones objetivo sin `search_path` fijo.
- 0 helpers privilegiados ejecutables por `anon`.
- 0 funciones de trigger invocables directamente por roles cliente.
- 0 avisos `auth_rls_initplan`, `multiple_permissive_policies` y
  `unindexed_foreign_keys`.
- Los planes de consulta de las once tablas afectadas compilan bajo el rol
  `authenticated` con un JWT de prueba, sin leer ni modificar datos.
- Los tres SQL de migración, verificación y reversión pasan el parser PostgreSQL.
  La batería global de la app no pudo repetirse al final porque entraron cambios
  locales ajenos a esta fase (Froiz/Gadis) que actualmente no pasan TypeScript.

## Despliegue y QA funcional

1. Obtener un backup o punto de recuperación reciente.
2. Aplicar primero la migración en una rama o proyecto de staging cuando exista.
3. Ejecutar `supabase/ops/verify_phase_3_security_performance.sql` (realizado en
   producción tras este despliegue).
4. Validar los flujos: alta/login, creación y unión a grupos, transferencia de
   administrador, listas e ítems, amistades, perfiles visibles/no visibles,
   favoritos, notificaciones, compras, disponibilidad de usuario y comparador.
5. Volver a ejecutar Security Advisor y Performance Advisor.
6. Promover a producción solo si las consultas de verificación y los flujos son
   correctos.

## Referencias

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/database/database-advisors
- https://supabase.com/docs/guides/database/functions
- https://supabase.com/docs/guides/auth/password-security
