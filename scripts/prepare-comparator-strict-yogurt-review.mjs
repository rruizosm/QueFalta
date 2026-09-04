#!/usr/bin/env node
// stdout-only reproduction, offline. This does not create a gold dataset.
import {readFileSync} from 'node:fs';
import {datasetHash as hash} from './lib/comparator-strict-dataset.mjs';
import {loadLabelCorpus} from './lib/comparator-strict-corpus-labels.mjs';
import {buildYogurtReview,YOGURT_REVIEW_VERSION} from './lib/comparator-strict-yogurt-review.mjs';
const args = Object.fromEntries(process.argv.slice(2).map(arg=>{
  const m = /^--(artifact|offset|limit)=(.+)$/.exec(arg);
  if (!m) throw Error('Unknown argument'); return [m[1],m[2]];
}));
const artifact = args.artifact ?? 'report';
if (!['products','annotations','index','report','manifest','review'].includes(artifact)) throw Error('Unknown artifact');
const packet = buildYogurtReview(loadLabelCorpus());
const files = ['scripts/lib/comparator-strict-yogurt-review-specs.mjs','scripts/lib/comparator-strict-yogurt-review.mjs',
  'scripts/prepare-comparator-strict-yogurt-review.mjs','scripts/lib/comparator-strict-corpus-labels.mjs',
  'scripts/lib/comparator-strict-corpus.mjs','scripts/lib/comparator-strict-labels.mjs','scripts/lib/comparator-strict-dataset.mjs',
  'docs/comparator-strict/dataset/label-corpus-v1/editorial.json','docs/comparator-strict/dataset/label-potatoes-v1/index.json',
  'docs/comparator-strict/CE-202-yogurt-source-review-guide.md'];
const manifest = {version:YOGURT_REVIEW_VERSION,corpus_manifest_sha256:packet.report.source_manifest_sha256,
  code_and_preexisting_evidence:files.map(path=>({path,sha256:hash(readFileSync(path,'utf8'))})),
  hashes:packet.report.hashes,report_sha256:hash(packet.report),
  materialization:'Reviewed products and compact pair index stored. Full annotations are stdout-reproducible and pinned by hash. This is an incremental batch, not the complete yogurt block.',
  CE201_complete:false,CE202_complete:false,CE203_complete:false,G2_pass:false};
const esc = x=>String(x).replaceAll('|','\\|').replaceAll('\n',' ');
const review = ['# CE-201/202 — Yogures, primer lote revisado','',
  `212 fichas: 72 Mercadona, 118 Consum, 22 Carrefour. ${packet.report.first_annotations_this_batch} parejas nuevas, compuestas desde hechos revisados; no son revisiones humanas individuales.`,
  '14 fichas ajenas al piloto tienen revisión solo de alcance; 198, revisión de atributos y formato. La familia completa sigue pendiente. Sin positivos íntegros, gold, segunda revisión ni ahorro aprobado.','',
  'Las citas con valores, campos, observaciones, capturas, filas y hashes están en [products.json](products.json). El [índice de parejas](index.json) conserva el vínculo a esas revisiones y las decisiones por dimensión.','',
  'Este dossier muestra propuestas: NO es un formulario ciego CE-203. Propietario: 20 % aleatorio más disputas, todavía sin sortear ni completar.','',
  '| Referencia | Producto | Matriz | Formato | Claims revisados |',
  '|---|---|---|---|---|',
  ...packet.products.map(p=>`| ${p.key} | ${esc(p.display_name)} | ${p.matrix} | ${p.format.state}: ${p.format.count ?? '?'} × ${p.format.each ? `${p.format.each.amount} ${p.format.each.dimension === 'mass' ? 'mg' : 'ml'}` : '?'} | ${esc(Object.entries(p.attributes).filter(([,v])=>v.state !== 'unknown').map(([k,v])=>`${k}=${v.state === 'conflicting' ? 'CONFLICTO' : JSON.stringify(v.value)}`).join('; '))} |`),
  '', '## Notas editoriales y conflictos','',
  ...packet.products.filter(p=>p.source_dispute || p.caveats.length || p.key.startsWith('carrefour:') || ['consum:7031974','consum:7443968','mercadona:20859','mercadona:21336'].includes(p.key))
    .map(p=>`- **${p.key}** — ${p.note} ${p.caveats.join(' ')}`.trimEnd()), '',
  'Reproducción: `node scripts/prepare-comparator-strict-yogurt-review.mjs --artifact=annotations --offset=0 --limit=20`.',
  'No modifica borradores, capas anteriores, fuentes, app ni Supabase. Fuentes idénticas solo se reutilizan para su observación exacta; no se transfieren hechos por marca/EAN.',''].join('\n');
let value = {...packet,manifest,review}[artifact];
if (args.offset !== undefined || args.limit !== undefined) {
  const offset = Number(args.offset ?? 0),limit = Number(args.limit ?? 100);
  if (!Array.isArray(value) || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 6000) throw Error('Invalid slice');
  value = value.slice(offset,offset + limit);
}
process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value) + '\n');
