import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../lib/supabase';
import { sponsorEventId } from '../lib/sponsorMetrics';

/** Two bounded attempts with the SAME event ID. No disk queue or cross-account replay. */
export async function recordSponsorEvent(owner: string, campaign: string, visit: string, type: 'impression' | 'click') {
  const args = { p_event_id: sponsorEventId(), p_campaign_id: campaign, p_visit_id: visit,
    p_event_type: type, p_platform: Platform.OS, p_app_version: Constants.expoConfig?.version ?? 'unknown' };
  for (let attempt=0; attempt<2; attempt++) {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user.id !== owner) return;
      const { error } = await supabase.rpc('record_sponsor_banner_event', args).abortSignal(AbortSignal.timeout(4000));
      if (!error || (error.code && !['57014','PGRST000'].includes(error.code))) return;
    } catch { /* Metrics must never interrupt navigation. */ }
  }
}
