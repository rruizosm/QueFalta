import '@supabase/functions-js/edge-runtime.d.ts';
import { withSupabase } from '@supabase/server';
import {
  effectiveEmbeddingInputHash,
  parseEmbeddingJob,
} from './job-identity.mjs';
import {
  chunkBatch,
  finalizeBatchMessageIds,
  parseFinalizeBatchResult,
  settleBatchWithIsolation,
  shouldIsolateBatchFinalizeError,
} from './batch-contract.mjs';

const MODEL = 'text-embedding-3-small';
const DIMENSIONS = 512;
const MAX_JOBS = 200;
const OPENAI_BATCH_SIZE = 50;
const WRITE_BATCH_SIZE = 20;
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
  embedded_content_hash: string | null;
  content_version: string;
  embedding: unknown;
  model: string | null;
  published: boolean;
}

interface WorkItem {
  row: CatalogRow;
  jobs: EmbeddingJob[];
}

interface FinalizeTotals {
  completed: number;
  failed: number;
  stale: number;
}

interface EmbeddingWrite {
  msg_ids: number[];
  store: string;
  product_id: string;
  embedding_input_hash: string;
  expected_content_hash: string;
  content_version: string;
  model: string;
  embedding: number[];
}

class OpenAIError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

class BatchFinalizeError extends Error {
  code: string;

  constructor(error: any) {
    super(`catalog_finalize_embedding_batch: ${error?.message ?? 'unknown error'}`);
    this.code = typeof error?.code === 'string' ? error.code : '';
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
        .select('store,product_id,content,content_hash,embedding_input_hash,embedded_content_hash,content_version,embedding,model,published')
        .eq('store', store)
        .in('product_id', productIds);
      if (error) {
        const totals = emptyTotals();
        try {
          addFinalizeOutcome(
            totals,
            await finalizeFailures(admin, jobs, 'catalog_read_failed', error.message),
          );
        } catch (finalizeError) {
          return finalizeErrorResponse(totals, finalizeError, jobs.length);
        }
        const dispatched = await dispatchNextBatch(admin);
        return result(totals.completed, totals.failed, totals.stale, dispatched, deferredJobs(jobs.length, totals));
      }
      for (const row of (data ?? []) as CatalogRow[]) rowsByKey.set(productKey(row.store, row.product_id), row);
    }

    const staleIds: number[] = [];
    const work = new Map<string, WorkItem>();
    for (const job of jobs) {
      const row = rowsByKey.get(productKey(job.store, job.productId));
      if (
        !row
        || !row.published
        || effectiveEmbeddingInputHash(row) !== job.embeddingInputHash
        || row.content_version !== job.contentVersion
      ) {
        staleIds.push(job.msgId);
        continue;
      }
      if (
        row.embedding != null
        && row.model === job.model
        && effectiveEmbeddedContentHash(row) === job.embeddingInputHash
      ) {
        staleIds.push(job.msgId);
        continue;
      }
      const key = `${productKey(job.store, job.productId)}:${job.embeddingInputHash}:${job.contentVersion}:${job.model}`;
      const existing = work.get(key);
      if (existing) existing.jobs.push(job);
      else work.set(key, { row, jobs: [job] });
    }

    const items = [...work.values()];
    const totals = emptyTotals();
    try {
      for (const staleChunk of chunkBatch(staleIds, MAX_JOBS)) {
        addFinalizeOutcome(totals, await finalizeBatch(admin, {
          writes: [],
          stale_msg_ids: staleChunk,
          failure: null,
        }));
      }

      for (let offset = 0; offset < items.length; offset += OPENAI_BATCH_SIZE) {
        const openAIBatch = items.slice(offset, offset + OPENAI_BATCH_SIZE);
        let embeddings: number[][];
        try {
          embeddings = await createEmbeddings(
            openAIKey,
            openAIBatch.map((item) => item.row.content),
          );
        } catch (error) {
          const code = error instanceof OpenAIError ? error.code : 'openai_request_failed';
          addFinalizeOutcome(
            totals,
            await finalizeFailures(
              admin,
              openAIBatch.flatMap((item) => item.jobs),
              code,
              errorMessage(error),
            ),
          );
          // Cada sublote reclamado debe tener un intento real: PGMQ incrementa
          // read_ct al reclamar todo el request, no al llamar a OpenAI.
          continue;
        }

        const writes: EmbeddingWrite[] = openAIBatch.map((item, index) => ({
          msg_ids: item.jobs.map((job) => job.msgId),
          store: item.row.store,
          product_id: item.row.product_id,
          embedding_input_hash: item.jobs[0].embeddingInputHash,
          expected_content_hash: item.row.content_hash,
          content_version: item.jobs[0].contentVersion,
          model: item.jobs[0].model,
          embedding: embeddings[index],
        }));
        const jobsByMsgId = new Map(
          openAIBatch.flatMap((item) => item.jobs).map((job) => [job.msgId, job]),
        );

        for (const writeChunk of chunkBatch(writes, WRITE_BATCH_SIZE)) {
          await settleBatchWithIsolation(writeChunk, {
            execute: (batch: EmbeddingWrite[]) => finalizeBatch(admin, {
              writes: batch,
              stale_msg_ids: [],
              failure: null,
            }),
            onSingletonError: (write: EmbeddingWrite, error: unknown) => {
              const failedJobs = write.msg_ids.map((msgId) => jobsByMsgId.get(msgId));
              if (failedJobs.some((job) => !job)) throw new Error('missing_write_job');
              return finalizeFailures(
                admin,
                failedJobs as EmbeddingJob[],
                'catalog_update_failed',
                errorMessage(error),
              );
            },
            shouldIsolate: shouldIsolateBatchFinalizeError,
            onOutcome: (outcome: any) => addFinalizeOutcome(totals, outcome),
          });
        }
      }
    } catch (error) {
      return finalizeErrorResponse(totals, error, jobs.length);
    }

