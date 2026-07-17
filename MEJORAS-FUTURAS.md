# Mejoras futuras (post–App Store)

> Documento de planificación escrito el 2026-07-03, durante la espera de la publicación en la App Store.
> Recoge las tres grandes mejoras candidatas (A, B, C), el estado real del código en ese momento,
> la arquitectura de matching acordada y el orden de ejecución recomendado.

---

## Resumen ejecutivo

| Feature | Estado actual | Esfuerzo | Prioridad |
|---|---|---|---|
| **B. Comparador de precios** | Construido y desactivado por kill-switch | Bajo (reactivar + pulir matching) | **1º** |
| **A. Índice alimentario** | MVP UI Mercadona con Open Food Facts; fallback de visión aparcado | Medio (extender cobertura + persistencia) | **2º** |
| **C. Plato → cesta** | No existe; se apoya en A y B | Alto (feature nueva) | **3º** |

**El hilo común de las tres es el emparejamiento/relevancia de productos** — cualquier inversión ahí
paga tres veces. Ver la sección "Arquitectura de matching".

---

## B. Comparador de precios/productos

### Estado real
- El comparador está **implementado y apagado** mediante kill-switch: `PRICE_COMPARISON_ENABLED`
  en `src/constants/limits.ts` (se desactivó el 2026-06-13 junto con el paywall de QuéFalta Plus).
- Mientras el flag esté a `false`, `SimilarProductsSection` no se consulta ni se muestra.
  Reactivar = poner el flag a `true`.
- Existe una rama abierta `fix/similar-products-recall` que apunta al problema real pendiente:
  la **calidad del emparejamiento** entre súpers.

### Trabajo pendiente
1. Pulir el matching (ver "Arquitectura de matching" más abajo). Es el mismo problema que el
   Nivel 2 del ranking de búsqueda que quedó pendiente en `sort.ts`.
2. Poner `PRICE_COMPARISON_ENABLED = true`.
3. Decidir si vuelve como feature Plus o gratis (la monetización está pausada).

---

## A. Índice alimentario

### Estado real
- **MVP UI implementado en la ficha de Mercadona (2026-07-16):** Open Food Facts
  aporta nutrición, NOVA y Green-Score por EAN; el cliente calcula el índice
  0-100 con pesos dinámicos y muestra el desglose 1-10.
- Backend (visión sobre `photos[1].zoom` — etiqueta trasera — → Nutri-Score) **hecho y aparcado**
  en la rama `health-score-wip` (commit `37d903b`). Su fórmula 60/30/10 y la
  columna antigua `ean13` ya no coinciden con el índice actual: sirve como
  referencia para un futuro fallback, no debe integrarse tal cual.
- Cobertura de datos de ingredientes/nutrición por súper:

| Súper | Datos estructurados | Cómo |
|---|---|---|
| Mercadona | ❌ (solo foto de etiqueta) | Visión (Haiku) sobre la foto trasera |
| Dia | ✅ | JSON `vike_pageContext` (crawl incremental) |
| Carrefour | ✅ (el más rico) | JSON `__INITIAL_STATE__` (crawl incremental) |
| bonÀrea | ✅ (bilingüe es+ca) | HTML (crawl incremental) |
| Consum | ❌ DESCARTADO | Su web no lo expone |
| Bonpreu | ⏸️ PENDIENTE | Bloqueado por WAF; requeriría navegador headless |

Migraciones ya en el repo: `supabase/migrations/{carrefour,dia,bonarea}_product_detail.sql`.

### Idea clave: la visión solo hace falta en Mercadona
El algoritmo Nutri-Score es **público y determinista**: donde ya hay tabla nutricional
estructurada (Dia, Carrefour, bonÀrea) la nota se calcula **sin LLM, gratis y sin errores de OCR**.
La visión con Haiku queda solo para Mercadona (coste por producto, one-shot + incremental).

### Trabajo pendiente
1. Extender el índice a los otros súper con EAN o ficha nutricional estructurada.
2. Rediseñar el pipeline de visión como fallback para Mercadona sin ficha en
   Open Food Facts (usar `ean`, `source_wh` y la fórmula 60/25/15 actual).
3. Decidir si se precalcula/persiste para disponer del índice sin depender de
   una consulta en vivo a Open Food Facts.
4. (Opcional, caro) Bonpreu vía headless.

