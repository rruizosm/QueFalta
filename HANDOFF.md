# HANDOFF.md — Estado en vuelo (traspaso a Codex)

## Logotipo local de Ahorramás (local, 2026-08-23)

- `CATALOG_STORES` enlaza ya `assets/stores/ahorramas.jpg`; desaparece el
  fallback genérico en todos los consumidores de los metadatos compartidos.
- Las rejillas temporales de tres y cuatro columnas usadas para las capturas
  fueron restauradas a las dos columnas actuales; no queda ningún cambio de
  layout en el cliente.

## Motor de búsqueda del catálogo (local + backend, 2026-08-23)

- Sustituida la búsqueda directa `ILIKE + limit(50)` de los 18 supermercados
  por RPC con FTS por prefijo, fallback trigram para erratas, ranking estable y
  paginación. Mantiene idioma, región, CP/centro, RLS y los adaptadores actuales.
- Catálogo usa relevancia por defecto durante la búsqueda y conserva precio y
  precio unitario como órdenes alternativos. El orden se aplica en el servidor
  antes de `limit`/`offset`, por lo que las tiendas individuales cargan páginas
  estables; «Todos» mezcla las cadenas habilitadas con el mismo criterio.
- Se corrigió el hueco previo de Froiz: existía el texto de búsqueda, pero no
  había efecto ni render de resultados. Froiz no muestra Categorías porque su
  espejo actual carece de árbol.
- El mismo motor queda conectado a Novedades y Ofertas cuando se escribe una
  búsqueda. Novedades deja de buscar solo en las páginas ya descargadas y
  Ofertas sustituye el filtro de palabras sin ranking; ambos aplican categoría,
  rango y orden antes de paginar y mantienen sus reglas de feed.
- `20260823101900_catalog_search_engine_v1.sql`,
  `20260823103646_catalog_search_language_index_planner.sql` y
  `20260823104120_catalog_search_server_sort_orders.sql` están desplegadas como
  `20260823103505`/`20260823103803`/`20260823104828`. Probadas las 18 RPC con rol
  `anon` y la ruta REST pública (HTTP 200), incluido orden por precio y páginas
  sin solape. Rendimiento caliente medido: 26–69 ms en Mercadona, Carrefour y
  Alcampo; suite completa, TypeScript y lint correctos.
- Backend listo antes del cliente, por lo que una build/OTA posterior no tendrá
  una ventana en la que falten las RPC.
- `20260823110039_catalog_feed_search_engine.sql` está desplegada como
  `20260823110849`: 18 RPC `SECURITY INVOKER`, acceso `anon` verificado,
  búsqueda con errata y paginación sin solape. Carrefour: ~51 ms/50 ofertas.

## Cupos gratuitos de alertas y comparador (local + backend, 2026-08-23)

- Las cuentas gratuitas pueden gestionar una alerta personalizada; Perfil ya
  no bloquea la pantalla y «Avísame» permite crearla o editarla. Al ocupar el
  hueco, intentar crear otra abre Plus. Las cuentas Plus siguen ilimitadas.
- «Buscar productos más económicos» permite tres ejecuciones gratuitas por
  cuenta. La cuarta abre el paywall; después de cada búsqueda se muestra el
  cupo restante. Plus sigue ilimitado.
- La cuota no usa AsyncStorage: `private.free_tier_usage` persiste el contador y
  `catalog_cheaper_products_v6` reserva uso+consulta de forma atómica. El
  procesador de alertas entrega la única regla free y pausa reglas sobrantes de
  una suscripción caducada.
- Los dos cupos están desacoplados del encendido comercial: se aplican ya con
  `paywall_enabled() = false`; los demás gates de servidor siguen apagados.
- `20260823063529_free_tier_alert_and_comparator_allowances.sql` y la policy
  defensiva `20260823065123_restrict_free_tier_usage_direct_access.sql` y
  `20260823065448_enforce_free_allowances_before_paywall_launch.sql` están
  desplegadas como versiones remotas `20260823064939`, `20260823065153` y
  `20260823065550`.
  Verificación transaccional real: usos restantes 2→1→0, 4º bloqueado y segunda
  alerta free rechazada; advisors sin avisos relacionados.

## Precio unitario de Eroski y Caprabo recuperado (local, 2026-08-22)

- Verificado en ambas webs que las tarjetas publican `1 KILO A ...`, `1 LITRO
  A ...` y `1 UNIDAD A ...`; el parser compartido ignoraba el bloque
  `quantity-text`/`quantity-price` y escribía siempre null.
- El sync normaliza ya esos valores a kg/L/ud, conserva null cuando la web omite
  la etiqueta y el cliente vuelve a seleccionarlos y mostrarlos. Las columnas
  ya existen: no hay migración; falta relanzar los syncs de Eroski y Caprabo
  para rellenar producción.
- DRY_RUN real de 3 hojas: Eroski 14/42 y Caprabo 10/31 productos con precio
  unitario, ambos con 0 hojas sin tiles. Suite 41/41, lint y typecheck correctos.

## Apertura estable de las fichas nutricionales (local, 2026-08-22)

- Corregido el salto por el que el comparador aparecía primero y bajaba al
  insertarse después el Índice alimentario. Un bloque compartido espera la
  resolución nutricional y revela índice+comparador en la misma actualización,
  con loader compacto, fundido y soporte para Reducir movimiento.
- El hook nutricional diferencia consulta pendiente y resuelta y evita exponer
  datos de la identidad anterior. Afecta a las nueve cadenas con índice y no
  modifica el comparador bajo demanda ni las fichas sin fuente nutricional.
- Añadidas dos pruebas de regresión; 39/39 tests y lint de los archivos tocados
  correctos. El chequeo global queda bloqueado por trabajo local concurrente en
  `ListScreen` y `GeneralStatisticsScreen`, ajeno a esta corrección.

## Plegado progresivo de categorías del carrito (local, 2026-08-22)

- `ListScreen` mantiene montadas las tarjetas de una zona al plegarla y anima
  su altura real con recorte: cierra de abajo hacia arriba y abre en el orden
  inverso, sin el salto instantáneo anterior.
- La ventana escalonada está acotada para que las categorías grandes no hagan
  lenta la interacción. Se conservan el doble toque por supermercado, la
  respuesta háptica, Reducir movimiento y la ocultación accesible.
- El plegado de la cabecera de supermercado incorpora también una transición
  suave de layout. Cambio solo de cliente, sin migración SQL.

## Precio unitario de HiperDino recuperado (local, 2026-08-22)

- La API GraphQL sí publica el precio de referencia en `price_text`; el sync
  anterior no solicitaba ese campo y escribía siempre `price_per_unit = null`.
- `scripts/sync-hiperdino.mjs` usa ahora `sap_final_price`/`sap_price` para el
  precio final y tachado, evitando el fallo actual de un resolver `price_range`,
  y normaliza kilo, litro, 100 g/ml, unidad y docena a l/kg/ud.
- Lavado, dosis y metro permanecen solo en `raw` para no mezclarlos con €/ud.
  DRY_RUN completo: 14.775 productos, 127 categorías, 0 sin precio y 11.357 con
  precio unitario canónico. Pruebas específicas del parser correctas.
- No requiere migración: las columnas y el cliente ya estaban preparados.
  Pendiente desplegar el sync y relanzarlo para rellenar producción.

## Estadísticas generales de la comunidad (local + backend, 2026-08-22)

- «Estadísticas generales» queda disponible también sin compras personales y
  abre `GeneralStatisticsScreen`, con refresco, errores recuperables, acceso
  Plus y versiones castellana/catalana.
- La pantalla ordena supermercados elegidos en preferencias, top 10 de
  productos de catálogo añadidos y top 10 de supermercados por unidades. Usa
  logos, miniaturas, barras proporcionales y etiquetas completas de accesibilidad.
- La implementación privada une `list_items` y `purchase_items`, excluye textos
  manuales y solo expone agregados. El RPC `public` es `SECURITY INVOKER`, exige
  sesión y Plus y revoca `anon`; no devuelve ids de usuarios, grupos, listas o
  compras. La lectura privilegiada vive en el esquema no expuesto `private`.
- `20260822165410_general_statistics.sql` y
  `20260822171122_general_statistics_private_boundary.sql` están desplegadas en
  producción como `20260822171009` y `20260822171221`. Verificación real: 17
  preferencias, 10 productos y 10 supermercados; sin avisos nuevos en advisors.

## Resultados del comparador rediseñados (local, 2026-08-22)

- «Buscar productos más económicos» muestra ahora una cabecera de resultados,
  un resumen del veredicto y tarjetas agrupadas únicamente para tiendas con
  coincidencias. Las filas priorizan miniatura, nombre y precios y marcan en
  verde las alternativas cuyo `isCheaper` es verdadero.
