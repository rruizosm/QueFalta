// Nota de salud 0-100 estilo Yuka (NO es Yuka: su fórmula y clasificación de
// aditivos son suyas; esto es un equivalente propio sobre fuentes públicas).
// Función PURA: la usa el extractor para precalcular el score y guardarlo; la app
// solo lee. Una sola implementación, aquí, en el sync.
//
// Tres componentes, como Yuka:
//   60% Calidad nutricional → Nutri-Score 2023 (algoritmo oficial general-foods),
//        mapeado a 0-100. Estimado cuando falta fibra/% fruta (se asume 0 = peor caso).
//   30% Aditivos → desde la lista de ingredientes (E-números + nombres comunes en
//        castellano) con una tabla de riesgo pública; el PEOR aditivo marca el techo.
//   10% Ecológico → bonus si es bio.
//
// Entrada: { kcal, kj, grasas, saturadas, hidratos, azucares, fibra, proteinas, sal }
//   (valores por 100g; null si la etiqueta no lo trae) + ingredients (texto) + flags.
// Salida: { score, grade, nutriScore, components, breakdown[] } o null si no hay tabla.

// ── Tablas Nutri-Score 2023 (alimentos generales) ───────────────────────────
// Cada tabla: lista de [umbral_máx_inclusive, puntos]; el último es el "resto".
const T_ENERGY = [[335,0],[670,1],[1005,2],[1340,3],[1675,4],[2010,5],[2345,6],[2680,7],[3015,8],[3350,9],[Infinity,10]];
const T_SUGAR  = [[3.4,0],[6.8,1],[10,2],[14,3],[17,4],[20,5],[24,6],[27,7],[31,8],[34,9],[37,10],[41,11],[44,12],[48,13],[51,14],[Infinity,15]];
const T_SATFAT = [[1,0],[2,1],[3,2],[4,3],[5,4],[6,5],[7,6],[8,7],[9,8],[10,9],[Infinity,10]];
const T_SALT   = [[0.2,0],[0.4,1],[0.6,2],[0.8,3],[1.0,4],[1.2,5],[1.4,6],[1.6,7],[1.8,8],[2.0,9],[2.2,10],[2.4,11],[2.6,12],[2.8,13],[3.0,14],[3.4,15],[3.8,16],[4.2,17],[4.6,18],[5.0,19],[Infinity,20]];
const T_PROTEIN= [[2.4,0],[4.8,1],[7.2,2],[9.6,3],[12,4],[14,5],[17,6],[Infinity,7]];
const T_FIBER  = [[3.0,0],[4.1,1],[5.2,2],[6.3,3],[7.4,4],[Infinity,5]];

const pts = (table, v) => { for (const [max, p] of table) if (v <= max) return p; return table[table.length - 1][1]; };

