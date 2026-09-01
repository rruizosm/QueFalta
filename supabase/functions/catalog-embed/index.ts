import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import {
  effectiveEmbeddingInputHash,
  parseEmbeddingJob,
} from './job-identity.mjs';

const MODEL = 'text-embedding-3-small';
const DIMENSIONS = 512;
const MAX_JOBS = 200;
const STORES = new Set([
  'alcampo', 'aldi', 'ametller', 'bonarea', 'caprabo', 'carrefour',
  'condis', 'consum', 'dia', 'eroski', 'esclat', 'hiperdino',
  'mercadona', 'plusfresc', 'sorli', 'gadis', 'froiz', 'ahorramas',
]);

interface EmbeddingJob {
  msgId: number;
  readCount: number;
  store: string;
  productId: string;
  embeddingInputHash: string;
  contentVersion: string;
  model: string;
}

interface CatalogRow {
  store: string;
  product_id: string;
  content: string;
  content_hash: string;
  embedding_input_hash: string | null;
  content_version: string;
  embedding: unknown;
  model: string | null;
  published: boolean;
}

class OpenAIError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export default {
  fetch: withSupabase({ auth: 'none' }, async (req, ctx) => {
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const expectedToken = Deno.env.get('EMBEDDING_WORKER_TOKEN') ?? '';
    const providedToken = req.headers.get('X-Embedding-Worker-Token') ?? '';
    if (!expectedToken || !(await safeEqual(providedToken, expectedToken))) {
      return json({ error: 'unauthorized' }, 401);
    }

    const openAIKey = Deno.env.get('OPENAI_API_KEY') ?? '';
    if (!openAIKey) return json({ error: 'missing_openai_api_key' }, 500);

    let jobs: EmbeddingJob[];
    try {
      const body = await req.json();
      if (!Array.isArray(body) || body.length < 1 || body.length > MAX_JOBS) {
        return json({ error: 'invalid_batch_size' }, 400);
      }
      jobs = body.map((value) => parseEmbeddingJob(value, {
        stores: STORES,
        defaultModel: MODEL,
      })) as EmbeddingJob[];
    } catch (error) {
      return json({ error: 'invalid_payload', detail: errorMessage(error) }, 400);
    }

    // @supabase/server no conoce los tipos generados de este proyecto. Las
    // respuestas que usamos se validan/castean explícitamente más abajo.
    const admin = ctx.supabaseAdmin as any;
    const rowsByKey = new Map<string, CatalogRow>();
    const jobsByStore = new Map<string, EmbeddingJob[]>();
    for (const job of jobs) {
      const storeJobs = jobsByStore.get(job.store) ?? [];
      storeJobs.push(job);
      jobsByStore.set(job.store, storeJobs);
    }

    for (const [store, storeJobs] of jobsByStore) {
      const productIds = [...new Set(storeJobs.map((job) => job.productId))];
      const { data, error } = await admin
        .from('catalog_product_embeddings')
        .select('store,product_id,content,content_hash,embedding_input_hash,content_version,embedding,model,published')
        .eq('store', store)
        .in('product_id', productIds);
      if (error) {
        await markFailures(admin, jobs, 'catalog_read_failed', error.message);
        const dispatched = await dispatchNextBatch(admin);
        return result(0, jobs.length, 0, dispatched);
      }
      for (const row of (data ?? []) as CatalogRow[]) rowsByKey.set(productKey(row.store, row.product_id), row);
    }

    const deleteIds: number[] = [];
    const work = new Map<string, { row: CatalogRow; jobs: EmbeddingJob[] }>();
    for (const job of jobs) {
      const row = rowsByKey.get(productKey(job.store, job.productId));
      if (!row || !row.published || effectiveEmbeddingInputHash(row) !== job.embeddingInputHash) {
        deleteIds.push(job.msgId);
        continue;
      }
      if (row.embedding != null && row.model === job.model) {
        deleteIds.push(job.msgId);
        continue;
      }
      const key = `${productKey(job.store, job.productId)}:${job.embeddingInputHash}:${job.model}`;
      const existing = work.get(key);
      if (existing) existing.jobs.push(job);
      else work.set(key, { row, jobs: [job] });
    }

    const items = [...work.values()];
    let completed = 0;
    let failed = 0;
    if (items.length) {
      try {
        const embeddings = await createEmbeddings(openAIKey, items.map((item) => item.row.content));
        for (let index = 0; index < items.length; index += 1) {
          const item = items[index];
          const { data, error } = await admin
            .from('catalog_product_embeddings')
            .update({
              embedding: embeddings[index],
              model: MODEL,
              embedded_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('store', item.row.store)
            .eq('product_id', item.row.product_id)
            .eq('content_hash', item.row.content_hash)
            .select('product_id')
            .maybeSingle();

          if (error) {
            failed += item.jobs.length;
            await markFailures(admin, item.jobs, 'catalog_update_failed', error.message);
          } else {
            // Una fila ausente indica que cambió mientras se generaba el vector:
            // el trabajo ya es obsoleto y se elimina sin sobrescribir el nuevo hash.
            deleteIds.push(...item.jobs.map((job) => job.msgId));
            if (data) {
              completed += item.jobs.length;
              await admin.from('catalog_embedding_failures').delete().in('msg_id', item.jobs.map((job) => job.msgId));
            }
          }
        }
      } catch (error) {
        const code = error instanceof OpenAIError ? error.code : 'openai_request_failed';
        const message = errorMessage(error);
        failed += items.reduce((count, item) => count + item.jobs.length, 0);
        await markFailures(admin, items.flatMap((item) => item.jobs), code, message);
      }
    }

    if (deleteIds.length) {
      const { error } = await admin.rpc('catalog_delete_embedding_jobs', {
        p_msg_ids: [...new Set(deleteIds)],
      });
      if (error) return json({ error: 'queue_delete_failed', detail: error.message }, 500);
    }

    const dispatched = await dispatchNextBatch(admin);
    return result(completed, failed, deleteIds.length - completed, dispatched);
  }),
};

async function createEmbeddings(apiKey: string, inputs: string[]): Promise<number[][]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, input: inputs, dimensions: DIMENSIONS, encoding_format: 'float' }),
  });
  const text = await response.text();
  let payload: any;
  try { payload = JSON.parse(text); } catch { payload = null; }
  if (!response.ok) {
    throw new OpenAIError(response.status, payload?.error?.code || `http_${response.status}`, payload?.error?.message || text.slice(0, 500));
  }
  if (!Array.isArray(payload?.data) || payload.data.length !== inputs.length) throw new Error('incomplete_embedding_response');
  return payload.data.map((item: any, index: number) => {
    if (item.index !== index || !Array.isArray(item.embedding) || item.embedding.length !== DIMENSIONS) {
      throw new Error('invalid_embedding_response');
    }
    return item.embedding as number[];
  });
}

