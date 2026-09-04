import { supabase } from '../lib/supabase';

export interface LidlStoreCandidate {
  id: string;
  name: string;
  street: string | null;
  streetNumber: string | null;
  postalCode: string;
  city: string;
  latitude: number;
  longitude: number;
  offerRegion: string | null;
  zone: string;
  distanceKm: number | null;
  matchKind: 'exact' | 'nearby';
  rank: number;
  isDefault: boolean;
  catalogSyncedAt: string | null;
}

export class LidlStoreDirectoryUnavailableError extends Error {
  constructor() {
    super('Lidl store directory is not deployed');
    this.name = 'LidlStoreDirectoryUnavailableError';
  }
}

function isDirectorySchemaMissing(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : '';
  const message = [record.message, record.details, record.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return ['42883', '42P01', 'PGRST202', 'PGRST205'].includes(code)
    && (message.includes('find_lidl_stores') || message.includes('lidl_stores'));
}

export async function fetchLidlStoreCandidates(
  postalCode: string,
  limit = 3,
): Promise<LidlStoreCandidate[]> {
  if (!/^\d{5}$/.test(postalCode)) return [];
  const { data, error } = await supabase.rpc('find_lidl_stores', {
    p_postal_code: postalCode,
    p_limit: limit,
  });
  if (isDirectorySchemaMissing(error)) throw new LidlStoreDirectoryUnavailableError();
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    name: String(row.name),
    street: row.street ?? null,
    streetNumber: row.street_number ?? null,
    postalCode: String(row.postal_code),
    city: String(row.city),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    offerRegion: row.offer_region ?? null,
    zone: String(row.zone),
    distanceKm: row.distance_km == null ? null : Number(row.distance_km),
    matchKind: row.match_kind === 'nearby' ? 'nearby' : 'exact',
    rank: Number(row.candidate_rank),
    isDefault: row.is_default === true,
    catalogSyncedAt: row.catalog_synced_at ?? null,
  }));
}
