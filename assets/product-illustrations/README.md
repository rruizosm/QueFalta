# Ilustraciones de producto

## Lidl: primera ilustración WebP publicada (2026-10-13)

- Completado 1/1: Leche semi desnatada Leyma Natura 1 l, `8804651149163_ES`, publicado y con fotografía oficial real. ImageGen integrado, estilo Mercadona 10699 y alfa nativo.
- WebP 512×768, 44.698 bytes, subido a `product-illustrations/lidl/8804651149163_ES/3dc19433a467466d.webp` y vinculado en `lidl_product_master.illustration_url`. Foto original intacta; sin duplicación por tienda.
- Migración local `20261013141332_add_lidl_illustration_url.sql`, aplicada en producción como `20261013141404`. Añade solo el campo al maestro; RLS/permisos intactos. El cliente/vista Lidl aún no consume esta ilustración; no se ha ampliado el encargo a integración visual.
- Lectura pública y BD verificadas por SHA/MIME/bytes/dimensiones/alfa/publicación. JPG/WebP temporales eliminados después de verificar. PNG nativos, prompts y recibos en `assets/product-illustrations/lidl-20261013-1/`. Typecheck correcto; sin commit/push.

## Mercadona: resultado de los 459 pendientes, 12-10-2026 — 441 ilustrados, 18 bloqueados

- De los 459 publicados sin ilustración del snapshot inicial se han generado, subido y verificado **441 WebP**. Quedan **18 rechazos de ImageGen**: 14 históricos excluidos y 4 nuevos (27201,46920,8260,52821), sin reintentos de moderación. Los 445 elegibles quedan resueltos como 441 publicados y 4 bloqueados.
- Auditoría conjunta: 2026-10-12 15:45:12 UTC, 29.292.088 bytes. Los 441 superan MIME, SHA-256, bytes, dimensiones<=768px, alfa nativo/WebP, prompt exacto y vínculo BD. Sus 441 JPG fuente y 441 WebP temporales fueron eliminados después de verificar cada subida. Cero JPG/JPEG/WebP en assets/product-illustrations. PNG nativos, versiones, prompts y recibos conservados.
- Las 5835 URLs de ilustración anteriores siguen intactas. Durante el cierre cambió el catálogo fuera de estas subidas:55 miniaturas (52 anteriores y 3 de la tanda) y 3 estados published a false (3768,4326,37001). Los 441 estaban publicados al subir;438 seguían publicados en la auditoría final. El uploader solo escribe illustration_url; los cambios de catálogo quedan registrados, sin restaurarlos.
- Cola remota al 2026-10-12 15:46:54 UTC: **56 publicados sin ilustración**, compuestos por los 18 bloqueados de este encargo y **38 publicados adicionales fuera del snapshot solicitado** que aparecieron durante la actualización del catálogo. Estos 38 no se contabilizan como parte de los 459.
- Cuatro lotes exclusivos con un máximo de cuatro actores activos. Todos los productores y el guardián de cuota han terminado. Typecheck npx tsc --noEmit:salida 0. Informe y evidencias en assets/product-illustrations/batch-20261012-459/README.md y verification.json. Los apartados siguientes son históricos.

## Tanda del 10-10 cerrada el 11-10: 1000/1000 completados

Completados y verificados los 396 pendientes, además de los 604 previamente subidos. Auditoría conjunta de los 1000 WebP: MIME, SHA-256, bytes, alfa y dimensiones correctos; 5439 ilustraciones y miniaturas anteriores intactas. Cero JPG/JPEG/WebP en esta carpeta tras el borrado de temporales verificados. Typecheck correcto.

El catálogo queda en 5835 productos ilustrados y 459 productos publicados sin ilustración fuera de esta tanda. Todos los productores terminaron. La carpeta histórica borrada externamente no se recrea; la evidencia de cierre está en [resume-20261011-396/README.md](resume-20261011-396/README.md) y su [auditoría](resume-20261011-396/verification.json). Las secciones siguientes son checkpoints históricos.

## Tanda del 10-10: 1000 adicionales en curso

