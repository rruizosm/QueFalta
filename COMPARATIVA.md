# Comparativa de productos similares entre supermercados

> Spec de la funcionalidad: en el detalle de un producto, mostrar el **producto
> más parecido** en los supermercados que el usuario tiene activos en
> Preferencias (`profiles.catalog_stores`). Documento vivo para agentes y
> colaboradores. Mantener al día según se avanza por fases.

> Nota de evolución (2026-09-02): este documento conserva el diseño histórico.
> Para la futura versión estricta de «Buscar productos más económicos», usar
> [PROYECTO-COMPARADOR-ESTRICTO.md](PROYECTO-COMPARADOR-ESTRICTO.md) como plan
> maestro y [COMPARADOR-ESTRICTO.md](COMPARADOR-ESTRICTO.md) como auditoría.
> CE-1 exige mismo formato y variantes verificadas; no hereda la equivalencia
> entre tamaños distintos por €/kg o €/L descrita aquí. Aún no está implementado.
> El plan v1.1 permite desarrollar en el Supabase actual con controles; no exige
> backend separado. Aplicar cambios de BD no equivale a activar CE-1 para usuarios.
> CE-201/202 ya completaron la primera anotación 6.000/6.000 y localizaron un
> equivalente de producto íntegro. CE-203 ha congelado 1.336 casos ciegos para
> revisión del propietario, todavía 0/1.336; gold, evaluación y G2 siguen pendientes.

## Presentación de resultados actual (2026-08-22)

- La búsqueda bajo demanda muestra únicamente los supermercados con matches,
  agrupados en tarjetas con miniatura, nombre, precio de envase y precio por
  unidad. Las filas cuyo `is_cheaper` es verdadero llevan un distintivo verde.
- Si existen matches fiables pero ninguno tiene `is_cheaper=true`, la interfaz
  explica que el producto de origen ya es la opción más económica. Este caso no
  se trata como ausencia de equivalentes.
- Las miniaturas usan la caché compartida del catálogo y cada fila anuncia a
  accesibilidad el producto, la tienda y su precio. No cambia la RPC v5.

## Objetivo
Que al abrir un producto (p.ej. "Tomate frito Hacendado 400 g") el usuario vea su
**equivalente más parecido** en sus otras tiendas, con precio, para decidir dónde
comprar. No es "el mismo producto" (la marca blanca no existe entre cadenas), sino
**el parecido más cercano** dentro de la misma familia.

## Principios rectores (no romper)
1. **Parecido, no idéntico.** No hay clave común entre supers → el match es por
   nombre (fuzzy), y se enmarca en la UI como *"Producto similar en X"*.
2. **Mejor un hueco vacío que un parecido malo.** Un falso positivo destruye la
   confianza más de lo que aporta. Umbral alto + mostrar miniatura/nombre/formato
   para que el usuario juzgue.
3. **Server-side.** El matching vive en un RPC de Postgres (como `searchProducts`),
   no en el cliente: un round-trip, usa los índices `gin_trgm`.
4. **Respeta `catalog_stores`** desde el primer día y **excluye la tienda actual**.
5. **Precio justo o ninguno.** Comparar precio absoluto de 1 L vs 200 ml engaña →
   se compara **€/unidad** (€/kg, €/L) donde se tenga; si no, se avisa.

## Datos disponibles (espejos en Supabase)
| Tienda    | Tabla                 | Nombre+trgm | unit_price | €/unidad             | EAN     |
|-----------|-----------------------|:-----------:|:----------:|----------------------|:-------:|
| Mercadona | `mercadona_products`  | ✅ `display_name` | ✅ | ✅ `raw.price_instructions.reference_price/format` | ❌ |
| Bonpreu   | `bonpreu_products`    | ✅          | ✅         | ✅ `price_format` ("1,50 €/kg") | ❌ |
| Carrefour | `carrefour_products`  | ✅          | ✅         | ✅ `raw->>'price_per_unit'` (el `price_format` es absoluto) | ✅ `ean` |
| bonÀrea   | `bonarea_products`    | ✅          | ✅         | ✅ `raw->>'unitPrice'` (el `price_format` es absoluto) | ❌ |

**Conclusiones de datos:**
- **No hay match por código:** solo Carrefour trae `ean` (antes `ean13`); el resto no, y la marca
  blanca no comparte EAN entre cadenas. → matching por nombre.
- **€/unidad disponible en las cuatro** (Mercadona/Bonpreu en columna directa;
  Carrefour/bonÀrea dentro de `raw`). Es el **gran igualador**: un pack de 9×1 L y
  un brik de 1 L cuestan lo mismo por litro. Conviene materializarlo a columna en
  el sync (Fase 2) para ordenar/mostrar sin tocar `raw`.
- Los cuatro tienen índice `gin (display_name gin_trgm_ops)`.

