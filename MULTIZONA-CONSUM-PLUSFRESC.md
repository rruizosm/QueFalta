# Multi-zona en Consum y Plusfresc — sondeo en vivo (2026-07-16)

> Investigación de si Consum y Plusfresc regionalizan **surtido** y/o **precio** por
> zona/tienda, como hacen Carrefour (catálogo+precio por CCAA) y Dia (disponibilidad
> por CCAA). Todo lo de abajo está **verificado contra las APIs en vivo** el
> 2026-07-16. Contexto general del filtro por comunidad: `COMUNIDAD-AUTONOMA.md`.

## TL;DR

## Implementación (2026-07-16)

- `sync-consum.mjs` barre València, Barcelona, Murcia, Albacete y Almería con
  `X-TOL-ZONE`; guarda `regions` por CCAA y `regional_prices` por zone id. Requiere
  ejecutar `supabase/migrations/consum_regions.sql`.
- `sync-plusfresc.mjs` barre los ocho centros, conserva Lleida 12 como referencia
  y guarda `centers` (disponibilidad) y `center_prices` (override). El mapa exacto
  CP→centro de `zones/zipcodes` vive en `src/constants/retailerZones.ts`.
- `catalog.ts` aplica la disponibilidad y el precio al buscar, navegar por
  categorías, abrir el detalle y navegar el listado alfabético. Un CP no cubierto
  conserva el catálogo/precio de referencia, sin falsos negativos.

| | Plusfresc | Consum |
|---|---|---|
| ¿Regionaliza surtido? | **Sí, por centro** (8 centros; cada uno con 190–400 exclusivos; Tàrrega −16%) | **Sí, por zona** (~2% Valencia↔anónimo, ~11% Valencia↔Barcelona) |
| ¿Regionaliza precio? | **Sí, 2 zonas de precio**: provincia BCN ~2,4% de refs más caras (casi todo Frescos, media +3%) | **Casi no**: ~0,1–0,9% de refs; lo gordo es Barcelona +15–20% en refrescos (impuesto azúcar catalán) y mostrador de frescos |
| ¿Qué baja nuestro sync hoy? | Centro **12** (Lleida Cap Pont) = default de la propia web | Zona **anónima del servidor** ≈ surtido Valencia (98% solape) |
| Coste de barrer todo | **Ridículo**: 1 petición de catálogo × 8 centros | Bajo: ~95 páginas × zona (4-9 zonas relevantes) |
| ¿Urge cambiar algo? | No — precios correctos para Lleida/Tarragona; BCN desviada en ~175 refs | No — precios válidos salvo bebidas azucaradas en Catalunya |

---

## Plusfresc (15º espejo)

### Cómo territorializa

Supsa opera ~77 tiendas físicas pero la compra online sale de **8 centros de
preparación**, todos en Catalunya. El CP del usuario decide su centro
(`GET utils/{cp}/centre` → centerid; `0` = sin servicio) y **todo el catálogo y los
precios se sirven por centro** (el `{centro}` va en cada URL de la API).

Los 8 centros online (`GET zones/preparationcenters` / `GET utils/centres`):

| centerid | Centro | Zona de reparto (`zones/zipcodes`) |
|---|---|---|
| 3 | Barcelona (Via Augusta, 188) | Zona Barcelona (08006–08037) |
| **12** | **Lleida "Ciutat Elisis" (Camí de Picos, 6)** — **el que sincronizamos** | Zona Lleida |
| 17 | Mollerussa | Zona Mollerussa |
| 33 | Tarragona (Av. Roma, 11) | Zona Tarragona (43xxx) |
| 36 | Tàrrega | Zona Tàrrega |
| 58 | Manresa (Pg. Pere III, 89-91) | Zona Manresa |
| 61 | Balaguer | Zona Balaguer |
| 110 | Terrassa (Francesc Salvans, 71) | Zona Terrassa |

(Hay un 9º "centro" `127899871` = **locker Gardeny** con `TipoRecogida=1`, no es un
catálogo aparte.)

La propia SPA usa centro **12 como default** si el usuario aún no dio CP
(`localStorage.centerId ?? "12"`) → nuestra elección de referencia coincide con la
de la web.

### Surtido por centro (medido, catálogo completo de los 8)