- Si hay alternativas fiables pero ninguna mejora el precio, aparece el aviso
  «Tu opción actual es la más económica». El vacío sin matches conserva su
  mensaje separado. Textos y accesibilidad están cubiertos en español y catalán.
- Cambio solo de cliente en `SimilarProductsSection`; no requiere migración SQL.
- `npm run quality` correcto: TypeScript, ESLint y 33/33 pruebas.

## Identidad centrada en Perfil (local, 2026-08-22)

- Retirado el botón promocional QuéFalta Plus de la tarjeta de identidad; la
  entrada de Cuenta añadida para compra/gestión es ahora el único acceso.
- El `@usuario` y su insignia vuelven a quedar a la derecha del avatar en el eje
  X, alineados a la izquierda, y centrados verticalmente en el eje Y.

## Gestión de suscripción en Perfil (local, 2026-08-22)

- La sección Cuenta incorpora QuéFalta Plus para free y premium: abre el
  paywall en free y la gestión oficial de App Store/Google Play en suscriptores.
- Lee `CustomerInfo` de RevenueCat para mostrar mensual, anual, prueba o fecha
  final. Si Supabase concede Plus sin entitlement (testers), muestra «De
  cortesía» sin enlazar a una cancelación inexistente.
- No hay cambios de esquema. Pendiente validar el destino real en las pruebas
  sandbox de iOS y Android ya previstas para Fase 3.

## Acceso heredado a «Todos» (local, migración pendiente, 2026-08-22)

- Catálogo y el selector compartido de Novedades, Ofertas y Cambios de precio
  mantienen «Todos» habilitado para cuentas anteriores a QuéFalta 1.3.
- La excepción usa `profiles.legacy_all_stores_access`; solo afecta a este gate,
  no a los demás beneficios Plus, y un trigger impide cambiarla desde el cliente.
- Pendiente desplegar `20260822090421_legacy_all_stores_access.sql` justo antes
  de publicar 1.3. El despliegue fotografía las cuentas existentes como legacy;
  las creadas después reciben `false` por defecto. Aplicarla con demasiada
  antelación dejaría fuera a altas realizadas todavía desde 1.2.1.

## Icono personalizado por grupo (local + backend, 2026-08-22)

- El detalle de grupo incorpora una tarjeta propia, separada por completo de
  gestionar miembros, desde la que el administrador elige un emoji.
- El selector reúne y deduplica todos los iconos de categoría y subcategoría ya
  usados por los catálogos. El icono elegido se refleja en Inicio, la cabecera
  de Carrito, la barra flotante de selección y todas las fichas de producto.
- `CartContext` conserva `groupIcon` en la clave por usuario, migra snapshots
  antiguos sin ese campo y actualiza nombre/icono al revalidar la pertenencia.
- `20260822071818_add_group_icon.sql` está desplegada en producción como versión
  remota `20260822073002`. Verificados columna, constraint, RLS y policy UPDATE
  del administrador. Typecheck, lint y 30/30 pruebas pasan.

## Barra de selección de productos actualizada (local, 2026-08-22)

- La barra que aparece al elegir cantidades en `StoreProductList` adopta una
  tarjeta flotante redondeada con superficie glass/fallback temado, icono de
  cesta y botón «Añadir» en cápsula. Sustituye la antigua franja oscura de ancho
  completo sin modificar la lógica de alta, el grupo de destino ni el offset de
  la navegación inferior.

## Suscripciones creadas en Apple y RevenueCat (2026-08-22)

- App Store Connect: grupo «QuéFalta Plus», nivel 1, España y localizaciones
  castellano/catalán. Productos definitivos:
  `com.quefalta.app.plus.monthly` (Apple ID `6804053263`, 3,99 €/mes) y
  `com.quefalta.app.plus.annual` (Apple ID `6804054501`, 19,99 €/año, prueba
  gratuita de una semana). No se enviaron a revisión ni se activó el paywall.
- Google Play: suscripción `quefalta_plus` creada con ficha ES/CA. Los planes
  definitivos siguen siendo `monthly` y `annual`, pero Play rechaza guardarlos
  porque la app aún no tiene ninguna build publicada en un canal (prueba interna
  figura inactiva, 0/3). Subir primero una build Android con RevenueCat/Google
  Play Billing; después crear los planes y la prueba anual de 7 días.
- RevenueCat: apps Apple y Google (`com.quefalta.app`), entitlement `plus`,
  offering `default` y paquetes `$rc_monthly`/`$rc_annual` configurados. Cada
  paquete ya enlaza Test Store, Apple y el producto Google futuro
  (`quefalta_plus:monthly` o `quefalta_plus:annual`). Pendientes: credencial de
  cuenta de servicio Google, clave App Store Connect para importación automática,
  API keys públicas en entorno/EAS, webhook y pruebas sandbox.

## Precio de QuéFalta Plus confirmado (2026-08-21)

- Mensual: **3,99 €**, sin periodo de prueba.
- Anual: **19,99 €**, con **7 días gratis** para usuarios elegibles.
- El resto de decisiones de producto y configuración propuestas para RevenueCat,
  Apple y Google quedan confirmadas.

## Consulta visible al desplazar el Catálogo (local, 2026-08-21)

- Tras escribir una búsqueda de Productos y empezar a desplazar sus resultados,
  el buscador se contrae y la cabecera se amplía con el texto introducido en
  cursiva, situado debajo del botón circular de la lupa.
- Reabrir el buscador, cambiar de supermercado o entrar en Categorías retira el
  resumen; altura, desplazamiento y opacidad usan una curva progresiva más lenta
  salvo con Reducir movimiento, donde el cambio sigue siendo inmediato.

## Orden unitario de Novedades, Ofertas y Cambios de precio abre Plus (local, 2026-08-21)

- En `ProductFilterSheet`, solo los botones de «Ordenar por precio unitario»
  de Novedades, Ofertas y Cambios de precio requieren Plus y abren el paywall
  sin aplicar el orden.
- «Ordenar por precio» del envase permanece disponible para cuentas gratuitas.
- Si Plus caduca con un orden unitario activo, la selección se limpia.
- Ofertas vuelve a mostrar formato/cantidad y precio unitario en la línea
  secundaria, manteniendo al final el precio anterior cuando está disponible.
- Cambios de precio mantiene anterior/actual/porcentaje y vuelve a mostrar
  debajo el formato/cantidad y el precio unitario.

## Producto alternativo de comentarios pasa a Plus (local, 2026-08-21)

- Los comentarios de la cesta siguen abiertos a todas las cuentas, pero
  «Asignar producto» y «Cambiar» requieren Plus.
- El gate vive en `ProductNoteSheet`: abre el paywall antes de iniciar una
  búsqueda y vuelve a validarse al elegir y guardar. Las alternativas existentes
  se pueden ver, conservar o quitar aun sin suscripción.
- El beneficio se añadió al paywall en castellano y catalán. Sin cambios de BD.

## Historial de compra abierto (local, 2026-08-21)

- «Historial de compra» deja de pertenecer a QuéFalta Plus: Perfil navega
  directamente, sin candado ni popup.
- `HistoryScreen` carga para todas las cuentas y permite repetir cualquier
  compra, sin límite de antigüedad. Eliminados el gate, el CTA bloqueado, los
  textos Plus y la antigua constante del límite de tres compras.
- El beneficio «Historial de compra» se retiró del paywall.

## Dorado Plus en «Mejor precio» (local, actualizado 2026-08-22)

- Retirado el acceso QuéFalta Plus de la tarjeta de identidad. El fondo/tinta
  dorados de `PremiumGoldBackground` quedan solo en «Mejor precio» del plan
  anual; el sello propio de la cabecera conserva su variante dorada.
- Filas bloqueadas, Apariencia, alertas, comparador, orden unitario, selector
  «Todos» y el resto del paywall usan ahora el acento normal, sin alterar gates,
  candados ni navegación al paywall.
- Las insignias públicas y las del paywall usan el acento. La celebración de
  bienvenida mantiene movimiento y composición, y recupera la paleta y el
  resplandor dorados después de una compra confirmada.
- `PremiumGoldBackground` queda usado únicamente por la etiqueta anual de
  `PaywallModal`.

## Doble toque en categorías del carrito (local, 2026-08-21)

- El toque simple sigue plegando o desplegando solo la categoría pulsada.
- Un segundo toque sobre la misma categoría dentro de 300 ms extiende la
  dirección del primero a todas las categorías de ese supermercado, sin retrasar
  la respuesta del toque simple ni modificar otras tiendas.