## Técnica de matching
1. **Limpiar** el nombre del producto origen ("needle"): minúsculas, quitar marca
   (Hacendado/Bonpreu/Carrefour…) y tokens de tamaño ("400 g", "1 l", "pack 6").
   Solo se limpia el needle, **no** los candidatos.
2. **Filtrar por familia = TODAS las palabras del núcleo presentes** en el nombre
   (no solo una). "leche entera" exige "leche" **y** "entera" → fuera "café con
   leche", "leche perro", "gel de leche y miel". `word_similarity ≥ umbral` a secas
   es **demasiado flojo** (deja pasar cualquier cosa con "leche") — fue el bug que
   destapó el spike. Sin taxonomía común entre supers, esto da la precisión que la
   categoría no puede (cada super tiene su árbol, sin mapeo).
3. **Ordenar por `€/unidad` ASC** (el equivalente más barato de la familia, que es
   lo que se muestra). ⚠️ Ordenar por nombre NO vale: `word_similarity` se satura y
   `similarity()` arrastra artefactos (marca larga demota al barato; nombres
   idénticos empatan). **Desempate:** `similarity(nombre)`, luego `unit_price` asc.
   ⚠️ El €/unidad **solo es comparable en la misma base** (€/L vs €/ml vs €/kg vs
   €/ud): mezclarlas miente (un gel a 0,01 €/ml "gana" a leche a 0,96 €/l). Hay que
   normalizar a base canónica — por eso es columna del sync, no parseo de texto.
4. **Top-1 por tienda.** Sin candidatos en la familia → "sin equivalente".

> Validado en el spike (Fase 0), que reveló los dos fallos clave: filtro de familia
> flojo y mezcla de bases de unidad. Ambos se cierran con el filtro "todas las
> palabras" + el €/unidad numérico normalizado de Fase 1a.

---

## Fases

### Fase 0 — Validar el matching (spike) · ✅ hecho
**Objetivo:** confirmar el matching antes de tocar UI.
- **Resultado:** la cobertura por nombre funciona. Aprendizajes: `word_similarity`
  se satura (solo sirve de gate de familia) y el ranking por nombre arrastra
  artefactos (marca larga demota al barato; nombres idénticos empatan). **Decisión
  de producto:** mostrar el **equivalente más barato por €/unidad** de la familia.
  El spike (`spike-similar-products.sql`) ya ordena por €/unidad.
- **Pendiente menor:** correr ~20 productos para fijar el **umbral** definitivo.

### Fase 1a — €/unidad numérico en los syncs (cimiento) · ~1–2 días
**Objetivo:** que el €/unidad sea una **columna numérica con base canónica** fiable
en las cuatro tablas — es la señal que ORDENA, no solo se muestra.
- **Datos:** `price_per_unit numeric` + `price_per_unit_unit text` ('l'|'kg'|'ud')
  en cada espejo (`migrations/catalog_price_per_unit.sql`). Base canónica: líquidos
  →€/L, peso →€/kg, conteo →€/ud (ml/cl/g se convierten) → arregla el "0,01 €/ml".
- **Syncs:** helper compartido `scripts/lib/price.mjs` (normaliza valor+unidad) y
  poblarlas en cada `sync-*.mjs` desde el dato estructurado:
  Mercadona `price_instructions.reference_price/format`, Bonpreu `unitPrice.{amount,unit}`,
  bonÀrea `unitPrice`+`euroUnit`, **Carrefour `price_per_unit`** (el hueco: inconsistente).
- **Se valida cuando:** los cuatro espejos tienen €/unidad canónico poblado y se
  mide el % de NULLs (sobre todo Carrefour).

### Fase 1b — MVP: el más barato por super en un modal · ~1–2 días
**Objetivo:** ver el equivalente más barato en el detalle, respetando preferencias.
- **Backend:** RPC `similar_products(p_id, p_store, p_stores)` → limpia el nombre,
  filtra familia con `word_similarity ≥ umbral`, **ordena por €/unidad asc**
  (desempate: nombre más cercano, luego pack más pequeño), top-1 por tienda.
- **Cliente/UI:** sección **"Más barato en…"** en `ProductDetailModal`. Respeta
  `catalogStores`, **excluye la tienda actual**, miniatura + nombre + **€/unidad** +
  precio, abre el detalle al tocar. Estado **"Sin equivalente"**.
- **Gate Plus actual:** una cuenta gratuita ve el CTA con candado, pero al
  pulsarlo abre el paywall sin ejecutar la RPC. La redacción `locked` del
  servidor se conserva como defensa para clientes antiguos.
- **Nombre comercial en el paywall:** «Radar de ahorro», descrito como la
  búsqueda de alternativas similares más baratas en los supermercados elegidos.
- **Se valida cuando:** funciona end-to-end en Mercadona y los matches convencen
  con básicos. **Aquí se prueba la hipótesis de producto.**

