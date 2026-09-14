# Palabra de hoy

Primera versión implementada el 11/09/2026. Cliente local, pendiente de una
nueva publicación de la app; backend ya desplegado en QuéFalta.

## Experiencia

- No se otorgan premios: retirados el botón regalo y su popup a petición del
  usuario. Se conserva el popup opaco de ayuda y la clasificación sin recompensas.
- Ranking con destacados 2–1–3: tarjetas redondeadas con degradados suaves
  oro/plata/bronce, primer puesto elevado y sombra sutil. Sustituyen los cilindros
  iniciales. Retratos enmarcados con medalla de posición, puntuación destacada,
  @ encima de la foto e insignia dorada de Plus. Foto ausente/fallida
  usa avatar neutro. Con menos de tres participantes quedan posiciones vacías;
  los empates conservan puesto, altura y metal reales. El resto continúa en lista.
  Localizado ES/CA y compatible con tema claro/oscuro. Pendiente revisión visual.
- Inicio sustituye «¡Prepara la compra!» por un botón con degradado y brillo
  en movimiento. La animación se detiene al salir de Inicio, pasar a segundo
  plano o activar Reducir movimiento.
- Abre `DailyWord` dentro de Inicio, a pantalla completa y con Volver. La barra
  general de pestañas se oculta solo en este destino y vuelve al salir.
- Desde el 12/09 se retira solo el bloque de fecha/letras/idioma. Se mantienen
  el selector Jugar/Ranking, el ranking por cuatro periodos y la posición propia.
- Tablero de seis filas, palabra de
  **4, 5 o 6 letras**, teclado propio fijo, leyenda, ayuda, cuenta atrás,
  recuperación tras errores y resultados compartibles sin solución.
- Al enviar una palabra válida, cada letra revela su color con un giro sobre el
  eje vertical, de izquierda a derecha. Giro de 420 ms, con 180 ms entre comienzos;
  el intento completo tarda 960–1320 ms según su longitud. El teclado muestra las
  pistas progresivamente y el resultado final espera a la última casilla.
  Se bloquea la entrada durante el revelado. Solo se anima el intento recién
  enviado: el historial y Reducir movimiento se presentan directamente.
- Estilos por fábrica y `useThemedStyles`: tema claro/oscuro/acento. Interfaz
  ES/CA; palabras y teclado solo en castellano, con Ñ y sin Ç. Las etiquetas de accesibilidad complementan los
  colores de evaluación; las casillas no muestran símbolos adicionales.
- Diseño Liquid Glass: cabecera superpuesta con selector Jugar/Ranking,
  selector de periodos de cristal y teclado flotante sobre una sola
  `GlassSurface`. El scroll reserva las alturas medidas y pasa bajo
  ambas barras; fondo ambiental de la app. El tablero y los resultados
  conservan superficies legibles. Sin cristales anidados ni un efecto nativo
  por tecla. Android/iOS sin cristal conservan la presentación opaca.

## Reglas

Una partida por cuenta y fecha de **Europe/Madrid**, también al cambiar de
dispositivo o idioma. El día va de medianoche a medianoche, con el cambio
horario real de España; no es un intervalo móvil de 24 horas.

Al entrar con la interfaz en catalán, un aviso en catalán explica que las palabras\ny el teclado son en castellano para compartir reto y clasificación. El juego no\nse activa hasta pulsar «Entesos». Se muestra una vez por visita a la pantalla.\n\nLa primera consulta del día crea el reto común en castellano mediante una
selección aleatoria en el servidor, excluyendo soluciones de los últimos 30
días. No hace falta cron. Consultar no consume la partida. El primer intento
válido inicia la partida; las siguientes visitas recuperan la misma partida.\nLa preferencia de idioma de la app no cambia el reto, el borrador ni el ranking.

Se admiten palabras de comida, cocina y compra, no cualquier palabra de lengua
general. Banco activo: **439 palabras en castellano**. Las 386 entradas catalanas\nse conservan deshabilitadas, sin poder jugarse.
Incluye acciones de cocina, utensilios, equipamiento, términos comerciales,
hostelería y alimentos. Las palabras se convierten a
mayúsculas y se quitan los acentos; la Ñ se conserva. Las entradas inválidas
y palabras ya probadas no consumen intentos. Las letras repetidas se evalúan
asignando primero coincidencias exactas y después las restantes disponibles.

Seis intentos. Puntos al acertar: **1000, 850, 700, 550, 400, 250**.
Derrota: cero. El tiempo no afecta a la puntuación. No hay ventajas Plus.
Los intentos se guardan en el servidor. El borrador todavía sin enviar se
conserva en el dispositivo por cuenta (clave española anterior), vinculado al reto y al número
de intento. Se recupera al salir/volver o reiniciar; se descarta si cambió el
reto, avanzó la partida en otro dispositivo o está corrupto.

Clasificación común para todos: diario, semana natural desde el lunes, mes natural
e histórico acumulado. Los empates de puntos comparten puesto. Se muestran
los primeros 50 usuarios y la posición propia aunque quede fuera. Solo aparece
el nombre de usuario público; los perfiles no descubribles salen como Jugador
ante terceros. No se devuelven ids, correos, nombres reales ni respuestas ajenas.

## Base de datos

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

El ranking se calcula sobre `word_plays` mediante índices, sin una tabla
duplicada que pueda quedar desactualizada.

API pública autenticada: `word_game_today`, `word_game_guess` y
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

RLS activada sin políticas permisivas en las cuatro tablas privadas: cierre
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