> **Snapshot: 2026-07-15.** Este documento consolida el estado NO obvio del repo: qué está
> commiteado vs. solo en local, qué supers están implementados pero sin migrar, y las features
> transversales a medias. Todo esto vivía en la memoria de Claude Code (que Codex no ve) y **no
> está completo en git**. La lista canónica y anotada de migraciones SQL está en
> [CONTEXTO.md](CONTEXTO.md) §"Migraciones SQL pendientes"; aquí va lo que ESE documento no dice:
> el estado de commit y el trabajo transversal.

## Burbujas ambientales en Carrito (local, 2026-08-21)

- Carrito comparte ahora con Inicio las 21 burbujas radiales y los lavados
  ligados al acento elegido en Apariencia, también en estados vacíos, pero no
  su degradado superior: conserva el fondo plano de papel.
- La implementación se extrajo a `AmbientBubbleBackdrop`: un único SVG
  memoizado, decorativo, sin gestos ni exposición a accesibilidad.
- La cabecera de Inicio aprovecha el espacio a la izquierda de campana y avatar
  para mostrar «¡Prepara la compra!» (localizado también al catalán). No se
  muestra en Carrito.
>
> ⚠️ Fechas y detalles reflejan lo que era cierto el 2026-07-15. **Verifica contra `git log` y
> contra Supabase antes de fiarte** — algo puede haberse commiteado/ejecutado después.

## Comentarios y producto alternativo en el carrito (local + backend, 2026-08-21)

- El carrito añade a cada producto una extensión inferior unida a su tarjeta y
  separada con puntos. El texto vacío es «Añade comentarios sobre el producto»
  y abre un editor multilínea; una nota existente se muestra directamente.
- Desde el mismo editor se puede elegir entre los supermercados activos y
  buscar dentro de uno para asignar, sustituir o quitar un producto alternativo.
  El buscador respeta CCAA, CP y preferencias del perfil. La extensión muestra
  nombre, supermercado y miniatura del vínculo.
- Con varias tiendas disponibles, la hoja obliga primero a seleccionar una
  mediante su logotipo y nombre; el buscador permanece inactivo hasta hacerlo.
  Una única tienda se preselecciona sin mostrar este paso y cambiar de opción
  descarta la búsqueda anterior para no mezclar productos.
- Comentarios compartidos y optimistas: actualizar un producto fusionado cambia
  todas sus filas y revierte si falla. Se archivan/restauran con el historial y
  se muestran también en el detalle del grupo; el producto asociado sigue el
  mismo ciclo de persistencia.
- Restar y eliminar miden 28 pt, como Asignar, y tienen más separación vertical.
- `20260821175658_list_item_notes.sql` está desplegada y verificada en producción:
  `note` nullable en `list_items` y `purchase_items`, máximo 280 caracteres y
  privilegios/RLS existentes sin cambios.
- `20260821181503_list_item_note_product.sql` está desplegada como versión remota
  `20260821182635`: cinco campos de referencia/snapshot en ambas tablas,
  constraints validados, RLS activo, privilegios correctos y seis policies sin
  cambios. `npm run quality` pasa con 30/30 pruebas.

## Grupos ilimitados para todas las cuentas (local + migración, 2026-08-21)

- «Nuevo» ya no consulta Plus ni el número de grupos: siempre abre
  `NameInputSheet`. Retirados del cliente el paywall y `free_group_limit`.
- `20260821175745_allow_unlimited_group_creation.sql` elimina el trigger
  `groups_enforce_limit` y su función. `paywall_gates.sql` ya no los recrea.
- La creación y la pertenencia a grupos quedan ilimitadas; los demás gates Plus
  no cambian.

## Popup redondeado de grupos (local, 2026-08-21)

- `NameInputSheet`, compartido por crear y renombrar grupos, redondea la hoja,
  el icono, el cierre, el campo y el CTA de confirmación.
- Retirado el borde duro de `HardShadow` del CTA; no cambia la lógica del
  formulario, su bloqueo durante la petición ni el comportamiento del teclado.

## Pie redondeado en las fichas de producto (local, 2026-08-21)

- El selector horizontal de cantidad y «Añadir a la cesta» pasan a usar
  geometría de cápsula en las fichas de todos los supermercados.
- Es un cambio exclusivamente visual; conserva acciones, tamaños táctiles,
  estados desactivados y color de acento.

## Botón circular al crear el primer grupo (local, 2026-08-21)

- El estado vacío de Grupos sustituye el CTA rectangular con borde duro por
  una acción circular de acento con el icono de suma y «Crear grupo» debajo.
- Se mantiene un solo objetivo táctil accesible y no cambia la creación ni la
  activación automática del primer carrito.

## Cabeceras de Catálogo, Carrito y Grupos (local, 2026-08-21)

- «Mi Lista» y «Grupos» quedaron alineados con los 20 pt de «Catálogo»,
  incluidos sus iconos y contenedores circulares reducidos proporcionalmente.
- Catálogo reutiliza ese mismo bloque visual con un icono exclusivo de biblioteca a la
  izquierda y conserva el selector de supermercado dentro de la fila, a la derecha.
- La pestaña inferior de Catálogo usa la misma familia library en las barras
  clásica y Liquid Glass.

## Controles de categorías y subcategorías (local, 2026-08-21)

- El selector Productos/Categorías de Catálogo usa la nueva variante reforzada
  de `SlidingSegments`: 44 px, borde sensible al tema, reflejo interior, sombra
  exterior y selección de acento más visible. Orden y lista/cuadrícula aplican el
  mismo tratamiento dentro de Catálogo sin cambiar su altura original de 40 px;
  el bloque unitario bloqueado replica esa geometría. No se anida otra superficie
  de cristal ni se alteran los controles compactos de las demás cabeceras.
- Redondeado el botón Atrás de la pantalla de categoría y de los listados de
  productos de todos los supermercados que usan las cabeceras de catálogo.
- El buscador compartido tiene ahora radio 16, espaciado y sombra acordes al
  Catálogo actual. El selector lista/cuadrícula usa una pastilla más redondeada
  y resalta el modo activo con el color de acento; en Liquid Glass reutiliza
  `SlidingSegments` y su misma transición de Catálogo → Productos. El icono de
  cuadrícula se compensa 1 pt a la derecha para centrarlo ópticamente en ambos.
- Typecheck, lint y 30/30 pruebas correctos.

## Transición onboarding → Inicio e Inicio estable (local, 2026-08-21)

- Eliminada por completo la tarjeta «Completa tu perfil» y su código/traducciones.
- El CTA final marca la entrada desde onboarding e Inicio mantiene una cubierta
  de continuidad hasta que su layout y datos principales están estables; funde
  en 260 ms, limita la espera a 900 ms y respeta Reducir movimiento.
- La cabecera reserva su altura desde el primer frame. Favoritos, grupos y última
  compra distinguen carga de vacío; grupos muestra reintento ante error.
- Corregido el control táctil anidado de última compra y consolidado el fondo de
  21 burbujas en un único SVG memoizado que usa el acento elegido en Apariencia.
- Perfil parte también de la altura conocida de su cabecera Liquid Glass y
  descarta mediciones iguales, evitando el salto de todo el bloque al entrar.
- Validado con `npm run quality` (30/30 pruebas) y compilación Debug completa
  del scheme `QuFalta` en Xcode (`BUILD SUCCEEDED`).
- Para ejecutar en simulador se reinstaló un build firmado con «Sign to Run
  Locally». No usar `CODE_SIGNING_ALLOWED=NO` en pruebas de autenticación: el
  binario abre, pero SecureStore no puede leer/escribir el llavero y Google PKCE
  termina mostrando el error genérico de inicio de sesión.

## Refuerzo integral del onboarding (local + backend, 2026-08-21)

- Corregidos los diez hallazgos de la auditoría: gate recuperable, carrera de
  @usuario, grupo transaccional/idempotente, validación final en servidor,
  reanudación, accesibilidad/texto grande, error de fototeca, CTA sin duplicados,
  pantalla Done y fondo SVG compartido.
- Añadidas pruebas unitarias de progreso y validación de @usuario.
- `20260821130300_onboarding_integrity.sql` está aplicada en producción. Se
  verificaron columnas, índice, permisos de RPC y 0 desajustes de progreso.
- Validado con `npm run quality` (30/30 pruebas), export iOS de producción y
  compilación Debug en Xcode (`BUILD SUCCEEDED`). Queda únicamente un recorrido
  visual extremo a extremo cuando haya una cuenta de pruebas cuyo
  `onboarded_at` sea NULL.

## Desplegable de correo integrado en Login (local, 2026-08-21)

- Añadido el isotipo oficial de QuéFalta sobre el título del formulario,
  reutilizando `assets/quefalta-logo-blue.png`; todo el bloque principal queda
  situado 20 px por encima del centrado base.
