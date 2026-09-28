# Palabra de hoy

## Controles de Android (local, 2026-09-28)

- Los selectores de pestaña y periodo evitan el gris translúcido en Android:
  pista opaca y opción activa en acento sólido con contenido blanco.
- Los botones de Volver, Premios e Info tienen la misma caja transparente de
  44 × 44 pt en Android e iOS.

## Tamaño del tablero (local, 2026-09-28)

- Las casillas máximas pasan a 44 pt en pantallas normales y 54 pt en las
  altas. La anchura disponible sigue limitando el tamaño para palabras de
  seis letras; la letra crece en proporción hasta 28 pt. El tamaño es el
  mismo antes y después de completar el reto.

## Cuatro participantes ficticios retirados (2026-09-27)

- La migración `20260927090604_remove_four_word_ranking_demo_users.sql` quita
  `demo_001`–`demo_004` del ranking público y del cálculo de mejores puestos en
  Perfil. Todos los periodos vuelven a usar solo resultados de partidas reales.
- Los participantes se generaban dentro de las funciones SQL: no había cuentas
  ni resultados guardados en las tablas que borrar. La prueba PGlite valida que
  tras la migración ya no aparecen en el ranking de hoy, ayer, otros periodos,
  grupos o la RPC legacy. Aplicada en Supabase como versión `20260927090604`;
  la consulta remota confirmó cero filas ficticias en Hoy y Ayer.

## Puestos del ranking general con Plus (local, 2026-09-26)

- Los tres primeros puestos y todos los números de puesto (`#n`) son visibles.
  Desde el cuarto puesto, sin Plus, usuario, foto, aciertos y puntuación
  aparecen difuminados.
  La fila propia no se resalta ni se añade al final; «Mi posición» abre Plus.
- Ayer y los demás periodos cerrados siguen la misma regla. Grupo conserva
  puestos, identidades y el salto a la fila propia sin gate.
- Las mejores posiciones de Perfil requieren Plus; racha y actividad no.
  `expo-blur` precisa una build nativa nueva para mostrar el efecto. La RPC
  mantiene los datos por compatibilidad con clientes anteriores; no hay
  migración.
- Material de las filas bloqueadas rediseñado el 27-09: capa translúcida,
  blur nativo, gradiente azul por alfa, stroke, highlight, sombra y micrograno.
  Barra pulsable que abre Plus; el puesto `#n` sigue nítido. Medidas, tokens,
  variante oscura, CSS y prompt en `docs/word-ranking-glass-design.md`.

## Banner de racha actual (2026-09-26)

- Al terminar la partida en esta pantalla se consulta la estadística propia y,
  una vez finalizado el revelado, se superpone arriba un banner durante 4 s.
  Usa el mismo icono `flame-outline` de la racha en Perfil y copia singular/
  plural en castellano y catalán. Victoria y derrota cuentan por igual.
- La etiqueta crece a 18 pt y el número a 24 pt. El banner nace mostrando la
  racha previa; a los 300 ms el valor nuevo sube desde abajo y sustituye al
  anterior, que sale por arriba. El fuego realiza tres pulsos ascendentes.
  Reducir movimiento omite estas transiciones y presenta el valor final.
- El disparo queda ligado al envío que termina la partida: refrescar, volver a
  entrar o cargar un resultado ya guardado no vuelve a mostrarlo. Si la app pasa
  a segundo plano durante la animación, espera a que la pantalla esté activa.
- El RPC `word_game_profile_statistics` añade `currentStreak`; se calcula con
  todos los días finalizados de la temporada que forman una secuencia hasta hoy
  en Europe/Madrid. Migración local
  `20260926133620_add_current_word_streak.sql`, aplicada en Supabase como
  `20260926134026_add_current_word_streak`.
- PGlite confirma racha actual/mejor, huecos, victorias/derrotas y permisos. El
  contrato del banner, TypeScript y ESLint pasan; pendiente revisión visual.

## Perfil: estadísticas de Palabra de hoy (2026-09-26)

