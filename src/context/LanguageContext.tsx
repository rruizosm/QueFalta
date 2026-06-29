/**
 * LanguageContext — idioma de la UI (castellà / català) elegido en Apariencia.
 *
 * Mismo patrón que ThemeContext: carga `@app_language` de AsyncStorage ANTES de
 * renderizar (devuelve null mientras tanto, con la splash visible) y aplica el
 * idioma de forma SÍNCRONA con `applyLanguage` antes del setState, para que el
 * `t()` de los componentes lea ya el idioma nuevo en el mismo render.
 *
 * `useTranslation()` suscribe al componente: al cambiar de idioma se re-renderiza
 * y sus llamadas a `t` devuelven los textos del idioma activo.
 */
import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  applyLanguage, t, LANGUAGE_OPTIONS, DEFAULT_LANGUAGE, type AppLanguage,
} from '../i18n';
import { syncPushTokenLanguageAsync } from '../lib/notifications';

const LANGUAGE_KEY = '@app_language';

interface LanguageContextValue {
  lang: AppLanguage;
  setLang: (lang: AppLanguage) => void;
  t: typeof t;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: DEFAULT_LANGUAGE,
  setLang: () => {},
  t,
});

function isLanguage(value: string | null): value is AppLanguage {
  return LANGUAGE_OPTIONS.some((o) => o.key === value);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setState] = useState<AppLanguage | null>(null);

  // Carga la preferencia guardada antes del primer render.
  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_KEY)
      .then((raw) => {
        const value = isLanguage(raw) ? raw : DEFAULT_LANGUAGE;
        applyLanguage(value);
        setState(value);
      })
      .catch(() => {
        applyLanguage(DEFAULT_LANGUAGE);
        setState(DEFAULT_LANGUAGE);
      });
  }, []);

  const setLang = useCallback((value: AppLanguage) => {
    // Aplica el idioma de inmediato (antes del re-render) para que el `t()` de
    // este ciclo ya devuelva los textos nuevos.
    applyLanguage(value);
    setState(value);
    AsyncStorage.setItem(LANGUAGE_KEY, value).catch(() => {});
    // Propaga el idioma al token de push de este dispositivo para que las
    // notificaciones del servidor lleguen en el idioma elegido (no-op en Expo
    // Go/web o sin sesión). Fire-and-forget: no debe bloquear el cambio de UI.
    syncPushTokenLanguageAsync(value).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ lang: lang ?? DEFAULT_LANGUAGE, setLang, t }),
    [lang, setLang],
  );

  if (lang === null) return null;

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation(): LanguageContextValue {
  return useContext(LanguageContext);
}
