import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '../lib/supabase';
import { setPendingProfileName } from '../lib/pendingProfileName';
import { linkAppleCredential } from '../api/account';
import { configurePurchases, logOutPurchases } from '../lib/purchases';
import { recordAppActivity } from '../lib/appActivity';
import {
  getNotificationsEnabled,
  registerForPushNotificationsAsync,
  unregisterPushNotificationsAsync,
} from '../lib/notifications';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  /** Envía un enlace de acceso de un solo uso. Crea la cuenta si no existe. */
  signInWithEmail: (email: string) => Promise<void>;
  /** Solo iOS (Sign in with Apple). En el resto resuelve sin hacer nada. */
  signInWithApple: () => Promise<void>;
  authCallbackError: boolean;
  clearAuthCallbackError: () => void;
  /** scope 'global' cierra la sesión en TODOS los dispositivos. */
  signOut: (scope?: 'global' | 'local' | 'others') => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  signInWithGoogle: async () => {},
  signInWithEmail: async () => {},
  signInWithApple: async () => {},
  authCallbackError: false,
  clearAuthCallbackError: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [authCallbackError, setAuthCallbackError] = useState(false);
  const processedAuthCallbacks = useRef(new Set<string>());
  const clearAuthCallbackError = useCallback(() => setAuthCallbackError(false), []);

  const exchangeAuthCodeFromUrl = useCallback(async (url: string) => {
    const { queryParams } = Linking.parse(url);
    const findUrlParam = (name: string) => {
      const match = url.match(new RegExp(`[?#&]${name}=([^&#]*)`));
      return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : null;
    };
    const code = typeof queryParams?.code === 'string'
      ? queryParams.code
      : findUrlParam('code');
    const accessToken = findUrlParam('access_token');
    const refreshToken = findUrlParam('refresh_token');
    const callbackKey = code ?? (accessToken && refreshToken ? accessToken : null);

    // Los errores de Auth llegan en el fragmento de la URL cuando el enlace ha
    // caducado o ya se ha usado. No deben confundirse con enlaces de invitación.
    if (!callbackKey) {
      if (findUrlParam('error') || findUrlParam('error_code')) setAuthCallbackError(true);
      return;
    }
    if (processedAuthCallbacks.current.has(callbackKey)) return;

    // Un enlace puede llegar a la vez al listener de Linking y al navegador de
    // OAuth. Se marca antes del await para no intentar canjear el mismo PKCE dos
    // veces (el código es de un solo uso).
    processedAuthCallbacks.current.add(callbackKey);
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.setSession({
          access_token: accessToken!,
          refresh_token: refreshToken!,
        });
    if (error) setAuthCallbackError(true);
    else setAuthCallbackError(false);
  }, []);

  useEffect(() => {
    // Si el refresh token guardado ya no existe (p. ej. tras un signOut global
    // desde otro dispositivo), getSession puede fallar con "Refresh Token Not
    // Found": purga la sesión local en silencio y sigue al login.
    supabase.auth
      .getSession()
      .then(async ({ data: { session }, error }) => {
        if (error) {
          await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          setSession(null);
        } else {
          setSession(session);
        }

        // Evita que getSession(null) compita con el canje del enlace durante un
        // arranque en frío: primero se resuelve el storage y después el callback.
        if (Platform.OS !== 'web') {
          const initialUrl = await Linking.getInitialURL().catch(() => null);
          if (initialUrl) await exchangeAuthCodeFromUrl(initialUrl);
        }
      })
      .catch(() => {
        supabase.auth.signOut({ scope: 'local' }).catch(() => {});
        setSession(null);
      })
      .finally(() => setLoading(false));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, [exchangeAuthCodeFromUrl]);

  // Los enlaces mágicos abren la app fuera del navegador interno de OAuth.
  // El arranque en frío se procesa después de leer el storage en el efecto
  // superior; aquí cubrimos el enlace recibido con la app ya abierta.
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const subscription = Linking.addEventListener('url', ({ url }) => {
      exchangeAuthCodeFromUrl(url).catch(() => setAuthCallbackError(true));
    });
    return () => subscription.remove();
  }, [exchangeAuthCodeFromUrl]);

  // RevenueCat: liga el appUserID al uid de Supabase (el webhook escribe
  // premium_until por ese id). No-op en Expo Go o sin API key (lib/purchases).
  useEffect(() => {
    if (session?.user.id) configurePurchases(session.user.id);
  }, [session?.user.id]);

  // DAU/WAU/MAU de producto: registra el arranque con sesión y cada regreso
  // real al primer plano. El servidor fija usuario, hora y día de Madrid.
  useEffect(() => {
    if (!session?.user.id) return;

    let disposed = false;
    let recording = false;
    let previousState = AppState.currentState;

    const record = async () => {
      if (disposed || recording) return;
      recording = true;
      try {
        await recordAppActivity();
      } catch {
        // La analítica es best-effort y nunca bloquea el acceso a la app.
      } finally {
        recording = false;
      }
    };

    if (previousState === 'active') record();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (previousState !== 'active' && nextState === 'active') record();
      previousState = nextState;
    });

    return () => {
      disposed = true;
      subscription.remove();
    };
  }, [session?.user.id]);

  // Push: reconcilia el token de este dispositivo con la preferencia local del
  // usuario. Una cuenta nueva parte en OFF y retira cualquier token antiguo que
  // pudiera quedar asociado a este dispositivo. No-op en Expo Go/web.
  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) return;
    getNotificationsEnabled(userId)
      .then((enabled) => (
        enabled
          ? registerForPushNotificationsAsync(userId)
          : unregisterPushNotificationsAsync(userId)
      ))
      .catch(() => {});
  }, [session?.user.id]);

  const signInWithGoogle = async () => {
    if (Platform.OS === 'web') {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) throw error;
      return;
    }

    const redirectTo = Linking.createURL('auth/callback');

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
      },
    });

    if (error) throw error;
    if (!data.url) throw new Error('Google OAuth URL missing');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === 'success') {
      // exchangeCodeForSession espera SOLO el `code`, no la URL completa.
      await exchangeAuthCodeFromUrl(result.url);
    }
  };

  const signInWithEmail = async (email: string) => {
    const redirectTo = Platform.OS === 'web'
      ? window.location.origin
      : Linking.createURL('auth/callback');

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: true,
      },
    });
    if (error) throw error;
  };

  // Sign in with Apple (flujo NATIVO, solo iOS). Apple devuelve un identityToken
  // (JWT) que Supabase canjea por sesión vía signInWithIdToken. No usa WebBrowser
  // ni PKCE: el sistema operativo gestiona el diálogo. Requiere build real
  // (no funciona en Expo Go) y el bundle id dado de alta en Supabase → Apple.
  const signInWithApple = async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      if (!credential.identityToken) return;

      // Apple SOLO entrega el nombre en el PRIMER login y nunca dentro del token.
      // Lo dejamos en el buzón ANTES de crear la sesión para que ProfileContext lo
      // aplique al cargar el perfil; si no, el trigger de Supabase deja como nombre
      // el prefijo del email del relay privado (p. ej. "y9h4vv8kr9").
      const full = credential.fullName;
      const appleName = [full?.givenName, full?.familyName].filter(Boolean).join(' ').trim();
      if (appleName) setPendingProfileName(appleName);

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) {
        setPendingProfileName(null);
        throw error;
      }
      // onAuthStateChange recoge la sesión.

      // Guarda el refresh_token de Apple (canje server-side del authorizationCode)
      // para poder revocarlo al borrar la cuenta. Best-effort: no bloquea el login.
      if (credential.authorizationCode) {
        linkAppleCredential(credential.authorizationCode).catch(() => {});
      }
    } catch (error: unknown) {
      setPendingProfileName(null);
      // El usuario cerró el diálogo: no es un error que mostrar.
      const code = typeof error === 'object' && error != null && 'code' in error
        ? String((error as { code?: unknown }).code)
        : '';
      if (code === 'ERR_REQUEST_CANCELED') return;
      throw error;
    }
  };

  const signOut = async (scope?: 'global' | 'local' | 'others') => {
    // Borra el push token de este dispositivo ANTES de cerrar sesión (la
    // política RLS exige estar autenticado para borrarlo).
    const uid = session?.user.id;
    if (uid) await unregisterPushNotificationsAsync(uid).catch(() => {});
    await logOutPurchases();
    await supabase.auth.signOut(scope ? { scope } : undefined);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signInWithApple,
        authCallbackError,
        clearAuthCallbackError,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
