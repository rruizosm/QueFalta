# CE-101 — Servicios compartidos y acceso de pruebas

Inicio: 2026-09-02. Documento: 2026-09-03, Europe/Madrid. Las capturas remotas
están fechadas en UTC en [CE-101-evidence.json](CE-101-evidence.json).
Estado: **COMPLETADA** por CE-VAL-001: inventario, conexión técnica y catálogo
de producción 1.3 confirmado por el propietario en su móvil. No acredita un
build de desarrollo ni un token/UID. **CE-100 sigue abierta**. Ver cierre en §7.

## 1. Alcance y resultado

CE-SEQ-001 recoge la instrucción «Empieza con CE-101 y dejamos pendiente cerrar
CE-100». Permite este inventario sin interpretar que la capacidad de producción
ya esté validada. No acepta G1 ni inicia CE-102 automáticamente.

Destino confirmado: `QueFalta`, ref `gkffvigcnsesbaihycay`, eu-west-1,
PostgreSQL 17.6, estado `ACTIVE_HEALTHY`. La app local configura
`https://auth.quefalta.es`, que respondió identificando la misma ref.

El propietario usará su cuenta habitual **@rruizosma**. La consulta acotada por
ese nombre encontró exactamente un perfil; no se leyó su email, UUID, sesión,
suscripción ni saldo. Esto confirma existencia, no autenticación del titular.
El [manifiesto de preparación](CE-101-test-access.json) es documentación:
**no lo consume el código y no concede acceso**.

Trabajo realizado: tres transacciones SQL READ ONLY con timeout de 5 s,
lock_timeout de 500 ms y ROLLBACK; concurrencia remota 1. Consultas de metadatos,
modo singleton del pipeline y conteo de coincidencias del perfil elegido, sin
payloads de colas ni catálogo masivo. Se inspeccionaron el panel y tres fuentes
Edge desplegadas, sin invocarlas. La muestra de actividad observó 23 conexiones
cliente, cero activas/locks/idle-in-transaction; **no es un baseline de carga**.

No se cambiaron código de app, SQL de despliegue, datos de negocio, roles,
servicios, secretos, cron, colas o suscripciones. No se enviaron emails/push,
no se inició sesión y no se consumieron búsquedas. Las lecturas pueden generar
los registros operativos normales del proveedor; no equivalen a impacto cero.

## 2. Conexión de desarrollo: qué está probado

Se usó el cliente Supabase instalado y las credenciales públicas locales en un
proceso Node aislado: persistencia y renovación de sesión desactivadas,
sin redirects ni retries, timeout de 5 s y una única petición permitida.

- `HEAD /rest/v1/mercadona_products`, selección `id`, límite 1 y sin count:
  HTTP 200, cabecera `sb-project-ref` correcta, sin descargar filas.
  Duración observada 212 ms: una muestra, **no p95 ni benchmark**.
- `GET /auth/v1/settings`: HTTP 200, misma ref, sin sesión, creación de cuenta
  ni envío de OTP. Habilitados email, Google y Apple; signup no deshabilitado;
  mailer/phone autoconfirm y SAML desactivados según configuración pública.

