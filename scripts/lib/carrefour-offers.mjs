// Carrefour's campaign/highlighted badges describe products, not savings.
// Keep this independent from other retailers and from application code.
const text = (value) => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || null : null;
const folded = (value) => (text(value) ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function offerDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso ? iso : null;
}

export function money(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value == null || String(value).trim() === '') return null;
  const n = Number(String(value).replace(/[\s€]/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function kindOf(name) {
  const s = folded(name);
  if (/envio\s+gratis|gastos\s+de\s+envio/.test(s)) return 'shipping';
  if (/acumula|cupon|cheque|\bclub\b/.test(s) && /\d+\s*[%€]|\d+\s*[x×]\s*\d+/.test(s)) return 'club';
  const multi = /\b(\d+)\s*[x×]\s*(\d+)\b/.exec(s);
  if (multi && Number(multi[1]) > Number(multi[2]) && Number(multi[2]) > 0) return 'multibuy';
  if (/\b(?:2[ªaºo]?|segunda)\s*(?:ud\.?|unidad)\b.*\d+\s*%/.test(s)) return 'second_unit';
  if (/\bcomprando\s+\d+\b/.test(s)) return 'multibuy';
  if (/-\s*\d+\s*%|\d+\s*€\s*(?:dto|descuento)|\d+\s*%\s*(?:dto|descuento|en cesta)|todo a\s*\d+/.test(s)) return 'discount';
  return null;
}

const rank = { multibuy: 0, second_unit: 1, discount: 2, club: 3, shipping: 4 };

export function carrefourOffers(product, today) {
  const structured = product.badge_map?.promotions;
  // Legacy untyped badge accepted only if no typed map exists, and only for a
  // recognised economic mechanic. Never resurrect an expired structured offer.
  const candidates = Array.isArray(structured) ? structured
    : !product.badge_map && product.badge ? [product.badge] : [];
  const promotions = [];
  const seen = new Set();
  const price = money(product.price ?? product.app_price);
  const previous = money(product.strikethrough_price);
  const strikethrough_price = price != null && previous > price ? previous : null;
  for (const source of candidates) {
    if (!source || (source.badge_type && source.badge_type !== 'promotions')) continue;
    const name = text(source.name);
    let kind = kindOf(name);
    // A marketing price label alone is not evidence of a discount.
    if (!kind && strikethrough_price != null && /^(super precio|precio imbatible|superchollos)/.test(folded(name))) kind = 'discount';
    if (!name || !kind) continue;
    const description = text(source.pdp_text ?? source.description);
    const dates = description?.match(/(?:del|desde el)\s+(\d{2}\/\d{2}\/\d{4})\s+al\s+(\d{2}\/\d{2}\/\d{4})/i);
    const startValue = source.start_date || dates?.[1];
    const endValue = source.end_date || dates?.[2];
    const start = offerDate(startValue), end = offerDate(endValue);
    if ((startValue && !start) || (endValue && !end) || (start && end && start > end)) continue;
    const offer = { name, text: description, start, end, kind, link: text(source.link) };
    const key = JSON.stringify(offer);
    if (!seen.has(key)) { promotions.push(offer); seen.add(key); }
  }
  promotions.sort((a, b) => rank[a.kind] - rank[b.kind] || JSON.stringify(a).localeCompare(JSON.stringify(b), 'es'));
  const active = promotions.filter((p) => (!p.start || p.start <= today) && (!p.end || p.end >= today));
  const primary = active.find((p) => p.kind !== 'shipping') ?? null;
  return {
    promo_name: primary?.name ?? null,
    promo_text: primary?.text ?? null,
    promo_start: primary?.start ?? null,
    promo_end: primary?.end ?? null,
    strikethrough_price,
    promotions,
  };
}

// Scan JSON objects without confusing braces inside descriptions with structure.
// No product-size cutoff: multiple promotions can legitimately exceed 4 KB.
export function extractCarrefourProducts(html) {
  const out = new Map();
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)];
  const sources = scripts.length ? scripts.map((m) => m[1]) : [html];
  for (const source of sources) {
    const h = source.replace(/\\u002F/g, '/');
    const stack = [];
    let quoted = false, escaped = false;
    for (let i = 0; i < h.length; i++) {
      const c = h[i];
      if (stack.length && quoted) {
        if (escaped) escaped = false;
        else if (c === '\\') escaped = true;
        else if (c === '"') quoted = false;
        continue;
      }
      if (stack.length && c === '"') { quoted = true; continue; }
      if (c === '{') {
        // Ignore JavaScript function bodies and CSS; only start JSON objects.
        if (stack.length || /^\s*["}]/.test(h.slice(i + 1))) stack.push(i);
      }
      else if (c === '}' && stack.length) {
        const start = stack.pop();
        const segment = h.slice(start, i + 1);
        if (!segment.includes('"product_id"') || !segment.includes('"sku_id"')) continue;
        try {
          const p = JSON.parse(segment);
          if (!p.product_id || !p.sku_id || !p.name) continue;
          const old = out.get(p.product_id);
          const score = (v) => (v.badge_map?.promotions?.length ?? 0) * 10 + (v.price != null ? 1 : 0);
          if (!old || score(p) > score(old)) out.set(p.product_id, p);
        } catch { /* enclosing JavaScript objects are not necessarily JSON */ }
      }
    }
  }
  return [...out.values()];
}