Checkpoint remoto:419 publicados/verificados,4835 previos intactos,0 JPG/WebP en esta carpeta.
Los124 pendientes anteriores ya están resueltos con ledger aditivo. Nueve moderados se
sustituyeron por otros nueve productos. Continúan los lotes restantes; esta tanda sigue
incompleta. Estado actual en [batch-20261010-1000/README.md](batch-20261010-1000/README.md).


## Segunda tanda del 09-10:876 adicionales publicados,124 pendientes por cuota

Auditoría remota 12:43:48 UTC: **876/1000** WebP verificados;3959 ilustraciones
anteriores y 1002 thumbnails intactos. JPG fuente y WebP temporales de cada
publicación eliminados tras readback; cero JPG/JPEG/WebP en esta carpeta.
ImageGen indicó reset el **10 de octubre de 2026 a 08:44:32 Madrid**. Productores
detenidos, sin reanudación automática. Typecheck correcto. Diez responsables
trabajaron por tandas con máximo cuatro actores activos.

Estado, cuota, recibos y 124 pendientes en
[batch-20261009-1000-02/README.md](batch-20261009-1000-02/README.md).

La primera tanda del 09-10 cerró 1000 publicaciones (997 originales y 3 sustitutos):
[batch-20261009-1000/aggregate-verification.json](batch-20261009-1000/aggregate-verification.json).

## Limpieza local posterior (2026-10-08)

Después de la tercera tanda se borraron recursivamente **1200 archivos `.jpg` y 779 `.webp`** de esta carpeta. La comprobación confirmó que no quedó ninguno. PNG, JPEG con extensión `.jpeg`, prompts, manifiestos y trazabilidad se conservaron. Supabase no cambió. La verificación de la tercera tanda y las 2231 ilustraciones anteriores describen su estado antes de esta eliminación local.

## Tercera tanda de 1000 adicionales: bloqueo de cuota (2026-10-08)

**728 nuevos WebP publicados y verificados de 1000; 272 pendientes**.
Total remoto real: **2959**. Las 2231 ilustraciones anteriores y los thumbnails de Supabase permanecen intactos.
Los JPG y WebP que se habían generado localmente se eliminaron después por solicitud
del usuario; no se restauraron los lotes limpiados anteriormente.

ImageGen devolvió HTTP 429 `usage_limit_reached` y señaló restablecimiento el 8 de octubre
a las 15:58:05 Europe/Madrid. Esa hora ya pasó; no se reanudó la generación tras la
posterior petición de limpieza local. Diez lotes de 100 asignados a diez responsables,
hasta cuatro activos por límite de ejecución. Lotes 01–06 completos, 07 tiene 96,
08 tiene 32 y 09/10 tienen 100 prompts preparados cada uno. Productores nativos terminados,
sin llamadas en vuelo. Typecheck correcto. El encargo sigue incompleto.

Inventario, verificación y recuperación en
[batch-20261008-1000/README.md](batch-20261008-1000/README.md).

## Limpieza de archivos JPG y WebP locales (2026-10-08)

- Por solicitud del usuario se eliminaron recursivamente **2168 archivos `.jpg`
  y 257 archivos `.webp`** de `assets/product-illustrations/` (2425 en total).
  La comprobación posterior encontró cero archivos de ambas extensiones.
- Esta limpieza incluye las fotografías fuente JPG y las galerías JPG, además
  de los WebP finales y sus versiones. Los registros de presencia de archivos
  de los lotes describen el estado anterior a esta limpieza.
- Los PNG, JPEG con extensión `.jpeg`, prompts, manifiestos y demás metadatos
  se conservaron. La operación fue exclusivamente local; no modificó Storage
  ni las URL publicadas en Supabase.

> Actualización 2026-10-08: a petición del usuario se borraron las ilustraciones
> locales PNG/WebP, las galerías de preview y las recuperaciones nativas. Se
> conservaron las fotografías fuente y la trazabilidad. Los objetos publicados
> en Supabase no se modificaron; las secciones siguientes documentan el historial.

## Segundo lote de 1000 adicionales completado (2026-10-08)

