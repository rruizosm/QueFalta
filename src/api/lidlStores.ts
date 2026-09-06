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

export async function fetchLidlStores(): Promise<LidlStoreCandidate[]> {
  const pageSize = 1000;
  const rows: any[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('lidl_stores')
      .select('id, name, street, street_number, postal_code, city, latitude, longitude, offer_region, zone')
      .eq('published', true)
      .eq('selectable', true)
      .order('city')
      .order('name')
      .order('id')
      .range(from, from + pageSize - 1);
    if (isDirectorySchemaMissing(error)) throw new LidlStoreDirectoryUnavailableError();
    if (error) throw error;
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) break;
  }
  return rows.map((row: any) => ({
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
  }));
}