- «Mis estadísticas» no se muestra en Perfil y «Editar» recupera su diseño
  anterior. La pantalla dedicada conserva el bloque: mejor racha de días
  consecutivos completados, mejores puestos diario/semanal/mensual/anual del
  ranking general y tablero mensual desplazable de los últimos 12 meses.
  El bloque ya no se muestra directamente en Perfil.
- Victoria y derrota cuentan igual para actividad/racha; iniciar sin terminar
  no cuenta. Fechas según Europe/Madrid, histórico desde el reinicio v2 del 16-09.
- Los puestos usan los mismos puntos/empates del ranking y comparan todos los
  periodos. Se muestra la fecha del mejor periodo; si aún está abierto se marca
  «En curso» y puede cambiar. No son máximos intradía guardados permanentemente.
- RPC `word_game_profile_statistics` sin parámetros de usuario, con comprobación
  de auth, implementación privada y wrapper invoker; solo devuelve datos propios.
  Migración `20260926113035_word_profile_statistics.sql` aplicada en Supabase.
- Cliente ES/CA, temas, carga/error/reintento y refresco al enfocar o volver a la
  app. Datos en memoria por instancia/cuenta; ninguna clave global persistida.
- Validación: integración PostgreSQL del juego y paridad de los cuatro récords,
  rachas y actividad, permisos, calendario bisiesto y parser, TypeScript y lint.
  Pendiente revisión visual en dispositivo; no se ha publicado build ni OTA.


Primera versión implementada el 11/09/2026. Cliente local, pendiente de una
nueva publicación de la app; backend ya desplegado en QuéFalta.

## Participantes ficticios retirados (2026-09-25)

- Los 100 participantes `demo_001`–`demo_100` y sus 400 resultados sintéticos
  fueron eliminados de producción el 25/09. Esa configuración solo con partidas
  reales fue sustituida el 26/09 por cuatro entradas virtuales nuevas en el
  ranking general; Grupo e Histórico siguen solo con jugadores reales.
- `20260925092356_remove_word_ranking_demo_users.sql` elimina la tabla privada
  de fixtures después de sustituir su última referencia en la función optimizada.
  Aplicada remotamente como `20260925092539_remove_word_ranking_demo_users`.
- No cambia el contrato del cliente ni requiere una nueva versión de la app.

## Experiencia

- Resultado final compacto: la derrota no muestra mensaje secundario ni sol;
  conserva la palabra correcta. La cifra de puntos se destaca sin tarjeta,
  fondo, borde ni sombra, y el tiempo aparece inmediatamente debajo.
  La victoria mantiene trofeo y título.
- El resultado mantiene el
  tablero ajustado al alto disponible, sin leyenda final y con espacios menores.
  La altura real del panel y del pie reserva espacio para ver la puntuación
  sin desplazar en móvil vertical; scroll de respaldo para accesibilidad.

- Ayuda con carrusel manual de puntuación: tres páginas (4/5/6 letras), seis
  filas de intento/puntos por página, puntos pulsables e indicación «Desliza ·
  n de 3». Se reinicia en 4 letras al abrir, sin avance automático. Textos ES/CA.

- Ranking y Grupo precargan solo el periodo elegido al entrar en el juego.
  Caché de memoria acotada a 12 respuestas, 60 s de frescura y hasta cinco
  minutos de instantánea para mostrar mientras se actualiza. Se separa por
  cuenta, día, grupo y resultado; sin persistencia ni polling. Máximo dos
  consultas simultáneas; solicitudes duplicadas comparten la misma respuesta.
  La lista virtualiza filas e imágenes y no se repinta por el reloj del juego.
  La primera apertura sin datos precargados sigue dependiendo de la conexión.
- Consulta optimizada aplicada en producción (20260920155934): conserva
  resultados y privacidad, calcula puestos antes de cargar como máximo 151
  perfiles/entradas JSON. La ruta de grupo filtra por membresía desde el inicio.
  En PGlite con 10.000 participantes: mediana 296,6 → 120,5 ms; no es una
  medición de CPU/RAM de producción ni una garantía de latencia de red.