| Centro | Únicos | Compartidos con 12 | Solo en este | Solo en 12 |
|---|---|---|---|---|
| 12 Lleida | 7.313 | — | — | — |
| 3 Barcelona | 7.443 | 7.044 | 399 | 269 |
| 17 Mollerussa | 7.410 | 7.066 | 344 | 247 |
| 33 Tarragona | 7.084 | 6.802 | 282 | 511 |
| 36 Tàrrega | 6.345 | 6.155 | 190 | **1.158** |
| 58 Manresa | 7.409 | 7.061 | 348 | 252 |
| 61 Balaguer | 7.520 | 7.219 | 301 | 94 |
| 110 Terrassa | 7.518 | 7.156 | 362 | 157 |

- Ningún centro es superconjunto (a diferencia de Condis 718): **todos** tienen
  exclusivos, sobre todo fruta/verdura/frescos.
- **Tàrrega es el catálogo pequeño**: le falta ~16% de lo que tiene Lleida.
- La unión de los 8 daría ~8.000+ únicos vs los 7.3k que capturamos hoy.

### Precio por centro: 2 zonas de precio

| Comparación vs centro 12 | Refs con precio distinto | % de compartidos |
|---|---|---|
| 17 Mollerussa · 33 Tarragona · 36 Tàrrega · 61 Balaguer | **0** | 0,0% |
| 3 Barcelona | 165 | 2,3% |
| 58 Manresa | 171 | 2,4% |
| 110 Terrassa | 170 | 2,4% |

Es decir: **precios idénticos en Lleida+Tarragona**, y una **zona "provincia de
Barcelona"** (Barcelona, Manresa, Terrassa) con ~170 refs más caras. Caracterización
de las diferencias 12↔3 (Barcelona):

- Por N1: **140 Frescos**, 14 Alimentación, 6 Limpieza y Hogar, 3 Cuidado Personal, 2 Congelados.
- 159 de 165 **más caras** en Barcelona; media |Δ| **3,1%**, máx 25,1% (un Ambi-Pur
  outlier; la fruta/verdura típica sube ~0,06 € ≈ +3–7%).
- **Ofertas idénticas** en los 8 centros (0 difs de `new_value_cents`).

### Implicaciones para QuéFalta

- Lo que mostramos hoy (centro 12) es **exacto para Lleida y Tarragona** y correcto
  al 97,6% para usuarios de la provincia de Barcelona.
- Si algún día se quiere afinar: el barrido completo son **8 peticiones de catálogo**
  (una por centro, ~7,5k filas cada una) → cabría en el sync actual casi gratis, con
  el patrón Carrefour (`regions text[]` no aplica — todo es ES-CT — pero sí un
  `center_prices jsonb` o simplemente unión de surtido). No urge.

### Chuleta de la API (para replicar)

```
POST https://wscompra.plusfresc.cat/api/loginGuest/{centro}      → JWT invitado (30 min)
GET  .../api/utils/centres                                        → los 8 centros + locker
GET  .../api/utils/{cp}/centre                                    → CP → centerid ("0" = sin servicio)
GET  .../api/zones/zipcodes                                       → CPs por zona de reparto
GET  .../api/zones/preparationcenters                             → centros de preparación
GET  .../api/products/category/Root/{centro}                      → catálogo ENTERO del centro
GET  .../api/categories/tree/{centro}/Root                        → árbol bilingüe del centro
```

---

## Consum (5º súper)

### Cómo territorializa: cabecera `X-TOL-ZONE`

La API pública (`tienda.consum.es/api/rest/V1.0`) sirve la zona vía **cabecera HTTP**,
sin cookies ni sesión:

- **`X-TOL-ZONE: {zoneId}`** → la que **cambia catálogo y precios**. Con ella sola basta.
- `X-TOL-SHIPPING-ZONE: {zoneId}{D|T}` → irrelevante para el catálogo (solo para
  carrito/slots de entrega en la web).
- Sin cabecera → **zona default del servidor** (la que baja nuestro sync). En el
  bundle de la SPA: `defaultZoneId: 1, defaultZipCode: "08006", defaultShippingZoneId: "1D"`,
  pero ojo: pedir `X-TOL-ZONE: 1` explícita devuelve **totalCount=0**; el default
  anónimo real lo resuelve el servidor y su surtido es ≈ Valencia (98% de solape).

El CP se resuelve a zona con (sin auth):

```
GET /api/rest/V1.0/shipping/area?shippingMethod=D,X,T,L&showDisableStore=false&zipCode={cp}
→ [{ shippingZoneId: "147D", zone: { id: 147 }, deliveryTypeId: "D", ... }]
```

Zonas resueltas en el sondeo (1 por CP de prueba, patrón ≈ 1 zona por provincia):