- El papel de fondo muestra quince burbujas azules radiales de distintos
  tamaños, estáticas, no interactivas y ocultas para accesibilidad.
- Actualizados título y subtítulo para presentar la compra organizada y las
  funciones de comparación, ofertas, novedades y cambios de precio, también en
  catalán.
- El formulario de acceso por correo se despliega como continuación directa del
  botón que lo abre, compartiendo fondo, borde y radios exteriores.
- Altura y opacidad se animan al abrir y cerrar; Reducir movimiento mantiene el
  cambio inmediato. El panel oculto no recibe toques ni se anuncia por
  accesibilidad.
- El scroll conserva su offset al abrir: texto y botones superiores permanecen
  inmóviles y todo el crecimiento visible sucede bajo el botón de correo. Solo
  se revela la parte inferior al enfocar el campo y aparecer el teclado.
- Retirado del panel el texto «Sin contraseña…»; el campo de correo es ahora
  su primer elemento.

## Cierre de auditoría de arranque y Login (local, 2026-08-21)

- Eliminada la pantalla vacía potencial entre splash y fuentes con una vista de
  continuidad en `App`; `ThemeContext` y `LanguageContext` montan con valores
  seguros y exponen `ready`, incluidos en el `BootLoader` y su watchdog.
- `authStorage` captura lecturas fallidas del llavero y las interpreta como
  sesión vacía/legacy, por lo que Supabase deja de repetir `ERR_KEY_CHAIN` en su
  auto-refresh. Las escrituras nuevas siguen exigiendo SecureStore.
- Loader inicial mínimo 350 ms. Login validado en simulador con texto normal y
  `accessibility-large`; escalas acotadas, legal desplazable y panel de correo
  unido que abre hacia abajo sin mover cabecera, Apple ni Google.
- Google usa la G oficial multicolor; Apple reserva su espacio desde el primer
  frame de iOS. Las 15 burbujas se dibujan con un solo SVG.
- `inlineRequires` activado en `metro.config.js`; imágenes de mascota y Froiz
  ajustadas a resolución de uso. Export iOS: 1.868→1.828 módulos y
  15.236→11.532 KiB totales; Hermes 7.460.130→7.597.028 bytes.
- Metadatos Xcode alineados en 1.3.0 (34) y referencia huérfana a
  `QuFaltaTests` retirada del scheme compartido. Sin migraciones ni cambios
  remotos de Supabase.

## Bienvenida animada a QuéFalta Plus (local, 2026-08-22)

- Añadida `PlusWelcomeTransition`, superposición a pantalla completa del paywall
  con fundido negro de 1,5 s, sello dorado brillante sin halo, virutas,
  partículas y mensaje de bienvenida en castellano y catalán.
- Eliminado el antiguo modo de vista previa: ambos CTA compran ahora el paquete
  seleccionado y la transición solo aparece si RevenueCat devuelve el
  entitlement `plus` activo. La expiración validada se refleja inmediatamente en
  el perfil local mientras el webhook completa la persistencia en Supabase.
- Respeta Reducir movimiento y puede cerrarse con X, Atrás o escape de
  accesibilidad; al cerrarla se descarta también el paywall.

## Filtros en Cambios de precio (local, 2026-08-21)

- `PriceChangesScreen` añade un botón independiente a la izquierda del selector
  `Bajadas / Subidas` en Liquid Glass y fallback. Su estado activo se marca con
  el acento elegido.
- Reutiliza `ProductFilterSheet` para multiselección de categorías y rangos de
  variación absoluta (≤5 %, 5–10 %, 10–20 %, >20 %). En `Todos`, las categorías
  están agrupadas y cualificadas por supermercado.
- La hoja oculta los controles de precio/orden que no corresponden a este feed,
  conserva la paginación y muestra el vacío específico de filtros sin
  coincidencias. Textos añadidos en castellano y catalán.
- Corregida la salida de `ProductFilterSheet`: ya no encadena un desplazamiento
  manual con el `slide` nativo del modal. Al comenzar un gesto vertical hacia
  abajo desde el tirador, actualiza inmediatamente `visible=false`; la única
  transición nativa termina el cierre sin esperar a que se suelte ni poder
  rebotar. Botón, backdrop y Atrás usan exactamente el mismo cierre.
- Typecheck, lint y 27/27 tests correctos; falta recorrido visual en
  dispositivo/simulador.

## Buscador ampliado de Catálogo (local, 2026-08-21)

- Al enfocar el buscador de productos, su expansión desplaza y oculta todos los
  controles de orden y vista de la fila; al perder el foco reaparecen.
- La superficie y la lupa ya no se sustituyen al cambiar de estado: el mismo
  botón se transforma lentamente en una cápsula redondeada y vuelve exactamente
  a su posición circular, eliminando el tirón del icono al contraerse.
- Se aplica por igual a Liquid Glass y al fallback.
- Corregido el salto vertical de la cabecera: el campo expandido usa la misma
  altura que la fila contraída (40 px en Liquid Glass y 44 px en fallback), sin
  alterar la medida del chrome ni mover el contenido inferior.

## Orden unitario Plus en Catálogo y Novedades (local, 2026-08-21)

- `€/u↑` y `€/u↓` quedan bloqueados para cuentas gratuitas en las variantes
  Liquid Glass y fallback. Usan un tratamiento neutro con acento, sin candado,
  y abren el paywall con la cabecera compacta, sin texto descriptivo
  contextual y sin modificar la consulta ni el orden activo.
- En cuentas gratuitas, precio total y precio unitario se muestran como dos
  controles independientes. Con Plus se fusionan en la pastilla original de
  cuatro segmentos, incluida la transición del filtro seleccionado. Si Plus
  caduca con el orden unitario activo, se restaura el orden por precio total.
- La versión bloqueada iguala tamaño, pastilla y laterales redondeados al bloque
  de precio; las etiquetas quedan centradas en ambos ejes.
- Novedades y Ofertas exponen orden por precio total y unitario dentro de
  `ProductFilterSheet`; Cambios de precio conserva relevancia y añade el orden
  unitario. En free, solo los botones unitarios muestran candado y abren el
  paywall sin aplicar el orden; una caducidad elimina esa selección. El orden
  por precio total sigue libre donde existe.
- Typecheck, lint sin avisos y 30/30 tests correctos.

## Fondo del carrito activo ligado a Apariencia (local, 2026-08-21)

- `HomeScreen` usa el acento elegido en Perfil → Apariencia como base del
  resumen del carrito activo. Conserva el degradado y los dos círculos
  recortados mediante luces y sombras neutras, sin una paleta azul fija ni
  cambios en la lógica.

## Información y control de notificaciones (local, 2026-08-20)

- Perfil → Notificaciones incorpora una tarjeta de activación y explica tres
  tipos de aviso: carrito compartido, amistad y grupo. Esta pantalla ya no
  muestra una segunda bandeja: los avisos
  recibidos se consultan exclusivamente desde la campana de Inicio.
- El interruptor parte apagado por defecto, pide el permiso del sistema al
  activarse, registra/elimina el token push al instante y ofrece abrir Ajustes
  si el permiso fue denegado.
- La preferencia de AsyncStorage ahora usa
  `@notifications_enabled:${userId}`. Auth reconcilia el token al iniciar sesión
  y elimina uno anterior si la cuenta no tiene la preferencia activa.
- `npm run quality` correcto (typecheck, lint y 27/27 tests). Falta recorrido visual en dispositivo y probar
  aceptar/denegar el permiso con un build nativo.

## Alertas personalizadas (evaluación acotada activa; actualizado 2026-08-23)

- MVP completo en cliente: reglas exactas o por palabras, multi-súper, bajada
  mínima, oferta, vista previa, gestión/pausa y CTA «Avísame» compartido por
  todas las fichas, superpuesto en la esquina superior derecha de la imagen
  mediante `ProductDetailImage`/`ProductDetailHero`.
- «Avísame» conserva la campana y permite crear la primera regla gratuita o
  editar la alerta exacta que ocupa ese hueco. Si ya existe otra regla, abre el
  paywall. Plus mantiene creación ilimitada.
- Perfil abre «Alertas personalizadas» para todas las cuentas. La pantalla
  identifica el cupo gratuito y solo bloquea reglas sobrantes procedentes de
  una suscripción caducada.
- Desplegadas en producción la migración
  `20260820162731_personalized_price_alerts.sql` y sus correcciones de RPC e
  índices. El backfill contiene los 18 catálogos y el verificador transaccional
  pasa. `20260821210209_price_alert_notification_products.sql` está también
  desplegada como `20260823193941` y permite abrir los resultados exactos de
  cada aviso.