---

## C. Plato → cesta ("macarrones a la carbonara")

### Concepto
El usuario pide un plato y la app muestra las opciones de compra de sus ingredientes en los
súpers que tenga seleccionados, con tres rankings: **más económico / mejores productos /
mejor calidad-precio**.

### Por qué va la última: es la feature que junta A y B
1. **Plato → ingredientes genéricos** con cantidades ("carbonara" → pasta, huevos,
   guanciale/bacon, queso, pimienta). Lo hace un LLM pequeño **en runtime pero cacheado**:
   los platos populares se repiten muchísimo → precomputar/cachear recetas; el coste por
   petición tiende a cero. Solo el matching por súper es dinámico.
2. **Ingrediente → productos por súper**: reutiliza el buscador y el matching (mismo problema
   que B: "nata para cocinar" devuelve 40 resultados y hay que elegir bien).
3. **Rankings**: precio ya existe; la señal de "calidad" la da el health score (A);
   la comparación entre súpers es B.

Es la más diferenciadora (nadie del nicho en España lo hace bien) y la candidata perfecta a
feature Plus si se retoma la monetización: valor percibido alto, coste marginal por uso.

---

## Arquitectura de matching (decisión acordada)

**Pregunta que motivó esto:** ¿hace falta un LLM para que "leche semidesnatada Hacendado 1L"
empareje con equivalentes de otros súpers sin arrastrar la marca? ¿Habría que "entrenar un agente"?

**Respuesta: NO se entrena nada y NO hay agente en runtime.** El emparejamiento se consulta
miles de veces pero el catálogo solo cambia una vez por semana (syncs de los lunes), así que la
inteligencia se aplica **offline, una vez por producto**, y el runtime queda en SQL puro.

### Pipeline de 3 capas (de más tonta a más lista)

**Capa 1 — Reglas deterministas (resuelve ~80%, coste cero)**
- Diccionario de marcas blancas (~30 entradas): Hacendado/Bosque Verde/Deliplus → Mercadona,
  Dia, Carrefour Clásico/Extra, bonÀrea, Consum Basic, Bonpreu… → quitar la marca de la consulta.
- Regex de formatos ("1L", "6x1,5L", "500 g") → normalizar a €/litro o €/kg
  (parte ya existe por el fix de precios de Bonpreu).
- Resultado: "leche semidesnatada Hacendado 1L" → `tipo="leche semidesnatada", formato≈1L`.

**Capa 2 — Embeddings precalculadas (semántica sin entrenar nada)**
- Modelo de embeddings multilingüe ya entrenado (hay open source que corre gratis dentro del
  workflow de GitHub Actions del sync semanal).
- **pgvector** (nativo en Supabase): vector por nombre de producto, calculado en el sync
  (incremental).
- Runtime: "productos similares" = consulta SQL de similitud coseno filtrada por formato
  comparable. Milisegundos, coste cero por consulta.
- Bonus: resuelve el bilingüismo gratis ("leche semidesnatada" ≈ "llet semidesnatada").

**Capa 3 (opcional) — LLM solo como limpiador offline**
- Para nombres crípticos que sobrevivan a las capas 1-2: batch en el sync que extrae atributos
  estructurados `{tipo, variante, formato, marca}` de cada nombre; después el matching vuelve
  a ser comparación determinista de campos.
- Coste (referencia 2026-07): **Haiku 4.5** a $1/$5 por millón de tokens + **Batch API**
  (50% de descuento, pensada para esto). ~50.000 nombres ≈ pocos millones de tokens ≈
  **5-10 € una sola vez**, y céntimos/semana para los productos nuevos del sync incremental.

### Dónde SÍ tiene sentido un LLM en vivo
Solo en la feature C (plato → ingredientes), porque la entrada es lenguaje libre del usuario —
y aun así, cacheado por plato.

---

## Orden de ejecución recomendado

1. **B** — reactivar comparador + pulir matching (capas 1+2 sobre la rama
   `fix/similar-products-recall`). Esfuerzo mínimo; el matching es infraestructura para todo.
2. **A** — UI de la rama aparcada + Nutri-Score determinista en Dia/Carrefour/bonÀrea +
   run de visión en Mercadona.
3. **C** — cuando ya haya señal de precio (B) y de calidad (A) sobre las que rankear.