// ── Aditivos: tabla de riesgo (subconjunto frecuente en súpers ES) ───────────
// Niveles estilo Yuka: 'evitar' > 'moderado' > 'limitado' > 'sin'. Claves por
// E-número y por nombre normalizado (sin acentos, minúsculas). Lista pública,
// ampliable sin migrar datos. Los E-números no listados → 'limitado' por defecto.
const ADDITIVE_RISK = {
  // edulcorantes
  e950: 'moderado', 'acesulfamo': 'moderado', 'acesulfamo-k': 'moderado', 'acesulfame': 'moderado',
  e951: 'moderado', 'aspartamo': 'moderado',
  e952: 'evitar', 'ciclamato': 'evitar',
  e954: 'evitar', 'sacarina': 'evitar',
  e955: 'moderado', 'sucralosa': 'moderado',
  e960: 'sin', 'glucosidos de esteviol': 'sin', 'estevia': 'sin',
  e965: 'sin', 'maltitol': 'sin', e967: 'sin', 'xilitol': 'sin', e420: 'sin', 'sorbitol': 'sin',
  // colorantes (los azoicos son los peor vistos)
  e102: 'evitar', 'tartrazina': 'evitar', e110: 'evitar', 'amarillo ocaso': 'evitar',
  e122: 'evitar', 'azorrubina': 'evitar', e124: 'evitar', 'rojo cochinilla': 'evitar',
  e129: 'evitar', 'rojo allura': 'evitar', e104: 'moderado', e133: 'moderado',
  e150c: 'moderado', e150d: 'moderado', 'caramelo': 'limitado',
  e160a: 'sin', 'caroteno': 'sin', e160c: 'sin', 'paprika': 'sin', e163: 'sin', 'antocianinas': 'sin',
  // conservantes
  e200: 'limitado', 'sorbico': 'limitado', e202: 'limitado', 'sorbato': 'limitado', 'sorbato potasico': 'limitado',
  e210: 'moderado', 'benzoico': 'moderado', e211: 'moderado', 'benzoato': 'moderado',
  e220: 'moderado', 'sulfuroso': 'moderado', e223: 'moderado', 'metabisulfito': 'moderado', 'sulfito': 'moderado',
  e249: 'evitar', e250: 'evitar', 'nitrito': 'evitar', e251: 'moderado', e252: 'moderado', 'nitrato': 'moderado',
  e280: 'limitado', 'propionico': 'limitado', e282: 'limitado',
  // antioxidantes
  e300: 'sin', 'acido ascorbico': 'sin', 'vitamina c': 'sin', e306: 'sin', 'tocoferol': 'sin',
  e320: 'evitar', 'bha': 'evitar', e321: 'evitar', 'bht': 'evitar',
  e330: 'sin', 'acido citrico': 'sin', 'citrico': 'sin', e331: 'sin', 'citrato': 'sin',
  // potenciadores / fosfatos / otros
  e621: 'moderado', 'glutamato': 'moderado', 'glutamato monosodico': 'moderado',
  e338: 'limitado', 'fosforico': 'limitado', e339: 'limitado', e340: 'limitado', 'fosfato': 'limitado',
  e407: 'moderado', 'carragenano': 'moderado',
  e433: 'moderado', e466: 'limitado', 'carboximetilcelulosa': 'limitado',
  e471: 'sin', 'mono y digliceridos': 'sin', e322: 'sin', 'lecitina': 'sin',
  e412: 'sin', 'goma guar': 'sin', e415: 'sin', 'goma xantana': 'sin', e440: 'sin', 'pectina': 'sin',
  e296: 'sin', 'acido malico': 'sin', e334: 'sin', 'tartarico': 'sin', e500: 'sin', 'bicarbonato': 'sin',
};
const RISK_RANK = { sin: 0, limitado: 1, moderado: 2, evitar: 3 };
const RISK_LABEL = { sin: 'sin riesgo', limitado: 'riesgo limitado', moderado: 'riesgo moderado', evitar: 'a evitar' };

const norm = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Detecta aditivos en la lista de ingredientes → [{token, risk}]. */
export function detectAdditives(ingredients) {
  const text = norm(ingredients);
  if (!text) return [];
  const found = new Map(); // clave → risk (dedupe)
  // 1) E-números explícitos (E-202, E 250, E160a…)
  for (const m of text.matchAll(/\be[-\s]?(\d{3,4}[a-z]?)\b/g)) {
    const code = 'e' + m[1];
    found.set(code, ADDITIVE_RISK[code] ?? 'limitado');
  }
  // 2) nombres comunes (sorbato, glutamato, aspartamo…)
  for (const name of Object.keys(ADDITIVE_RISK)) {
    if (name.startsWith('e') && /\d/.test(name)) continue; // ya cubiertos por el regex
    if (text.includes(name)) found.set(name, ADDITIVE_RISK[name]);
  }
  // Dedupe: descarta un nombre si es subcadena de otro detectado más específico
  // ("sorbato" ⊂ "sorbato potasico"). No afecta al riesgo (se toma el máximo).
  const keys = [...found.keys()];
  for (const k of keys) {
    if (/^e\d/.test(k)) continue;
    if (keys.some((o) => o !== k && !/^e\d/.test(o) && o.includes(k))) found.delete(k);
  }
  return [...found].map(([token, risk]) => ({ token, risk }));
}

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

/** ¿el producto es ecológico? (nombre + ingredientes) */
function isOrganic(name, ingredients) {
  const t = norm(`${name} ${ingredients}`);
  return /\b(ecologic|biologic|\bbio\b|\beco\b|organic)/.test(t);
}

/**
 * Calcula la nota de salud. `n` = nutrición por 100g (números o null).
 * Devuelve null si faltan los 4 valores núcleo (energía, azúcar, sat, sal): sin
 * ellos no hay Nutri-Score y la nota engañaría.
 */
