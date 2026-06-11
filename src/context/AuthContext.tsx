import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Session } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '../lib/supabase';
import { configurePurchases, logOutPurchases } from '../lib/purchases';

WebBrowser.maybeCompleteAuthSession();

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  /** scope 'global' cierra la sesión en TODOS los dispositivos. */
  signOut: (scope?: 'global' | 'local' | 'others') => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  loading: true,
  signInWithGoogle: async () => {},
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

  const signOut = async (scope?: 'global' | 'local' | 'others') => {
    await logOutPurchases();
    await supabase.auth.signOut(scope ? { scope } : undefined);
  };

  return (
    <AuthContext.Provider value={{ session, loading, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
