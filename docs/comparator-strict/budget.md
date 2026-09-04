# CE-004 — Presupuesto, responsables y límites del piloto

> 2026-09-03 · versión 1.1 · plan v1.2 / CE-ENV-001 / CE-BU-002.
>
> CE-004 COMPLETADA: alcance, presupuesto y responsable de revisión confirmados
> por el propietario. F0/G0 aceptada; actualización posterior: F1/G1 cerrada
> para el canario privado, CE-100 cerrada con limitaciones de rendimiento.
>
> En el cierre histórico de CE-004: solo documentación y lecturas remotas.
> Entonces no se habían aplicado los límites como
> configuración, contratado servicios ni implementado CE-1.

Continuidad: CE-005 tiene [FR-02](freshness-policy.md) confirmada por el propietario:
catálogo activo/versionado, sin TTL de 24 h. Sustituye FR-01; el
[protocolo QA-01](acceptance.md) y G0 quedaron aceptados al ordenar cerrar CE-005
y empezar CE-100. El acta de §8 conserva el cierre histórico de CE-004; no cambia
ningún límite de recursos ni coste. Diagnóstico F1 en
[CE-100-readiness.md](CE-100-readiness.md).

Estado actual 2026-09-03: [CE-BU-002](CE-BU-002-corpus-authority.md) retira el
límite SQL acumulado por instrucción expresa del propietario y amplía filas /
transferencia solo para completar CE-200. [Corpus terminado](CE-200-closure.md).
Contadores conservados al cierre: 1.518.920 ms reservados (sin techo acumulado),
108.246.478/134.217.728 bytes y 34.177/50.000 lecturas reservadas. No son consumo
facturado ni CPU. Los 299.920/300.000 ms y 22 MiB del cierre F1 son históricos;
su prohibición de nueva carga por tiempo queda expresamente sustituida.

## 1. Acuerdo del piloto

- Cuatro tiendas candidatas: Mercadona, Carrefour, Consum y Plusfresc.
- Dos CP de referencia: 08006 y 25001; tres familias de CE-003, sin ampliación.
- **0 € de nuevas contrataciones y ampliaciones autorizadas**: reutilizar el
  Supabase actual y las herramientas existentes; no contratar un buscador,
  proveedor de IA, proxy, nueva instancia o rama de pago para empezar.
- Trabajo intensivo y evaluación de miles de parejas en fixtures locales;
  consultas y escrituras remotas acotadas, estas últimas solo desde F1.
- Si no caben calidad, coherencia con el catálogo o carga en este marco, detener
  la ampliación y presentar el coste necesario. No rebajar equivalencia ni
  integridad de versiones; FR-02 elimina el TTL comercial, no los topes de carga.

La [matriz de fuentes/zonas](source-zone-matrix.md) detalla capacidades y
condiciones por tienda. La aprobación del piloto no promete cuatro resultados
ni cobertura comercial completa en ambos CP.

## 2. Situación comprobada y límites de conocimiento

| Elemento | Evidencia de CE-004 |
|---|---|
| Proyecto | `gkffvigcnsesbaihycay`, QueFalta, eu-west-1, `ACTIVE_HEALTHY` puntual |
| Organización | Plan Pro confirmado por Management API |
| Compute | CONTEXTO/HANDOFF piden mantener Medium durante dos ciclos; tamaño efectivo no comprobado por Management API en esta tarea |
| Conexiones | 25 conexiones a la BD, 0 activas, 0 esperando lock y 0 idle in transaction, excluida la consulta; `max_connections=60` |
| Segunda muestra | Mismos contadores puntuales; no equivale a una serie temporal |
| Precios locales existentes | `catalog_location_prices`, estimación de 163.838 filas; índice por tienda/ubicación/producto publicado |
| Fuentes piloto | Las cuatro relaciones existen; sincronizaciones globales y muestra de 600 filas locales verificadas |
| CPU, RAM, I/O, latencia histórica | No medidos en CE-004; no inferir capacidad libre a partir de conexiones inactivas |
| Factura y límites de consumo | No se han leído factura, cuota remanente, configuración de Spend Cap ni consumo de Actions/proveedores |

No inferir tamaño Micro/Medium a partir de `max_connections`; puede existir
configuración específica. No bajar compute ni modificar el trabajo operativo
de observación del pipeline por esta tarea.

