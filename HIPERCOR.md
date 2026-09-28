# Hipercor en QuéFalta

> Documento canónico de la integración de Hipercor: investigación, decisiones,
> modelo de datos, sincronización, validaciones y trabajo pendiente.
>
> Última actualización: 23 de septiembre de 2026.

## 1. Estado actual

La integración se encuentra en este punto:

- El catálogo legado de Hipercor está publicado y contiene **20.338 productos**
  y **10 categorías** del centro observado `010130`.
- El esquema multicentro ya está creado y desplegado en Supabase.
- El backfill del catálogo legado al nuevo esquema se completó con 20.338 fichas
  maestras y 20.338 variantes del centro `010130`.
- Se verificó que el backfill conserva exactamente precio, promoción y
  disponibilidad del catálogo legado.
- El mapa código postal → centro está vacío en producción: no se han inventado
  asociaciones ni se han usado códigos postales de perfiles de usuario.
- La adaptación multicentro del sincronizador existe **solo en el workspace
  local** y no se ha ejecutado para publicar centros adicionales.
- La aplicación todavía consume el catálogo legado; aún no resuelve Hipercor por
  el código postal del perfil.
- La exploración masiva de códigos postales, el modo rutinario `CatalogOnly` y la
  publicación de nuevos centros quedan **aplazados para una fase futura**.

En resumen: la base de datos está preparada y el diseño está documentado, pero
QuéFalta continúa mostrando únicamente el catálogo Hipercor existente.

## 2. Objetivo funcional

Cuando esta fase se retome, QuéFalta deberá:

1. Resolver el código postal del usuario a una modalidad y un centro Hipercor.
2. Mostrar exclusivamente el precio, promoción, surtido y disponibilidad de ese
   centro.
3. Evitar descargar y almacenar un catálogo completo por cada código postal.
4. Descargar una sola vez cada catálogo realmente distinto.
5. Mantener trazabilidad de cambios y ejecuciones sin exponer datos operativos al
   cliente.

La clave de la solución es distinguir tres conceptos:

| Concepto | Función |
|---|---|
| Código postal | Entrada geográfica del usuario y del selector público. |
| Modalidad | `home_delivery`, `click_and_car` o `eci_express`. |
| Centro | Contexto comercial que determina catálogo, precio y disponibilidad. |

La comunidad autónoma sirve para presentación o agrupación, pero no es una clave
suficientemente precisa para atribuir precios.

## 3. Información recogida de Hipercor

### 3.1 Catálogo público

Hipercor publica páginas SSR bajo rutas como:

```text
https://www.hipercor.es/supermercado/alimentacion/1/
```

Las páginas contienen:

- tarjetas de producto con identificadores públicos `B…`;
- nombre, imagen y formato;
- precio final y precio anterior, cuando existe;
- precio por unidad;
- promociones explícitas;
- disponibilidad observable por el botón de añadir;
- paginación y recuento anunciado;
- `page.store_id` dentro del `dataLayer`.

El `page.store_id` observado es la identidad autoritativa del centro del
catálogo. No se debe sustituir por el código postal, la provincia, la comunidad
autónoma ni por un identificador interno del selector.

### 3.2 Resultados iniciales

La POC original observó dos ejecuciones independientes con el centro `010130`:

| Categoría | Páginas probadas | Productos anunciados | Productos extraídos |
|---|---:|---:|---:|
| Alimentación | 2 de 203 | 4.861 | 45 |
| Lácteos | 2 de 38 | 909 | 45 |

Posteriormente se recorrió el catálogo completo y se publicaron 20.338 productos
en 10 categorías.

### 3.3 Resolución por código postal

La web ofrece un selector público de entrega. La modalidad analizada como
canónica para QuéFalta es **Envío a domicilio** (`home_delivery`).

Se observaron estas señales:

- el encabezado confirma el CP mediante un texto equivalente a `Envío a 28050`;
- la sesión usa señales de ubicación como `ff_postal_code` y `ff_food_center`;
- el catálogo resultante expone el centro comercial mediante `page.store_id`;
- un CP aceptado por la interfaz no garantiza por sí solo un catálogo válido: la
  página debe exponer productos y un `store_id` coherente.

Observaciones puntuales de la investigación:

| CP/contexto | Resultado observado | Interpretación |
|---|---|---|
| Catálogo público por defecto | Centro `010130` | Contexto usado por el catálogo legado. |
| `28050`, envío | Centro `010130` | El CP puede resolver al mismo centro que el catálogo por defecto. |
| `28008`, prueba aislada | Selector aceptado, pero catálogo vacío/sin centro | Debe registrarse como `empty_catalog`, no inventar una asociación. |

Estas observaciones no constituyen un censo nacional. Deben repetirse desde el
runner operativo antes de publicar asociaciones.

### 3.4 Identificadores encontrados

Existen al menos dos familias de identificadores:

- `page.store_id`: centro que realmente sirve el catálogo; es la PK usada por
  QuéFalta.
- `fireflyId` o identificador del selector: se usa al elegir determinados centros
  o modalidades; puede guardarse como metadato, pero no sustituye a `store_id`.

En el frontend de Hipercor se localizaron referencias a operaciones equivalentes
a:

```text
select-center?filters[]=country&filters[]=virtual
set-delivery-center?deliveryType=click_and_car&center={fireflyId}&postalCode={postalCode}
```

Estas rutas son información de investigación y requieren una validación operativa
antes de convertirlas en dependencia estable. La implementación local usa el
selector visible mediante Playwright, porque las peticiones directas han sido más
sensibles a Akamai.

### 3.5 Domicilio frente a recogida

Las pruebas disponibles no demostraron una diferencia de precio cuando ambas
modalidades terminaban en el mismo centro. Esto no permite asumir que sean siempre
equivalentes:

- pueden resolver centros diferentes;
- puede variar la disponibilidad;
- Hipercor podría aplicar reglas distintas en el futuro.

Por ese motivo, el esquema conserva `delivery_type` y la primera implantación se
limita a `home_delivery`. La recogida (`click_and_car`) deberá validarse y publicarse
como modalidad independiente si se incorpora.

## 4. Conclusión del análisis de regionalización

La jerarquía correcta es:

```text
código postal + modalidad
            ↓
      centro Hipercor
            ↓
catálogo, precio, promoción y disponibilidad
```

La estrategia óptima no es una descarga por CP. Si varios códigos postales
resuelven el mismo `store_id` y la muestra de catálogo es idéntica, se conserva el
mapa de todos esos CP, pero el catálogo se descarga una sola vez.

Antes de deduplicar dos CP se debe comparar una huella estable de la primera
página que incluya:

- ids de producto;
- precio final;
- precio anterior;
- precio por unidad;
- disponibilidad;
- recuento anunciado.

Si dos CP comparten `store_id` pero la huella difiere, la ejecución debe fallar.
No se deben mezclar catálogos bajo la suposición de que el identificador es
suficiente.

## 5. Esquema Supabase desplegado

Las migraciones productivas son:

- `supabase/migrations/20260923104530_hipercor_multicenter_catalog.sql`
- `supabase/migrations/20260923104854_hipercor_multicenter_hardening.sql`

No deben editarse ni reaplicarse. Cualquier cambio futuro debe hacerse mediante
una migración nueva.

### 5.1 `hipercor_centers`

Directorio de centros de preparación.

Campos principales:

- `id`: `page.store_id`, seis dígitos y PK.
- `firefly_id`: identificador opcional del selector, único.
- `source_site_id`: identificador auxiliar de la fuente.
- `name`, `banner`, `center_kind`.
- dirección, ciudad, provincia, comunidad autónoma y CP del centro.
- latitud y longitud, siempre ambas o ninguna.
- capacidades `supports_home_delivery`, `supports_click_and_car` y
  `supports_eci_express`.
- `selectable`: impide exponer un centro sin catálogo validado.
- `published`, `raw`, `first_seen_at` y `synced_at`.

Un centro nuevo debe crearse con `selectable=false`. Solo pasa a `true` después de
publicar correctamente su catálogo completo.

### 5.2 `hipercor_postal_centers`

Resolución observada de código postal y modalidad.

- PK compuesta: `(postal_code, delivery_type)`.
- `center_id` nullable y FK a `hipercor_centers`.
- `supported`.
- `resolution_status`: `resolved`, `unsupported`, `empty_catalog` o `error`.
- `failure_reason`, `raw`, `resolved_at`, `synced_at` y `published`.

