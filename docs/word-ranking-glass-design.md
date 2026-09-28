# Ranking general · fila desde el 4.º puesto

Referencia: `image.png` facilitada por el usuario. La barra no representa progreso: es la superficie que oculta foto, nombre, aciertos y puntuación a quienes no tienen Plus. El número `#n` permanece fuera del material y siempre es legible. Podio y Grupo no reciben este efecto.

## Especificación

| Propiedad | Claro | Oscuro |
| --- | --- | --- |
| Fila | 72 pt mínimo; separación entre `#n` y barra de 10 pt | Igual |
| Barra | 48 pt mínimo, radio 16 pt, padding horizontal 12 pt | Igual |
| Base translúcida | `rgba(231,242,255,.54)` | `rgba(24,41,66,.58)` |
| Tinte azul, de izquierda a derecha | `rgba(126,182,255,.42)` → `rgba(197,223,255,.28)` al 42 % → `rgba(197,223,255,.03)` | `rgba(79,141,225,.32)` → `rgba(104,155,223,.18)` al 42 % → `rgba(104,155,223,.03)` |
| Blur del contenido real | `expo-blur` 88/100; equivalente web orientativo: `backdrop-filter: blur(18px) saturate(1.08)` | Igual, con material ultra fino oscuro |
| Stroke | 1 pt `rgba(86,142,211,.18)` | 1 pt `rgba(220,237,255,.24)` |
| Highlight | Diagonal `rgba(255,255,255,.28)` → transparente; trazo interior de 1 pt arriba a la izquierda, blanco .34 | Diagonal blanco .16 → transparente; trazo blanco .24 |
| Sombra | `0 6px 18px rgba(49,92,142,.08)` | `0 6px 18px rgba(0,0,0,.10)` |
| Grano | Patrón de 9 × 9 pt con tres puntos de 1 pt al 1,2–1,8 % de opacidad | Igual, en blanco |
| Número | Space Grotesk 18 pt, tracking −0,35 pt; `#` Medium `#74695F`, cifra Bold `#2B2521` | `#` `#B3A895`, cifra `#F2EBE0` |

El contraste del `#` es 5,35:1 en blanco y 6,87:1 en oscuro; el de la cifra es 15,12:1 y 13,61:1. El blur cubre el contenido privado completo, incluida la puntuación, y la etiqueta de accesibilidad de la barra anuncia solo `#n`. Si en el futuro se añade un valor que deba leerse, se coloca **por encima** de las capas de blur y tinte, con contraste AA verificado.

La base mantiene una tonalidad fría en todo el ancho. El color azul se atenúa por alfa hasta transparente; no hay un stop blanco opaco. El blur nativo actúa sobre el contenido real, mientras el borde, el highlight y la sombra separan la cápsula del fondo. El grano de 1–2 % reduce el banding sin parecer textura visible.

La barra abre Plus al pulsarla. Hover la eleva 1 pt y refuerza la sombra; pressed la baja 1 pt y reduce la opacidad a .96. La selección de la fila propia solo se usa cuando Plus muestra la identidad, de forma que una cuenta gratuita no descubre cuál es su fila.

## Tokens CSS equivalentes

