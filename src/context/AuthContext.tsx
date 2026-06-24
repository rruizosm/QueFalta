import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '../lib/supabase';
import { setPendingProfileName } from '../lib/pendingProfileName';
import { linkAppleCredential } from '../api/account';
import { configurePurchases, logOutPurchases } from '../lib/purchases';
import {
  registerForPushNotificationsAsync,
  unregisterPushNotificationsAsync,
} from '../lib/notifications';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  /** Solo iOS (Sign in with Apple). En el resto resuelve sin hacer nada. */
  signInWithApple: () => Promise<void>;
  /** scope 'global' cierra la sesión en TODOS los dispositivos. */
  signOut: (scope?: 'global' | 'local' | 'others') => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  signInWithGoogle: async () => {},
  signInWithApple: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Si el refresh token guardado ya no existe (p. ej. tras un signOut global
    // desde otro dispositivo), getSession puede fallar con "Refresh Token Not
    // Found": purga la sesión local en silencio y sigue al login.
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (error) {
          supabase.auth.signOut({ scope: 'local' }).catch(() => {});
          setSession(null);
        } else {
          setSession(session);
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
  }, []);

  // RevenueCat: liga el appUserID al uid de Supabase (el webhook escribe
  // premium_until por ese id). No-op en Expo Go o sin API key (lib/purchases).
  useEffect(() => {
    if (session?.user.id) configurePurchases(session.user.id);
  }, [session?.user.id]);

  // Push: registra el Expo push token de este dispositivo para el usuario (si
  // tiene las notificaciones activadas). No-op en Expo Go/web. Ver lib/notifications.
  useEffect(() => {
    if (session?.user.id) registerForPushNotificationsAsync(session.user.id).catch(() => {});
  }, [session?.user.id]);

  const signInWithGoogle = async () => {
    if (Platform.OS === 'web') {
      await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
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

    if (error || !data.url) return;

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

    if (result.type === 'success') {
      // exchangeCodeForSession espera SOLO el `code`, no la URL completa.
      const { queryParams } = Linking.parse(result.url);
      const code = typeof queryParams?.code === 'string' ? queryParams.code : null;
      if (code) await supabase.auth.exchangeCodeForSession(code);
    }
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
        return;
      }
      // onAuthStateChange recoge la sesión.

      // Guarda el refresh_token de Apple (canje server-side del authorizationCode)
      // para poder revocarlo al borrar la cuenta. Best-effort: no bloquea el login.
      if (credential.authorizationCode) {
        linkAppleCredential(credential.authorizationCode).catch(() => {});
      }
    } catch (e: any) {
      setPendingProfileName(null);
      // El usuario cerró el diálogo: no es un error que mostrar.
      if (e?.code === 'ERR_REQUEST_CANCELED') return;
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
    <AuthContext.Provider value={{ session, loading, signInWithGoogle, signInWithApple, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