Las constraints impiden estas incoherencias:

- una fila soportada sin centro;
- una fila `resolved` marcada como no soportada;
- un CP con formato distinto de cinco dígitos;
- una modalidad fuera de las tres previstas.

### 5.3 `hipercor_product_master`

Ficha común del producto, sin información local.

- `id` y `retailer_product_id`.
- `ean`, cuando exista una fuente fiable.
- nombre, marca, formato, imagen y URL del producto.
- `display_name_norm` generado para búsqueda.
- `published`, `raw`, `first_seen_at` y `synced_at`.

Precio, promoción, disponibilidad y pertenencia a un centro no deben guardarse en
esta tabla.

### 5.4 `hipercor_center_products`

Estado comercial vigente de cada combinación centro-producto.

- PK compuesta: `(center_id, product_id)`.
- categoría principal y `category_ids`.
- precio, texto de precio y precio por unidad.
- promoción, precio promocional y precio base.
- disponibilidad y publicación.
- `observed_at`, `first_seen_at`, `synced_at` y `sync_run_id`.
- `prev_unit_price`, `price_changed_at` y `price_delta_pct`.
- `offer_unit_price` generado como `coalesce(promo_price, unit_price)`.

La limpieza de obsoletos debe estar siempre acotada por `center_id`. Un sync de un
centro nunca puede despublicar productos de otro.

### 5.5 `hipercor_center_categories`

Categorías y recuentos por centro.

- PK compuesta: `(center_id, category_id)`.
- `product_count`, `published`, `synced_at` y `sync_run_id`.

Evita presentar el recuento del catálogo legado como si fuera válido para todos
los centros.

### 5.6 `hipercor_price_history`

Historial privado de cambios comerciales.

Registra, por centro y producto:

- precio anterior y nuevo;
- promoción anterior y nueva;
- precio base promocional anterior y nuevo;
- disponibilidad anterior y nueva;
- ejecución y momento de observación.

Solo se inserta una fila cuando cambia al menos uno de esos valores. Esta tabla no
está expuesta al cliente y será la principal candidata a crecimiento sostenido.
Antes de ampliar a muchos centros debe definirse retención o particionado.

### 5.7 `hipercor_sync_runs`

Auditoría privada de procesos.

- scopes: `center_directory`, `postal_mapping` y `center_catalog`;
- centro, modalidad y CP representativo;
- estados: `running`, `validating`, `completed`, `failed` y `cancelled`;
- productos vistos/publicados, categorías, validación y error estructurado;
- inicio y final de la ejecución.

Una ejecución terminada debe tener `finished_at`; una ejecución activa no puede
tenerlo.

### 5.8 Vistas

`hipercor_product_centers` une la ficha maestra con el estado de un centro y
expone una fila lista para consumo por la app.

`hipercor_center_category_catalog` une la categoría global con el recuento y
estado del centro.

Ambas vistas usan `security_invoker=true`, por lo que respetan las políticas de
las tablas subyacentes.

### 5.9 Triggers

`hipercor_prepare_center_price_change` calcula:

- precio anterior;
- fecha de cambio;
- porcentaje de variación.

`hipercor_record_center_price_change` inserta el cambio en
`hipercor_price_history` cuando varía precio, promoción o disponibilidad.

Las funciones son `security invoker`, usan `search_path=''` y no están concedidas
a `anon` ni `authenticated`.

### 5.10 Índices

El esquema incluye índices para:

- CP, provincia y coordenadas de centros;
- resolución inversa centro → CP;
- búsqueda normalizada y trigramas del maestro;
- productos por centro, categoría, precio, precio por unidad y oferta;
- novedades y cambios de precio;
- categorías por centro;
- historial por producto y ejecución;
- ejecuciones activas y ejecuciones por centro.

Las FK señaladas por los advisors quedaron cubiertas por la migración de
hardening.

## 6. Seguridad y acceso

Todas las tablas nuevas de `public` tienen RLS habilitado.

### Lectura del cliente

`anon` y `authenticated` tienen lectura de:

- centros publicados;
- resoluciones postales publicadas;
- maestro publicado;
- productos y categorías publicados de centros seleccionables;
- las dos vistas de lectura.