Actualización CE-100: el panel autenticado muestra MICRO/t4g.micro, no Medium;
ningún tamaño ha sido cambiado por CE-1. Hay margen en las cuotas Pro mostradas
y spend cap habilitado. Se verificaron copias físicas y PITR desactivado; los
gráficos de I/O/conexiones no completan la línea base. El historial de CE-004
anterior se conserva, pero no acredita la capacidad actual. Ver
[CE-100-readiness.md](CE-100-readiness.md). No restaurar Medium por inferencia
ni ampliar estos topes para compensar recursos sin comprobar.

### Coste contratado no es coste marginal cero

El acuerdo de 0 € significa no autorizar nuevos servicios ni ampliaciones,
**no** que las lecturas, almacenamiento, transferencia o ejecución adicional
sean gratis. Antes de una campaña remota F1 comprobar consumo disponible y
factura prevista; si no puede verificarse margen, no iniciar la campaña.
Las lecturas diagnósticas mínimas actuales no certifican un coste facturado de cero.

Supabase factura compute por tiempo de instancia, no por sentencia SQL;
sus créditos son de organización. El Spend Cap cubre algunos consumos, no
compute, y no permite fijar un presupuesto preciso para CE-1. No usarlo como
único límite ni cambiarlo en esta tarea. Véanse [compute](https://supabase.com/docs/guides/platform/manage-your-usage/compute)
y [control de costes](https://supabase.com/docs/guides/platform/cost-control).

## 3. Presupuesto por partida

Los siguientes son topes aceptados, no una certificación de recursos disponibles.

| Partida | Marco inicial aceptado | Condición de ampliación |
|---|---|---|
| Proyecto/compute/replicas/ramas Supabase | Sin altas ni cambio de tamaño; preservar lo contratado | Evidencia de cuello de botella y coste incremental aceptado |
| Disco, transferencia, funciones y Actions | Solo margen incluido verificado; presupuesto de operaciones de §4 | Si hay sobrecoste previsible o margen desconocido, detener nuevos lotes y pedir decisión |
| OpenAI/embeddings/reranking nuevos | 0 llamadas adicionales de pago para CE-1 por este acta | F4: utilidad medida, tokens, coste por 1.000 referencias y mensual aprobados |
| Open Food Facts | Reutilizar datos ya disponibles, sin nuevas consultas en F0; evaluación posterior limitada | F4: licencia, cobertura del pack comercial, límites y coste de mantenimiento; no inferir precio/stock |
| GS1, buscador externo, proxies u otros proveedores | 0 contrataciones / 0 llamadas | Decisión explícita de F4; no son necesarios para definir las puertas estrictas |
| pgTAP | Candidato de pruebas en F1, preferentemente local/CI; sin instalación ahora | Revisar versión disponible, permisos y coste de ejecución antes de instalar |
| pg_jsonschema | Condicional en F3, sin instalación ahora | Justificar utilidad frente a validación tipada existente |
| Almacenamiento local de evidencias | Máximo inicial 250 MiB; texto y datos necesarios, sin imágenes ni datos personales | Ampliar con motivo si el corpus independiente lo necesita |

No se pone precio a la factura actual con una tarifa genérica de internet.
Una eventual propuesta de pago debe separar divisa, impuestos aplicables,
coste existente y diferencial, volumen previsto y peor caso; nunca aprobar
un coste mensual ilimitado mediante una estimación por petición.

Fórmula de control posterior: coste incremental = compute añadido + excesos
de disco/egress/funciones/Actions + llamadas/tokens externos + nuevos servicios.
Medir cada término con el proveedor real; lo no observado queda «desconocido»,
no cero. El presupuesto de cuota comercial CU-01 es independiente del coste
técnico y de los límites antiabuso.

## 4. Límites de ejecución aceptados

Aplicables **después de aceptar G0**, dentro de la fase correspondiente y con
control implementado en F1. No autorizan escrituras durante F0. Todos los límites
son por proyecto CE-1, no por proceso, y el diario es de 00:00 a 24:00 UTC.
Reintentos consumen presupuesto técnico aunque no consuman cuota del usuario.

| Recurso/operación CE-1 | Límite inicial |
|---|---|
| Concurrencia remota | 1 trabajo CE-1 activo y 1 consulta/transacción en vuelo; sin multiplicarlo por tienda |
| Lectura para corpus | 500 filas/página. Ordinario: 5.000 filas y 10 MiB/día. CE-BU-002: hasta 50.000 filas / 128 MiB contabilizados para el corpus CE-200, conservando reservas previas; no renovación automática |
| Corpus inicial | Hasta 6.000 referencias comerciales y 12.000 observaciones de ubicación; extracción incremental, no dump completo |
| Pruebas remotas del comparador nuevo | 100 peticiones lógicas/día, hasta 3 destinos por origen, 50 candidatos por destino; mínimo 1 s entre inicios, sin solapamiento |
| Escritura posterior en CE-1 | Primer canario ≤ 5 filas; lotes ≤ 50 filas; ≤ 500 filas por trabajo y ≤ 2.000/día |
| Tiempo SQL | `statement_timeout=5s`, `lock_timeout=500ms` locales para nuevos trabajos; operación que no quepa requiere revisión específica, no aumento global |
| Tiempo de trabajo | Sin límite acumulado de duración o SQL por CE-BU-002. Lease individual ≤ 20 min para impedir trabajos colgados; continuar mediante lotes sucesivos. Conservar contadores y timeouts por sentencia; no confundir reservas con CPU |
| Llamadas a retailers/OFF | 0 nuevas en F0–F3; en F4/F5, ensayo autorizado ≤ 120 intentos HTTP/día en total y ≤ 20 por trabajo, sin automatismo periódico |
| Ritmo externo posterior | Concurrencia 1, al menos 2 s entre intentos; prevalece cualquier límite del proveedor más restrictivo; respetar Retry-After y no esquivar bloqueos |
| Respuesta externa | Máximo 10 MiB por respuesta, incluida dentro del tope diario de transferencia CE-1; detener descarga excesiva y no publicar una captura parcial |
| Reintentos | Máximo 2 adicionales por operación idempotente, dentro de todos los topes; ante error persistente o 403/429, detener ese origen y revisar |
| Nuevos jobs periódicos / usuarios públicos | 0 en F0; creación por la fase prevista y activación pública solo en F8 |

Los topes son máximos, no un objetivo de consumo. Alcanzar cualquiera detiene
el trabajo hasta el siguiente presupuesto o una decisión explícita. Un catálogo
entero de miles de filas no se convierte en «operación pequeña» por llegar en
una única petición HTTP. No lanzar los scripts actuales suponiendo que ya
implementan estos límites: no lo hacen necesariamente.

En escrituras se deben inventariar también filas inducidas por triggers,
históricos, colas e invalidaciones. Si esos efectos no pueden delimitarse, no
ejecutar el lote en una tabla compartida; revisar el diseño en F1/F5.
No incrementar generaciones de todas las tiendas por un ensayo de una sola.

El corpus de F2 sigue exigiendo **5.000–10.000 parejas y al menos 1.000 consultas**.
Se evalúan localmente: no son 10.000 llamadas remotas. Los topes de extracción
no rebajan el tamaño, independencia o precisión exigidos; si no bastan,
ampliar el presupuesto antes de cerrar G2. Repetir la misma pareja o mismo
GTIN no crea evidencia independiente.

Los límites comerciales continúan siendo tres usos por cuenta y Plus sin ese
cupo. En F6, proponer para ambas modalidades un límite antiabuso separado de
1 petición lógica nueva en vuelo y 6 inicios/minuto por cuenta; reintentos
idempotentes recuperan la misma operación. Alcanzarlo produce espera, no pérdida
de un uso. Validar el límite técnico antes de incorporarlo, sin venderlo como
una nueva cuota de búsquedas de Plus.

## 5. Ventana, métricas y criterios de parada

Excepción puntual del 2026-09-03: el propietario autorizó la prueba CE-100
condicionada a no añadir coste monetario. Tras comprobar cuota incluida y
ausencia de facturación de overages, se usó un máximo interno de 22 MiB
ese día y el lock HTTP existente de 8 s (sentencia anon 3 s), sin cambiar
roles, plan ni recursos. [Resultado](CE-100-catalog-probe-results.md): 20,94 MiB
contabilizados, ejecución terminada y baseline incompleto. No es ampliación
permanente ni rebaja calidad. CE-BU-002 autoriza después una extracción distinta
de corpus: sustituye el impedimento acumulado, sin reutilizar aquel canario.

Ventana candidata para lotes remotos: martes–jueves, **21:30–22:00 UTC**
(23:30–00:00 en Madrid en verano; 22:30–23:00 en invierno). No se ha programado
nada ni demostrado que sea la franja de menor uso. Priorizar salud observada
y ausencia de sync/mantenimiento; una hora de reloj por sí sola no autoriza DDL.

CE-001 identifica coincidencia de Gadis y mantenimiento a las 05:20 UTC y
varios syncs los lunes. No detenerlos ni mover sus horarios para acomodar CE-1.
El cron de alertas existente cada 15 min sigue activo y debe poder coexistir;
que no haya otro sync del piloto no significa que la BD esté libre.

Antes de escribir o medir carga: registrar 15 minutos de baseline de CPU/I/O,
conexiones, locks, errores y latencias con la fuente de métricas disponible.
La instrumentación se concreta en CE-100/102/106, sin consultas a perfiles ni a
RPC que consuman cuota. Si faltan métricas, mantener diagnóstico de lectura y
pruebas locales; no pasar a lotes o escalarlos a ciegas.

Criterios operativos iniciales aceptados, no resultados ya medidos:

- No iniciar/ampliar si CPU ≥ 70 % sostenida 5 min, conexiones ≥ 80 % del
  límite configurado o presión de memoria/I/O indicada por la plataforma.
- Detener ante bloqueo de clientes atribuible a CE-1, fallo de cuota, escritura
  fuera del conjunto permitido, error de permisos o falso ahorro crítico.
- Detener ante dos timeouts SQL consecutivos, lote que supera su presupuesto
  o errores de nuevas operaciones CE-1 > 1 % con al menos 100 intentos.
  Un error grave no espera a completar esa muestra.
- Detener si p95 del flujo vigilado aumenta simultáneamente > 20 % y > 200 ms
  respecto al baseline comparable, durante 5 min con ≥ 20 observaciones.
  Con menos tráfico, no declarar estabilidad ni ampliar solo por falta de datos.
- Si crecen colas/trabajos inducidos por CE-1 fuera del límite del lote,
  suspender su productor y conservar estado para recuperar; no drenar la cola
  legacy ni cancelar sesiones de usuarios ajenos.

Esto complementa el rollback de F8; no sustituye sus umbrales ni prueba que la
infraestructura soporte el piloto. Detener primero el trabajo CE-1 identificado;
revertir solo su cambio si corresponde y es seguro. No restaurar toda la BD.

## 6. Responsables y dedicación

| Función | Responsable / estado | Evidencia exigida |
|---|---|---|
| Producto, alcance y gasto | Propietario de QuéFalta, usuario de este chat | Aceptación explícita de CE-004/G0; no se deduce del permiso para usar producción |
| Ejecución técnica actual | Codex en este repositorio; cada fase nombra su operador en el acta | Commit, consulta/diff, límites, pruebas y resultado; no implica atención permanente |
| Validación del corpus | Propietario de QuéFalta, confirmado en RV-01 | Segunda revisión de disputas y del 20 % aleatorio conforme a CE-203, sin ver la predicción del motor antes de emitir su criterio |
| Operación y parada | Operador de cada ventana; propietario aprueba excepciones | Observación previa/posterior y capacidad de detener su trabajo identificado |

No prometer una fecha de finalización sin medir extracción y revisión. CE-200/203
deben cronometrar primero 50 casos y extrapolar esfuerzo. Como orientación
aritmética, revisar 1.000–2.000 parejas (20 % de 5.000–10.000) a 30–90 s/caso
requeriría unas 8–50 h **solo para esa segunda revisión**, más disputas y
etiquetado inicial. No es una tarifa, compromiso de horas del usuario ni medición.
La automatización puede asistir; no reemplaza la revisión independiente exigida.

**RV-01 confirmada (2026-09-02):** el usuario responde «si yo me encargaré de
revisarlo» después de la explicación de la segunda revisión. El propietario
asume ese control; no se contrata ni se asigna a un tercero.

En F2 se prepararán lotes con los dos productos, formato/variante y evidencia
original para recoger su criterio y los casos dudosos. El calendario y tamaño
de los lotes se acordarán al preparar la revisión, sin convertir la estimación
de horas anterior en un compromiso. La asignación no significa que los casos
estén ya revisados ni que G2 esté aceptado. No se han creado tareas externas,
agentes adicionales ni servicios de revisión.

## 7. Estado de decisiones y dependencias

| ID | Decisión / estado | Efecto |
|---|---|---|
| SC-01 | CONFIRMADA: Mercadona, Carrefour, Consum y Plusfresc; CP 08006/25001 | Alcance de evaluación aceptado, sin certificar cobertura ni activar resultados |
| BU-01 | CONFIRMADA: sin nuevas contrataciones/ampliaciones y con los topes técnicos de este documento | Aplicación en las fases previstas tras G0; ningún gasto adicional o proceso habilitado ahora |
| CE-BU-002 | CONFIRMADA: tiempo acumulado sin techo; ampliar filas/transferencia para CE-200 dentro del margen incluido | Migración privada aplicada, reservas conservadas; corpus completado sin contratar servicios ni activar el comparador |
| RV-01 | CONFIRMADA: el propietario hará la segunda revisión | Responsable asignado; lotes/calendario por acordar en F2, revisión aún no realizada |
| CE-005 | COMPLETADA: FR-02 y QA-01 confirmadas; G0 PASS en [acceptance.md](acceptance.md) | Catálogo activo, sin TTL de 24 h; no ampliar carga por invalidar o recalcular |

Las brechas de ubicación se implementan y verifican en CE-504/505; el control
de recursos en CE-100/102/106; la cuota CU-01 en CE-607. Estos entregables no adelantan
esas fases ni aprueban los parches HNSW/modal de CE-002.

Historial de aprobación (2026-09-02): la primera respuesta del usuario asignó
la revisión (RV-01), sin aprobar por inferencia el resto. Después se le preguntó
expresamente por las cuatro tiendas, CP 08006/25001, ausencia de nuevas
contrataciones y límites de carga propuestos. Respondió «si exacto, eso es»:
esta segunda respuesta confirma SC-01 y BU-01 y cierra CE-004.

Aquella respuesta no aprobaba el TTL de 24 h ni las métricas entonces pendientes de CE-005,
la activación pública, nuevos gastos ni saltarse los controles de las fases.
Esa frase describe la aprobación de CE-004: posteriormente el propietario
descarta expresamente el TTL de 24 h y confirma FR-02, sin ampliar BU-01.
Finalmente «cierra CE-005 y empieza CE-100» ratifica QA-01 y G0.

## 8. Acta histórica de CE-004, método y fuentes

| Campo | Resultado |
|---|---|
| Entregables | Este presupuesto, matriz de fuentes/zonas y `CE-004-evidence.json` |
| Estado CE-004 | COMPLETADA como definición; SC-01, BU-01 y RV-01 confirmadas; sin implementación |
| Fase | F0 EN CURSO; G0 no aceptado; CE-005 pendiente |
| Remoto | 5 intentos SQL de lectura: 4 correctos y 1 error sintáctico, corregido una vez; sin ampliar timeouts |
| Precauciones | Transacciones READ ONLY, statement_timeout 5 s, lock_timeout 1 s, ROLLBACK; metadatos/agregados y muestra de 600 filas sin raw ni perfiles |
| Costes nuevos / cambios productivos | Ninguna contratación, instalación, despliegue, sync, cambio de contador ni configuración |
| Validación local | `npx tsc --noEmit` y `git diff --check` correctos; 11 documentos con enlaces/bloques válidos; 67 tareas, solo CE-000–CE-004 cerradas; T01–T35, D01–D14 y ocho hashes preexistentes conservados |
| Próximo paso | CE-005: vigencia de precios/disponibilidad y criterios de aceptación, sin saltar G0 |

La primera consulta devolvió el último SELECT de su inspección de columnas;
los agregados de salud se repitieron en una consulta de salida única. Las
tres capturas exitosas retenidas (20:22:50, 20:23:11 y 20:23:52 UTC) y su SQL
están en [CE-004-evidence.json](CE-004-evidence.json). Son instantes sucesivos,
no un snapshot atómico ni una prueba de impacto nulo.

Se han usado las guías de Supabase/Postgres para limitar consultas y distinguir
salud puntual, capacidad y coste. El changelog Markdown no pudo obtenerse por
las herramientas disponibles; se revisó la versión HTML y los avisos aplicables:

- [Compute y disco](https://supabase.com/docs/guides/platform/compute-and-disk): no cambiar tamaño sin presupuesto y planificación de interrupción.
- [Control de costes](https://supabase.com/docs/guides/platform/cost-control): Spend Cap no es un presupuesto granular de CE-1.
- [Cambio de logs.all](https://supabase.com/changelog/48235-migration-of-supabase-management-api-logs-all-analytics-endpoint-to-logs-endpoint): al implementar métricas, verificar compatibilidad con el endpoint vigente; retirada anunciada para 2026-09-23. No se modificó el sistema de logs.
- [Versiones de extensiones](https://supabase.com/changelog/extension-version-pinning-ignored): verificar versión efectivamente instalada en F1/F3; no asumir que solicitar una versión garantiza obtenerla. No instalar ahora.

Los datos históricos del plan y el estado operativo continúan en
[CE-001](CE-001-supabase-inventory.md), [CONTEXTO](../../CONTEXTO.md) y
[HANDOFF](../../HANDOFF.md). La política comercial vigente para el proyecto
está en [decisions.md](decisions.md).
