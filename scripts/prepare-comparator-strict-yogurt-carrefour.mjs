#!/usr/bin/env node
// OFFLINE/stdout-only; no deployment or gold promotion.
import {readFileSync} from 'node:fs';
import {datasetHash as hash} from './lib/comparator-strict-dataset.mjs';
import {loadLabelCorpus} from './lib/comparator-strict-corpus-labels.mjs';
import {buildCarrefourYogurtReview,CARREFOUR_LAYER} from './lib/comparator-strict-yogurt-carrefour.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{
  const m=/^--(artifact|offset|limit)=(.+)$/.exec(arg);if(!m)throw Error('Unknown argument');return [m[1],m[2]];
}));
const artifact=args.artifact??'report';
if(!['products','annotations','index','report','manifest','review'].includes(artifact))throw Error('Unknown artifact');
const packet=buildCarrefourYogurtReview(loadLabelCorpus()),r=packet.report;
const files=['scripts/lib/comparator-strict-yogurt-carrefour-specs.mjs','scripts/lib/comparator-strict-yogurt-carrefour.mjs',
  'scripts/prepare-comparator-strict-yogurt-carrefour.mjs','scripts/inspect-comparator-strict-carrefour-yogurt.mjs',
  'scripts/lib/comparator-strict-yogurt-review.mjs','scripts/lib/comparator-strict-corpus-labels.mjs','scripts/lib/comparator-strict-corpus.mjs',
  'scripts/lib/comparator-strict-dataset.mjs','scripts/lib/comparator-strict-labels.mjs',
  ...['corpus','potatoes','yogurt','yogurt-plusfresc'].map(n=>`docs/comparator-strict/CE-201-202-${n}-evidence.json`),
  ...['label-yogurt-v1','label-yogurt-plusfresc-v1'].flatMap(d=>['products','index'].map(n=>`docs/comparator-strict/dataset/${d}/${n}.json`)),
  'docs/comparator-strict/dataset/label-potatoes-v1/index.json','docs/comparator-strict/dataset/label-corpus-v1/editorial.json',
  ...Array.from({length:12},(_,i)=>`docs/comparator-strict/dataset/label-corpus-v1/index-${String(i*500).padStart(4,'0')}.json`),
  'docs/comparator-strict/CE-202-yogurt-carrefour-guide.md'];
const manifest={version:CARREFOUR_LAYER,corpus_manifest_sha256:r.source_manifest_sha256,
  code_and_preexisting_evidence:files.map(path=>({path,sha256:hash(readFileSync(path,'utf8'))})),hashes:r.hashes,report_sha256:hash(r),
  materialization:'545 new source reviews and compact index stored; 431 previous product reviews byte-identical. Full annotations stdout-reproducible and pinned. Source block complete, not full equivalence, owner review or gold.',
  CE201_complete:false,CE202_complete:false,CE203_complete:false,G2_pass:false};
const esc=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' ');
const review=['# CE-201/202 — Carrefour: dossier de primera revisión','',
  `${r.source_reviewed_products} fichas nuevas; ${r.reused_unchanged_product_reviews} previas reutilizadas. Las ${r.yogurt_source_reviews_total} observaciones del bloque yogur quedan registradas, incluidos confusores.`,
  `${r.first_annotations_this_batch} parejas compuestas, ${r.newly_first_annotated_corpus_pairs} nuevas; cuatro editoriales se revisitan sin duplicar cobertura. Unión ${r.union_first_annotated_corpus_pairs}/6.000; ${r.corpus_pairs_pending_first_annotation} pendientes de agua.`,
  `${r.decision_counts.rejected} rechazos, ${r.decision_counts.excluded_scope} exclusiones y ${r.decision_counts.abstain} abstenciones propuestos. No revisión humana individual ni calidad del motor.`,
  'CE-201/202 abiertas. Cero equivalencias completas, gold, ahorro o revisión independiente. E07 conserva desacuerdo editorial para arbitraje.','',
  '[Guía](../../CE-202-yogurt-carrefour-guide.md) · [Hechos/citas](products.json) · [Índice](index.json) · [Informe](report.json).',
  'Este dossier expone propuestas; no es el formulario ciego de CE-203.','',
  '| ID Carrefour | Producto | Matriz | Formato | Hechos explícitos |','|---|---|---|---|---|',
  ...packet.products.map(p=>`| ${p.key.split(':')[1]} | ${esc(p.display_name)} | ${p.matrix} | ${p.format.state}: ${p.format.count??'?'} × ${p.format.each?`${p.format.each.amount} ${p.format.each.dimension==='mass'?'mg':'ml'}`:'?'} | ${esc(Object.entries(p.attributes).filter(([,v])=>v.state!=='unknown').map(([k,v])=>`${k}=${v.state==='conflicting'?'CONFLICTO':JSON.stringify(v.value)}`).join('; '))} |`),
  '', '## Observaciones por referencia','',...packet.products.map(p=>`- **${p.key}** — ${p.note}`),
  '', 'Reproducción: `node scripts/prepare-comparator-strict-yogurt-carrefour.mjs --artifact=annotations --offset=0 --limit=20`.',
  'Sin escrituras en Supabase, app, cron, syncs o embeddings; sin reextracción ni nuevas integraciones.',''].join('\n');
let value={...packet,manifest,review}[artifact];
if(args.offset!==undefined||args.limit!==undefined){
  const offset=Number(args.offset??0),limit=Number(args.limit??100);
  if(!Array.isArray(value)||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>6000)throw Error('Invalid slice');
  value=value.slice(offset,offset+limit);
}
process.stdout.write(typeof value==='string'?value:JSON.stringify(value)+'\n');