Un catálogo de centro queda oculto si el centro no está publicado o no es
seleccionable. Una asociación postal soportada también queda oculta mientras su
centro no sea seleccionable.

### Acceso operativo

- `hipercor_price_history` y `hipercor_sync_runs` son privados.
- Las escrituras corresponden exclusivamente a `service_role`.
- La clave `service_role` solo puede usarse en el runner local/servidor y nunca en
  la aplicación.
- RLS y los grants de la Data API son controles separados; ambos están definidos.

La revisión posterior al despliegue no encontró avisos Hipercor de seguridad ni
FK sin índice. Los avisos de índices nuevos todavía sin uso son esperables hasta
activar el nuevo flujo.

## 7. Backfill y compatibilidad

La migración creó el centro `010130` a partir del catálogo legado y copió:

- 20.338 productos a `hipercor_product_master`;
- 20.338 estados a `hipercor_center_products`;
- 10 categorías a `hipercor_center_categories`.

Las tablas `hipercor_products` y `hipercor_categories` se conservaron intactas
para no romper las builds publicadas.

La adaptación local del sync mantiene esta regla:

- todos los centros se escriben en el modelo nuevo;
- solo el centro `010130` se refleja también en las tablas legacy;
- `catalog_sync_status` se actualiza únicamente cuando se actualiza ese espejo.

## 8. Sincronizador multicentro local

Archivos principales:

- `scripts/sync-hipercor.mjs`
- `scripts/lib/hipercor.mjs`
- `scripts/lib/stale.mjs`
- `scripts/run-hipercor-sync.ps1`
- `scripts/tests/hipercor-sync-resilience.test.mjs`
- `scripts/README-hipercor-sync.md`

Este trabajo está implementado localmente, pero queda pausado y no debe
interpretarse como una integración multicentro activada.

### 8.1 Fase postal implementada

1. Lee CP explícitos desde `HIPERCOR_POSTAL_CODES` o un fichero público.
2. Opcionalmente genera 364 candidatos provinciales: siete sufijos para cada una
   de las 52 provincias.
3. Abre un contexto aislado de Chrome por CP para evitar contaminación de sesión.
4. Selecciona `home_delivery` en la interfaz pública.
5. Confirma el CP visible y lee el `store_id` del catálogo.
6. Genera una huella de la primera página.
7. Registra `resolved`, `unsupported`, `empty_catalog` o `error`.
8. Agrupa los CP soportados por centro.
9. Exige la misma huella y el mismo identificador de selector para CP que
   comparten centro.

La exploración provincial ayuda a descubrir centros, pero no es una lista
exhaustiva de cobertura postal.

### 8.2 Fase de catálogo implementada

Por cada centro único:

1. Reabre la sesión usando un CP representativo.
2. Comprueba que el centro no cambia durante la paginación.
3. Recorre las diez categorías raíz.
4. Valida páginas vacías, recuentos y cobertura mínima por categoría.
5. Exige al menos 10.000 productos por defecto.
6. Publica primero el maestro y después el estado por centro.
7. Despublica ausencias únicamente dentro de ese centro.
8. Marca el centro como seleccionable al terminar.
9. Registra el resultado en `hipercor_sync_runs`.

Las diez categorías raíz son:

1. Alimentación.
2. Desayunos, dulces y pan.
3. Lácteos.
4. Congelados.
5. Bebidas.
6. Frescos.
7. Bebés.
8. Cuidado personal y belleza.
9. Droguería y limpieza.
10. Mascotas.

### 8.3 Checkpoints e informe

- Resolución postal:
  `scripts/logs/hipercor-location-checkpoint.json`.
- Catálogo por centro:
  `scripts/logs/hipercor-sync-checkpoint-<centro>.json`.
- Informe persistente:
  `scripts/logs/hipercor-location-report.json`.

El informe contiene asociaciones, centros, CP agrupados y huellas, pero no guarda
cookies completas de sesión. Los checkpoints admiten reanudación durante siete
días y se eliminan únicamente cuando termina el lote completo.

### 8.4 Modos del runner Windows

El runner admite:

