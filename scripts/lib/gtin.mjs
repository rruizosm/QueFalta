const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/** Devuelve un GTIN canónico solo si su longitud y dígito de control son válidos. */
export function validGtin(value) {
  const gtin = String(value ?? '').trim();
  if (!GTIN_LENGTHS.has(gtin.length) || !/^\d+$/.test(gtin)) return null;

  const digits = [...gtin].map(Number);
  const checkDigit = digits.pop();
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === checkDigit ? gtin : null;
}

/**
 * GTIN apto para enlazar catálogos distintos. Excluye números de circulación
 * restringida (RCN), que pueden repetirse entre regiones o empresas.
 */
export function validGlobalGtin(value) {
  const gtin = validGtin(value);
  if (!gtin) return null;
  if (gtin.length === 8) return gtin.startsWith('2') ? null : gtin;

  // Lleva GTIN-12/13 a la posición de prefijo de un GTIN-13. En GTIN-14, el
  // primer dígito es el indicador logístico y el prefijo empieza después.
  const prefix = Number(gtin.length === 14
    ? gtin.slice(1, 4)
    : gtin.length === 13
      ? gtin.slice(0, 3)
      : `0${gtin}`.slice(0, 3));
  const restricted = (prefix >= 20 && prefix <= 29)
    || (prefix >= 40 && prefix <= 49)
    || (prefix >= 200 && prefix <= 299);
  return restricted ? null : gtin;
}