### Fase 2 — Cobertura total · ~1 día
**Objetivo:** la misma sección en los otros tres detalles.
- **Cliente/UI:** sección en `BonpreuProductModal`, `CarrefourProductModal` y
  `BonareaProductModal`. Badge €/unidad; "precio a DD/MM" (frescura del espejo).
- **Se valida cuando:** aparece en cualquier detalle. ← *feature completa y honesta.*
  Depende de 1a + 1b.

### Fase 3 — Calidad del match · ~2–4 días · solo si hay uso
**Objetivo:** subir precisión, reducir falsos positivos.
- **Backend/datos:** mejor stripping de marca, ranking **consciente del tamaño**
  (prefiere formato parecido), sinónimos curados. Opción potente: **embeddings +
  pgvector** generados en el sync + tabla precomputada `product_matches` (instantánea
  y curable a mano).
- **Se valida cuando:** baja la tasa de "match raro". **No meterse en embeddings
  antes de tener uso real.**

### Fase 4 — El gancho: optimización de cesta · ~3–5 días
**Objetivo:** *"Tu lista sale más barata en Mercadona (−4,20 €)"*.
- **Backend:** agregar sobre `list_items`, resolver match por ítem (reutiliza Fase 3),
  sumar total por super.
- **Cliente/UI:** resumen en la pantalla de lista con total por cadena + ahorro.
- **Se valida cuando:** el cálculo es coherente y la gente abre la app para verlo.
  **Es la retención de verdad.**

## Dependencias
```
Fase 0 (✅ validado, decisión: más barato €/unidad)
  └─> Fase 1a (€/unidad numérico en los 4 syncs)   ← cimiento
        └─> Fase 1b (RPC + UI, valida producto)
              └─> Fase 2 (cobertura en los 4 modales)   ← feature completa
                    ├─> Fase 3 (calidad)   [opcional, según uso]
                    └─> Fase 4 (cesta)     [el gancho; mejor con Fase 3]
```

## Estado
- ✅ **Fase 0:** matching validado. Decisión: mostrar el **más barato por €/unidad**
  de la familia. Pendiente menor: correr ~20 productos para fijar el umbral.
- ✅ **Fase 1a (backfill real hecho):** columnas pobladas por los syncs (commit
  `23aed72` + fix bonÀrea `74787ea`). Cobertura real: Carrefour 16.143/16.547
  (97,5%), Bonpreu OK (leche 0,96 €/L). ⚠️ bonÀrea: el fix de la base (la base va
  en el sufijo de `unitPrice`, NO en `euroUnit`, que es la unidad del precio de
  VENTA: "€/u." para un brik o un pollo por pieza) está pusheado pero **falta
  re-lanzar su workflow** para re-poblar (mientras, casi todo sale 'ud').
- ✅ **Fase 1b (funcionando end-to-end):** RPC `migrations/similar_products.sql`
  aplicado y validado vía REST (leche entera → 3 tiendas, €/L correctos, ~1–3,5 s;
  el 1er hit tras un sync masivo puede dar statement timeout por plan frío).
  `fetchSimilarProducts()` en `api/catalog.ts` + sección en `ProductDetailModal`.
- ✅ **Fase 2 (código hecho):** sección extraída a `SimilarProductsSection`
  (componente compartido con su propio estado/efecto/estilos) y cableada en los
  4 modales, cada uno excluyendo su tienda (`mercadona`/`esclat`/`carrefour`/
  `bonarea`). `tsc --noEmit` limpio. Falta probar en la app.
- 🔧 **Mejora del needle (pendiente de aplicar en SQL Editor):** el test inverso
  ("BONPREU Leche entera en cartón" → `[]`) destapó que las palabras de ENVASE
  (cartón/brik/botella/lata…) y los paréntesis ("(Mantener refrigerado)") rompen
  el filtro todas-las-palabras. `catalog_clean_name` ya los quita en la migración
  actualizada — **re-ejecutar `similar_products.sql`**.
- 🔧 **Recall del filtro de familia (pendiente de re-ejecutar en SQL Editor):** el AND
  de "todas las palabras" dejaba huecos entre cadenas (la marca blanca nombra el
  mismo producto distinto en cada súper): p.ej. "salsa original ligeresa" no casaba
  con "salsa fina ligeresa" ni con "mayonesa sabor original ligeresa". Se sustituye
  `catalog_has_all_words` por `catalog_family_match` (permite que falte 1 palabra
  del núcleo; needles de 2 palabras siguen exigiendo las 2). Sin migración de datos:
  es solo lógica de query. **Re-ejecutar `similar_products.sql`.** Si aparecen
  falsos positivos, el siguiente dial es Fase 3 (embeddings).
- ⬜ Fases 3–4: sin empezar. Fase 3 (match semántico por embeddings + pgvector +
  tabla `product_matches` precomputada en el sync) es la solución de fondo para la
  variación de nombre entre cadenas; el filtro léxico de arriba es el puente.
