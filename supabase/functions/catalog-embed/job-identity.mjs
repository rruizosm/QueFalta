export function effectiveEmbeddingInputHash(row) {
  return String(row?.embedding_input_hash ?? row?.content_hash ?? '');
}

export function parseEmbeddingJob(value, {
  stores,
  defaultModel,
}) {
  if (!value || typeof value !== 'object') throw new Error('job_not_object');
  const job = value;
  const parsed = {
    msgId: Number(job.msgId),
    readCount: Number(job.readCount),
    store: String(job.store ?? ''),
    productId: String(job.productId ?? ''),
    embeddingInputHash: String(job.embeddingInputHash ?? job.contentHash ?? ''),
    contentVersion: String(job.contentVersion ?? ''),
    model: String(job.model ?? defaultModel ?? ''),
  };
  if (!Number.isSafeInteger(parsed.msgId) || parsed.msgId < 1) throw new Error('invalid_msg_id');
  if (!Number.isInteger(parsed.readCount) || parsed.readCount < 1) throw new Error('invalid_read_count');
  if (!stores.has(parsed.store) || !parsed.productId) throw new Error('invalid_product_key');
  if (!/^[0-9a-f]{64}$/.test(parsed.embeddingInputHash)) throw new Error('invalid_content_identity');
  if (!parsed.contentVersion) throw new Error('invalid_content_version');
  if (parsed.model !== defaultModel) throw new Error('unsupported_model');
  return parsed;
}
