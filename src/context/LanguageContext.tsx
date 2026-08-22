/**
 * LanguageContext — idioma de la UI (castellà / català) elegido en Apariencia.
 *
 * Carga `@app_language` de AsyncStorage sin bloquear el árbol de React. Hasta
 * resolverlo expone el idioma por defecto y `ready=false`, para que Navigation
 * pueda mantener un loader real en pantalla en vez de dejar un frame vacío.
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
  ready: boolean;
  setLang: (lang: AppLanguage) => void;
  t: typeof t;
}

const LanguageContext = createContext<LanguageContextValue>({
  lang: DEFAULT_LANGUAGE,
  ready: false,
  setLang: () => {},
  t,
});

function isLanguage(value: string | null): value is AppLanguage {
  return LANGUAGE_OPTIONS.some((o) => o.key === value);
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setState] = useState<AppLanguage>(DEFAULT_LANGUAGE);
  const [ready, setReady] = useState(false);

  // Carga la preferencia guardada antes del primer render.
  useEffect(() => {
    AsyncStorage.getItem(LANGUAGE_KEY)
      .then((raw) => {
        const value = isLanguage(raw) ? raw : DEFAULT_LANGUAGE;
        applyLanguage(value);
        setState(value);
        setReady(true);
      })
      .catch(() => {
        applyLanguage(DEFAULT_LANGUAGE);
        setState(DEFAULT_LANGUAGE);
        setReady(true);
      });
  }, []);

  const setLang = useCallback((value: AppLanguage) => {
    // Aplica el idioma de inmediato (antes del re-render) para que el `t()` de
    // este ciclo ya devuelva los textos nuevos.
    applyLanguage(value);
    setState(value);
    setReady(true);
    AsyncStorage.setItem(LANGUAGE_KEY, value).catch(() => {});
    // Propaga el idioma al token de push de este dispositivo para que las
    // notificaciones del servidor lleguen en el idioma elegido (no-op en Expo
    // Go/web o sin sesión). Fire-and-forget: no debe bloquear el cambio de UI.
    syncPushTokenLanguageAsync(value).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ lang, ready, setLang, t }),
    [lang, ready, setLang],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useTranslation(): LanguageContextValue {
  return useContext(LanguageContext);
}
