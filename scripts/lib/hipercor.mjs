import { createHash } from 'node:crypto';
import { extname } from 'node:path';

export const HIPERCOR_PROVINCE_SUFFIXES = Object.freeze(['001', '002', '004', '080', '200', '500', '700']);

export function parseHipercorPostalCodes(text) {
  const values = String(text ?? '')
    .split(/\r?\n/)
    .flatMap((line) => line.replace(/#.*/, '').split(/[\s,;]+/))
    .map((value) => value.trim())
    .filter(Boolean);
  const invalid = values.filter((value) => !/^\d{5}$/.test(value) || Number(value.slice(0, 2)) < 1 || Number(value.slice(0, 2)) > 52);
  if (invalid.length) throw new Error(`códigos postales inválidos: ${[...new Set(invalid)].join(', ')}`);
  return [...new Set(values)];
}

export function hipercorProvinceDiscoveryPostalCodes() {
  const rows = [];
  for (let province = 1; province <= 52; province++) {
    const prefix = String(province).padStart(2, '0');
    for (const suffix of HIPERCOR_PROVINCE_SUFFIXES) rows.push(`${prefix}${suffix}`);
  }
  return rows;
}

export function hipercorCatalogFingerprint(result) {
  const products = [...(result?.products ?? [])]
    .map((product) => [
      product.id,
      product.finalPriceText ?? null,
      product.regularPriceText ?? null,
      product.pricePerUnitText ?? null,
      Boolean(product.available),
    ])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  return createHash('sha256')
    .update(JSON.stringify({ declaredCount: result?.declaredCount ?? null, products }))
    .digest('hex');
}

export function groupHipercorPostalMappings(mappings) {
  const groups = new Map();
  for (const mapping of mappings) {
    if (!mapping?.supported || !mapping.center_id) continue;
    const current = groups.get(mapping.center_id) ?? {
      centerId: mapping.center_id,
      postalCodes: [],
      representativePostalCode: mapping.postal_code,
      sampleFingerprint: mapping.raw?.sampleFingerprint ?? null,
      selectorCenterId: mapping.raw?.selectorCenterId ?? null,
    };
    current.postalCodes.push(mapping.postal_code);
    if (!current.selectorCenterId && mapping.raw?.selectorCenterId) {
      current.selectorCenterId = mapping.raw.selectorCenterId;
    }
    groups.set(mapping.center_id, current);
  }
  return [...groups.values()].sort((left, right) => left.centerId.localeCompare(right.centerId));
}

export function assertHipercorSharedCenterParity(mappings) {
  const fingerprints = new Map();
  for (const mapping of mappings) {
    if (!mapping?.supported || !mapping.center_id) continue;
    const fingerprint = mapping.raw?.sampleFingerprint;
    if (!fingerprint) throw new Error(`${mapping.postal_code}: falta la huella de validación del centro ${mapping.center_id}`);
    const selectorCenterId = mapping.raw?.selectorCenterId ?? null;
    const previous = fingerprints.get(mapping.center_id);
    if (previous && previous.fingerprint !== fingerprint) {
      throw new Error(
        `el centro ${mapping.center_id} no es deduplicable: ${previous.postalCode} y ${mapping.postal_code} `
        + 'devuelven productos/precios distintos',
      );
    }
    if (previous?.selectorCenterId && selectorCenterId && previous.selectorCenterId !== selectorCenterId) {
      throw new Error(
        `el centro ${mapping.center_id} no es deduplicable: ${previous.postalCode} y ${mapping.postal_code} `
        + 'devuelven identificadores distintos en el selector',
      );
    }
    fingerprints.set(mapping.center_id, { fingerprint, postalCode: mapping.postal_code, selectorCenterId });
  }
}

export function hipercorCheckpointPath(basePath, centerId) {
  const extension = extname(basePath);
  const stem = extension ? basePath.slice(0, -extension.length) : basePath;
  return `${stem}-${centerId}${extension || '.json'}`;
}

export function hipercorPostalPlanSignature(postalCodes) {
  return createHash('sha256').update(postalCodes.join('|')).digest('hex');
}
