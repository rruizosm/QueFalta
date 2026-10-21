# Lidl: minutos de GitHub Actions, 1–21 de octubre de 2026

## Conciliación de los 3.118 minutos

Consultadas las cuatro ejecuciones de `Sync Lidl catalog fleet` y todos sus
jobs en la API de GitHub. El tiempo visible del workflow mide desde su inicio
hasta su fin; los minutos de uso suman el tiempo de los jobs concurrentes. Para
conciliar la cifra mostrada por Actions Usage Metrics se redondea cada job al
minuto siguiente y se omiten los cuatro jobs cancelados del 5 de octubre.

| Ejecución | Duración de pared | Jobs iniciados | Minutos de jobs no cancelados, redondeados |
|---|---:|---:|---:|
| [5 oct, 37364627157](https://github.com/rruizosm/QueFalta/actions/runs/37364627157) | 418 min | 27, incluidos 4 cancelados | 1.174 |
| [12 oct, 38303318853](https://github.com/rruizosm/QueFalta/actions/runs/38303318853) | 394 min | 27 | 1.192 |
| [13 oct, 38420835581](https://github.com/rruizosm/QueFalta/actions/runs/38420835581) | 5 min | 11 | 14 |
| [19 oct, 39294552781](https://github.com/rruizosm/QueFalta/actions/runs/39294552781) | 244 min | 27 | 738 |
| **Total** | **~1.062 min** | | **3.118 min** |

Los cuatro jobs cancelados del 5 de octubre duraron 15:02, 15:03, 30:05 y
30:06; suman 94 minutos después de redondear. Si se incluyeran, el total
sería 3.212. La coincidencia exacta con 3.118 se obtiene al excluirlos.
Este repositorio es público y utiliza `ubuntu-latest` estándar: estos son
minutos de uso de recursos, no minutos facturables de Actions.

## Causa del exceso y cambio local

- El workflow semanal creaba 24 jobs `sync` aunque el censo ronda 720 tiendas.
  Cada job admite 100 reclamos: ocho tienen capacidad para 800. Los jobs
  sobrantes del final salían rápido, pero cada uno iniciaba un runner.
- Una tienda fallida se reclamaba hasta tres veces, con espera exponencial de
  15 y 30 minutos. El run del 12 de octubre registró 58 tiendas en `dead` y
  174 intentos fallidos: tres por tienda. Repetir un catálogo bajo mínimo o
  vacío no reparó la fuente y prolongó los jobs. El 19 de octubre varios
  workers volvieron a fallar tras procesar sus lotes.
- El worker podía esperar hasta 35 minutos sin reclamar otro trabajo mientras
  había estados `running` o `retry` en la cola.

El cambio local programa ocho workers semanales, fija un intento automático
por tienda y elimina la espera ociosa. Un fallo queda en `dead`, aparece en el
informe final y requiere revisar la causa antes de reabrir ese ID con
`--retry-dead-only` y ejecutar `recover`. Se conserva el fallback a la tienda
maestra cuando Lidl entrega un catálogo vacío verificado; ese recorrido usa
otra fuente y protege el catálogo de Canarias. También se conservan los
reintentos acotados de peticiones HTTP individuales y las comprobaciones de
cobertura antes de publicar.

La reducción exacta futura depende de cuántas tiendas falle Lidl. Si el censo
supera 800 tiendas abiertas, el informe final marcará las pendientes y habrá
que aumentar capacidad; no se omiten silenciosamente. La ejecución manual
`weekly` sigue reprogramando todo el censo y `recover` sigue sin reprogramar
las tiendas completadas.