- La fila actual admite tocar cualquier casilla para escribir o corregir esa
  posición. La seleccionada se destaca; la siguiente letra avanza al próximo
  hueco. El borrador local guarda los huecos y la selección. Enviar exige todas
  las letras, incluso si se completó una casilla posterior antes que una anterior.
- El botón de regalo vuelve a la cabecera y abre el popup opaco de premios
  mensuales y anuales, con textos ES/CA. Es informativo: el juego
  todavía no adjudica premios ni activa suscripciones automáticamente.
- Ranking con destacados 2–1–3: tarjetas redondeadas con degradados suaves
  oro/plata/bronce, primer puesto elevado y sombra sutil. Sustituyen los cilindros
  iniciales. Retratos enmarcados con medalla de posición, puntuación destacada,
  @ encima de la foto e insignia dorada de Plus. Foto ausente/fallida
  usa avatar neutro. Con menos de tres participantes quedan posiciones vacías;
  los empates conservan puesto, altura y metal reales. El resto continúa en una
  lista que también muestra la foto pública o las iniciales de cada usuario.
  Localizado ES/CA y compatible con tema claro/oscuro. Pendiente revisión visual.
- Inicio sustituye «¡Prepara la compra!» por un botón con degradado y brillo
  en movimiento. La animación se detiene al salir de Inicio, pasar a segundo
  plano o activar Reducir movimiento.
- Abre `DailyWord` dentro de Inicio, a pantalla completa y con Volver. La barra
  general de pestañas se oculta solo en este destino y vuelve al salir.
- Desde el 12/09 se retira solo el bloque de fecha/letras/idioma. El selector
  ofrece Jugar, Ranking y Grupo. Los dos rankings usan cinco periodos y
  muestran la posición propia según el gate Plus del ranking general; Grupo
  mantiene la posición propia para todos.
- Tablero de seis filas, palabra de
  **4, 5 o 6 letras**, teclado propio fijo, leyenda, ayuda, cuenta atrás,
  recuperación tras errores y resultados compartibles sin solución ni letras.
  El mensaje conserva una fila por intento y una celda de color por letra:
  verde para lugar correcto, amarillo para otra posición y gris oscuro para
  letra ausente.
- Al enviar una palabra válida, cada letra revela su color con un giro sobre el
  eje vertical, de izquierda a derecha. Giro de 420 ms, con 180 ms entre comienzos;
  el intento completo tarda 960–1320 ms según su longitud. El teclado muestra las
  pistas progresivamente y el resultado final espera a la última casilla.
  Se bloquea la entrada durante el revelado. Solo se anima el intento recién
  enviado: el historial y Reducir movimiento se presentan directamente.
- Estilos por fábrica y `useThemedStyles`: tema claro/oscuro/acento. Interfaz
  ES/CA; palabras y teclado solo en castellano, con Ñ y sin Ç. Las etiquetas de accesibilidad complementan los
  colores de evaluación; las casillas no muestran símbolos adicionales.
- Diseño Liquid Glass: cabecera superpuesta con selector Jugar/Ranking/Grupo,
  selector de periodos de cristal y teclado flotante sobre una sola
  `GlassSurface`. El scroll reserva las alturas medidas y pasa bajo
  ambas barras; fondo ambiental de la app. El tablero y los resultados
  conservan superficies legibles. Sin cristales anidados ni un efecto nativo
  por tecla. Android/iOS sin cristal conservan la presentación opaca.

## Reglas

Una partida por cuenta y fecha de **Europe/Madrid**, también al cambiar de
dispositivo o idioma. El día va de medianoche a medianoche, con el cambio
horario real de España; no es un intervalo móvil de 24 horas.

Al entrar con la interfaz en catalán, un aviso en catalán explica que las palabras
y el teclado son en castellano para compartir reto y clasificación. El juego no
se activa hasta pulsar «Entesos». La aceptación se guarda por cuenta en este
dispositivo: el aviso solo aparece la primera vez que esa cuenta entra a jugar.

La primera consulta del día crea el reto común en castellano mediante una
selección aleatoria en el servidor, excluyendo soluciones de los últimos 30
días. No hace falta cron. Consultar no consume la partida. «Empezar reto» crea
la partida y fija el inicio del tiempo en el servidor; las siguientes visitas
recuperan esa misma partida.\nLa preferencia de idioma de la app no cambia el
reto, el borrador ni el ranking.

