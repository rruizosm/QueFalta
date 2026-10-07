# Ilustraciones de producto

## Cuarto lote: otros 100 productos (2026-10-07)

100 nuevas ilustraciones WebP transparentes publicadas y verificadas en Supabase;
total actual: **231 WebP**. Fotografías oficiales y las 131 ilustraciones previas
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
