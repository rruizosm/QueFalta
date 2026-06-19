/**
 * Paleta de la app. Dos ejes elegibles por el usuario en Perfil → Apariencia:
 *
 *  - Modo claro/oscuro: `paper`, `white`, `ink`, `border`… son getters sobre
 *    una `palette` mutable que cambia `applyTheme()` (LIGHT u oscuro cálido DARK).
 *  - Color principal (accent): `accent`, `accentLight` y `accentMid` son getters
 *    sobre un valor mutable que cambia `applyAccent()`.
 *
 * ⚠️ Los StyleSheet.create que usan estos colores se evalúan una sola vez, así
 * que esos ficheros definen una fábrica y la pasan por `useThemedStyles`
 * (src/context/ThemeContext.tsx) para recrearse al cambiar tema o color.
 */
import type { StatusBarStyle } from 'react-native';

/* ───────────────────────── Tema claro / oscuro ──────────────────────────── */

export type ThemeMode = 'light' | 'dark' | 'system';
export type ColorScheme = 'light' | 'dark';

/** Opciones de tema que se ofrecen en Apariencia (encima del color). */
export const THEME_OPTIONS = [
  { key: 'light',  name: 'Claro',      icon: 'sunny-outline'          },
  { key: 'dark',   name: 'Oscuro',     icon: 'moon-outline'           },
  { key: 'system', name: 'Automático', icon: 'phone-portrait-outline' },
] as const;

export const DEFAULT_THEME_MODE: ThemeMode = 'system';

/** Tokens semánticos que dependen del modo claro/oscuro. */
interface Palette {
  ink:              string;
  inkSoft:          string;
  inkFaint:         string;
  paper:            string;
  white:            string;
  surfaceAlt:       string;
  photoPlaceholder: string;
  border:           string;
  ok:               string;
  statusBar:        StatusBarStyle;
}

/** Tema claro original (look cálido tipo papel crema). */
const LIGHT: Palette = {
  ink:              '#2b2521',
  inkSoft:          '#8a7f73',
  inkFaint:         '#c2b8a9',
  paper:            '#fbf6ee',
  white:            '#ffffff',
  surfaceAlt:       '#f6efe3',
  photoPlaceholder: '#f6efe3',
  border:           '#ece2d3',
  ok:               '#3f8f4f',
  statusBar:        'dark-content',
};

/** Tema oscuro cálido: marrón/carbón que conserva la identidad crema. */
const DARK: Palette = {
  ink:              '#f2ebe0',
  inkSoft:          '#b3a895',
  inkFaint:         '#6f6457',
  paper:            '#1c1815',
  white:            '#262019', // superficie de tarjeta sobre el fondo
  surfaceAlt:       '#2f2820',
  photoPlaceholder: '#2f2820',
  border:           '#3a322a',
  ok:               '#4caf63',
  statusBar:        'light-content',
};

let palette: Palette = LIGHT;

/** Cambia el modo claro/oscuro en caliente. Llamar solo desde ThemeContext. */
export function applyTheme(scheme: ColorScheme) {
  palette = scheme === 'dark' ? DARK : LIGHT;
}

/* ──────────────────────────── Color principal ───────────────────────────── */

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

/* ──────────────────────────────── Paleta ────────────────────────────────── */

export const colors = {
  // Color principal (mutable por accent)
  get accent()      { return accent; },
  get accentLight() { return accentLight; },
  get accentMid()   { return accentMid; },
  // Tokens semánticos (mutables por modo claro/oscuro)
  get ink()              { return palette.ink; },
  get inkSoft()          { return palette.inkSoft; },
  get inkFaint()         { return palette.inkFaint; },
  get paper()            { return palette.paper; },
  get white()            { return palette.white; },
  get surfaceAlt()       { return palette.surfaceAlt; },
  get photoPlaceholder() { return palette.photoPlaceholder; },
  get border()           { return palette.border; },
  get ok()               { return palette.ok; },
  get statusBar()        { return palette.statusBar; },
  // Category colors (warm-shifted) — compartidos en ambos modos
  red:    '#df4b2e',
  orange: '#d98324',
  blue:   '#2f6cb5',
  yellow: '#c98a1e',
  purple: '#7a4fb5',
  teal:   '#1f8a8f',
};