Se admiten **31.890 formas españolas de 4–6 letras**: 31.889 derivadas de RLA-ES
`es_ES` v2.9 y la excepción curada `BONSAI` (forma normalizada de «bonsái»), sin filtro temático. Incluyen singulares, plurales y formas
verbales. Se omiten lemas que comienzan por mayúscula para evitar nombres
propios y siglas. Las entradas locales antiguas que no están en RLA-ES quedan
deshabilitadas, no borradas: los retos históricos conservan sus referencias y
la solución de hoy aún puede acertarse. Las 386 entradas catalanas
se conservan deshabilitadas. Las palabras se convierten a
mayúsculas y se quitan los acentos; la Ñ se conserva. Las entradas inválidas
y palabras ya probadas no consumen intentos. Las letras repetidas se evalúan
asignando primero coincidencias exactas y después las restantes disponibles.

Seis intentos. Desde la nueva temporada, la base por intento es
**100, 85, 70, 55, 40, 25**. Longitud: 4 letras ×1, 5 ×1,2, 6 ×1,4.
Cada bloque completo de 20 segundos desde «Empezar reto» multiplica los
puntos restantes por 0,95. Se redondea con mínimo de 1 punto por victoria;
el domingo (fecha del reto en Europe/Madrid) se duplica el resultado final.
Derrota: cero. No hay ventajas Plus. El servidor registra el inicio y el
acierto; el tiempo sigue corriendo entre dispositivos y en segundo plano.
Antes de empezar se puede consultar el reto sin consumir tiempo ni partida.
Las partidas, los intentos y los puntos anteriores se eliminaron al activar
la fórmula; el histórico comienza desde cero el 2026-09-16.
Los intentos se guardan en el servidor. El borrador todavía sin enviar se
conserva en el dispositivo por cuenta (clave española anterior), vinculado al reto y al número
de intento. Se recupera al salir/volver o reiniciar; se descarta si cambió el
reto, avanzó la partida en otro dispositivo o está corrupto.

Clasificación común para todos: diario, semana natural desde el lunes, mes
natural, año natural e histórico acumulado desde el reinicio. Tras cerrar un
periodo diario, semanal, mensual o anual, «Ver periodo anterior» permite
consultar sus resultados y recorrer periodos cerrados hasta el comienzo de
la nueva puntuación. El servidor calcula los límites en Europe/Madrid y
devuelve el tramo efectivo desde el reinicio. Los empates de puntos
comparten puesto. Se muestran
los primeros 150 usuarios y la posición propia aunque quede fuera. Solo aparece
el nombre de usuario público; los perfiles no descubribles salen como Jugador
ante terceros. No se devuelven ids, correos, nombres reales ni respuestas ajenas.
La pestaña Grupo aplica los mismos periodos, podio y reglas de privacidad a
los miembros actuales del grupo activo. El servidor exige que el usuario
pertenezca al grupo solicitado. Sin grupo activo se muestra una indicación
para activarlo en Grupos. El periodo «Anterior» queda retirado también del RPC.
La migración `20260916210720_word_group_ranking.sql` se aplicó en producción
como `20260916211123_word_group_ranking`; el cliente sigue pendiente de
publicación.
La migración `20260916211402_word_ranking_period_history.sql` se aplicó como
`20260916211853_word_ranking_period_history`: añade la consulta de periodos
cerrados y el año al ranking general y de grupo. Las clasificaciones antiguas
de Grupo consideran los miembros actuales del grupo.
`20260919102242_seed_word_ranking_demo_users.sql`, aplicada como
`20260919102523_seed_word_ranking_demo_users`, incorpora 100 participantes de
demostración en Hoy, Semana, Mes y Año. Se guardan en una tabla privada sin
cuentas Auth, perfiles ni membresías; quedan excluidos de Grupo e Histórico.

## Base de datos