- `-PostalCodes '28050,28051'`;
- `-PostalCodesFile .\datos\cp-hipercor.txt`;
- `-DiscoverProvinces`;
- `-LocationOnly`;
- `-MaxPostalCodes N`;
- `-MaxCenters N`;
- `-Resume`;
- `-Visible`;
- `-Publish`.

Sin `-Publish`, la ejecución es un `DRY_RUN` y no escribe Supabase.

Sin ningún CP ni exploración provincial, conserva el comportamiento compatible
de sincronizar únicamente el catálogo público por defecto.

## 9. Akamai y entorno operativo

Hipercor protege el catálogo mediante Akamai.

- Las peticiones HTTP directas y algunos fingerprints automatizados reciben 403.
- Los runners alojados de GitHub quedaron bloqueados de forma sostenida después
  de recorrer la primera categoría completa.
- Chrome local en Windows es actualmente el entorno operativo previsto.
- El script aplica pausas aleatorias, espera entre categorías, reintentos y un
  cooldown específico para 403/429.
- La ejecución local en macOS utilizada durante el desarrollo no permitió un
  crawl real completo por el bloqueo de Akamai.

Por ello, ninguna conclusión multicentro debe darse por validada hasta ejecutar
un piloto desde Windows y revisar el informe generado.

## 10. Validaciones realizadas

### Base de datos

- Migraciones aplicadas en Supabase.
- Backfill exacto de 20.338 productos y 10 categorías.
- Cero diferencias frente al legado en precio, promoción y disponibilidad.
- RLS y grants comprobados.
- Ocultación comprobada al despublicar/no seleccionar un centro.
- Trigger de historial probado dentro de una transacción revertida.
- Advisors sin nuevos avisos Hipercor de seguridad ni FK sin índice.

### Código local

- 7 tests específicos de Hipercor correctos.
- `npx tsc --noEmit` correcto.
- `git diff --check` correcto.
- Pruebas unitarias de parsing postal, deduplicación, paridad, checkpoint y stale
  por clave compuesta.

No se ha realizado todavía:

- piloto Windows con varios CP;
- catálogo completo de un segundo centro;
- comparación exhaustiva entre centros;
- publicación de asociaciones postales;
- prueba E2E de la aplicación consumiendo el nuevo esquema.

## 11. Dimensión estimada

No se crearán 20.338 filas de producto por CP. La cardinalidad aproximada es:

```text
maestro ≈ unión de productos de todos los centros
estado local ≈ suma de productos disponibles en cada centro
mapa postal = una fila por CP y modalidad observados
```

Con 20.338 productos por centro como referencia:

| Centros únicos | Maestro estimado | Filas centro-producto aproximadas |
|---:|---:|---:|
| 5 | 20–25 mil | 101.690 |
| 10 | 20–30 mil | 203.380 |
| 25 | 20–35 mil | 508.450 |
| 50 | 20–40 mil | 1.016.900 |
| 100 | 20–45 mil | 2.033.800 |

Un millón de filas centro-producto es manejable en PostgreSQL con los índices
actuales. El riesgo principal de crecimiento es `hipercor_price_history`, sobre
todo si cambian masivamente disponibilidad o promociones.

Antes de una carga amplia se debe medir:

- número real de centros únicos;
- porcentaje de solapamiento de productos;
- diferencias de precio y disponibilidad;
- tamaño medio de la fila y de los índices;
- cambios históricos generados por ejecución;
- impacto en base, WAL y latencia.

Si los centros fueran casi idénticos, se podría estudiar un modelo futuro de
catálogo base más diferencias. No debe adoptarse sin evidencia porque complica
lecturas, stale, historial y auditoría.

## 12. Decisión: separar descubrimiento y sync rutinario

No es óptimo resolver miles de CP en cada sincronización de precios.

La arquitectura futura debe separar:

### Descubrimiento postal

- ejecución explícita, por lotes y poco frecuente;
- usa una lista pública de CP, nunca perfiles de usuarios;
- actualiza `hipercor_postal_centers`;
- descubre centros nuevos;
- conserva checkpoint e informe;
- revalida una muestra de CP que comparten centro.

### `CatalogOnly` rutinario

- consulta los centros ya validados en Supabase;
- toma un CP representativo por centro;
- descarga una vez cada centro;
- no recorre todos los CP;
- mantiene precio, promociones, disponibilidad e historial.

