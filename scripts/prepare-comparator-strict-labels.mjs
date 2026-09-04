#!/usr/bin/env node
// CE-201/202. Explicit local files only; stdout only. No env, RPC or label predictions.
import {readFileSync} from 'node:fs';
import {datasetHash, importExploratorySample, buildExploratoryPairs} from './lib/comparator-strict-dataset.mjs';
import {buildAnnotationPacket, annotationReport, buildSyntheticLabelCases} from './lib/comparator-strict-labels.mjs';

const root = new URL('../', import.meta.url);
const dir = 'docs/comparator-strict/dataset/label-pilot-v1/';
const sourcePaths = {
  sample: 'docs/comparator-strict/fixtures/catalog-sample-2026-09-03.json',
  products: 'docs/comparator-strict/dataset/seed-v1/products.json',
  pairs: 'docs/comparator-strict/dataset/seed-v1/pairs.json',
  realSpecs: dir + 'real-case-specs.json',
  syntheticSpecs: dir + 'contract-case-specs.json',
  legacy: 'docs/comparator-strict/fixtures/contract-cases-v1.json',
};
const arg = process.argv[2] ?? '--artifact=report';
const allowed = ['report', 'annotations', 'contracts', 'review'];
if (process.argv.length > 3 || !arg.startsWith('--artifact=') || !allowed.includes(arg.slice(11))) {
  throw new Error('Usage: --artifact=report|annotations|contracts|review');
}
const texts = Object.fromEntries(Object.entries(sourcePaths).map(([key, path]) =>
  [key, readFileSync(new URL(path, root), 'utf8')]));
const input = Object.fromEntries(Object.entries(texts).map(([key, text]) => [key, JSON.parse(text)]));
const products = importExploratorySample(input.sample,
  {sourcePath: sourcePaths.sample, sourceSha256: datasetHash(texts.sample)});
if (datasetHash(products) !== datasetHash(input.products)
  || datasetHash(buildExploratoryPairs(products)) !== datasetHash(input.pairs)) {
  throw new Error('ce202_seed_drift');
}
const annotations = buildAnnotationPacket(input.realSpecs, {products, pairs: input.pairs});
const contracts = buildSyntheticLabelCases(input.syntheticSpecs, input.legacy,
  {path: sourcePaths.legacy, sha256: datasetHash(texts.legacy)});
const report = {...annotationReport(annotations), synthetic_contract_cases: contracts.length,
  historical_contract_cases_reused: contracts.filter(c => c.historical_fixture).length,
  additional_synthetic_cases: contracts.filter(c => !c.historical_fixture).length,
  contracts_sha256: datasetHash(contracts),
  synthetic_is_not_real_coverage: true, partial_T30_T31_are_not_CE207_tests: true,
  source_files: Object.entries(sourcePaths).map(([key, path]) => ({path, sha256: datasetHash(texts[key])})),
  remote_project_calls: 0, dependencies_added: 0};
const esc = value => value.replaceAll('|', '\\|').replaceAll('\n', ' ');
const names = Object.fromEntries(products.map(p => [p.product_key, p.raw.display_name]));
const review = ['# CE-201/202 — Lote exploratorio de revisión', '',
  'Propuestas del asistente, NO etiquetas gold. 22 parejas elegidas de la semilla histórica; no representativas.',
  'No se ha realizado tu segunda revisión CE-203 ni sorteado el 20 % del corpus completo.',
  'Revisar evidencia y razonamiento; no aceptar una propuesta por coincidir con un resultado del motor.', '',
  'Reloj del snapshot: ' + input.sample.captured_at + '. CP 08006 = contexto de prueba, no ubicación acreditada.',
  'En TODAS las parejas: precio, ubicación, disponibilidad y revisiones comerciales = desconocidos.',
  'Los casos rechazados/excluidos conservan esas lagunas; el rechazo no prueba el resto de dimensiones.', '',
  '| Caso | Origen | Candidato | Propuesta | Motivo |', '|---|---|---|---|---|',
  ...annotations.map(r => `| ${r.case_id} | ${esc(names[r.target.origin_key])} (${r.target.origin_key}) | ${esc(names[r.target.candidate_key])} (${r.target.candidate_key}) | ${r.decision} | ${esc(r.reason)} |`),
  '', '## Cómo leer las propuestas', '',
  '- `excluded_scope`: al menos un producto está fuera del piloto; no se declara similitud ni ahorro.',
  '- `rejected`: existe una incompatibilidad explícita; no implica que todos los demás datos sean conocidos.',
  '- `abstain`: faltan datos o hay conflicto; no equivale a un negativo confirmado.',
  '- Cada etiqueta y cita literal está en [annotations.json](annotations.json), ligada a producto, observación y SHA-256.',
  '- Guía completa: [CE-202-labeling-guide.md](../../CE-202-labeling-guide.md).',
  '- Sin positivos reales aprobados: los positivos hipotéticos están aparte en [contracts.json](contracts.json).',
  '', 'La revisión independiente debe registrarse aparte, conservando propuesta, cambios, motivo y evidencia.',
  'Este lote no sustituye el corpus CE-200 ni el muestreo aleatorio/arbitraje de CE-203.', ''].join('\n');
const value = {report, annotations, contracts, review}[arg.slice(11)];
process.stdout.write(typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n');
