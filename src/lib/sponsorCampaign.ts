export interface SponsorCampaign {
  id: string;
  sponsor_name: string;
  image_path: string;
  destination_ios: string | null;
  destination_android: string | null;
  destination_web: string | null;
  accessibility_label_es: string;
  accessibility_label_ca: string;
  starts_at: string;
  ends_at: string | null;
  enabled: boolean;
  priority: number;
  updated_at: string;
}

export const CAMPAIGN_CACHE_TTL = 60 * 60 * 1000;
export interface CampaignSnapshot { fetchedAt: number; campaigns: SponsorCampaign[] }

export function isHttpsUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password;
  } catch { return false; }
}

export function parseCampaign(value: unknown): SponsorCampaign | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  for (const key of ['id', 'sponsor_name', 'accessibility_label_es', 'accessibility_label_ca']) {
    if (typeof row[key] !== 'string' || !row[key].trim()) return null;
  }
  if (typeof row.image_path !== 'string' || row.image_path.includes('..') ||
      !/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9._/-]+\.(jpg|jpeg|png|webp)$/.test(row.image_path)) return null;
  if (typeof row.enabled !== 'boolean' || typeof row.priority !== 'number' || !Number.isFinite(row.priority)) return null;
  for (const key of ['starts_at', 'updated_at']) {
    if (typeof row[key] !== 'string' || !Number.isFinite(Date.parse(row[key]))) return null;
  }
  if (row.ends_at !== null && (typeof row.ends_at !== 'string' || !Number.isFinite(Date.parse(row.ends_at)))) return null;
  if (row.ends_at !== null && Date.parse(row.ends_at as string) <= Date.parse(row.starts_at as string)) return null;
  for (const key of ['destination_ios', 'destination_android', 'destination_web']) {
    if (row[key] !== null && !isHttpsUrl(row[key])) return null;
  }
  return row as unknown as SponsorCampaign;
}

export function campaignDestination(campaign: SponsorCampaign, platform: string): string | null {
  return platform === 'ios' ? campaign.destination_ios : platform === 'android'
    ? campaign.destination_android : platform === 'web' ? campaign.destination_web : null;
}

export function selectCampaign(snapshot: unknown, platform: string, now = Date.now()): SponsorCampaign | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const { fetchedAt, campaigns } = snapshot as CampaignSnapshot;
  if (!Number.isFinite(fetchedAt) || fetchedAt > now || now - fetchedAt >= CAMPAIGN_CACHE_TTL || !Array.isArray(campaigns)) return null;
  return campaigns.map(parseCampaign).filter((c): c is SponsorCampaign => !!c && c.enabled &&
    Date.parse(c.starts_at) <= now && (c.ends_at === null || Date.parse(c.ends_at) > now) &&
    isHttpsUrl(campaignDestination(c, platform)))
    .sort((a, b) => b.priority - a.priority || Date.parse(b.updated_at) - Date.parse(a.updated_at) || a.id.localeCompare(b.id))[0] ?? null;
}