- El procesador agrupa por regla y lote de sync y usa la bandeja/push actuales;
  una RPC transaccional impide duplicar la fila de bandeja o el push al
  reintentar. No amplía `send-push` ni acepta contenido desde el cliente.
- Si un producto genera a la vez bajada y
  oferta, el procesador lo cuenta y comunica solo como oferta. Las novedades
  tienen textos propios en push y bandeja, sin caer en el texto de ofertas.
- Cada push `price_alert` lleva el `notificationId` y cada fila de bandeja ya
  conoce su propio id. Ambos abren `PriceAlertResults`, que consulta mediante la
  RPC protegida `get_price_alert_notification_products` los productos exactos
  del aviso y permite abrir sus fichas.
- El editor de reglas por palabras solo ofrece los supermercados activos en
  Perfil → Supermercados que además correspondan a la CCAA actual. Al editar,
  intersecta también la selección guardada con esa lista para no conservar
  cadenas que el usuario haya desactivado. Cada chip sitúa el logotipo local
  del supermercado a la derecha de su nombre.
- Las reglas persisten un emoji de clasificación. Cliente y carrito comparten
  `getSubcategoryEmoji`; el editor ofrece una vista viva y la tarjeta sustituye
  el icono genérico por el emoji. La migración
  `20260820165618_price_alert_rule_emoji.sql` está desplegada y asignó `🫒` a
  la regla existente de «aceite oliva»; el fallback es `🛒`.
- Añadido y desplegado el modo exclusivo «Novedad» (`new_arrival`): conserva
  los supermercados elegidos, usa `🆕` y no admite palabras, bajadas,
  ofertas, bajada mínima ni vista previa. La migración
  `20260820170935_personalized_alert_new_arrivals.sql` captura inserciones
  publicadas de los espejos y el RPC solo las entrega a este tipo de regla.
- Evaluación del lunes 24-08-2026: `process-price-alerts` v2 y la nueva RPC
  `claim_price_alert_deliveries_for_user` están acotadas exclusivamente a
  `@rruizosma`. Se crearon seis reglas `TEST 1` a `TEST 6` para novedades,
  bajadas, umbral del 10%, ofertas, mezcla/deduplicación y producto exacto.
  La RPC acotada se desplegó como `20260823194159` + corrección
  `20260823194414`.
  El cron de `ops/schedule_rruizosma_price_alert_evaluation.sql` corre cada 15
  minutos y se elimina solo el 25-08 a las 00:00 UTC; prueba HTTP 200 con cola
  inicial vacía.
- Pendiente tras valorar la prueba: convertir el procesador en general,
  configurar `PROCESS_PRICE_ALERTS_SECRET` dedicado y activar el cron permanente
  de `ops/schedule_price_alerts.sql` para todas las cuentas.
- Corregido el bucle de «No se pudieron cargar tus alertas»: `ToastContext`
  conserva un valor estable y un error remoto ya no vuelve a disparar el
  `useFocusEffect` de la pantalla indefinidamente.
- Si Plus caduca, el procesador crea solo el registro deduplicador en estado
  `paused`; no envía y los avisos vencidos no reaparecen al renovar. Las reglas
  siguen en BD, pero el acceso desde Perfil queda reservado a cuentas Plus.

## Fondo Plus en «Todos» (local, 2026-08-20)

- El paywall abre con una cabecera más baja: sello dorado compartido de
  `VerifiedBadge` y título en una sola fila, sin el bloque «Más control para
  encontrar el mejor precio» ni subtítulos contextuales desde ningún acceso.
- La presentación es ahora de altura completa hasta el borde superior, con zona
  segura para el contenido. Se retiraron tirador y cierre exterior, y el gesto
  de descarte está desactivado; solo cierran la X o Atrás del sistema.
- Mensual y Anual ocupan dos columnas de una misma fila; Anual conserva la
  preselección y «Mejor precio». La etiqueta «Incluido» se retiró del título
  «Todo lo que desbloqueas». Anual reutiliza el ritmo del barrido diagonal de
  QuéCocino con una franja azul difuminada e irregular, estática cuando el
  sistema solicita Reducir movimiento. «Mejor precio» usa directamente
  `PremiumGoldBackground`, con su tinta oscura. «Todo lo que desbloqueas» no
  muestra checks a la derecha de sus filas.
  El comparador figura como «Radar de
  ahorro», con una descripción explícita de alternativas similares más baratas.
- El borde activo de los planes es una superposición absoluta: conserva los 2 px
  visuales sin alterar la altura de la fila ni mover el CTA al alternar entre
  Mensual y Anual.
- «Buscar productos más económicos» mantiene sus iconos de búsqueda, carga y
  resultado. En cuentas gratuitas reutiliza el fondo dorado, añade un candado y
  abre el paywall sin texto descriptivo contextual y sin invocar el comparador;
  con Plus usa el estilo normal.
- Catálogo y el selector compartido por Cambios de precio, Novedades y Ofertas
  muestran en «Todos» el fondo dorado animado solo cuando la opción está
  bloqueada para una cuenta gratuita; con Plus vuelve al diseño normal.
- El efecto se centralizó en `PremiumGoldBackground`, tiene una opacidad base
  del 30 %, respeta Reducir movimiento y detiene la animación cuando el panel de
  supermercados está cerrado. La etiqueta «Mejor precio» del plan anual mantiene
  una excepción al 70 %.
- Retirados los accesos Plus de la tarjeta de identidad. `@usuario` queda a la
  derecha del avatar y centrado solo en el eje Y; la fila de Cuenta es el único
  acceso al paywall o a la gestión de la suscripción.
- «Color personalizado» en Apariencia usa el mismo fondo solo cuando está
  bloqueado; con Plus activo muestra una fila normal.
- `premium_until` futuro es la única fuente de verdad de Plus. `verified` pasa a
  ser su reflejo público protegido para la insignia dorada en Perfil, Amigos y
  Grupos; el trigger lo sincroniza y el cliente no puede editarlo. Migración
  `20260820163441_sync_plus_verified_badge` aplicada en remoto: 2 cuentas Plus,
  2 insignias y 0 discrepancias tras el backfill.
- Cada bloque usa una semilla de movimiento propia para variar posiciones,
  trayectorias, fases y velocidad; no hay partículas sincronizadas entre ellos.
- La animación es una caída vertical continua: cada elemento cruza el borde
  inferior, se oculta durante el retorno y reaparece arriba sin reinicio grupal.
- Las rejillas añaden una celda invisible cuando el número de supermercados es
  impar para impedir que la última tarjeta ocupe las dos columnas.

## QuéCocino desactivado (local, 2026-08-20)

- Retirada la pestaña QuéCocino del árbol de navegación mediante
  `QUE_COCINO_ENABLED = false`; la barra inferior vuelve a tener Inicio,
  Catálogo, Carrito y Grupos tanto en Liquid Glass como en la variante clásica.
- La pantalla, el icono y sus traducciones se conservan como implementación
  preliminar para retomarla más adelante. No existe backend ni dato remoto que
  haya que migrar o apagar.

## Push de solicitudes de amistad (local + backend desplegado, 2026-08-20)

- La solicitud ahora selecciona su `friendshipId` y espera la invocación
  best-effort de `send-push`, evitando abandonar la petición remota al terminar
  inmediatamente la acción del cliente.
- `send-push` v7 está ACTIVE en producción. Valida la solicitud exacta y mantiene
  compatibilidad con versiones publicadas que solo mandan `addresseeId`.
- Los taps de tipo `friend` quedan en cola hasta que el navegador autenticado
  esté listo y abren directamente Perfil/Inicio → Amigos, también en arranque
  en frío. Pendiente: validar extremo a extremo con dos dispositivos reales y
  notificaciones activadas en el receptor.

## Valoración nativa de las tiendas (local, 2026-08-20)

- Sustituido el modal propio de valoración y su redirección por
  `expo-store-review`, que solicita el cuadro oficial de App Store o Google Play.
- La primera apertura autenticada arma el plazo local por usuario. Una
  reapertura posterior tras 24 horas realiza un solo intento; la tienda conserva
  el control sobre si lo muestra y no devuelve la puntuación ni el resultado.
- Eliminados el componente, estilos y textos del popup anterior. Requiere nuevo
  build nativo; pendiente de validar en dispositivo/distribución de pruebas.

## Fondo ambiental en Inicio (local, 2026-08-18)

- Implementado localmente en `HomeScreen`: degradado tenue basado en el accent,
  con formas ambientales amplias y discretas detrás del contenido.
- Añadida una prueba visual con veintiuna burbujas del color de acento estáticas, combinando
  tamaños pequeños, medianos y grandes, difuminadas mediante degradado radial
  y sin incorporar recursos raster.
- Respeta tema claro/oscuro, accent personalizado, gestos y accesibilidad. No
  incorpora recursos nuevos ni modifica la jerarquía funcional de Inicio.

