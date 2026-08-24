import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

/**
 * Registra una entrada real de la app al primer plano.
 *
 * La fecha y el usuario se resuelven en Supabase para que el dispositivo no
 * pueda alterar los agregados DAU/WAU/MAU. El llamador trata el registro como
 * best-effort: una caída de analítica nunca debe impedir usar la app.
 */
export async function recordAppActivity(): Promise<void> {
  const { error } = await supabase.rpc('record_app_activity', {
    p_platform: Platform.OS,
    p_app_version: Constants.expoConfig?.version ?? null,
  });

  if (error) throw error;
}
