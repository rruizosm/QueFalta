/**
 * Paleta de la app. El color principal (accent) es elegible por el usuario
 * en Perfil → Apariencia: `accent`, `accentLight` y `accentMid` son getters
 * sobre un valor mutable que cambia `applyAccent()`.
 *
 * ⚠️ Los StyleSheet.create que usan colors.accent* se evalúan una sola vez,
 * así que esos ficheros definen una fábrica y la pasan por `useThemedStyles`
 * (src/context/ThemeContext.tsx) para recrearse al cambiar el color.
 */

/** Opciones de color principal que se ofrecen en Apariencia. */
export const ACCENT_OPTIONS = [
  { key: 'naranja',  name: 'Naranja',  hex: '#df4b2e' },
  { key: 'verde',    name: 'Verde',    hex: '#3f8f4f' },
  { key: 'azul',     name: 'Azul',     hex: '#2f6cb5' },
  { key: 'morado',   name: 'Morado',   hex: '#7a4fb5' },
  { key: 'turquesa', name: 'Turquesa', hex: '#1f8a8f' },
  { key: 'rosa',     name: 'Rosa',     hex: '#c2497d' },
] as const;

export type AccentKey = (typeof ACCENT_OPTIONS)[number]['key'];

export const DEFAULT_ACCENT: AccentKey = 'naranja';

function withAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

let accent      = '#df4b2e';
let accentLight = withAlpha(accent, 0.12);
let accentMid   = withAlpha(accent, 0.30);

/** Cambia el color principal en caliente. Llamar solo desde ThemeContext. */
export function applyAccent(key: AccentKey) {
  const opt = ACCENT_OPTIONS.find((o) => o.key === key) ?? ACCENT_OPTIONS[0];
  accent      = opt.hex;
  accentLight = withAlpha(opt.hex, 0.12);
  accentMid   = withAlpha(opt.hex, 0.30);
}

export const colors = {
  get accent()      { return accent; },
  get accentLight() { return accentLight; },
  get accentMid()   { return accentMid; },
  ink:              '#2b2521',
  inkSoft:          '#8a7f73',
  inkFaint:         '#c2b8a9',
  paper:            '#fbf6ee',
  white:            '#ffffff',
  surfaceAlt:       '#f6efe3',
  photoPlaceholder: '#f6efe3',
  border:           '#ece2d3',
  ok:               '#3f8f4f',
  // Category colors (warm-shifted)
  red:    '#df4b2e',
  orange: '#d98324',
  blue:   '#2f6cb5',
  yellow: '#c98a1e',
  purple: '#7a4fb5',
  teal:   '#1f8a8f',
};
