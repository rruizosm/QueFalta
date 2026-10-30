# Carrefour: cinco pruebas de fotografía sin fondo (27-10-2026)

Petición: replicar el recorte de BonÀrea para Despensa y excluir **Papelería,
Bazar y Calzado**. La exclusión afecta a la preparación de imágenes; no
despublica ni elimina productos del catálogo.

Muestras publicadas y disponibles al seleccionarlas:

| ID | Producto | Categoría |
|---|---|---|
| 520664611 | Caldo casero de pollo Original Carrefour 1 l | Conservas, Sopas y Precocinados |
| 520660281 | Aceite de oliva virgen extra Bio 500 ml | Aceites y vinagres |
| 521002680 | Galletas horneadas Original 500 g | Desayuno |
| 521003205 | Leche condensada 397 g | Lácteos |
| 521001754 | Cera para terrazo y baldosa 1 l | Limpieza del hogar |

Fotos oficiales descargadas desde las URL de `thumbnail` mediante navegador
(curl recibe 403 de Cloudflare). `manifest.json` conserva las fuentes y categorías.
`*-original.jpg` son las descargas sin modificar; `*-preview.png` contienen
transparencia real. `comparison.png`: originales arriba, recortes abajo sobre
damero. Orden igual al de la tabla.

Se replica la extracción mediante script solicitada para BonÀrea. No hay
generación ni redibujado. Se elimina blanco casi puro conectado al exterior;
una semilla revisada visualmente elimina también el hueco del asa de la cera.
Se conservan dimensiones y todos los valores RGB decodificados del original
por `sips`, incluso bajo los píxeles transparentes. La verificación comprueba
los RGB tras releer cada PNG y conserva SHA-256 de fuente y resultado.
Las fotos tienen 350 × 350 píxeles (galletas: 350 × 349).

Reproducir en macOS desde la raíz:

```sh
node scripts/preview-carrefour-cutouts.mjs
```

El script exige cinco IDs distintos y rechaza categorías excluidas o vacías.
La preparación y su `verification.json` son locales. Los cinco pares
se revisaron visualmente; las zonas blancas del envase se conservan y el asa
queda abierta. No es una certificación del método para todo el catálogo:
envases blancos, vidrio y alimentos sin envase requieren revisión específica.

Actualización posterior: Carrefour ya está integrado en `PANTRY_STORES` y su
tabla tiene `illustration_url` mediante la migración aplicada
`20261027203144_carrefour_pantry_cutouts.sql`. Se subieron y enlazaron estos
cinco PNG, comprobando HTTP, MIME y SHA-256 remotos. Recibo de publicación:
`docs/carrefour-cutouts-publicacion-20261027-5.json`. `thumbnail` intacto.
El cliente local incorpora selector/búsqueda/compras/refresco/persistencia y
reposición a la lista, con región y exclusiones. Pendiente distribución y QA
nativa; no se ha publicado una versión de la app.

Validación: `npx tsc --noEmit` correcto.
