/**
 * ThemeContext — color principal (accent) elegido por el usuario.
 *
 * Carga la preferencia de AsyncStorage ANTES de renderizar la app (devuelve
 * null mientras tanto, con la splash aún visible) para que todos los
 * StyleSheet se creen ya con el color correcto y no haya flash naranja.
 *
 * `useThemedStyles(fábrica)` es el puente para los StyleSheet que usan
 * colors.accent*: suscribe al componente al tema y recrea los estilos al
 * cambiar el color (un StyleSheet.create estático se evaluaría una sola vez).
 */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ACCENT_OPTIONS, AccentKey, DEFAULT_ACCENT, applyAccent,
} from '../constants/colors';

const STORAGE_KEY = '@accent_color';

interface ThemeContextValue {
  accentKey: AccentKey;
  setAccentKey: (key: AccentKey) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  accentKey: DEFAULT_ACCENT,
  setAccentKey: () => {},
});

function isAccentKey(value: string | null): value is AccentKey {
  return ACCENT_OPTIONS.some((o) => o.key === value);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [accentKey, setKey] = useState<AccentKey | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const key = isAccentKey(raw) ? raw : DEFAULT_ACCENT;
        applyAccent(key);
        setKey(key);
      })
      .catch(() => {
        applyAccent(DEFAULT_ACCENT);
        setKey(DEFAULT_ACCENT);
      });
  }, []);

  const setAccentKey = useCallback((key: AccentKey) => {
    applyAccent(key);
    setKey(key);
    AsyncStorage.setItem(STORAGE_KEY, key).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ accentKey: accentKey ?? DEFAULT_ACCENT, setAccentKey }),
    [accentKey, setAccentKey],
  );

  if (accentKey === null) return null;

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/** Recrea estilos dependientes del accent al cambiar el tema. */
export function useThemedStyles<T>(factory: () => T): T {
  const { accentKey } = useTheme();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, [accentKey]);
}