| CP | Ciudad | zoneId |
|---|---|---|
| 46001 | Valencia | **147** (+ recogida 582T) |
| 46701 | Gandia | 658 |
| 12001 | Castellón | 1077 |
| 03001 | Alicante | 154 |
| 30001 | Murcia | 495 |
| 02001 | Albacete | 1105 |
| 04001 | Almería | 254 |
| 08201 | Sabadell (BCN) | 575 |
| 43700 | El Vendrell (TGN) | **sin servicio** (0 áreas) |

⚠️ Consum online **no cubre todo su mapa de tiendas**: El Vendrell da 0 áreas de
reparto. El "dónde hay servicio" es por CP, no por provincia entera.

### Surtido por zona (medido, catálogo completo de 4 zonas)

| Zona | totalCount | Con oferta |
|---|---|---|
| Anónima (la del sync) | 9.378 | 1.295 |
| Valencia (147) | 9.469 | 1.301 |
| Barcelona (575) | 9.428 | 1.296 |
| Murcia (495) | 9.344 | 1.228 |

- Anónima ↔ Valencia: 9.190 compartidos (188/279 exclusivos) → **el sync baja
  ~98% del surtido valenciano**.
- Valencia ↔ Barcelona: ~8.358 compartidos, **1.111/1.070 exclusivos (~11% de churn)**
  (regionales: mistela D.O. Valencia solo en VLC; algunas cervezas/refrescos solo BCN…).
- Valencia ↔ Murcia: ~8.667 compartidos (802/677 exclusivos).

### Precio por zona: casi uniforme, con 2 excepciones

| Comparación | Refs precio distinto | % | Patrón |
|---|---|---|---|
| Valencia vs anónima | 11 | 0,1% | mostrador frescos (carne/queso) |
| Murcia vs anónima | 17 | 0,2% | mostrador frescos (carne/pescado), máx +117% (codillo) |
| **Barcelona vs Valencia** | **71** | **0,8%** | **70 de 71 MÁS caras; refrescos/bebidas +15–20%** |

Las subidas de Barcelona son sistemáticas y casi exclusivas de bebidas (cola +18,6%,
tónica +18,9%, té +18%, isotónica +20%, energética +16,9%, soja-chocolate +15,6%)
→ **encaja con el impuesto catalán a las bebidas azucaradas envasadas (IBEE)**, que el
distribuidor repercute en el PVP en Catalunya. El resto de diferencias son mostrador
de frescos (pescado/carne, difieren por lonja/origen). Ofertas prácticamente
idénticas entre zonas (solo 3 refs con oferta distinta).

### Implicaciones para QuéFalta

- El catálogo que servimos ≈ **surtido de Valencia** con precios válidos para toda la
  huella **salvo** (a) bebidas azucaradas para usuarios catalanes (~70 refs, +15–20%) y
  (b) un puñado de frescos de mostrador.
- Si algún día se quiere multi-zona: patrón Dia/Carrefour directo —
  `X-TOL-ZONE` por zona (¡una cabecera, sin navegador ni cookies!), ~95 páginas por
  zona; con las 8-9 zonas de arriba se cubriría la huella entera
  (`regions text[]` + `regional_prices jsonb`). Habría que enumerar CPs de más
  provincias (Andalucía interior, Castilla-La Mancha…) vía `shipping/area` para
  completar el mapa de zonas. No urge: <1% de refs afectadas.

---

## Metodología

- Sondeo 2026-07-16 con scripts Node de un solo uso (fetch puro, sin escribir en BD).
- **Plusfresc**: catálogo completo de los 8 centros (`products/category/Root/{c}`),
  dedup por `item_id` con la misma lógica del sync (`copia primaria = hoja numérica`),
  comparación por producto de `value_cents`, `value_x_unit` y `new_value_cents`.
  Endpoints de zonas descubiertos en el bundle Angular de `compra.plusfresc.cat`
  (main.f95f44ede6e7ea21bf6f.js).
- **Consum**: cabeceras `X-TOL-*` y endpoint `shipping/area` descubiertos en los
  chunks perezosos de `tienda.consum.es` (main-64AJZYUW.js + 81 chunks); catálogo
  completo paginado (`/catalog/product?offset&limit=100`) por zona con
  `X-TOL-ZONE`, comparación de `centAmount` (OFFER_PRICE ?? PRICE) por `code`.
- Los % de "precio distinto" son sobre productos compartidos entre las dos zonas
  comparadas. Los frescos de mostrador fluctúan a diario: las cifras exactas de esas
  refs son foto del día, el patrón es lo estable.
