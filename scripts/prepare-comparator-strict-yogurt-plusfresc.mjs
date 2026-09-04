#!/usr/bin/env node
// Offline/stdout-only reproduction; no deployment or gold promotion.
import {readFileSync} from 'node:fs';
import {datasetHash as hash} from './lib/comparator-strict-dataset.mjs';
import {loadLabelCorpus} from './lib/comparator-strict-corpus-labels.mjs';
import {buildPlusfrescYogurtReview,PLUSFRESC_LAYER} from './lib/comparator-strict-yogurt-plusfresc.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(arg=>{
  const m=/^--(artifact|offset|limit)=(.+)$/.exec(arg);if(!m)throw Error('Unknown argument');return [m[1],m[2]];
}));
const artifact=args.artifact??'report';
if(!['products','annotations','index','report','manifest','review'].includes(artifact))throw Error('Unknown artifact');
const packet=buildPlusfrescYogurtReview(loadLabelCorpus());
const files=['scripts/lib/comparator-strict-yogurt-plusfresc-specs.mjs','scripts/lib/comparator-strict-yogurt-plusfresc.mjs',
  'scripts/prepare-comparator-strict-yogurt-plusfresc.mjs','scripts/lib/comparator-strict-yogurt-review.mjs',
  'scripts/lib/comparator-strict-corpus-labels.mjs','scripts/lib/comparator-strict-corpus.mjs',
  'scripts/lib/comparator-strict-dataset.mjs','scripts/lib/comparator-strict-labels.mjs',
  'docs/comparator-strict/CE-201-202-yogurt-evidence.json','docs/comparator-strict/dataset/label-yogurt-v1/products.json',
  'docs/comparator-strict/dataset/label-yogurt-v1/index.json','docs/comparator-strict/dataset/label-potatoes-v1/index.json',
  'docs/comparator-strict/dataset/label-corpus-v1/editorial.json','docs/comparator-strict/CE-202-yogurt-plusfresc-guide.md'];
const manifest={version:PLUSFRESC_LAYER,corpus_manifest_sha256:packet.report.source_manifest_sha256,
  code_and_preexisting_evidence:files.map(path=>({path,sha256:hash(readFileSync(path,'utf8'))})),
  hashes:packet.report.hashes,report_sha256:hash(packet.report),
  materialization:'219 new source reviews and compact pair index stored. 212 prior source reviews reused byte-identically. Full annotations stdout-reproducible and pinned by hash. Spanish source review, not complete yogurt family or gold.',
  CE201_complete:false,CE202_complete:false,CE203_complete:false,G2_pass:false};
const esc=s=>String(s).replaceAll('|','\\|').replaceAll('\n',' ');
const review=['# CE-201/202 — Yogures Plusfresc: dossier de primera revisión','',
  '219 fichas nuevas: 207 revisadas por atributos/formato y 12 por exclusión de alcance. Se reutilizan sin editar las 212 fichas del lote anterior.',
  '449 parejas nuevas compuestas desde estos hechos: 271 rechazos propuestos, 23 exclusiones y 155 abstenciones. No son revisiones humanas individuales ni resultados del motor.',
  'CE-201/202 siguen abiertas. Cero equivalencias completas, gold, ahorro y segunda revisión. 25 formatos compatibles en parejas no bastan para aprobar receta ni comercio.','',
  '[Guía](../../CE-202-yogurt-plusfresc-guide.md) · [Hechos y citas](products.json) · [Índice](index.json) · [Fichas anteriores reutilizadas](../label-yogurt-v1/products.json).',
  'Este dossier expone propuestas y no es el formulario ciego CE-203. Las citas contienen observación, captura, archivo, fila, campo, valor original y hashes.','',
  '| ID Plusfresc | Producto | Matriz | Formato | Hechos explícitos |',
  '|---|---|---|---|---|',
  ...packet.products.map(p=>`| ${p.key.split(':')[1]} | ${esc(p.display_name)} | ${p.matrix} | ${p.format.state}: ${p.format.count??'?'} × ${p.format.each?`${p.format.each.amount} ${p.format.each.dimension==='mass'?'mg':'ml'}`:'?'} | ${esc(Object.entries(p.attributes).filter(([,v])=>v.state!=='unknown').map(([k,v])=>`${k}=${v.state==='conflicting'?'CONFLICTO':JSON.stringify(v.value)}`).join('; '))} |`),
  '', '## Observaciones por referencia','',
  ...packet.products.map(p=>`- **${p.key}** — ${p.note} ${p.caveats.join(' ')}`.trimEnd()),'',
  'Reproducción: `node scripts/prepare-comparator-strict-yogurt-plusfresc.mjs --artifact=annotations --offset=0 --limit=20`.',
  'Sin escrituras en Supabase, app, cron, sincronizaciones o embeddings. Sin reextracción ni nuevas integraciones.',''].join('\n');
let value={...packet,manifest,review}[artifact];
if(args.offset!==undefined||args.limit!==undefined){
  const offset=Number(args.offset??0),limit=Number(args.limit??100);
  if(!Array.isArray(value)||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>6000)throw Error('Invalid slice');
  value=value.slice(offset,offset+limit);
}
process.stdout.write(typeof value==='string'?value:JSON.stringify(value)+'\n');
