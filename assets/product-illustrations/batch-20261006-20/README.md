# Lote de 20 ilustraciones Mercadona — 2026-10-06

20 productos sin ilustración previa, publicados en Supabase QueFalta
(`gkffvigcnsesbaihycay`) dentro de `product-illustrations` y enlazados en
`mercadona_products.illustration_url`. Las fotografías `thumbnail` y las
11 ilustraciones anteriores se conservan. El catálogo tiene ahora 31 WebP.

Generación: herramienta integrada **ImageGen**, una edición/transferencia de
estilo por producto. La foto oficial es la fuente de identidad; el PNG aprobado
`10699` es la referencia de estilo: ilustración editorial frontal, contornos
suaves, colores del envase y textura sutil, sin sombras externas ni decorado,
con transparencia alfa real. Se conservan los multipacks completos.

- [Vista previa](preview.jpg) sobre fondo crema de inspección (solo la vista previa tiene fondo).
- [Prompts completos](prompts.json): prompt común y detalles por producto.
- [Procedencia](provenance.json): originales generados y corrección de la etiqueta de miel.
- [Inventario y verificación](manifest.json): fotos fuente, PNG maestros, WebP, dimensiones,
  canal alfa, SHA-256 y URL públicas.
- `originals/`: fotografías oficiales descargadas a 1000×1000 desde la URL del catálogo.

## Productos

| ID | Producto | WebP |
| --- | --- | --- |
| 4193 | Aceite de coco virgen Hacendado | [Archivo](mercadona-4193-aceite-de-coco-virgen-hacendado.webp) |
| 4040 | Aceite de girasol refinado 0,2º Hacendado | [Archivo](mercadona-4040-aceite-de-girasol-refinado-0-2-hacendado.webp) |
| 16452 | Aceitunas verdes rellenas de anchoa Hacendado | [Archivo](mercadona-16452-aceitunas-verdes-rellenas-de-anchoa-hacendado.webp) |
| 86656 | Ajo granulado Hacendado | [Archivo](mercadona-86656-ajo-granulado-hacendado.webp) |
| 26019 | Alubia cocida blanca Hacendado | [Archivo](mercadona-26019-alubia-cocida-blanca-hacendado.webp) |
| 26029 | Garbanzo cocido Hacendado | [Archivo](mercadona-26029-garbanzo-cocido-hacendado.webp) |
| 5330 | Lenteja pardina Hacendado | [Archivo](mercadona-5330-lenteja-pardina-hacendado.webp) |
| 29100 | Harina de trigo Hacendado | [Archivo](mercadona-29100-harina-de-trigo-hacendado.webp) |
| 16864 | Sal fina de mesa Hacendado | [Archivo](mercadona-16864-sal-fina-de-mesa-hacendado.webp) |
| 17132 | Tomate frito Hacendado | [Archivo](mercadona-17132-tomate-frito-hacendado.webp) |
| 16043 | Tomate triturado Hacendado | [Archivo](mercadona-16043-tomate-triturado-hacendado.webp) |
| 4957 | Vinagre de manzana Hacendado | [Archivo](mercadona-4957-vinagre-de-manzana-hacendado.webp) |
| 15430 | Miel de flores Hacendado | [Archivo](mercadona-15430-miel-de-flores-hacendado-v2.webp) |
| 86755 | Mermelada de fresa Hacendado | [Archivo](mercadona-86755-mermelada-de-fresa-hacendado.webp) |
| 86368 | Copos de avena sin gluten Hacendado | [Archivo](mercadona-86368-copos-de-avena-sin-gluten-hacendado.webp) |
| 14102 | Galletas María Hacendado | [Archivo](mercadona-14102-galletas-maria-hacendado.webp) |
| 7031 | Caldo de pollo Hacendado bajo en sal | [Archivo](mercadona-7031-caldo-de-pollo-hacendado-bajo-en-sal.webp) |
| 16712 | Maíz dulce Hacendado | [Archivo](mercadona-16712-maiz-dulce-hacendado.webp) |
| 5598 | Orégano Hacendado | [Archivo](mercadona-5598-oregano-hacendado.webp) |
| 34171 | Pimienta negra molida Hacendado | [Archivo](mercadona-34171-pimienta-negra-molida-hacendado.webp) |

## Preparación y comprobaciones

Limpieza técnica de partículas fuera de la silueta con
`scripts/clean-product-illustration-alpha.mjs`, conservando el canal alfa
generado y margen de 16 px. La miel se corrigió con ImageGen para que el título
dijera exactamente «Miel de Flores»; el PNG seleccionado lleva `-v2` y el
primer candidato permanece sin publicar.

Conversión determinista con Sharp: lado máximo 768 px, ajuste interior sin
ampliación, WebP calidad 84 y alfa 100. Total: **1.563.568 bytes**.
Todos los WebP tienen alfa real, píxeles opacos en el producto y borde
totalmente transparente. Revisión visual de los 20 archivos sobre fondo crema.

Publicación mediante `scripts/upload-mercadona-illustration.mjs`, sin
`--replace-existing`, en rutas nuevas con hash. Cada subida comprobó descarga
pública HTTP correcta, `image/webp` y SHA-256 idéntico al archivo local antes
de enlazar la fila. Verificación posterior con la clave pública de la app:
20 filas publicadas, URL exacta y `thumbnail` idéntico al original.
Consulta SQL de control: 31 ilustraciones, todas WebP, 20 del nuevo lote.
`npx tsc --noEmit` correcto. Sin cambios de cliente ni migraciones.