export function healthScore({ nutrition, ingredients = '', displayName = '' }) {
  const n = nutrition || {};
  const kj = n.kj != null ? n.kj : (n.kcal != null ? n.kcal * 4.184 : null);
  const core = [kj, n.azucares, n.saturadas, n.sal];
  if (core.some((v) => v == null || !Number.isFinite(v))) return null;

  // ── Nutri-Score 2023 (alimentos generales) ──
  const neg = pts(T_ENERGY, kj) + pts(T_SUGAR, n.azucares) + pts(T_SATFAT, n.saturadas) + pts(T_SALT, n.sal);
  const fiberPts = n.fibra != null ? pts(T_FIBER, n.fibra) : 0;       // sin fibra → 0 (peor caso) → ESTIMADO
  const proteinPts = n.proteinas != null ? pts(T_PROTEIN, n.proteinas) : 0;
  const fruitPts = 0; // % fruta/verdura casi nunca en etiqueta → 0
  // Regla oficial: con neg≥11 y sin ≥80% fruta, la proteína no puntúa.
  const proteinCounts = neg < 11 || fruitPts === 5;
  const pos = fruitPts + fiberPts + (proteinCounts ? proteinPts : 0);
  const nutriScore = neg - pos;
  const grade = nutriScore <= 0 ? 'A' : nutriScore <= 2 ? 'B' : nutriScore <= 10 ? 'C' : nutriScore <= 18 ? 'D' : 'E';
  const nutri100 = clamp(Math.round(100 - ((nutriScore + 15) / 55) * 100), 0, 100);

  // ── Aditivos: el peor marca el techo (estilo Yuka) ──
  const additives = detectAdditives(ingredients);
  const worst = additives.reduce((w, a) => Math.max(w, RISK_RANK[a.risk] ?? 1), -1);
  const add100 = worst < 0 ? 100 : worst === 0 ? 100 : worst === 1 ? 75 : worst === 2 ? 50 : 0;

  // ── Ecológico: bonus ──
  const organic = isOrganic(displayName, ingredients);

  const score = clamp(Math.round(0.6 * nutri100 + 0.3 * add100 + (organic ? 10 : 0)), 0, 100);
  const tier = score >= 75 ? 'excelente' : score >= 50 ? 'bueno' : score >= 25 ? 'mediocre' : 'malo';
  const estimated = n.fibra == null; // sin fibra el Nutri-Score es aproximado

  // ── Puntos fuertes / débiles (lo que muestra Yuka) ──
  const breakdown = [];
  const flag = (key, label, level, detail) => breakdown.push({ key, label, level, detail });
  flag('calorias',  'Calorías',        n.kcal != null ? (n.kcal <= 90 ? 'good' : n.kcal >= 300 ? 'bad' : 'neutral') : 'neutral', n.kcal != null ? `${n.kcal} kcal/100g` : null);
  flag('saturadas', 'Grasas saturadas', n.saturadas <= 1.5 ? 'good' : n.saturadas >= 5 ? 'bad' : 'neutral', `${n.saturadas} g/100g`);
  flag('azucares',  'Azúcar',           n.azucares <= 5 ? 'good' : n.azucares >= 15 ? 'bad' : 'neutral', `${n.azucares} g/100g`);
  flag('sal',       'Sal',              n.sal <= 0.3 ? 'good' : n.sal >= 1.5 ? 'bad' : 'neutral', `${n.sal} g/100g`);
  if (n.proteinas != null) flag('proteinas', 'Proteínas', n.proteinas >= 8 ? 'good' : 'neutral', `${n.proteinas} g/100g`);
  if (n.fibra != null) flag('fibra', 'Fibra', n.fibra >= 3 ? 'good' : 'neutral', `${n.fibra} g/100g`);
  flag('aditivos', 'Aditivos',
    additives.length === 0 ? 'good' : worst >= 2 ? 'bad' : 'neutral',
    additives.length === 0 ? 'Sin aditivos' : `${additives.length} aditivo(s) · ${RISK_LABEL[Object.keys(RISK_RANK)[worst]]}`);
  if (organic) flag('ecologico', 'Ecológico', 'good', 'Producto ecológico');

  return {
    score, tier, grade, nutriScore, estimated,
    components: { nutri100, add100, organicBonus: organic ? 10 : 0 },
    additives,
    breakdown,
  };
}
