import { supabase } from '../lib/supabase';
import type { CatalogStore } from '../constants/stores';

export type CatalogSyncStatus = {
  store: CatalogStore;
  syncedAt: string;
};

export async function fetchCatalogSyncStatuses(): Promise<CatalogSyncStatus[]> {
  const { data, error } = await supabase
    .from('catalog_sync_status')
    .select('store, synced_at')
    .order('synced_at', { ascending: false });

  if (error) throw error;
  return (data ?? []).map((row) => ({
    store: row.store as CatalogStore,
    syncedAt: row.synced_at,
  }));
}
