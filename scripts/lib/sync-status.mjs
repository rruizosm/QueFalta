/** Registra la finalización correcta de un sync de catálogo en Supabase. */
export async function recordCatalogSync({ url, key, store, syncedAt = new Date().toISOString() }) {
  const response = await fetch(`${url}/rest/v1/catalog_sync_status?on_conflict=store`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ store, synced_at: syncedAt }),
  });
  if (!response.ok) throw new Error(`No se pudo registrar el sync de ${store}: ${await response.text()}`);
}
