import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { authStorage } from './authStorage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Tokens en el almacén cifrado del sistema (Keychain/Keystore) en nativo,
    // AsyncStorage en web. Ver src/lib/authStorage.ts.
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    // PKCE: necesario para exchangeCodeForSession() en el login nativo (móvil).
    flowType: 'pkce',
  },
});
