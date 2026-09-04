#!/usr/bin/env node
// Offline/stdout only. No credentials, services, writes, gold or production matcher.
import {readFileSync} from 'node:fs';
import {datasetHash} from './lib/comparator-strict-dataset.mjs';
import {buildCorpusLabelDrafts, buildEditorialAnnotations, loadLabelCorpus} from './lib/comparator-strict-corpus-labels.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const m = /^--(artifact|offset|limit)=(.+)$/.exec(arg); if (!m) throw Error('Unknown argument'); return [m[1], m[2]];
}));
const artifact = args.artifact ?? 'report';
if (!['products', 'locations', 'annotations', 'report', 'index', 'editorial', 'review', 'manifest'].includes(artifact)) throw Error('Unknown artifact');
const input = loadLabelCorpus();
const packet = buildCorpusLabelDrafts(input);
const specsPath = 'docs/comparator-strict/dataset/label-corpus-v1/editorial-specs.json';
const editorial = buildEditorialAnnotations(JSON.parse(readFileSync(specsPath, 'utf8')), input);
const index = packet.annotations.map(a => ({id: a.annotation_id, left: a.left, right: a.right,
  cohort: a.cohort, states: Object.fromEntries(Object.entries(a.product_labels).map(([k, v]) => [k, v.state])),
  decision_draft: a.contexts[0].decision, editorial_id: editorial.find(e => e.pair_id === a.pair_id)?.id ?? null}));
const report = {...packet.report, editorial_first_annotations: editorial.length,
  first_semantic_reviews: editorial.filter(e => e.cohort === 'editorial_subset_of_frozen_corpus').length,
  drafts_pending_first_semantic_review: packet.annotations.length - editorial.filter(e => e.cohort === 'editorial_subset_of_frozen_corpus').length,
  editorial_within_frozen_corpus: editorial.filter(e => e.cohort === 'editorial_subset_of_frozen_corpus').length,
  editorial_supplemental_challenges: editorial.filter(e => e.cohort !== 'editorial_subset_of_frozen_corpus').length,
  editorial_decisions: Object.fromEntries(['abstain', 'rejected', 'excluded_scope'].map(k => [k, editorial.filter(e => e.decision === k).length])),
  editorial_supplements_do_not_inflate_CE200: true, editorial_sha256: datasetHash(editorial), index_sha256: datasetHash(index)};
const codeFiles = ['scripts/lib/comparator-strict-corpus-labels.mjs', 'scripts/prepare-comparator-strict-corpus-labels.mjs', 'scripts/lib/comparator-strict-labels.mjs', specsPath];
const manifest = {version: report.version, task_status: 'CE201_CE202_in_progress', G2_pass: false,
  corpus_manifest: {path: 'docs/comparator-strict/dataset/corpus-v1/manifest.json', sha256: input.manifest_sha256},
  code_and_editorial_sources: codeFiles.map(path => ({path, sha256: datasetHash(readFileSync(path, 'utf8'))})), report,
  materialization: 'Compact index and editorial records stored. Full draft products/locations/annotations reproducible via CLI; hashes above freeze them. Drafts are not reviewed gold.'};
const names = new Map(input.products.map(p => [p.key, p.raw.display_name]));
const esc = x => String(x).replaceAll('|', '\\|').replaceAll('\n', ' ');
const review = ['# CE-201/202 — Anotaciones editoriales del corpus', '',
  '20 primeras anotaciones del asistente tras contrastar los campos fuente. NO son gold, segunda revisión ni el 20 % aleatorio de CE-203.',
  '7 parejas pertenecen al corpus congelado y 13 son retos complementarios elegidos a propósito. No modificar los pesos, denominadores ni las 1.200 Q originales.',
  'Precio, ubicación, disponibilidad y revisiones: desconocidos en todos los casos para ambos CP. Ningún ahorro aprobado.', '',
  '| Caso | Productos | Decisión propuesta | Motivo |', '|---|---|---|---|',
  ...editorial.map(e => `| [${e.id}](#${e.id.toLowerCase()}) | ${e.products.map(k => `${esc(names.get(k))} (${k})`).join(' / ')} | ${e.decision} | ${esc(e.reason)} |`), '',
  ...editorial.flatMap(e => [`## ${e.id}`, '', `${e.products.map(k => `${names.get(k)} (${k})`).join(' ↔ ')}`, '',
    `Procedencia: ${e.cohort}. Reloj del replay: ${e.reference_clock}.`, '',
    ...Object.entries(e.labels).map(([k, v]) => `- ${k}: ${v.state}. ${v.reason}`), '',
    '### Evidencia original', '',
    ...e.citations.flatMap(c => [`${c.product_key}; campo ${c.pointer}; captura ${c.captured_at}.`,
      `[Archivo fuente](../acquisition-v1/${c.source.file.split('/').at(-1)}) · fila ${c.source.pointer} · SHA-256 ${c.source.sha256}.`,
      '', '```json', JSON.stringify(c.value, null, 2).replaceAll('```', '\\u0060\\u0060\\u0060'), '```', '']),
  ]),
  'Los borradores automáticos permanecen intactos. Estas anotaciones se superponen por pair_id y observación; no son una interfaz ciega de revisión.', ''].join('\n');
let value = ({...packet, report, index, editorial, review, manifest})[artifact];
if (args.offset || args.limit) {
  const offset = Number(args.offset ?? 0), limit = Number(args.limit ?? 500);
  if (!Array.isArray(value) || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 6000) throw Error('Invalid slice');
  value = value.slice(offset, offset + limit);
}
process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value) + '\n');