**1000 nuevas ilustraciones publicadas y verificadas**; total real **2231 WebP**.
Se conservaron las 1231 ilustraciones anteriores y todas las fotografías originales.
Diez responsables de 100 productos, ejecutados por tandas con hasta cuatro agentes
activos. Verificación remota de SHA/alfa/MIME y TypeScript correcto.
Tras la limpieza indicada arriba se generaron/recuperaron únicamente archivos de
trabajo para cerrar pendientes; el lote conserva 246 PNG/WebP finales locales y
trazabilidad completa, con los 1000 objetos verificados en Supabase.
Inventario y detalles en [batch-20261007-1000-02/README.md](batch-20261007-1000-02/README.md).

## Primer lote de 1000 adicionales completado (2026-10-07)

Se publicaron 1000 productos adicionales; el catálogo alcanzó 1231 WebP y se
conservaron las 231 ilustraciones previas. Inventario y verificación histórica en
[batch-20261007-1000/README.md](batch-20261007-1000/README.md).

## Cuarto lote: otros 100 productos (2026-10-07)

100 nuevas ilustraciones WebP transparentes publicadas y verificadas en Supabase;
total tras aquel lote: **231 WebP**. Fotografías oficiales y las 131 ilustraciones previas
intactas. ImageGen integrado y el mismo estilo de la referencia `10699`.
Inventario, prompts y cinco vistas previas en
[batch-20261007-100/README.md](batch-20261007-100/README.md).

## Tercer lote: 100 productos adicionales (2026-10-06)

Publicadas y verificadas 100 ilustraciones nuevas; tras aquel lote: **131 WebP**.
Mismo estilo de la referencia `10699`, fondo transparente y fotos originales intactas.
Inventario completo y cinco vistas previas en
[batch-20261006-100/README.md](batch-20261006-100/README.md).

## Segundo lote: 20 productos adicionales (2026-10-06)

Se añadieron 20 ilustraciones WebP siguiendo el estilo de la referencia `10699`.
Están publicadas en Supabase; tras aquel lote el catálogo alcanzó **31 ilustraciones WebP**.
Inventario, archivos, fuentes, prompts y comprobaciones en
[batch-20261006-20/README.md](batch-20261006-20/README.md).
Vista conjunta en [batch-20261006-20/preview.jpg](batch-20261006-20/preview.jpg).

- `mercadona-10699-hacendado-leche-entera-sin-lactosa.png` es el PNG maestro del
  brik de leche entera sin lactosa Hacendado, producto Mercadona `10699`; su
  derivado de producción es el WebP homónimo.
- Fuente: ilustración frontal original generada en la conversación, guardada por
  Codex en `.codex/generated_images/.../exec-c8eb709c-a198-4614-8d12-f03decf6bf61.png`.
  El original tenía fondo crema; el recorte conserva el envase y elimina el fondo
  y la sombra. Se comprobó el canal alfa del PNG final.
- Destino actual: bucket público Supabase `product-illustrations`, objeto
  `mercadona/10699/7cc6a3843dadeaed.webp`. La columna
  `mercadona_products.illustration_url` contiene su URL pública; `thumbnail`
  conserva la fotografía original. El PNG anterior permanece como respaldo sin
  estar referenciado. La subida WebP se verificó comparando SHA-256.
- Para incorporar otras ilustraciones aprobadas, usar
  `node --env-file=.env.local scripts/upload-mercadona-illustration.mjs <id> <png|webp>`
  tras comprobar visualmente su transparencia. El script evita sustituir una
  ilustración existente salvo que se indique explícitamente
  `--replace-existing`.

## Lote Mercadona del 2026-10-06

Se generaron localmente diez ilustraciones nuevas con ImageGen integrado en
modo edición/transferencia de estilo. La ilustración aprobada del producto
`10699` se usó solo como referencia visual y no se modificó ni regeneró.