async function markFailures(admin: any, jobs: EmbeddingJob[], code: string, message: string): Promise<void> {
  await Promise.all(jobs.map(async (job) => {
    const maxAttempts = ['credit_balance_exhausted', 'insufficient_quota'].includes(code) ? 20 : 5;
    await admin.rpc('catalog_fail_embedding_job', {
      p_msg_id: job.msgId,
      p_store: job.store,
      p_product_id: job.productId,
      p_content_hash: job.embeddingInputHash,
      p_read_count: job.readCount,
      p_error_code: code.slice(0, 100),
      p_error_message: message.slice(0, 1000),
      p_max_attempts: maxAttempts,
    });
  }));
}

async function dispatchNextBatch(admin: any): Promise<number> {
  const { data, error } = await admin.rpc('catalog_dispatch_embedding_jobs', {
    p_max_requests: 1,
  });
  if (error) {
    console.warn('embedding_dispatch_failed', { message: error.message });
    return 0;
  }
  return Array.isArray(data) ? data.length : 0;
}

async function safeEqual(left: string, right: string): Promise<boolean> {
  const key = crypto.getRandomValues(new Uint8Array(32));
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const encoder = new TextEncoder();
  const [leftHash, rightHash] = await Promise.all([
    crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(left)),
    crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(right)),
  ]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) difference |= leftBytes[index] ^ rightBytes[index];
  return difference === 0;
}

const productKey = (store: string, productId: string) => `${store}:${productId}`;
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

function result(completed: number, failed: number, stale: number, dispatched = 0): Response {
  return json({ completed, failed, stale, dispatched }, 200, {
    'X-Completed-Jobs': String(completed),
    'X-Failed-Jobs': String(failed),
    'X-Stale-Jobs': String(stale),
    'X-Dispatched-Batches': String(dispatched),
  });
}

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