---

## Login directo (local, 2026-08-20)

- Eliminada la portada gestual de la burbuja, junto con su shader, fallback,
  textos y estado de revelado. La app sin sesión muestra directamente el
  formulario actual de Apple, Google y correo, con sus enlaces legales.
- Retirada `@shopify/react-native-skia`, que no tenía otros consumidores. Se
  conservan Reanimated, Gesture Handler, SVG, Haptics y `expo-glass-effect`
  porque siguen siendo dependencias activas del resto de la app.
- Los flujos de autenticación no cambian; Google mantiene PKCE.

## Código postal y comunidad en el primer paso (local, 2026-08-18)

- Al completar un CP válido, la tarjeta del código postal se contrae desde la
  derecha y la comunidad autónoma aparece a su lado; ambas terminan al 50 % y
  con la misma altura.
- La transición respeta Reducir movimiento y solo se activa en el primer paso;
  Ajustes y el gate existente conservan su composición vertical.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).

## Primer paso sin transición de entrada (local, 2026-08-19)

- Eliminada la bajada completa de `OnboardingShutter` y la transición entre la
  mascota agarrada y la sentada. Fondo, contenido y formulario aparecen desde
  el primer render.
- `berenjena-sentada-ok.png` queda directamente en su posición final y el campo
  de usuario conserva el enfoque automático al montar.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).

## Paso 2 del onboarding con persiana azul (local, 2026-08-18)

- Implementado localmente, sin commit: `Username` navega inmediatamente a
  `Stores`, que ahora replica el fondo azul con lamas del primer paso.
- Se eliminaron «Paso 2 de 5» y el subtítulo «Mostraremos sus catálogos y
  precios…». La mascota con carrito queda fija, completa y
  adaptada a la altura sobre un grid desplazable; el CTA también permanece
  visible. El indicador de selección queda fijo en la esquina superior derecha.
  Recurso: `berenjena-carrito-transicion.png`.
- El grid usa la comunidad guardada en el paso 1. Se completó la huella de las
  cadenas regionales nuevas: Plusfresc `ES-CT`/`ES-AR`, Gadis `ES-GA`/`ES-CL`,
  Froiz `ES-GA`/`ES-CL`/`ES-CM`/`ES-MD` y Ahorramás
  `ES-CM`/`ES-MD`/`ES-CL`; HiperDino continúa limitado a `ES-CN`.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).
- Falta validar la composición visual con una cuenta que tenga el onboarding
  incompleto en dispositivo o simulador.

## Paso 3 del onboarding con mascota selfie (local, 2026-08-19)

- Generada e integrada `assets/mascot/berenjena-selfie.png` (512×768, RGBA con
  alfa real): la berenjena aparece completa haciéndose un selfie con un móvil.
- `AvatarScreen` adopta fondo azul con lamas, volver flotante, título superior
  sin subtítulo, tarjeta clara de foto y footer fijo con Continuar/Ahora no. La
  cabecera empieza justo bajo el botón de volver y la mascota aparece entre la
  tarjeta y el footer, con 50 px adicionales de ancho y alto respecto al primer
  diseño reducido.
- Se conserva `expo-image-picker`, el recorte 1:1, la subida existente y la
  posibilidad de omitir; no hay cambios de backend ni migraciones.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).

## Paso 4 del onboarding con amistades (local, 2026-08-19)

- Generada e integrada `assets/mascot/berenjena-amigos.png` (1024×1536, PNG
  RGBA): la berenjena aparece entre las nuevas mascotas plátano y tomate, que
  le dan una mano cada una.
- `FriendsScreen` replica la persiana azul con lamas, volver flotante, cabecera
  superior, composición de mascotas al 50 % de su tamaño inicial, buscador y
  resultados claros, y footer fijo con Continuar/Ahora no. Conserva la búsqueda
  y el envío de solicitudes existentes.
- El buscador queda fijo; la lista de usuarios es la única zona desplazable y
  muestra el indicador vertical nativo (persistente en Android).
- Optimizado el typeahead tanto aquí como en Perfil → Amigos: primera consulta
  válida inmediata, siguientes a 100 ms, cancelación con `AbortController` y
  filtrado local provisional del prefijo anterior. El `EXPLAIN ANALYZE` remoto
  con rol autenticado y RLS dio ~5 ms sobre unas 3.900 filas, así que no se tocó
  el esquema.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).

## Paso 5 del onboarding con primer grupo (local, 2026-08-19)

- `GroupScreen` deja `OnboardingLayout` y completa el lenguaje visual de la
  persiana azul: volver flotante, título/subtítulo, mascota con carrito, tarjeta
  clara para el nombre y sugerencias rápidas sobre el fondo.
- El footer fijo mantiene visibles Continuar/Crear grupo y Ahora no; al aparecer
  el teclado, el contenido intermedio es desplazable sin perder la acción. Las
  dos acciones completan `onboarded_at` y abren directamente Inicio; se eliminó
  la pantalla terminal «Todo listo». Si se crea el grupo, queda como carrito
  activo; la misma autoactivación se aplica al primer grupo creado desde Grupos.
- Generada e integrada `assets/mascot/berenjena-grupo.png` (1024×1536, PNG
  RGBA): la berenjena empuja el carrito, el plátano va dentro y el tomate queda
  a la derecha; las tres mascotas saludan. `createGroup`, los hápticos, el toast
  y el carácter opcional del paso se conservan sin cambios de backend.
- Corregida la máscara alfa de los huecos interiores del carrito: ya no quedan
  placas blancas entre las barras, bajo la cesta ni alrededor de las ruedas.
- Igualado al morado de la mano el reflejo casi blanco que ocupaba el dedo
  central levantado de la berenjena, conservando un brillo pequeño y natural.
- `npm run quality` correcto (typecheck, lint y 27/27 tests).

## Hipercor (pendiente de migrar y primer sync, 2026-08-15)

- La POC terminó correctamente en GitHub Actions con Google Chrome. El sync
  completo queda en `scripts/sync-hipercor.mjs`, con workflow diario
  `sync-hipercor.yml` y esquema `supabase/migrations/hipercor_catalog.sql`.
- Ejecutar primero la migración y luego el workflow manual. El guardarraíl
  exige 10.000 productos antes de modificar Supabase. El catálogo representa
  únicamente el centro público sin CP/dirección; aún no añadir Hipercor al
  cliente, filtros ni comparativa hasta validar ese primer run.

## Actualización Fase 3 (2026-08-14)

Desplegada y verificada en Supabase, todavía sin commit local:

- Auditoría real: 44 avisos de seguridad y 121 de rendimiento.
- Nueva migración `20260814141719_phase_3_security_performance_hardening.sql`:
  rutas seguras de funciones, RPC privilegiados sin acceso anónimo, RLS
  consolidada y optimizada, y seis índices de claves foráneas.
- Resultado: seguridad 44→20 y rendimiento 121→69. Los seis índices nuevos aún
  figuran «sin uso» porque no han recibido tráfico suficiente.
- SQL validado, preflight correcto, verificador ejecutado y policies compiladas
  con rol autenticado. Falta QA manual con cuentas reales en la app.
- La repetición final de `npm run quality` queda bloqueada por trabajo local
  concurrente de Froiz/Gadis con errores TypeScript; no pertenece a la Fase 3 y
  no se modificó durante este despliegue.
- Debe aplicarse después de scripts legacy que vuelvan a crear estas funciones o
  policies. No mover `pg_trgm` ni borrar índices «sin uso» sin métricas.
- Reversión funcional disponible en `supabase/ops/rollback_phase_3_access_changes.sql`.
- Ajuste manual pendiente: activar leaked-password protection en Supabase Auth.

Detalle: `FASE-3-SEGURIDAD-RENDIMIENTO-DATOS.md`.

## Actualización Fase 2 (2026-08-14)

Implementada localmente, sin commit ni cambios remotos:

- Accesibilidad: animaciones, transiciones y expansiones respetan Reducir movimiento; toast, filtros, cantidades, segmentos, selectores y hojas exponen etiquetas/estados.
- Diseño: contraste AA reforzado para textos secundarios y los seis accents; objetivos táctiles compartidos de al menos 44 pt.
- Texto grande: Login se reorganiza en una columna con `accessibility-large` y evita desbordamientos; iPad mantiene la composición completa.
- Recursos: importación directa de Ionicons y Space Grotesk, Montserrat sin uso eliminada; export iOS 57→38 recursos, 1.524→1.470 módulos y 6,15→5,81 MB de Hermes.
- `npm run quality` y Xcode Release correctos; 27/27 tests. Falta recorrido VoiceOver/TalkBack autenticado y dispositivo físico.

