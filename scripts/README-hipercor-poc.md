# POC de Hipercor

`poc-hipercor.mjs` comprueba si el catalogo publico de Hipercor puede leerse de
forma estable desde Google Chrome. Es deliberadamente de solo lectura: no usa
Supabase y no escribe ningun fichero salvo que se pase `HIPERCOR_OUTPUT`.

## Prueba rapida

```bash
PW_CHANNEL=chrome MAX_PAGES=2 MIN_PRODUCTS=40 node scripts/poc-hipercor.mjs
```

En CI se usa Google Chrome con `PW_CHANNEL=chrome`: Chromium de Playwright fue
bloqueado por Akamai. En local se recomienda el mismo canal.

Por defecto recorre `/supermercado/alimentacion/`. Otra categoria:

```bash
PW_CHANNEL=chrome HIPERCOR_PATH=/supermercado/lacteos/ MAX_PAGES=2 node scripts/poc-hipercor.mjs
```

Para conservar el resultado completo de la POC:

```bash
PW_CHANNEL=chrome HIPERCOR_OUTPUT=/tmp/hipercor-poc.json node scripts/poc-hipercor.mjs
```

Variables:

| Variable | Default | Uso |
|---|---:|---|
| `HIPERCOR_PATH` | `/supermercado/alimentacion/` | Categoria publica a recorrer. |
| `MAX_PAGES` | `2` | Paginas SSR consecutivas. |
| `MIN_PRODUCTS` | `min(MAX_PAGES*20, 40)` | Guardarrail contra bloqueos o respuestas parciales. |
| `NAV_TIMEOUT_MS` | `45000` | Timeout por navegacion. |
| `PW_CHANNEL` | Chromium de Playwright | Permite usar `chrome` localmente. |
| `HEADLESS` | `1` | Usa `0` para mostrar el navegador. |
| `HIPERCOR_OUTPUT` | vacio | JSON opcional con paginas y productos. |

## Criterios de la POC

El resultado informa de:

- centro de reparto observado;
- productos y paginas anunciados por Hipercor;
- productos unicos extraidos;
- cobertura de imagen, precio final y precio por unidad;
- ofertas explicitas, separando precio anterior y promociones de lote;
- productos temporalmente no disponibles.

Antes de convertirla en un sync real deben completarse tres ejecuciones
consecutivas en GitHub Actions y una comparacion de al menos dos centros. El
paso de codigo postal no forma parte de este script para no guardar ni enviar
ubicaciones de usuarios durante la POC.

## Resultado local inicial (2026-08-14)

Dos ejecuciones independientes con Chrome, centro observado `010130`:

| Categoria | Paginas | Anunciados | Extraidos | Precio | Precio/unidad | Imagen | Ofertas explicitas |
|---|---:|---:|---:|---:|---:|---:|---:|
| Alimentacion | 2 de 203 | 4.861 | 45 | 45 | 45 | 45 | 5 |
| Lacteos | 2 de 38 | 909 | 45 | 45 | 45 | 45 | 8 |

Las dos pruebas terminaron sin bloqueo y sin productos duplicados entre sus dos
paginas. Estos resultados validan los selectores y la paginacion, pero no aun
la estabilidad del runner de GitHub ni la resolucion multi-centro.