### Revalidación rotatoria

- revisa periódicamente algunos CP adicionales por centro;
- detecta un cambio de `store_id` o de huella;
- actualiza el mapa o bloquea la publicación si hay incoherencias.

El modo `CatalogOnly` todavía no está implementado. Esta es la principal
diferencia entre el prototipo local y la solución operativa definitiva.

## 13. Privacidad

- No se deben consultar ni exportar CP de `profiles` para construir cobertura.
- El censo debe proceder de una fuente postal pública y documentada.
- No se usan cuentas Hipercor, direcciones completas ni carritos.
- Los informes solo deben contener CP públicos, ids de centro y huellas técnicas.
- `service_role` permanece exclusivamente en `.env.local` del runner autorizado.

## 14. Plan de reanudación futuro

Cuando se decida continuar:

1. Implementar el modo `CatalogOnly` leyendo centros y CP representativos desde
   Supabase.
2. Elegir y documentar una fuente pública de CP españoles.
3. Ejecutar en Windows una resolución `LocationOnly` pequeña y sin publicación.
4. Revisar manualmente `hipercor-location-report.json`.
5. Confirmar al menos dos CP para un mismo centro y uno para un centro diferente.
6. Descargar 3–5 centros en `DRY_RUN`.
7. Medir unión, solapamiento, diferencias y almacenamiento.
8. Definir retención/particionado de `hipercor_price_history`.
9. Publicar primero un segundo centro con `selectable=false`.
10. Auditar recuentos, RLS, vistas e historial.
11. Activar el centro solo tras validación completa.
12. Implementar en la app la resolución CP → centro y el fallback seguro.
13. Mantener el catálogo legado hasta que una build publicada ya no dependa de él.

## 15. Criterios de aceptación futuros

No se considerará terminada la integración multicentro hasta cumplir todos estos
criterios:

- existe una fuente pública y reproducible de CP;
- cada CP publicado tiene estado explícito;
- cada centro publicado tiene un catálogo completo validado;
- ningún crawl cambia de centro durante la paginación;
- los CP deduplicados por centro superan la prueba de paridad;
- stale está acotado al centro;
- el historial tiene política de crecimiento;
- la app selecciona centro por CP y modalidad;
- existe fallback para CP desconocido o no soportado;
- tests E2E demuestran que dos centros pueden mostrar precios distintos sin
  mezclar datos;
- la retirada del legado tiene un plan compatible con las builds publicadas.

## 16. Comandos reservados para la futura reanudación

Estos comandos se documentan como referencia, pero no deben ejecutarse como carga
masiva hasta retomar formalmente el trabajo.

```powershell
# Resolver unos pocos CP sin escribir Supabase
.\scripts\run-hipercor-sync.ps1 -PostalCodes '28050,28051' -LocationOnly

# Resolver un fichero público de CP y publicar únicamente el mapa
.\scripts\run-hipercor-sync.ps1 `
  -PostalCodesFile .\datos\cp-hipercor.txt `
  -LocationOnly `
  -Publish

# Piloto limitado a dos centros
.\scripts\run-hipercor-sync.ps1 `
  -PostalCodes '28050,28051' `
  -MaxCenters 2

# Reanudar una ejecución interrumpida
.\scripts\run-hipercor-sync.ps1 `
  -PostalCodesFile .\datos\cp-hipercor.txt `
  -Resume
```

## 17. Referencias del repositorio

- Contexto general: `CONTEXTO.md`.
- Estado en vuelo: `HANDOFF.md`.
- Operación del sync: `scripts/README-hipercor-sync.md`.
- POC original: `scripts/README-hipercor-poc.md`.
- Script principal: `scripts/sync-hipercor.mjs`.
- Helpers: `scripts/lib/hipercor.mjs`.
- Runner Windows: `scripts/run-hipercor-sync.ps1`.
- Tests: `scripts/tests/hipercor-sync-resilience.test.mjs`.
- Migración principal:
  `supabase/migrations/20260923104530_hipercor_multicenter_catalog.sql`.
- Hardening:
  `supabase/migrations/20260923104854_hipercor_multicenter_hardening.sql`.