La primera tentativa HEAD dentro del sandbox no obtuvo respuesta de red.
Una repetición de lectura con acceso de red aprobado obtuvo 200. No se atribuye
el fallo de transporte al backend. No se guardaron claves en los entregables.
`/settings` es una lectura pública de configuración, documentada en el
[OpenAPI oficial de Supabase Auth](https://github.com/supabase/auth/blob/master/openapi.yaml).

La inspección de `src/lib/supabase.ts`, `src/lib/authStorage.ts` y
`src/context/AuthContext.tsx` confirma PKCE, persistencia de sesión y manejo
del callback. `eas.json` separa los entornos development/preview/production;
**no se han verificado las variables remotas de EAS ni un build instalado**.
El proyecto local comparte bundle/package `com.quefalta.app` y scheme
`quefalta`; no instalar sobre la app habitual ni publicar una OTA como prueba.

Abrir la app con sesión no es una lectura pura: el arranque puede registrar
actividad, reconciliar tokens push y configurar RevenueCat. Por ello no se
arrancó ni se hizo login automáticamente. La conexión técnica del cliente no
sustituye una prueba de sesión/deep link en el runtime nativo.

## 3. Inventario de servicios

| Servicio | Estado observado | Consecuencia para CE-1 |
|---|---|---|
| Auth | Email, Google y Apple habilitados; sin Auth Hooks listados | Usar cuenta existente; no crear usuarios ni modificar proveedores |
| Data API | Expuestos `public` y `graphql_public`; autoexposición de tablas nuevas ON | Revisar grants, RLS y RPC de cada objeto nuevo antes de escribir |
| Storage | `avatars` y `recipe-images` públicos | No guardar evidencia privada o dataset de pruebas en estos buckets |
| Edge Functions | Siete ACTIVE, versiones detalladas debajo | Inventariar no implica invocar ni redeplegar |
| Cron embeddings | Job 17 inactivo; pipeline `paused` | Mantener sin activar, no ejecutar ni consumir cola |
| Cron alertas | Job 18 activo cada 15 minutos | Sigue operando aunque los embeddings estén pausados |
| Queues | Una cola durable `catalog_embedding_jobs` | Sin USAGE/SELECT/escritura directa para anon/authenticated en relaciones observadas |
| Webhooks y triggers | Receptor RevenueCat y procesamiento de alertas; 66 triggers en 27 grupos | Una escritura de catálogo puede propagarse a otros procesos |

### Auth y redirecciones

El [panel de URLs](https://supabase.com/dashboard/project/gkffvigcnsesbaihycay/auth/url-configuration)
mantiene Site URL `http://localhost:8081` y estas cuatro redirecciones:
`quefalta://auth/callback`, `quefalta://**`, `exp://**`,
`exp://*.exp.direct/**`. El callback nativo está permitido. Los comodines
amplios y el fallback localhost merecen revisión separada con pruebas de
Google/Apple/email; **no demuestran que el login actual esté roto** ni autorizan
cambiar globalmente Auth. Supabase distingue el fallback Site URL del
`redirectTo` explícito y recomienda acotar las redirecciones productivas.
[Documentación oficial](https://supabase.com/docs/guides/auth/redirect-urls).

El [panel de Auth Hooks](https://supabase.com/dashboard/project/gkffvigcnsesbaihycay/auth/hooks)
muestra estado vacío. Esto no elimina el trigger SQL existente
`on_auth_user_created → public.handle_new_user`, habilitado. Los controles de
perfil/premium y las tablas de notificaciones/push observadas mantienen RLS.
No se revisaron credenciales de proveedores, SMTP, tokens o usuarios ajenos.

### Data API y permisos

El [panel Data API](https://supabase.com/dashboard/project/gkffvigcnsesbaihycay/integrations/data_api/settings)
indica 2/5 esquemas, 54/83 tablas y 88/185 funciones expuestas. Son denominadores
de esa pantalla, no un conteo de todos los objetos de Postgres. Los checks se
verificaron visualmente: `comparator_internal`, `price_alerts_internal` y
`private` no están seleccionados. Search path adicional `public, extensions`;
máximo 1.000 filas; pool sin tamaño manual.

**CE101-R01:** la autoexposición de tablas nuevas está habilitada. CE-103 debe
definir/revocar privilegios y comprobarlos dentro de la misma migración aditiva,
con pruebas negativas antes de habilitar el piloto. No basta con elegir un
nombre de esquema privado: una RPC pública SECURITY DEFINER puede acceder a
objetos internos. No se cambió el ajuste global ni se ejecutó la RPC comercial
`catalog_cheaper_products_v7`. El inventario administrativo no certifica permisos
reales del cliente; estos se ensayan en CE-105/106.

### Storage

`avatars`: público, máximo 5 MiB, JPEG/PNG/WebP. `recipe-images`: público,
máximo 6 MiB, JPEG. Once políticas en `storage.objects`: hay duplicados
semánticos en lectura/subida/actualización de avatares; no se limpiaron.

Las escrituras observadas verifican carpeta/propietario según operación.
Una política UPDATE de avatares carece de WITH CHECK explícito, pero Postgres
reutiliza USING para ese control: **no se diagnostica un agujero solo por ese
campo nulo**. Las políticas permisivas se combinan con OR.
[CREATE POLICY, PostgreSQL 17](https://www.postgresql.org/docs/17/sql-createpolicy.html).

**CE101-R03:** un bucket público permite recuperar el archivo por su URL;
una política SELECT para authenticated no convierte esa entrega pública en
privada. No se leyeron objetos ni se subió material. Si CE-1 necesita Storage
privado, se diseñará un objeto propio y acotado en CE-103, no se reciclarán estos
buckets ni se cambiará su visibilidad global.
[Modelo de acceso de Supabase Storage](https://supabase.com/docs/guides/storage/buckets/fundamentals).

### Edge Functions y autenticación de servicios

| Función desplegada | Versión | verify_jwt | Comprobación en CE-101 |
|---|---:|---|---|
| `delete-account` | 10 | true | Metadatos; no ejecutada |
| `apple-link` | 8 | true | Metadatos; no ejecutada |
| `send-push` | 13 | true | Metadatos; no ejecutada |
| `catalog-embed` | 13 | false | Fuente remota: POST + secreto de worker mediante double-HMAC |
| `revenuecat-webhook` | 6 | false | Fuente remota: POST + Authorization/secreto RC mediante double-HMAC |
| `process-price-alerts` | 6 | false | Fuente remota: POST + secreto de alertas, con fallback al de embeddings |
| `sync-plus-subscription` | 2 | true | Metadatos; no ejecutada |

Los hashes de los siete bundles están en el JSON. `verify_jwt=false` no prueba
acceso anónimo sin protección: las tres fuentes leídas validan un secreto antes
del trabajo privilegiado. **Esto es inspección, no prueba de seguridad de la
configuración de secretos**. No se listaron valores ni se hicieron requests de
prueba. La presencia del secreto dedicado de alertas no se ha comprobado;
revisar la separación en una tarea autorizada, sin rotarlo aquí.

### Cron, colas, eventos y webhooks

Ambos jobs usan `*/15 * * * *`: `catalog-embedding-dispatch` (17, inactivo) y
`process-price-alerts-every-15-minutes` (18, activo). La definición del segundo
contiene llamada HTTP; se guardó hash, no su comando ni cabeceras. No se cambiaron
horarios. En PGMQ, `meta`, cola y archivo no tienen RLS pero tampoco USAGE ni
grants de lectura/escritura para anon/authenticated en la captura. No se leyó
la cola, no se midió backlog y no se infieren sus valores a partir de CE-001.

**CE101-R02:** 18 catálogos tienen captura de cambios para alertas; 19, trazado
de precio. Precios por ubicación tienen sus propios triggers. Las tablas de
embeddings invalidan/revalidan cachés y runs. Son caminos preexistentes activos:
pausar el dispatcher no desactiva todo el sistema. Las fixtures de CE-104 no
deben insertarse en catálogos publicados o activar alertas para otros usuarios.

La búsqueda de triggers con llamada HTTP directa no devolvió candidatos.
Es una búsqueda acotada por nombres/cuerpo, **no una auditoría transitiva de
todas las funciones o webhooks externos**. RevenueCat tiene receptor desplegado;
no se verificó su configuración de entrega/reintentos en el proveedor. Tampoco
se enviaron pruebas de Expo push. No se observaron relaciones publicadas en
`supabase_realtime`; eso no demuestra que Realtime/Broadcast esté deshabilitado.

## 4. Preparación del acceso de @rruizosma

El manifiesto fija `enabled=false`, sin UID ni credenciales y sin efecto runtime.
El diseño para CE-103/105 será autorización servidor por `auth.uid()` verificado
y lista controlada por servidor, denegación por defecto y ámbito de CE-1. El
username puede cambiar: **no será el control de acceso**, ni tampoco `__DEV__`,
un flag del cliente o metadatos editables por el usuario.

Usar la cuenta habitual no concede Plus, no modifica permisos legacy ni
reinicia los tres usos gratuitos de por vida. CU-01 sigue intacta: solo una
respuesta final correcta que ofrece al menos un equivalente válido más barato
consume uso; vacío/error/pendiente no. Esta tarea no ejercita el contador.

Protocolo conservado para cuando haya código de app no publicado que validar
(ya no es condición para cerrar este inventario CE-101):

1. Identificar dispositivo/runtime y configuración realmente cargada, sin
   publicar build/OTA ni sobrescribir la app habitual. Si las variables vienen
   de EAS, comprobar ese entorno concreto sin mostrar claves.
2. Abrir la app de desarrollo con su cuenta existente y comprobar conexión,
   perfil y retorno del login si fuera necesario. Registrar los efectos normales
   de actividad/push/RevenueCat; no presentarlo como prueba sin escrituras.
3. No pulsar el comparador comercial, comprar/restaurar compras, crear reglas
   de alerta ni modificar el catálogo para validar la conexión. No pedir al
   propietario contraseñas, OTP, JWT o claves para volcarlos aquí.
4. Anotar evidencia de sesión y resultado. La vinculación del UID y los tests
   de denegación se harán al implementar las guardas; no son permiso concedido
   por este documento ni implican activar CE-1.

El test negativo de otro usuario no requiere acceder a una cuenta ajena:
usar fixtures locales o un principal controlado expresamente cuando proceda.

## 5. Integraciones y continuidad

No hace falta una integración nueva para CE-101. Auth, Data API, Storage, Cron,
Queues y las funciones existentes permiten preparar el piloto. Añadir otro
servicio ahora no resuelve permisos, aislamiento lógico o equivalencia estricta.
pgTAP se decide en CE-105; enriquecimiento de productos, en F4, con evidencia y
coste. No se cambia BU-01 ni se contrata PITR/compute u otro proveedor.

Pendientes exactos:

- **CE-101:** completada con el alcance de CE-VAL-001; nuevo runtime diferido
  hasta que haya código de app no publicado. UID/guardas servidor no habilitados.
- **CE-100:** completar su baseline de al menos 15 minutos, con CPU, memoria,
  I/O, conexiones, locks, latencia y errores; el HEAD no cubre ese requisito.
- **CE-102/103:** guardas locales completadas y reconciliación iniciada. Antes
  de cambios aditivos, destino/permisos acotados, capacidad y ausencia de efectos
  comerciales no deseados; G1 pendiente. F8 conserva aprobación pública separada.

Las guías Supabase/Postgres motivaron las consultas pequeñas READ ONLY, la
separación entre permisos administrativos y de cliente, y la comprobación
de efectos secundarios antes de iniciar una sesión. No se alteró el contrato
de cantidades exactas, variantes estrictas o catálogo activo sin TTL de 24 h.
La validación local y la conservación de cambios previos constan en el JSON;
no certifican el nuevo comparador desplegado.

## 6. Continuación autorizada — CE-SEQ-002 (2026-09-03)

El propietario ordena: «Cuando termines empieza la tarea CE-102 y si todo es
correcto empieza la CE-103». Queda autorizada esa continuación sin volver a
pedir permiso para cada inicio, manteniendo las condiciones de cierre.

Se comprobó la disponibilidad del entorno iOS: doce simuladores disponibles,
todos apagados. La guía ios-debugger-agent indica solicitar que se abra uno
en lugar de arrancarlo automáticamente; no se compiló, instaló ni inició
ninguna app. Se solicita al propietario confirmar que su versión de desarrollo
muestra `@rruizosma` y carga el catálogo, indicando móvil o simulador. No debe
pulsar el comparador ni compartir credenciales para esta comprobación.

En esa comprobación inicial CE-101 seguía EN VALIDACIÓN; el cierre posterior
consta en §7. Revisados preparatoriamente los scripts legacy: el importador
y materializador no son una vía segura para esta validación, porque pueden
escribir por defecto salvo DRY_RUN. No se han ejecutado ni modificado.

Al cerrar CE-101, implementar y probar las guardas de CE-102. Si pasan, iniciar
la reconciliación de CE-103. Sus escrituras siguen sujetas a CE-100/BU-01:
con baseline incompleto, solo lecturas y preparación/pruebas locales. No
desplegar automáticamente migraciones pendientes ni aceptar G1 por secuencia.

## 7. Cierre — CE-VAL-001 (2026-09-03)

El propietario aclara que usa el móvil y producción 1.3. Tras explicar que la
comprobación básica no necesita instalar otro build, confirma «pues si, se abre
el catalogo correctamente confirmado». Evidencia aportada por el usuario,
no observación automatizada de su pantalla ni validación de un token.

Se cierra CE-101: inventario y conexión local verificados, cuenta nominada y
catálogo de la app existente funcionando. Se corrige la exigencia prematura de
build de desarrollo; no se da una prueba inexistente por pasada. No se ha
concedido acceso de CE-1 ni cambiado cuota/Plus. CE-SEQ-002 permite continuar:
[CE-102](CE-102-execution-guards.md) completada localmente y
[CE-103](CE-103-migration-readiness.md) iniciada en lectura. CE-100 sigue abierta.
