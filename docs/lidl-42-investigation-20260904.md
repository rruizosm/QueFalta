# Investigación de los 42 Lidl pendientes — 2026-09-04

Estado previo: 679 éxitos y 42 pendientes tras recuperar 36 tiendas. Esta investigación no modifica producción ni relanza sincronizaciones.

## Resultado confirmado

- **3 outlets no alimentarios**: ES5016 (Pinto), ES5026 (Vallecas), ES5093 (Alcalá de Henares). El directorio los denomina `(FD)-Non Food Restanten`. Son los únicos tres registros con esa denominación. Categorías devuelve HTTP 204 y fruta HTTP 200 con cero productos. `normalizeLidlStore` usa únicamente estado abierto para marcar `selectable`: falta excluir outlets del catálogo de alimentación.
- **39 tiendas abiertas de Canarias**: las 39 responden HTTP 200, ocho categorías raíz y cero productos en fruta. También se probó una tienda temporalmente cerrada con el mismo resultado, ajena a los 42 pendientes. El barrido original había observado cero productos en todas sus 40/41 hojas; esta nueva prueba censal comprueba categorías y fruta, no repite todas las hojas.
- **Controles peninsulares ES0367 y ES3572**: HTTP 200, siete categorías raíz y 138 productos en fruta usando los mismos encabezados. No hubo 403 en el censo.
- Una ficha disponible en ES3572 (`8800521561963_ES`, aguacate ecológico, 2,65 €) devuelve HTTP 204 al pedirla para ES0951. Es una muestra, no una comprobación de todas las fichas.

## Configuración y límites de la conclusión

El localizador oficial confirma `ES00952`, zona CAN y región de ofertas 49 para Granadilla. La conversión al ID de catálogo ES0952 coincide con la regla utilizada en las demás tiendas. Probar ES00951 o 951 en Product Catalog devuelve validación 400; el país IC devuelve 204 tanto para Canarias como para el control. Estas pruebas acotadas no identifican un endpoint regional alternativo.

La ausencia de productos en el endpoint utilizado está confirmada. **No está confirmado el motivo interno de Lidl**: cobertura del servicio, configuración regional o carga del catálogo. Lidl Plus sí existe en Canarias; no debe confundirse con disponibilidad de este catálogo completo. Tampoco hay evidencia de que esperar al próximo lunes lo resuelva.

Fuentes oficiales:
- https://www.lidl.es/s/es-ES/tiendas/granadilla-de-abona-tenerife/avda-de-la-democracia-s-n/
- https://www.lidl.es/c/lidl-plus-en-canarias/s10089416

## El feed de ofertas no valida cobertura local

`https://offers.lidlplus.com/app/api/v4/ES/{id}/offers` devolvió HTTP 200, 28 ofertas totales y 27 storeoffers para ES0951, ES3572, ES5016 e incluso el ID ficticio ES0000. La huella SHA256 de las ofertas ordenadas (id, productIds, priceBox) fue idéntica: `f86216cfcbf24d40a6512cce476102fcb65ec5edbc68d9a9a3765fe9072c68c6`. Esto es compatible con una respuesta genérica de respaldo; no acredita precios canarios. No publicar sustitutos nacionales.

## Siguiente actuación propuesta

1. Excluir los tres outlets del selector y de la programación alimentaria, con prueba de regresión.
2. Clasificar las 39 tiendas como catálogo regional no disponible; evitar reintentos intensivos y conservar una comprobación periódica acotada.
3. Contrastar el catálogo mostrado por la aplicación oficial al seleccionar una tienda canaria. Si existe allí, identificar su fuente/configuración regional antes de cambiar nuestro adaptador.

Evidencia del censo: `lidl-42-investigation-20260904.json` (45 tiendas: 39 abiertas CAN, una cerrada CAN, tres outlets y dos controles). Las pruebas complementarias anteriores se registran en este informe. No se ha implementado todavía la exclusión ni cambiado el estado de la cola como parte de esta investigación.