Detalle: `FASE-2-ACCESIBILIDAD-DISENO.md`.

## Actualización Fase 1 (2026-08-14)

Implementada localmente, sin commit ni cambios remotos:

- ESLint: 82 → 0 avisos; CI exige cero.
- Arranque: mínimo del BootLoader 2.000 → 350 ms y pestañas bajo demanda.
- Catálogo/Novedades/Ofertas/Cambios: colecciones, comparadores, cachés y efectos estabilizados para evitar trabajo repetido.
- Login: fallos de Apple/Google localizados y sin texto técnico; contenido centrado en iPad.
- `npm run quality`, export iOS y Xcode Debug/Release correctos; Release revisada en iPhone 17e e iPad mini.
- `ios/.xcode.env.local` (ignorado) se corrigió de Node 24.9.0 a 22.23.2 en esta máquina.

Detalle y pendientes de QA física: `FASE-1-ESTABILIDAD-RENDIMIENTO.md`.

## Actualización Fase 0 (2026-08-13)

Se ha creado una línea base técnica sin cambios funcionales ni mutaciones remotas:

- Node 22.23.2/npm 10.9.8 fijados y controles de calidad reproducibles.
- CI para typecheck, lint y 27 pruebas existentes.
- Compilaciones Debug y Release verificadas en Xcode 26.5; login revisado en iPhone 17 Pro, iPhone 17e e iPad mini simulados.
- Supabase auditado en modo lectura: las columnas críticas y los tres RPC que usa el cliente existen. Las listas de migraciones de este handoff son históricas y no deben interpretarse ya como ausencia de columna sin contrastar el esquema remoto.
- No se aplicaron migraciones, no se modificó lógica de producto y no se creó commit.

Resultados y pendientes de dispositivo físico/cuenta QA: `FASE-0-LINEA-BASE.md`.

## Actualizacion CP: Consum y Plusfresc (2026-07-16)

Implementado localmente, sin migrar ni sincronizar en Supabase. Consum barre 5
`X-TOL-ZONE` y escribe `regions`/`regional_prices` (ejecutar
`consum_regions.sql` antes); Plusfresc barre sus 8 centros y escribe
`centers`/`center_prices` (incluido en `plusfresc_catalog.sql`, pendiente). El
cliente ya aplica el CP en busqueda, listado, categoria y detalle. DRY_RUN OK:
Consum 131 productos/1 pagina/zona; Plusfresc 7.927 en la union de los 8 centros.
Falta ejecutar SQL y los syncs reales con service_role.

El histórico de precios por ubicación de Consum/Plusfresc usa
`catalog_location_price_history.sql`: los syncs rellenan
`catalog_location_prices` (precio efectivo por producto+zona/centro) y un
trigger escribe los cambios en `catalog_location_price_changes`. La primera
pasada solo establece la base; los cambios se registran desde el siguiente sync.

## 1. Qué está commiteado/pusheado vs. SOLO en local

Esto es lo primero que se pierde en un traspaso. Repo de la app = `github.com/rruizosm/QueFalta`, rama `main`.

**Commiteado y pusheado a `main`:**
- Fix `markStale` 57014 (lotes+reintentos, `scripts/lib/stale.mjs`) — commit `1a6032c` (2026-07-10).
- OTA Android (fix "icono pillado") a canal production — commit `1a6032c` (2026-07-10).
- Eroski (8º) + Caprabo (9º), backend Tapestry compartido — commit `6e72611` (2026-07-11).
- Fix nombre de columna `ean` (bonÀrea/Consum/Dia, renombrado `ean13`→`ean`) — commit `3158318`
  (2026-07-15), **quirúrgico**: SOLO el nombre de columna, SIN arrastrar la multi-zona Dia/Carrefour.
- (Repo web aparte `QueFalta-Web`) AEO F0–F3 — commit `a5c4ff3` (2026-07-12).

**SOLO en local (NO commiteado) al 2026-07-15 — el grueso del trabajo reciente:**
- **Supers nuevos sin commitear:** Ametller (11º), Aldi (12º), Hiperdino (13º), Alcampo (14º), Plusfresc (15º).
  Condis (10º) estaba con "commit en espera" porque Ametller rompía el typecheck a medias — verifica su estado real.
- **Multi-zona Carrefour** (barrido por comunidad, `regions`/`regional_prices`) — local.
- **Multi-zona Dia** (barrido 48 CP, `regions`) — local.
- **Vínculo bonÀrea↔OpenFoodFacts** (`off_code`, script + migración) — local, sin ejecutar.
- **Comunidad autónoma → filtro de supers** (F0–F5: `profiles.region` + `regions.ts` + onboarding paso 3) — local.
- Distintas migraciones SQL **sin ejecutar** (ver §3).

> Regla de oro: antes de "seguir" cualquier súper o feature de abajo, comprueba con `git status` /
> `git log` si ya está dentro. La memoria decía "local" pero pudo commitearse después.

---

## 2. Supermercados (espejos de catálogo) — estado

15 espejos + Mercadona en vivo. Un sync por súper en `scripts/sync-*.mjs` (workflows `sync-*.yml`,
cron lunes escalonado). Tras CADA súper nuevo hay que **re-ejecutar `similar_products.sql`** (lleva un
brazo por tabla). Estado al 2026-07-15:

| # | Súper | Backend del sync | Commit | Migración ejecutada | Notas |
|---|-------|------------------|--------|---------------------|-------|
| 1 | Mercadona | API pública en vivo | ✅ | — | Publicado. Multi-almacén (~48 wh). Bilingüe `lang=ca`. |
| 2 | Bonpreu | Navegador headless (WAF) | ✅ | ⚠️ publicación reanudable | Staging bilingüe por Actions; falta desplegar `20260729184317_bonpreu_resumable_publication.sql` junto al script que recupera el cursor. |
| 3 | bonÀrea | API JSON propia (ShoppingBody) | ✅ (col `ean`) | ⚠️ ficha/off pend. | Ficha bilingüe es/ca. `off_code`↔OFF listo pero SIN ejecutar. |
| 4 | Carrefour | fetch SSR `__INITIAL_STATE__` | parcial | ⚠️ regions/offers | Ficha más rica. Multi-zona + ofertas LOCAL. Corre en local (Cloudflare). |
| 5 | Consum | API REST abierta | ✅ | ⚠️ | EAN + marca estructurados. Sin ficha (no la expone). |
| 6 | Dia | SSR Vike `vike_pageContext` | ✅ base | ⚠️ multi-zona local | Ficha es. Multi-zona 48 CP LOCAL. |
| 7 | Sorli | Playwright bootstrap + fetch | ✅ | ⚠️ | Bilingüe es/ca. nutriScore propio vacío 99%. |
| 8 | Eroski | Tapestry (`lib/eroski-tapestry.mjs`) | ✅ `6e72611` | ⚠️ nutrición | es-only, €/kg-L-ud desde el tile, sin EAN; nutrición PDP incremental local. |
| 9 | Caprabo | Tapestry (compartido con Eroski) | ✅ `6e72611` | ⚠️ nutrición | Idem Eroski. |
| 10 | Condis | Empathy.co API JSON abierta | ⚠️ dudoso | ⚠️ | Bilingüe. Sin ficha v1. "Commit en espera" por Ametller → VERIFICAR. |
| 11 | Ametller | SCAPI Salesforce (guest PKCE) | ❌ local | ⚠️ | Bilingüe + ficha + EAN. Logo placeholder. |
| 12 | Aldi | SSR Algolia embebido (`__NEXT_DATA__`) | ❌ local | ⚠️ | es-only, sin EAN. Guardarraíl <800. Logo placeholder. |
| 13 | Hiperdino | Magento 2 GraphQL abierto | ❌ local | ⚠️ | **SOLO Canarias (IGIC)** → filtrar por comunidad. es-only, sin ficha; €/ud local pendiente de backfill. |
| 14 | Alcampo | Ocado, patrón Dia (product-pages) | ❌ local | ⚠️ | es-only CON ficha (EAN/origen/operador). Nacional (no multi-zona). |
| 15 | Plusfresc | API REST ASP.NET (JWT guest) | ❌ local | ⚠️ | **Solo Catalunya (ES-CT)**. Bilingüe + ficha con ALÉRGENOS legibles. |

**Descartados/no viables:** Lidl (sin espejo: ~75% sin precio, IAN≠EAN). Alcampo NO multi-zona
(surtido nacional idéntico). Condis tienda 718 = superconjunto (no multi-tienda).

Cada súper tiene su `scripts/README-*-sync.md`. Los detalles de cada backend y sus gotchas están en
CONTEXTO.md §"Migraciones SQL pendientes" (cada `*_catalog.sql` lleva un párrafo).

---

