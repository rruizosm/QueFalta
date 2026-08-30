# BM — explorador multizona (Fase 1)

`scripts/explore-bm.mjs` es una prueba tecnica de **solo lectura** sobre la API
publica que consume la tienda online de BM. No carga `.env.local`, no necesita
credenciales y no tiene ningun camino de escritura a Supabase.

## Que comprueba

- resolucion de codigo postal a centro, zona y modalidad de entrega;
- recuento de productos y ofertas por zona;
- estructura y profundidad del arbol de categorias;
- muestra paginada y normalizada de productos;
- codigo BM, EAN/GTIN, precios, disponibilidad, novedades y promociones;
- senales disponibles en la ficha de detalle;
- diferencias de surtido, precio, oferta y disponibilidad frente a la primera
  zona soportada de la ejecucion.

La salida JSON se escribe en `stdout`. El progreso y los errores se escriben en
`stderr`, por lo que el informe se puede redirigir sin mezclar los mensajes.

## Ejecucion

```bash
node scripts/explore-bm.mjs
```

Prueba corta con tres zonas y una pagina de muestra:

```bash
POSTAL_CODES=20009,28008,48009 SAMPLE_PAGES=1 node scripts/explore-bm.mjs
```

Variables disponibles:

- `POSTAL_CODES`: lista separada por comas. Por defecto usa una capital o zona
  representativa de cada territorio donde se ha detectado presencia de BM.
- `PAGE_SIZE`: productos por pagina, entre 1 y 20; por defecto 20.
- `SAMPLE_PAGES`: paginas de catalogo por zona, entre 1 y 10; por defecto 2.
- `DETAIL_SAMPLES`: fichas de detalle consultadas por zona, entre 0 y 5; por
  defecto 3.
- `PREVIEW_PRODUCTS`: productos incluidos como muestra en el JSON; por defecto 3.
- `REQUEST_DELAY_MS`: separacion minima previa a cada peticion; por defecto 120.
- `REQUEST_TIMEOUT_MS`: timeout por peticion; por defecto 25 segundos.
- `MAX_RETRIES`: intentos para errores de red, `429` o `5xx`; por defecto 3.

## Interpretacion

Un codigo postal sin cobertura no hace fallar el proceso: queda registrado como
`supported: false`. Los errores de contrato o red se recogen en `errors`. El
proceso solo termina con codigo distinto de cero si ninguna zona funciona o si
todas las zonas solicitadas fallan.

Este explorador no es el sincronizador productivo. La publicacion en Supabase,
los guardarrailes de catalogo completo y el historial multizona pertenecen a las
fases siguientes.

## Resultado validado (2026-08-30)

El barrido representativo confirmo siete zonas online distintas y cero errores de
contrato o red:

| CP | Centro de entrega | Productos | Ofertas |
| --- | --- | ---: | ---: |
| 20009 | BM Pagola Online | 8.420 | 610 |
| 48009 | Zubiarte Online | 7.103 | 531 |
| 01001 | BM Lakua | 8.101 | 579 |
| 39001 | BM Santander Online | 8.120 | 579 |
| 31001 | BM Ardoi Online | 8.053 | 582 |
| 26001 | BM Avd. Madrid Online | 8.051 | 554 |
| 28008 | BM Princesa | 7.683 | 677 |

Los CP representativos 05001, 19001, 33001 y 50001 no devolvieron una zona
online habilitada. Esto describe esos CP concretos, no demuestra por si solo que
toda la provincia carezca de cobertura.

El catalogo limita cada bloque a 20 productos y pagina mediante `offset`;
`currentPage` se ignora aunque `hasMore` sea `true`. Los arboles observados tienen
entre 937 y 992 nodos y profundidad maxima 6. En muestras deterministas de 40
productos ya aparecen diferencias de surtido, precio y tipo de oferta entre
zonas, por lo que la integracion productiva debe conservar el contexto postal.