| ID | Producto | PNG final |
| --- | --- | --- |
| `12586` | 99% cacao negro Hacendado | `mercadona-12586-hacendado-99-cacao-negro.png` |
| `5044` | Arroz redondo Hacendado | `mercadona-5044-hacendado-arroz-redondo.png` |
| `18071` | Atún claro en aceite de oliva Hacendado | `mercadona-18071-hacendado-atun-claro-aceite-oliva.png` |
| `19897` | Azúcar blanco Hacendado | `mercadona-19897-hacendado-azucar-blanco.png` |
| `13038` | Cacao soluble Hacendado | `mercadona-13038-hacendado-cacao-soluble.png` |
| `11715` | Café molido Colombia Hacendado | `mercadona-11715-hacendado-cafe-molido-colombia.png` |
| `23926` | Bebida de almendras 0% azúcar Hacendado | `mercadona-23926-hacendado-bebida-almendras.png` |
| `4740` | Aceite de oliva virgen extra Hacendado | `mercadona-4740-hacendado-aceite-oliva-virgen-extra.png` |
| `34128` | Albahaca Hacendado | `mercadona-34128-hacendado-albahaca.png` |
| `23138` | Albóndigas en salsa Hacendado | `mercadona-23138-hacendado-albondigas-salsa.png` |

Las fotografías descargadas del campo `thumbnail` se conservan sin modificar
en `originals/mercadona-<id>-original.<ext>`. Todas eran accesibles, legibles y
mostraban claramente el producto, por lo que no hubo omisiones. Los diez PNG
finales tienen canal alfa real, borde totalmente transparente, margen uniforme
de 16 px y un lado mayor de al menos 1000 px.

El 2026-10-06 se convirtieron los diez PNG nuevos y la referencia `10699` a
WebP de producción mediante un proceso determinista —sin ImageGen ni cambios en
el arte—: lado máximo 768 px, calidad 84 y alfa a calidad 100. Los 11 WebP
ocupan 663.306 bytes en total. Se subieron a rutas nuevas con hash en el bucket
`product-illustrations` y sus URL quedaron guardadas en
`mercadona_products.illustration_url`. Una lectura pública posterior verificó
para los 11 productos `image/webp`, estado publicado y SHA-256 idéntico al
archivo local. Los PNG maestros y las fotografías originales permanecen
intactos.

### Prompt final

Prompt común: usar la primera imagen como fuente exacta del producto y la
segunda (`10699`) solo como referencia de colección; crear una ilustración
editorial cálida, limpia y frontal, con contornos suaves, colores definidos y
textura sutil; conservar forma, proporciones, colores, marca, jerarquía visual y
textos principales; no rediseñar ni inventar etiquetas, ingredientes,
cantidades o reclamos; mostrar un único producto completo, vertical y con base
horizontal; no añadir manos, estanterías, utensilios, decoración, perspectiva
isométrica, aspecto 3D, sombra exterior, suelo, halo, fondo blanco ni cuadrícula
dibujada; entregar PNG con transparencia alfa real y margen mínimo uniforme.

Textos principales indicados por producto:

- `12586`: «NEGRO», «99%», «100g», «SIN/SEM GLUTEN», «HACENDADO».
- `5044`: «ARROZ», «REDONDO», «1 Kg», «HACENDADO».
- `18071`: «ATÚN CLARO EN ACEITE DE OLIVA», «HACENDADO»,
  «Fuente natural de Omega 3».
- `19897`: «AZÚCAR», «HACENDADO», «1 kg».
- `13038`: «Soluble de Cacao», «HACENDADO», «500 g».
- `11715`: «6», «COLOMBIA», «HACENDADO», «250g».
- `23926`: «ALMENDRA», «AMÊNDOA», «0% AZÚCAR», «AÇÚCAR»,
  «HACENDADO», «1L».
- `4740`: «Aceite de Oliva Virgen Extra», «HACENDADO», «1L»,
  «ORIGEN ESPAÑA».
- `34128`: «Albahaca», «Manjericão», «HACENDADO».
- `23138`: «Albóndigas en salsa», «Almôndegas com molho», «HACENDADO».

La limpieza técnica del alfa se hizo con
`scripts/clean-product-illustration-alpha.mjs`; la lata `23138` usa además
`scripts/extract-cylindrical-product-alpha.mjs` para conservar sus aros
metálicos completos, que el recorte por color confundía con el fondo gris.