## 3. Migraciones SQL — ejecutar en Supabase (a mano)

La lista **completa y anotada** está en CONTEXTO.md. Aquí, lo esencial y el ORDEN:

**Ya ejecutada:** `ean_unify.sql` (rename `ean13`→`ean` en las 14 tablas) ✅.

**Bloqueantes de arranque** (el cliente ya `SELECT`ea la columna → la app crashea sin ellas):
`profile_onboarding.sql`, `profile_premium.sql`, `profile_region.sql`, `profile_verified.sql`,
`list_items_store_product_id.sql`, `favorites_store.sql`, `catalog_unaccent_search.sql`,
`mercadona_catalog_ca.sql`.

**Órdenes que importan:**
- `fix_bonpreu_prices.sql` **ANTES** de `catalog_price_changes.sql` (si no, cambios de precio falsos).
- Bonpreu: `20260728182501_bonpreu_sync_staging.sql` → `20260729184317_bonpreu_resumable_publication.sql`; desplegar la segunda junto al sync actualizado, nunca con el script antiguo.
- `profile_premium.sql` → `paywall_gates.sql` → (re)`similar_products.sql`.
- `carrefour_offers.sql` y `carrefour_regions.sql` **ANTES** del próximo sync de Carrefour (el `upsert` las incluye).
- Cada `bonarea/dia/carrefour_product_detail.sql` antes del sync de su súper (pasada de ficha).
- `20260718133958_eroski_caprabo_nutrition.sql` y después
  `20260719102703_eroski_caprabo_product_detail.sql` antes de los próximos syncs
  de Eroski/Caprabo; añaden la ficha nutricional y los campos `ingredients`,
  `conservation` y `manufacturer`.
- `20260718183152_catalog_browse_indexes.sql` añade índices parciales para la
  navegación alfabética keyset de todos los catálogos. Es aditiva y no bloquea
  el arranque, pero debe ejecutarse para obtener toda la mejora de rendimiento.
- Migración de cada súper nuevo (`ametller/aldi/hiperdino/alcampo/plusfresc/condis/eroski/caprabo_catalog.sql`)
  → luego **re-ejecutar `similar_products.sql`**.

**Redeploys de Edge Functions asociados:** tras `push_tokens_lang.sql` y `notifications_inbox.sql` →
`supabase functions deploy send-push`.

**Multi-zona / OFF (local, sin ejecutar):** `dia_regions.sql`, `carrefour_regions.sql`, `bonarea_off_code.sql`.

---

## 4. Multi-zona por comunidad / código postal

- **Dia:** `sync-dia.mjs` barre 48 zonas (check-service + save-shipping-address por CP). `regions` =
  disponibilidad por CCAA (`null` = nacional = en todas las CCAA barridas). Falta `dia_regions.sql` + relanzar. LOCAL.
- **Carrefour:** regionaliza catálogo Y precio por almacén (`werks_id`, 48 en España; sin cookie = Madrid
  COL PINAR). El sync barre **1 capital por comunidad** (~18 crawls, ~2 h) fijando la cookie `salepoint`.
  Columnas base = Madrid (la app no cambia hasta implementar el filtro). Falta `carrefour_regions.sql` +
  1er run (subir el `-ExecutionTimeLimit` de la tarea de Windows a ~4 h). LOCAL.
- **Filtro por comunidad (transversal):** `profiles.region` + `src/constants/regions.ts` + código postal
  integrado en el paso 1 + gate/filtro de catálogo. Necesario para no enseñar cadenas regionales fuera
  de su zona. F0–F5 en local, typecheck verde, sin validar en device. Ver
  `COMUNIDAD-AUTONOMA.md`. **Ejecutar `profile_region.sql` antes de arrancar.**
- **Alcampo/Condis/Mercadona:** NO multi-zona (Alcampo surtido nacional; Condis 718 = superconjunto;
  Mercadona ya multi-almacén por su cuenta).

---

## 5. Nutrición / OpenFoodFacts (estrategia de datos)

- **OFF API** probada 2026-07-14/15: lookup por EAN sin API key (con User-Agent identificativo). v3 sin
  buscador (v2 `search` = única búsqueda estructurada). Tope anónimo 1.000/consulta → multi-ventana
  `sort_by`. 7,5 req/min o llueven 503. En marcas con carnicería ~70% son códigos de bandeja → auto-vincular
  solo EAN `84…`.
- **Cobertura con nutrición YA** (2026-07-15): Carrefour 8,6k · Dia 3,9k · Ametller 2,2k · bonÀrea ~80% al
  correr syncs · Consum sin ficha PERO 9,5k EAN→OFF directo · Sorli nutriScore propio vacío 99%.
- **Estrategia:** OFF-oficial > calculado-estimado > visión. (Health score por visión: solo Mercadona,
  Plus; backend hecho, falta UI+run — ver memoria `health-score-nutricional`.)
- **Vínculo bonÀrea↔OFF:** matcher token-set (231 ALTA / 242 revisar / resto fresco sin match). Usa
  `off_code` y **NO** `ean` (el sync pisa `ean` cada lunes + semántica multipack). Script + `bonarea_off_code.sql`
  LISTOS pero SIN ejecutar/relanzar. Matcher reutilizable para otros espejos sin EAN.

---

## 6. Otras features transversales en vuelo

- **Liquid Glass iOS** (solo iOS 26+, Android intacto): F0–F3 hechas (barra flotante, campana+panel,
  Cambios de precios, Catálogo). Typecheck verde, **sin validar en device**. Validación por canal `preview`
  (`eas update --channel preview --platform ios`). **PROHIBIDO glass a production hasta validar F1–F5.**
  Ver `LIQUID-GLASS.md`.
- **Android / Google Play** (`ANDROID.md`): closed testing corriendo desde ~2026-07-08 (12+ testers). Queda:
  pegar huella SHA-256 en `assetlinks.json`, push web, data safety, content rating, ficha es/ca, cuenta de
  prueba. ⚠️ iOS y Android comparten canal `production` → OTA a production es peligroso (el repo lleva glass
  sin validar).
- **Notificaciones:** bandeja server-side (`notifications` + `send-push` la rellena) e idioma por dispositivo
  (`push_tokens.lang`, es/ca). Faltan `notifications_inbox.sql` + `push_tokens_lang.sql` + redeploy `send-push`.
- **Sign in with Apple:** flujo nativo iOS funcionando. Revocación de token al borrar cuenta montada, **pendiente
  `.p8` + secrets + deploy**. (Nota: `AGENTS.md`/`AGENTS` viejo decía Expo v56 — el proyecto es SDK 54.)
- **Insignia Plus** (dorada): `profiles.verified` es un reflejo público protegido
  de `premium_until` + `VerifiedBadge`. Backfill/trigger desplegados en remoto.
  `revenuecat-webhook` aún no existe en producción: antes de desplegarlo hay que
  configurar `RC_WEBHOOK_TOKEN`; el código local ya sincroniza ambos campos.
- **Ranking de búsqueda:** Nivel 1 (cliente) hecho. BUG conocido: las 6 `search*` con `limit 50` SIN `order` →
  50 filas arbitrarias. Nivel 2 (RPC ranking en servidor + offset) especificado en
  `BUSQUEDA-RANKING-SERVIDOR.txt`, pendiente de implementar.
- **Comparativa entre supers** y **Monetización QuéFalta Plus**: ambas DESACTIVADAS por flags
  (`PRICE_COMPARISON_ENABLED` / `PAYWALL_ENABLED` en `src/constants/limits.ts`), código intacto. Ver
  `COMPARATIVA.md` / `MONETIZACION.md`.
- **Seguridad:** fix crítico (profiles legible por anon) + secure-store para tokens (requiere build nuevo) +
  4 SQL pendientes + redeploy webhook. Ver `PRIVACIDAD-SEGURIDAD.md` y memoria `security-hardening`.

---

## 7. Dónde vivía todo esto (para el humano)

El conocimiento acumulado estaba en la memoria de Claude Code, en
`~/.claude/projects/c--Users-ruben-OneDrive-Escritorio-MercaApp/memory/` (índice `MEMORY.md` + ~40 ficheros
`.md`, uno por tema). **Codex no lee esa carpeta.** Este HANDOFF.md + CONTEXTO.md son el volcado para Codex.
Si en el futuro quieres el detalle fino de un tema (p. ej. el truco exacto de la cookie de Carrefour, o el
mapa de APIs de Lidl), está en esos ficheros de memoria.

Repos ecosistema: app `rruizosm/QueFalta` · web `rruizosm/QueFalta-Web` (carpeta hermana `quefalta-web/`) ·
dashboard privado `rruizosm/QueFalta-Datos` (`QueFaltaDatos/`, Astro SSR + service_role).