    const dispatched = await dispatchNextBatch(admin);
    return result(
      totals.completed,
      totals.failed,
      totals.stale,
      dispatched,
      deferredJobs(jobs.length, totals),
    );
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

async function finalizeFailures(
  admin: any,
  jobs: EmbeddingJob[],
  code: string,
  message: string,
): Promise<any> {
  if (!jobs.length) {
    return {
      completedMsgIds: [],
      failedMsgIds: [],
      staleMsgIds: [],
    };
  }
  const maxAttempts = ['credit_balance_exhausted', 'insufficient_quota'].includes(code) ? 20 : 5;
  return finalizeBatch(admin, {
    writes: [],
    stale_msg_ids: [],
    failure: {
      jobs: jobs.map((job) => ({
        msg_id: job.msgId,
        read_count: job.readCount,
        store: job.store,
        product_id: job.productId,
        embedding_input_hash: job.embeddingInputHash,
        content_version: job.contentVersion,
        model: job.model,
      })),
      code: code.slice(0, 100) || 'unknown_failure',
      message: message.slice(0, 1000) || 'unknown failure',
      max_attempts: maxAttempts,
    },
  });
}

async function finalizeBatch(admin: any, batch: Record<string, unknown>): Promise<any> {
  const expectedMessageIds = finalizeBatchMessageIds(batch);
  const { data, error } = await admin.rpc('catalog_finalize_embedding_batch', {
    p_batch: batch,
  });
  if (error) throw new BatchFinalizeError(error);
  return parseFinalizeBatchResult(data, expectedMessageIds);
}

function emptyTotals(): FinalizeTotals {
  return { completed: 0, failed: 0, stale: 0 };
}

function addFinalizeOutcome(totals: FinalizeTotals, outcome: any): void {
  totals.completed += outcome.completedMsgIds.length;
  totals.failed += outcome.failedMsgIds.length;
  totals.stale += outcome.staleMsgIds.length;
}

function finalizeErrorResponse(totals: FinalizeTotals, error: unknown, totalJobs: number): Response {
  return json({ error: 'batch_finalize_failed', detail: errorMessage(error) }, 500, {
    'X-Completed-Jobs': String(totals.completed),
    'X-Failed-Jobs': String(totals.failed),
    'X-Stale-Jobs': String(totals.stale),
    'X-Deferred-Jobs': String(deferredJobs(totalJobs, totals)),
    'X-Dispatched-Batches': '0',
  });
}

function deferredJobs(totalJobs: number, totals: FinalizeTotals): number {
  return Math.max(0, totalJobs - totals.completed - totals.failed - totals.stale);
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
const effectiveEmbeddedContentHash = (row: CatalogRow) => (
  row.embedded_content_hash ?? effectiveEmbeddingInputHash(row)
);
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);

function result(
  completed: number,
  failed: number,
  stale: number,
  dispatched = 0,
  deferred = 0,
): Response {
  return json({ completed, failed, stale, deferred, dispatched }, 200, {
    'X-Completed-Jobs': String(completed),
    'X-Failed-Jobs': String(failed),
    'X-Stale-Jobs': String(stale),
    'X-Deferred-Jobs': String(deferred),
    'X-Dispatched-Batches': String(dispatched),
  });
}

function json(body: unknown, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders },
  });
}
