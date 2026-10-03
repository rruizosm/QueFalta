import { supabase } from '../lib/supabase';
import { parseCampaign, type CampaignSnapshot, type SponsorCampaign } from '../lib/sponsorCampaign';

export async function fetchSponsorCampaigns(): Promise<CampaignSnapshot> {
  const { data, error } = await supabase.from('sponsor_campaigns')
    .select('id,sponsor_name,image_path,destination_ios,destination_android,destination_web,accessibility_label_es,accessibility_label_ca,starts_at,ends_at,enabled,priority,updated_at')
    .eq('placement', 'home_banner').eq('enabled', true)
    .order('priority', { ascending: false }).order('updated_at', { ascending: false })
    .abortSignal(AbortSignal.timeout(8000));
  if (error) throw error;
  return { fetchedAt: Date.now(), campaigns: (data ?? []).map(parseCampaign).filter((c): c is SponsorCampaign => c !== null) };
}

export function promotionImageUrl(path: string): string {
  return supabase.storage.from('promotions').getPublicUrl(path).data.publicUrl;
}
