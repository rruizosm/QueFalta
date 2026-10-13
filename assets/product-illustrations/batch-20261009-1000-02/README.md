# Mercadona — segunda tanda del 9 de octubre de 2026

Comprobación posterior (09-10-2026, 14:21 UTC): nueva petición de 1000 adicionales.
Supabase confirmó 1459 productos publicados sin ilustración. Una prueba real con 5503
volvió a recibir HTTP 429 `usage_limit_reached`, mismo reset 10-10 a 08:44:32 Madrid.
Cero nuevas generaciones/publicaciones; no se inició otra tanda ni se lanzaron agentes.
Error exacto en `batch-20261009-1000-02/quota-recheck-20261009-1421.json`.
Sin reanudación automática. Los 876 anteriores y 124 pendientes conservan su estado.

**876 de 1000 ilustraciones adicionales publicadas y verificadas; 124 pendientes por cuota de ImageGen.** El encargo sigue incompleto. Auditoría remota: 2026-10-09 12:43:48 UTC, 62.768.862 bytes.

Todos los productos seleccionados tenían `published=true`, `illustration_url` nulo, ID numérico y fotografía oficial. Se asignaron diez lotes de 100 a diez responsables (nueve subagentes y el coordinador). La plataforma permitió como máximo cuatro actores activos, por lo que se ejecutaron por tandas. El coordinador también ayudó a cerrar los lotes 07,08 y 10.

| Lote | Publicados | Pendientes |
| --- | ---: | ---: |
| 01 | 99 | 0; un original rechazado sustituido |
| 02 | 99 | 0; un original rechazado sustituido |
| 03–07 | 500 | 0 |
| 08 | 78 | 22 |
| 09 | 47 | 53 |
| 10 | 51 | 49 |
| Suplemento | 2 | 0 |
| Total efectivo | 876 | 124 |

Cada ilustración se generó mediante ImageGen integrado, con la foto oficial, referencia de estilo 10699 y prompt específico. Se revisó el WebP final, transparente y de hasta 768 px. No se convirtieron fotografías directamente en sustitución de las ilustraciones.

La auditoría comprobó los 876 objetos de Supabase: MIME WebP, SHA 256, bytes, dimensiones, alfa y bordes transparentes, URL de BD, estado publicado, PNG nativo, prompt y recibos de limpieza. Las 3959 ilustraciones anteriores y los 1002 thumbnails seleccionados permanecen intactos. Los 124 pendientes siguen `published=true` e `illustration_url=null`, comprobados el 09-10 a 12:44:12 UTC.

Los 876 JPG fuente y 876 WebP de publicación se eliminaron inmediatamente después de confirmar cada publicación y su readback. No quedan JPG/JPEG/WebP en `assets/product-illustrations/`. Los PNG nativos, prompts, manifiestos, jobs y recibos se conservan. Las fuentes de productos pendientes y galerías de QA permanecen en `/private/tmp/mercadona-batch-20261009-1000-02/`.

ImageGen devolvió HTTP 429 `usage_limit_reached`; se detuvieron todas las nuevas generaciones y se terminaron las publicaciones ya generadas. Reset indicado por el servicio: **10 de octubre de 2026, 08:44:32 Europe/Madrid** (06:44:32 UTC; `resets_at=1791614672`). No quedan llamadas en vuelo ni se ha programado reanudación automática.

Los originales 44973 y 14087 fueron rechazados por moderación: error exacto conservado, sin reintento ni reformulación. Se sustituyeron por dos productos distintos publicados y sin ilustración,19976 y 33344. El objetivo efectivo sigue siendo 1000; los 124 pendientes son únicamente productos aún sin generar de los lotes 08–10.

`npx tsc --noEmit`: correcto. Cambios locales anteriores preservados; esta tanda no se ha commiteado ni subido a GitHub.

Archivos de cierre:

- [aggregate-verification.json](aggregate-verification.json): auditoría parcial, `complete=false`.
- [pending-products.json](pending-products.json) y [pending-verification.json](pending-verification.json):124 IDs y comprobación remota.
- [quota-block.json](quota-block.json): error real y reset; los archivos `PAUSE` siguen activos.
- [moderation-blocked.json](moderation-blocked.json): dos rechazos sin reintentos.
- `lot-NN/`: prompts exactos, PNG nativos, jobs, recibos, revisión visual e informes de cada responsable.

Para retomar después del reset, comprobar primero la cuota y los 124 pendientes contra Supabase, usar sus manifiestos/prompts y generar solo IDs aún sin ilustración. No sobrescribir publicaciones existentes ni reintentar IDs rechazados por moderación. El cierre completo exige 1000 publicaciones verificadas, snapshot intacto y typecheck correcto.