```css
:root {
  --rank-row-min-height: 72px;
  --rank-gap: 10px;
  --rank-glass-min-height: 48px;
  --rank-glass-radius: 16px;
  --rank-glass-padding-inline: 12px;
  --rank-glass-blur: 18px;
  --rank-ink: #2b2521;
  --rank-hash: #74695f;
  --rank-glass-surface: rgba(231, 242, 255, .54);
  --rank-glass-border: rgba(86, 142, 211, .18);
  --rank-glass-tint-a: rgba(126, 182, 255, .42);
  --rank-glass-tint-b: rgba(197, 223, 255, .28);
  --rank-glass-tint-c: rgba(197, 223, 255, .03);
  --rank-glass-highlight: rgba(255, 255, 255, .34);
  --rank-glass-shadow: 0 6px 18px rgba(49, 92, 142, .08);
  --rank-glass-selected: rgba(47, 108, 181, .30);
  --rank-grain-color: #285f9c;
}

[data-theme="dark"] {
  --rank-ink: #f2ebe0;
  --rank-hash: #b3a895;
  --rank-glass-surface: rgba(24, 41, 66, .58);
  --rank-glass-border: rgba(220, 237, 255, .24);
  --rank-glass-tint-a: rgba(79, 141, 225, .32);
  --rank-glass-tint-b: rgba(104, 155, 223, .18);
  --rank-glass-tint-c: rgba(104, 155, 223, .03);
  --rank-glass-highlight: rgba(255, 255, 255, .24);
  --rank-glass-shadow: 0 6px 18px rgba(0, 0, 0, .10);
  --rank-glass-selected: rgba(140, 186, 246, .38);
  --rank-grain-color: #fff;
}

.rank-row { display: flex; align-items: center; gap: var(--rank-gap); min-height: var(--rank-row-min-height); }
.rank-number { min-width: 38px; color: var(--rank-ink); font: 700 18px/1 "Space Grotesk", sans-serif; letter-spacing: -.35px; }
.rank-number__hash { color: var(--rank-hash); font-weight: 500; }
.rank-glass {
  position: relative; isolation: isolate; flex: 1; min-height: var(--rank-glass-min-height);
  padding-inline: var(--rank-glass-padding-inline); overflow: hidden;
  border: 1px solid var(--rank-glass-border); border-radius: var(--rank-glass-radius);
  background: var(--rank-glass-surface); box-shadow: var(--rank-glass-shadow);
  transition: transform 160ms ease, box-shadow 160ms ease, opacity 160ms ease;
}
.rank-glass__source { position: relative; z-index: 0; }
.rank-glass::before {
  content: ""; position: absolute; inset: 0; z-index: 1;
  background: var(--rank-glass-surface);
  -webkit-backdrop-filter: blur(var(--rank-glass-blur)) saturate(1.08);
  backdrop-filter: blur(var(--rank-glass-blur)) saturate(1.08);
}
.rank-glass::after {
  content: ""; position: absolute; inset: 0; z-index: 2; pointer-events: none;
  background: linear-gradient(100deg, var(--rank-glass-tint-a), var(--rank-glass-tint-b) 42%, var(--rank-glass-tint-c));
  -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 42%, transparent 100%);
  mask-image: linear-gradient(90deg, #000 0%, #000 42%, transparent 100%);
}
.rank-glass__highlight { position: absolute; z-index: 3; top: 1px; left: 12px; width: 45%; height: 1px; background: var(--rank-glass-highlight); }
.rank-glass__grain {
  position: absolute; z-index: 4; inset: 0; pointer-events: none; color: var(--rank-grain-color); opacity: .018;
  background-image: radial-gradient(circle at 1px 2px, currentColor .5px, transparent .6px),
    radial-gradient(circle at 6px 5px, currentColor .5px, transparent .6px);
  background-size: 9px 9px;
}
.rank-glass__foreground { position: relative; z-index: 5; color: var(--rank-ink); }
@media (hover: hover) { .rank-glass:hover { transform: translateY(-1px); } }
.rank-glass:active { transform: translateY(1px); opacity: .96; }
.rank-row[aria-selected="true"] .rank-glass { outline: 2px solid var(--rank-glass-selected); outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .rank-glass { transition: none; } }
```

## Prompt de edición del mockup (inglés)

> Edit the provided ranking-row screenshot. Preserve its exact composition, white background, single “#4” on the left and one empty horizontal rounded bar on the right. Do not add icons, badges, labels, percentages, extra rows, or progress indicators. Align the optical center of “#4” with the bar; use a fixed 10 px gap. Set the bar to approximately 48 px high with a 16 px corner radius and balanced 12 px horizontal inset. Render “#” in Space Grotesk Medium and “4” in Space Grotesk Bold, 18 px equivalent, with slightly negative tracking; use #74695F for the hash and #2B2521 for the digit, preserving AA contrast. Replace the current blue-to-white fade with a refined translucent cool-blue glass surface: a soft rgba(231,242,255,.54) base, real 18 px backdrop blur, and an alpha-masked blue tint that starts at rgba(126,182,255,.42), reaches rgba(197,223,255,.28) around 42%, and dissolves to near-transparent blue at the right edge. The end must reveal the background material, never become painted opaque white. Add a 1 px rgba(86,142,211,.18) stroke, a restrained upper-left white inner highlight, subtle 1–2% micrograin to prevent banding, and a soft 0 6px 18px rgba(49,92,142,.08) shadow. Keep the glass clean, thin, and tactile, with no bloom, muddy Gaussian haze, neon, heavy skeuomorphism, or 2018-style gradient. If any content is placed inside the bar later, render that readable content above the blur and verify AA contrast. Output a crisp 2025–2026 product UI mockup consistent with Apple HIG and a restrained Linear/Raycast level of craft.

Para la variante oscura, conservar la misma geometría y sustituir únicamente los tokens de la tabla y el bloque `[data-theme="dark"]`.
