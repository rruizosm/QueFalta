/**
 * ThemeContext — dos ejes de tema elegidos por el usuario en Apariencia:
 *   - modo claro/oscuro (`themeMode`: 'light' | 'dark' | 'system')
 *   - color principal (`accentKey`)
 *
 * Carga ambas preferencias de AsyncStorage ANTES de renderizar la app (devuelve
 * null mientras tanto, con la splash aún visible) para que todos los StyleSheet
 * se creen ya con el tema correcto y no haya flash.
 *
 * `useThemedStyles(fábrica)` es el puente para los StyleSheet que dependen del
 * tema: suscribe al componente y recrea los estilos al cambiar modo o color
 * (un StyleSheet.create estático se evaluaría una sola vez).
 */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { Appearance } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ACCENT_OPTIONS, AccentKey, DEFAULT_ACCENT, applyAccent,
  THEME_OPTIONS, ThemeMode, ColorScheme, DEFAULT_THEME_MODE, applyTheme,
} from '../constants/colors';

const ACCENT_KEY = '@accent_color';
const THEME_KEY  = '@theme_mode';

interface ThemeContextValue {
  accentKey: AccentKey;
  setAccentKey: (key: AccentKey) => void;
  themeMode: ThemeMode;
  setThemeMode: (mode: ThemeMode) => void;
  /** Esquema realmente aplicado ('light' | 'dark'), ya resuelto el 'system'. */
  scheme: ColorScheme;
}

const ThemeContext = createContext<ThemeContextValue>({
  accentKey: DEFAULT_ACCENT,
  setAccentKey: () => {},
  themeMode: DEFAULT_THEME_MODE,
  setThemeMode: () => {},
  scheme: 'light',
});

function isAccentKey(value: string | null): value is AccentKey {
  return ACCENT_OPTIONS.some((o) => o.key === value);
}

function isThemeMode(value: string | null): value is ThemeMode {
  return THEME_OPTIONS.some((o) => o.key === value);
}

/** Resuelve el esquema efectivo a partir del modo y el ajuste del sistema. */
function resolveScheme(mode: ThemeMode, system: ColorScheme): ColorScheme {
  return mode === 'system' ? system : mode;
}

/** Alinea la apariencia NATIVA (trait claro/oscuro de las ventanas) con el
 *  tema elegido: los materiales del sistema (p. ej. el liquid glass de
 *  GlassSurface, que va en 'auto') siguen así el tema DE LA APP aunque el
 *  usuario lo fuerce distinto del sistema. En 'system' se limpia el override
 *  (vuelve a seguir al dispositivo). */
function applyNativeScheme(mode: ThemeMode) {
  Appearance.setColorScheme(mode === 'system' ? null : mode);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accentKey, setKey] = useState<AccentKey | null>(null);
  const [themeMode, setMode] = useState<ThemeMode | null>(null);
  const [systemScheme, setSystemScheme] = useState<ColorScheme>(
    () => (Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'),
  );

  // Carga las preferencias guardadas antes del primer render.
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(ACCENT_KEY),
      AsyncStorage.getItem(THEME_KEY),
    ])
      .then(([rawAccent, rawMode]) => {
        const key = isAccentKey(rawAccent) ? rawAccent : DEFAULT_ACCENT;
        const mode = isThemeMode(rawMode) ? rawMode : DEFAULT_THEME_MODE;
        applyAccent(key);
        applyTheme(resolveScheme(mode, systemScheme));
        applyNativeScheme(mode);
        setKey(key);
        setMode(mode);
      })
      .catch(() => {
        applyAccent(DEFAULT_ACCENT);
        applyTheme(resolveScheme(DEFAULT_THEME_MODE, systemScheme));
        applyNativeScheme(DEFAULT_THEME_MODE);
        setKey(DEFAULT_ACCENT);
        setMode(DEFAULT_THEME_MODE);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ref con el modo vigente para que el listener del sistema (closure estable)
  // sepa si debe re-aplicar la paleta.
  const modeRef = useRef<ThemeMode>(themeMode ?? DEFAULT_THEME_MODE);
  modeRef.current = themeMode ?? DEFAULT_THEME_MODE;

  // Sigue los cambios de tema del sistema (relevante en modo 'system').
  useEffect(() => {
    const sub = Appearance.addChangeListener(({ colorScheme }) => {
      const sys: ColorScheme = colorScheme === 'dark' ? 'dark' : 'light';
      // Muta la paleta ANTES del setState para que useThemedStyles recree los
      // estilos ya con el esquema nuevo en el mismo render (igual que el accent).
      if (modeRef.current === 'system') applyTheme(sys);
      setSystemScheme(sys);
    });
    return () => sub.remove();
  }, []);

  const scheme: ColorScheme = resolveScheme(themeMode ?? DEFAULT_THEME_MODE, systemScheme);

  const setAccentKey = useCallback((key: AccentKey) => {
    applyAccent(key);
    setKey(key);
    AsyncStorage.setItem(ACCENT_KEY, key).catch(() => {});
  }, []);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    // Aplica la paleta de inmediato (antes del re-render) para evitar un frame
    // con el tema anterior. applyNativeScheme va ANTES de leer getColorScheme:
    // al pasar a 'system' limpia el override y la lectura ya devuelve el
    // esquema real del dispositivo (con override activo devolvería el forzado).
    applyNativeScheme(mode);
    applyTheme(resolveScheme(mode, Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'));
    setMode(mode);
    AsyncStorage.setItem(THEME_KEY, mode).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({
      accentKey: accentKey ?? DEFAULT_ACCENT,
      setAccentKey,
      themeMode: themeMode ?? DEFAULT_THEME_MODE,
      setThemeMode,
      scheme,
    }),
    [accentKey, setAccentKey, themeMode, setThemeMode, scheme],
  );

  if (accentKey === null || themeMode === null) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Recrea estilos dependientes del tema (modo o color) al cambiar. */
export function useThemedStyles<T>(factory: () => T): T {
  const { accentKey, scheme } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, [accentKey, scheme]);
}