#!/usr/bin/env node
// One assisted GET only. No automatic loop, retries, SQL, or metrics job.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { CATALOG_PROBE, catalogProbeHash, catalogProbeUrl, catalogProbeBlockers, readCatalogProbeOnce } from './lib/comparator-catalog-probe.mjs';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('docs/comparator-strict/CE-100-catalog-probe-manifest.json', root), 'utf8'));
const actualSourceHash = createHash('sha256').update(readFileSync(new URL('src/api/catalog.ts', root))).digest('hex');
if (manifest.client_source_sha256 !== actualSourceHash) throw new Error('CE100_CLIENT_SOURCE_CHANGED');
const blockers = catalogProbeBlockers(manifest);
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log(JSON.stringify({ mode: 'plan', operation: CATALOG_PROBE, operation_hash: catalogProbeHash, url: catalogProbeUrl(), blockers, network_calls: 0 }, null, 2));
} else {
  const expected = ['--read-once', '--project-ref', CATALOG_PROBE.projectRef, '--confirm', catalogProbeHash];
  if (args.length !== expected.length || args.some((v, i) => v !== expected[i])) throw new Error('CE100_EXPLICIT_REQUEST_REQUIRED');
  if (blockers.length) throw new Error(`CE100_PREFLIGHT: ${blockers.join(',')}`);
  const env = parseEnv(readFileSync(new URL('.env.local', root), 'utf8'));
  if (env.EXPO_PUBLIC_SUPABASE_URL !== CATALOG_PROBE.origin) throw new Error('CE100_ENDPOINT_MISMATCH');
  const result = await readCatalogProbeOnce({ anonKey: env.EXPO_PUBLIC_SUPABASE_ANON_KEY, manifest });
  console.log(JSON.stringify(result));
  if (!result.success) process.exitCode = 1;
}
