#!/usr/bin/env node
// CE-203 offline/stdout-only blind review packet. No credentials, network or writes.
import {readFileSync} from 'node:fs';
import {datasetHash as hash} from './lib/comparator-strict-dataset.mjs';
import {
  buildOwnerReview,
  OWNER_REVIEW_VERSION,
  renderBlindReview,
  WATER_CLOSURE_RECEIPT,
  WATER_CLOSURE_RECEIPT_SHA256
} from './lib/comparator-strict-owner-review.mjs';

const args = {};
for (const arg of process.argv.slice(2)) {
  const match = /^--(artifact|offset|limit|batch|batch-size)=(.+)$/.exec(arg);
  if (!match) throw Error('Unknown argument');
  if (Object.hasOwn(args, match[1])) throw Error('Duplicate argument');
  args[match[1]] = match[2];
}
const artifact = args.artifact ?? 'report';
if (!['report', 'manifest', 'index', 'cases', 'responses', 'review'].includes(artifact)) throw Error('Unknown artifact');

const packet = buildOwnerReview();
const codeAndPolicy = [
  'scripts/lib/comparator-strict-owner-review.mjs',
  'scripts/prepare-comparator-strict-owner-review.mjs',
  'docs/comparator-strict/CE-203-owner-review-guide.md',
  'docs/comparator-strict/CE-202-labeling-guide.md'
];
const manifest = {
  version: OWNER_REVIEW_VERSION,
  status: 'blind_owner_review_packet_ready_owner_review_not_started',
  corpus_manifest: {
    path: 'docs/comparator-strict/dataset/corpus-v1/manifest.json',
    sha256: packet.report.seed_material.corpus_manifest_sha256
  },
  first_annotation_closure: {
    path: WATER_CLOSURE_RECEIPT,
    sha256: WATER_CLOSURE_RECEIPT_SHA256
  },
  code_and_policy: codeAndPolicy.map(path => ({path, sha256: hash(readFileSync(path, 'utf8'))})),
  report: packet.report,
  materialization: 'Compact blind index/report/manifest stored. Full source-only blind cases and blank response template are deterministic stdout artifacts. Case-level selection reasons and first annotations are not exposed by this CLI.'
};

let value = ({...packet, manifest})[artifact];
if (artifact === 'review') {
  if (args.offset || args.limit) throw Error('Use batch arguments for review');
  const batch = Number(args.batch ?? 1), batchSize = Number(args['batch-size'] ?? 25);
  if (!Number.isSafeInteger(batch) || batch < 1 || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 25) throw Error('Invalid batch');
  value = renderBlindReview(packet.cases.slice((batch - 1) * batchSize, batch * batchSize));
} else if (args.batch || args['batch-size']) {
  throw Error('Batch arguments are review-only');
} else if (args.offset || args.limit) {
  const offset = Number(args.offset ?? 0), limit = Number(args.limit ?? 100);
  if (!Array.isArray(value) || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > packet.index.length) throw Error('Invalid slice');
  value = value.slice(offset, offset + limit);
}

process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value) + '\n');