Nueva migración local `supabase/migrations/20260916192534_word_game_scoring_v2.sql`,
aplicada en producción como **20260916193755_word_game_scoring_v2**. Crea el RPC
autenticado `word_game_start`, registra `scoring_version` y fija el inicio de
la temporada. La migración posterior
`supabase/migrations/20260916202042_word_game_start_now_reset_history.sql`,
aplicada como **20260916202316_word_game_start_now_reset_history**, adelantó
el corte al **2026-09-16** y borró respuestas, partidas y puntuaciones
anteriores. Los retos comunes y el diccionario permanecen. El cliente nuevo
está pendiente de publicación; los clientes antiguos no podrán enviar
intentos sin iniciar el reto.

Sustitución de vocabulario: `supabase/migrations/20260916201158_replace_word_game_dictionary_es_es.sql`.
Generada por `scripts/generate-word-game-es-es.py` desde el paquete oficial
[`es_ES.oxt` de RLA-ES v2.9](https://github.com/sbosio/rla-es/releases/tag/v2.9),
SHA-256 `3eea87836b24b6004aa1ee6fd285b6c71774b0996aec70d096d75d5526efb4ac`.
Para regenerarla: descargar ese paquete, instalar temporalmente `spylls==0.1.7`
y pasar su ruta y la ruta de la migración al script. RLA-ES ofrece licencia
GPL-3.0+, LGPL-3.0+ o MPL-1.1+ a elección; se conserva la atribución y el
[aviso de licencia original](https://github.com/sbosio/rla-es/blob/master/LICENSE.md).
No cambia la puntuación ni las tablas. La selección diaria y la validación
siguen ocurriendo en el servidor. Aplicada en producción como
**20260916201909_replace_word_game_dictionary_es_es**: 31.889 ES activas,
37 ES antiguas deshabilitadas y recuentos intactos de 4 retos, 2 partidas
y 7 intentos. No requiere una build nueva del cliente.

Excepción posterior: `supabase/migrations/20260920163807_add_bonsai_to_word_game_dictionary.sql`
añade `BONSAI`, forma de seis letras normalizada de «bonsái» ausente en RLA-ES.
La inserción es idempotente y no modifica partidas, retos ni puntuaciones.

Podio: `20260912154950_word_ranking_podium.sql`, aplicada como
**20260912155231_word_ranking_podium**. Añade `avatarUrl` e `isPlus` a cada fila
de la RPC existente, sin exponer fecha de suscripción ni cambiar puntos.
Solo entrega identidad del perfil propio o descubrible; los demás conservan
nombre/foto nulos y Plus oculto. Plus se calcula con la vigencia actual.
PGlite verifica privacidad, Plus vencido y conservación de juegos/respuestas.

Migración local: `supabase/migrations/20260911184021_daily_word_game.sql`.
Aplicada en producción como **20260911184500_daily_word_game**.

Ampliación del diccionario: `supabase/migrations/20260912120048_expand_word_game_dictionary.sql`,
aplicada como **20260912120558_expand_word_game_dictionary**. Añade 271 palabras
ES y 225 CA; inserción idempotente sin cambiar palabras existentes ni sus flags.
Los retos ya generados y las partidas permanecen intactos. Las nuevas palabras
se aceptan inmediatamente y pueden ser soluciones de futuros retos, sin nueva build.

Unificación en castellano: `supabase/migrations/20260912153336_spanish_only_word_game.sql`,\naplicada como **20260912153657_spanish_only_word_game**. Los handlers fuerzan ES\nincluso si clientes antiguos solicitan CA; rechazan envíos a retos CA antiguos.\nLas restricciones impiden habilitar vocabulario CA o guardar partidas CA nuevas.\nNo había partidas CA al migrar; si las hubiera, la migración abortaría sin borrarlas.\nPartidas, respuestas y puntuaciones existentes verificadas intactas en remoto.\n\nEjemplos añadidos:

- Acciones: LAVAR, COCER, PELAR, CORTAR, BATIR, HERVIR, ALIÑAR, AMASAR.
- Cocina: PLATOS, NEVERA, OLLA, SARTEN, CUENCO, PINZAS, MANTEL, TAMIZ.
- Compra: OFERTA, SUPER, REBAJA, CUPON, AHORRO, CAJERO, TICKET, PAGAR.
- Comida y hostelería: BUFFET, BUFE, RECETA, POSTRE, MENU, BRASA, VEGANO.
- El antiguo banco catalán está deshabilitado desde la unificación.

Se mantienen las 4–6 letras: términos más largos como MEZCLAR u HORNEAR no
entran en este formato. La Ñ se conserva, no se convierte en N.

Las tablas se encuentran en el esquema **private** (seleccionarlo en el editor
de tablas de Supabase):

| Tabla | Contenido |
| --- | --- |
| `word_dictionary` | Banco ES activo y antiguo CA deshabilitado |
| `word_games` | Reto diario ES y solución secreta; registros CA antiguos inactivos |
| `word_plays` | Cuenta, partida, intentos, estado, puntuación y finalización |
| `word_guesses` | Cada respuesta, evaluación por letra y fecha de envío |
| `word_scoring_cutover` | Día de inicio de la nueva temporada |

El ranking se calcula sobre `word_plays` mediante índices, sin una tabla
duplicada que pueda quedar desactualizada.

API pública autenticada: `word_game_today`, `word_game_start`, `word_game_guess` y
`word_game_ranking`, todas `SECURITY INVOKER`. Delegan en funciones privadas
con identidad verificada y `search_path` vacío. El cliente no puede leer ni
escribir las tablas directamente. Las soluciones solo se devuelven cuando el
usuario ha ganado o agotado sus intentos. Borrar la cuenta elimina partidas y
respuestas mediante cascada.

Los envíos se serializan por cuenta y día, con unicidad transversal al idioma.
Cada envío incluye el número de intentos conocido: reenviar la misma palabra
al mismo número de intento devuelve el estado, sin duplicar ni puntuar otra
vez. Un estado obsoleto se recupera desde el servidor. Tras una respuesta de
red incierta no se permite cambiar de palabra hasta resolver el estado.

## Motor del cliente y recuperación

`src/lib/wordGameSession.ts` contiene la lógica independiente de la interfaz;
`useWordGame` conecta foco, segundo plano y almacenamiento a la pantalla glass.

- Las peticiones tienen un límite de 15 segundos y se validan antes de pintar
  el tablero o ranking. No se presupone que un timeout revierta una escritura.
- El envío pendiente se conserva antes de hacer la petición. Si se perdió la
  respuesta, se consulta el servidor: si ya se guardó, se muestra el resultado;
  si sigue incierto, «Confirmar intento» repite exactamente palabra y posición.
  También funciona después de reiniciar. Las teclas se bloquean hasta resolverlo.
- Doble toque, refresco y regreso durante un envío no generan otro intento.
  Las escrituras locales se ordenan entre instancias de pantalla; un refresco
  tardío no sobrescribe lo que el usuario está escribiendo al volver.
- Cuenta atrás basada en el intervalo comunicado por el servidor y reloj
  monotónico local. Al volver del segundo plano se vuelve a consultar el reto.
  A medianoche se bloquea el tablero caducado y se carga el siguiente, incluso
  si había un error. Sin red se reintenta cada 30 s mientras esté visible.
- Vibración leve al aceptar una palabra; feedback de éxito/derrota al terminar.
  Errores de carga también visibles fuera del teclado y en partidas terminadas.

Requiere conexión para comprobar palabras. No se almacena la solución en el
cliente antes de terminar ni se calculan puntos localmente.

RLS activada sin políticas permisivas en las cinco tablas privadas: cierre
intencionado. El asesor informa `rls_enabled_no_policy` (informativo), sin
advertencias nuevas de funciones públicas privilegiadas. Referencia:
https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy

## Mantener el vocabulario

El banco se puede ampliar desde SQL con permisos de administración:

```sql
insert into private.word_dictionary(language, word)
values ('es', 'COCO')
on conflict do nothing;
```

Usar palabras reales de compra, en mayúsculas normalizadas y de 4 a 6 letras.
No editar la solución ni deshabilitar una palabra que ya sea el reto del día.
Las palabras futuras no están prepublicadas en el cliente ni en un calendario
calculable a partir de la fecha. El banco inicial debería ampliarse según las
palabras que echen en falta los primeros jugadores.

## Verificación

- Nueva puntuación (2026-09-16): typecheck, ESLint focalizado, 25 pruebas del
  motor y PGlite con migración real correctos. Casos: 19/20 segundos, longitudes
  4/5/6, domingo ×2, mínimo por acierto, inicio explícito/idempotente,
  reenvío sin recálculo y reinicio de historial. Producción verificada en
  lectura: RPC y permisos presentes, corte 2026-09-16, 0 partidas, 0 intentos,
  0 puntos, 4 retos y 31.889 palabras ES activas. Cliente no publicado.

- TypeScript y ESLint focalizado correctos.
- 20 pruebas del motor real: borrador/reinicio, cuentas separadas, escritura
  tardía, victoria/derrota, inválidas/repetidas, doble toque, pérdida de respuesta,
  conflicto entre dispositivos, caducidad sin red y validación de payloads.
- `scripts/test-word-game-sql-local.mjs`: ejecuta la migración real en PGlite
  con cuentas ficticias. Cubre letras repetidas, reenvíos, victoria/derrota,
  límites, reanudación, permisos, privacidad, periodos,
  empates, cambios de hora y borrado en cascada.
  Incluye además el motor cliente real contra los RPC PostgreSQL para ganar,
  perder y recuperar una respuesta perdida, y valida sus cuatro rankings.
  Aplica también la ampliación dos veces, comprueba que no altera retos/partidas
  ni reabre palabras deshabilitadas y juega los ejemplos nuevos mediante RPC.\n  Después aplica la unificación, conserva los datos previos, bloquea retos CA\n  antiguos y verifica reto/rankings idénticos con solicitudes ES/CA.\n  Nuevo popup pendiente de comprobación visual en dispositivo.
- Prueba transaccional en producción bajo el rol `authenticated`: solución
  oculta, victoria, puntuación, reenvío, idioma, cuatro rankings y denegación de
  escritura directa. Todas las escrituras de esa prueba se revirtieron.
- iPhone 15 Pro / iOS 26.5: acceso animado, pantalla, teclado, entrada/borrado,
  rechazo de palabra inválida con cero intentos y ranking vacío. Sin completar
  la partida real del usuario ni añadir puntuaciones de prueba.
  Última revisión: el borrador se mantiene al salir a Inicio y reabrir el juego.
- Suite general: 736/737. Único fallo preexistente en
  `lidl-release-prompt.test.mjs`, por ausencia de `android/app/build.gradle`
  generado. No se reconstruyó Android para alterar ese estado previo.

Para repetir las pruebas SQL, pasar al script la ruta absoluta a
`@electric-sql/pglite/dist/index.js` de una instalación temporal. No utiliza
credenciales ni red. No se ha publicado una nueva build iOS/Android.
## Enlace del resultado compartido (2026-09-25)

El mensaje compartido no incluye ya el indicador de idioma `ES/CA`; muestra la
fecha, puntuación, cuadrícula sin letras y enlace.

El resultado usa `https://quefalta.es/inicio?v=3`. La app reconoce esa ruta y abre
la pantalla principal de Inicio, no Palabra de hoy. El destino se conserva en
arranque en frío hasta que sesión, perfil y onboarding permitan montar la
navegación. Las invitaciones `/join/<id>` mantienen su comportamiento.

La web quedó subida y desplegada en `QueFalta-Web` commit `d11fc12`: sirve
`/inicio/` y un AASA con `/join/*`, `/inicio` y `/inicio/*`. Falta aplicar en
Amplify el rewrite 200 del endpoint AASA sin extensión a la copia `.json`; el
endpoint exigido por Apple aún responde 301 con barra final. Android ya declara
ambas rutas.

La preview social usa una tarjeta compacta: icono 180×180 a la izquierda y los
textos «Palabra de hoy · QuéFalta» / «Un pequeño reto. Una nueva palabra cada
día.» a la derecha. La versión `v=3` fuerza a renovar la preview anterior.
