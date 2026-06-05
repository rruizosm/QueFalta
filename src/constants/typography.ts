export const fonts = {
  regular:   'SpaceGrotesk_400Regular',
  medium:    'SpaceGrotesk_500Medium',
  semibold:  'SpaceGrotesk_600SemiBold',
  bold:      'SpaceGrotesk_700Bold',
  // Alias de compatibilidad: todo el código usa fonts.extraLight.
  // Apunta a medium para que el cambio sea global sin tocar cada pantalla.
  extraLight: 'SpaceGrotesk_500Medium',
} as const;
