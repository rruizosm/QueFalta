/** Material de las filas del ranking general ocultas tras Plus. */
export const WORD_RANKING_GLASS = {
  minHeight: 48,
  radius: 16,
  insetX: 12,
  blurIntensity: 88,
  blurReductionFactor: 3,
  light: {
    surface: 'rgba(231,242,255,0.54)',
    border: 'rgba(86,142,211,0.18)',
    gradient: ['rgba(126,182,255,0.42)', 'rgba(197,223,255,0.28)', 'rgba(197,223,255,0.03)'] as const,
    highlight: ['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0)'] as const,
    edge: 'rgba(255,255,255,0.34)',
    shadow: '#315C8E',
    shadowOpacity: 0.08,
    grain: '#285F9C',
  },
  dark: {
    surface: 'rgba(24,41,66,0.58)',
    border: 'rgba(220,237,255,0.24)',
    gradient: ['rgba(79,141,225,0.32)', 'rgba(104,155,223,0.18)', 'rgba(104,155,223,0.03)'] as const,
    highlight: ['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.03)', 'rgba(255,255,255,0)'] as const,
    edge: 'rgba(255,255,255,0.24)',
    shadow: '#000000',
    shadowOpacity: 0.14,
    grain: '#FFFFFF',
  },
} as const;
