#!/usr/bin/env node
// Reproduce a frozen-source first annotation. stdout only; no network or writes.
import {readFileSync} from 'node:fs';
import {datasetHash} from './lib/comparator-strict-dataset.mjs';
import {loadLabelCorpus} from './lib/comparator-strict-corpus-labels.mjs';
import {buildPotatoReview, REVIEW_VERSION} from './lib/comparator-strict-potato-review.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(arg => {
  const m = /^--(artifact|offset|limit)=(.+)$/.exec(arg);
  if (!m) throw Error('Unknown argument');
  return [m[1], m[2]];
}));
const artifact = args.artifact ?? 'report';
if (!['products', 'annotations', 'index', 'report', 'review', 'manifest'].includes(artifact)) throw Error('Unknown artifact');
const packet = buildPotatoReview(loadLabelCorpus());
const files = ['scripts/lib/comparator-strict-potato-review-specs.mjs', 'scripts/lib/comparator-strict-potato-review.mjs',
  'scripts/prepare-comparator-strict-potato-review.mjs', 'scripts/lib/comparator-strict-corpus-labels.mjs',
  'scripts/lib/comparator-strict-corpus.mjs', 'scripts/lib/comparator-strict-labels.mjs',
  'docs/comparator-strict/dataset/label-corpus-v1/editorial.json',
  'docs/comparator-strict/CE-202-labeling-guide.md', 'docs/comparator-strict/CE-202-corpus-labeling-guide.md'];
const manifest = {version: REVIEW_VERSION, corpus_manifest_sha256: packet.report.source_manifest_sha256,
  code_and_preexisting_evidence: files.map(path => ({path, sha256: datasetHash(readFileSync(path, 'utf8'))})),
  hashes: packet.report.hashes, report_sha256: datasetHash(packet.report),
  materialization: 'Product source reviews and compact pair index stored. Full annotations reproducible by CLI and pinned by hash. Original CE-200 and v1 drafts/editorial annotations remain unchanged.',
  CE201_complete: false, CE202_complete: false, CE203_complete: false, G2_pass: false};
const esc = x => String(x).replaceAll('|', '\\|').replaceAll('\n', ' ');
const anchor = k => k.replaceAll(':', '-').toLowerCase();
const review = ['# CE-201/202 — Primera anotación del bloque de patatas', '',
  '2026-09-03. 146 fichas contrastadas: 53 de congelados y 93 confusores. Se componen 922 parejas desde hechos editoriales ligados a cada observación; NO son 922 revisiones humanas individuales ni gold.',
  'Los confusores reciben revisión del gate de alcance; no se aprueba su receta, formato o comercio. Las fichas admitidas reciben revisión de atributos y formato. Los desconocidos se refieren a la proyección adquirida, no a todo lo que pueda saber el supermercado.', '',
  `Decisiones propuestas: ${packet.report.decision_counts.rejected} rechazos, ${packet.report.decision_counts.excluded_scope} exclusiones, ${packet.report.decision_counts.abstain} abstenciones. No son errores medidos del motor.`,
  'Sin precio, disponibilidad o CP bilateral aprobados; sin requisito de antigüedad de 24 h. CE-203 sigue pendiente del propietario.', '',
  '## Índice de fichas revisadas', '',
  '| Referencia | Producto | Familia propuesta | Formato |', '|---|---|---|---|',
  ...packet.products.map(p => `| [${p.key}](#${anchor(p.key)}) | ${esc(p.display_name)} | ${p.family} | ${p.format.state}${p.format.nominal_mg ? ` · ${p.format.nominal_mg / 1000} g` : ''} |`), '',
  '## Lectura y reproducción', '',
  'El [índice de parejas](index.json) conserva cada par, las decisiones por dimensión y el vínculo a las fichas de [products.json](products.json). Las citas completas contienen campo, valor original, captura, observación, fila y SHA-256; las categorías enlazan a filas originales del árbol, no al rótulo de muestreo.',
  'Para ver anotaciones completas: `node scripts/prepare-comparator-strict-potato-review.mjs --artifact=annotations --offset=0 --limit=20`.',
  'La composición conserva cada estado independiente, no copia etiquetas de los borradores ni atributos entre tiendas. La revisión independiente deberá resolver interpretaciones y datos pendientes. Este dossier revela propuestas y NO es la interfaz ciega CE-203.', '',
  ...packet.products.flatMap(p => [`## ${anchor(p.key)}`, '', `${p.display_name} (${p.key})`, '',
    `Alcance: ${p.scope.state}. Matriz: ${p.form}. Profundidad: ${p.source_review_depth}.`, '',
    p.note, '', `Formato: ${p.format.reason}`, '',
    `Hechos explícitos: ${Object.entries(p.attributes).filter(([,v]) => v.state === 'known').map(([k,v]) => `${k}=${v.value}`).join('; ') || 'ninguno aplicable a las variantes del piloto'}.`, '',
    `No resueltos: ${Object.entries(p.attributes).filter(([,v]) => v.state === 'unknown').map(([k]) => k).join(', ')}. Motivos y presencia null/ausente por campo en products.json.`, '',
    `[Fuente original](../acquisition-v1/${p.source.file.split('/').at(-1)}) · fila ${p.source.pointer} · captura ${p.captured_at}.`,
    `SHA-256 fuente: ${p.source.sha256}. Observación: ${p.observation_id}. Revisión: ${p.review_id}.`, '']),
  'Los originales y las anotaciones previas no se sobrescriben. E09 se solapa, mantiene estados/decisión y solo cuenta una vez.', ''].join('\n');
let value = {...packet, review, manifest}[artifact];
if (args.offset || args.limit) {
  const offset = Number(args.offset ?? 0), limit = Number(args.limit ?? 100);
  if (!Array.isArray(value) || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 6000) throw Error('Invalid slice');
  value = value.slice(offset, offset + limit);
}
process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value) + '\n');
