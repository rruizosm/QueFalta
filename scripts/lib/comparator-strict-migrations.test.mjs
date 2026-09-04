import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { migrationTextBoundaryForm, reconcileStrictMigrations } from './comparator-strict-migrations.mjs';

const md5 = (sql) => createHash('md5').update(migrationTextBoundaryForm(sql)).digest('hex');
const remote = (version = '20260903000001', name = 'sample', sql = 'select 1') => ({
  version, name, statement_count: 1, joined_lf_md5: md5(sql), joined_semicolon_lf_md5: md5(sql),
});
const capture = (rows) => ({ total_rows: rows.length, rows, captured_at: '2026-09-03T00:00:00Z' });
const local = (file = '20260903000001_sample.sql', sql = 'select 1;\n') => ({ file, sql });

test('versión y texto iguales se correlacionan, sin autorizar aplicación', () => {
  const r = reconcileStrictMigrations([local()], capture([remote()]));
  assert.equal(r.rows[0].association, 'same_version'); assert.equal(r.rows[0].text_evidence, 'boundary_text_match');
  assert.equal(r.rows[0].apply_authorized, false); assert.deepEqual(r.automatic_actions, []);
});
test('mismo nombre con timestamp distinto conserva el desajuste', () => {
  const r = reconcileStrictMigrations([local('20260902000001_sample.sql')], capture([remote()]));
  assert.equal(r.rows[0].association, 'name_only'); assert.equal(r.rows[0].text_evidence, 'boundary_text_match');
});
test('un archivo legacy sin timestamp no se renombra ni considera pendiente por defecto', () => {
  const r = reconcileStrictMigrations([local('sample.sql')], capture([remote()]));
  assert.equal(r.rows[0].association, 'name_only'); assert.equal(r.rows[0].local_candidates[0].version, null);
});
test('versión idéntica con distinto SQL NO acredita equivalencia', () => {
  const r = reconcileStrictMigrations([local(undefined, 'select 2')], capture([remote()]));
  assert.equal(r.rows[0].text_evidence, 'text_equivalence_not_established');
});
test('no elimina comentarios ni modifica espacios de literales', () => {
  assert.notEqual(md5("select 'a  b'"), md5("select 'a b'"));
  assert.notEqual(md5('select 1 -- note'), md5('select 1'));
  assert.equal(md5(' \r\nselect 1;\r\n'), md5('select 1'));
});
test('los candidatos ambiguos no se eligen arbitrariamente', () => {
  const r = reconcileStrictMigrations([local('20260902000001_sample.sql'), local('sample.sql')], capture([remote()]));
  assert.equal(r.rows[0].association, 'ambiguous_local_candidates');
});
test('detecta el mismo fichero reclamado por dos entradas del historial', () => {
  const r = reconcileStrictMigrations([local('sample.sql')], capture([remote(), remote('20260903000002')]));
  assert.equal(r.multiply_claimed_local_files.length, 1);
});
test('retiene remote-only y local sin historial sin inferir estado desplegado', () => {
  const r = reconcileStrictMigrations([local('unrelated.sql')], capture([remote()]));
  assert.equal(r.rows[0].association, 'remote_only'); assert.equal(r.local_without_history_match.length, 1);
});
test('una captura truncada, duplicada o no íntegra se rechaza', () => {
  assert.throws(() => reconcileStrictMigrations([], { total_rows: 2, rows: [remote()] }), /incomplete/);
  assert.throws(() => reconcileStrictMigrations([], capture([remote(), remote()])), /invalid_remote/);
  assert.throws(() => reconcileStrictMigrations([local('../outside.sql')], capture([])), /invalid_local/);
});
test('sin SQL remoto la coincidencia de nombre no certifica contenido', () => {
  const r = reconcileStrictMigrations([local()], capture([{ ...remote(), joined_lf_md5: null, joined_semicolon_lf_md5: null }]));
  assert.equal(r.rows[0].text_evidence, 'remote_text_unavailable');
});
