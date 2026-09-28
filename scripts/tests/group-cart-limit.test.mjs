import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const compile = (path) => ts.transpileModule(
  readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } },
).outputText;
const dataUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const limitsUrl = dataUrl(compile('src/constants/limits.ts'));
const releaseUrl = dataUrl('export const GROUP_CART_LIMIT_RELEASE_ENABLED = true;');
const groupLimitSource = compile('src/lib/groupCartLimit.ts')
  .replace("from '../constants/limits'", `from '${limitsUrl}'`)
  .replace("from './groupCartRelease'", `from '${releaseUrl}'`);
const { freeGroupCartIds, groupCartIsLocked } = await import(dataUrl(groupLimitSource));
const oldReleaseUrl = dataUrl('export const GROUP_CART_LIMIT_RELEASE_ENABLED = false;');
const oldGroupLimitSource = compile('src/lib/groupCartLimit.ts')
  .replace("from '../constants/limits'", `from '${limitsUrl}'`)
  .replace("from './groupCartRelease'", `from '${oldReleaseUrl}'`);
const { groupCartIsLocked: oldGroupCartIsLocked } = await import(dataUrl(oldGroupLimitSource));
const { isVersionAtLeast, releaseVersionForHost } = await import(dataUrl(compile('src/lib/appVersion.ts')));

test('the release gate starts at native app version 1.3.2', () => {
  assert.equal(isVersionAtLeast('1.3.1', '1.3.2'), false);
  assert.equal(isVersionAtLeast('1.3.2', '1.3.2'), true);
  assert.equal(isVersionAtLeast('1.3.3', '1.3.2'), true);
  assert.equal(isVersionAtLeast('1.4.0', '1.3.2'), true);
  assert.equal(isVersionAtLeast(null, '1.3.2'), false);
  assert.equal(isVersionAtLeast('1.3.2-beta', '1.3.2'), false);
  assert.equal(releaseVersionForHost('1.3.1', '1.3.2', false), '1.3.1');
  assert.equal(releaseVersionForHost('57.0.0', '1.3.2', true), '1.3.2');
  assert.equal(oldGroupCartIsLocked([
    { id: 'first', joinedAt: '2026-01-01T00:00:00Z' },
    { id: 'second', joinedAt: '2026-02-01T00:00:00Z' },
    { id: 'third', joinedAt: '2026-03-01T00:00:00Z' },
    { id: 'fourth', joinedAt: '2026-04-01T00:00:00Z' },
  ], 'fourth', false), false);
});

test('free carts belong to the three oldest memberships, even if the list is newest first', () => {
  const groups = [
    { id: 'new', joinedAt: '2026-04-01T00:00:00Z', createdAt: '2025-01-01T00:00:00Z' },
    { id: 'third', joinedAt: '2026-03-01T00:00:00Z', createdAt: '2024-01-01T00:00:00Z' },
    { id: 'first', joinedAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'second', joinedAt: '2026-02-01T00:00:00Z', createdAt: '2026-02-01T00:00:00Z' },
  ];
  assert.deepEqual([...freeGroupCartIds(groups)].sort(), ['first', 'second', 'third']);
  assert.equal(groupCartIsLocked(groups, 'new', false), true);
  assert.equal(groupCartIsLocked(groups, 'third', false), false);
  assert.equal(groupCartIsLocked(groups, 'new', true), false);
  assert.equal(groupCartIsLocked([{ ...groups[0], joinedAt: null }, ...groups.slice(1)], 'first', false), true);
});

test('the free selection is deterministic for equal join timestamps', () => {
  const groups = ['d', 'c', 'b', 'a'].map((id) => ({
    id, joinedAt: '2026-01-01T00:00:00Z', createdAt: '2026-01-01T00:00:00Z',
  }));
  assert.deepEqual([...freeGroupCartIds(groups)].sort(), ['a', 'b', 'c']);
});
