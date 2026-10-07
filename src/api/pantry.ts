import { supabase } from '../lib/supabase';
import { isPantryImageUrl, type PantryProduct } from '../lib/pantryLayout';
import type { AppLanguage } from '../i18n';

export const PANTRY_SEARCH_PAGE_SIZE = 30;

/** The illustration filter is applied on the server before ordering/pagination. */
export async function searchPantryProducts(
  query: string,
  language: AppLanguage,
  offset = 0,
  signal?: AbortSignal,
): Promise<{ products: PantryProduct[]; hasMore: boolean }> {
  const nameColumn = language === 'ca' ? 'display_name_ca_norm' : 'display_name_norm';
  let request = supabase.from('mercadona_products')
    .select('id, display_name, display_name_ca, illustration_url')
    .eq('published', true)
    .not('illustration_url', 'is', null)
    .neq('illustration_url', '');
  // Words only: %, _, punctuation and PostgREST operators cannot broaden a query.
  const words = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .match(/[\p{L}\p{N}]+/gu) ?? [];
  for (const word of words) request = request.ilike(nameColumn, `%${word}%`);
  request = request.order(nameColumn).order('id').range(offset, offset + PANTRY_SEARCH_PAGE_SIZE);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  const rows = data ?? [];
  return {
    products: rows.slice(0, PANTRY_SEARCH_PAGE_SIZE).flatMap((row) => isPantryImageUrl(row.illustration_url) ? [{
      id: String(row.id),
      name: language === 'ca' && row.display_name_ca ? row.display_name_ca : row.display_name,
      illustrationUrl: row.illustration_url,
    }] : []),
    hasMore: rows.length > PANTRY_SEARCH_PAGE_SIZE,
  };
}
