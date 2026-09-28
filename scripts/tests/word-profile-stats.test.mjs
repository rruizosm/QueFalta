import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync(new URL('../../src/lib/wordProfileStats.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { activityMonths, parseWordProfileStats } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
test('12 calendar months include leap days and Monday alignment across years', () => {
  const months = activityMonths('2024-03-31');
  assert.equal(months.length, 12);
  assert(months[0].month.startsWith('2023-04-01'));
  const feb = months[10].cells.filter(Boolean);
  assert.equal(feb.length, 29);
  assert.equal(feb.at(-1), '2024-02-29');
  assert.equal(months[11].cells[4], '2024-03-01');
  const days = months.flatMap(m => m.cells.filter(Boolean));
  assert.equal(new Set(days).size, days.length);
});
test('reject malformed payloads instead of showing invented zero statistics', () => {
  const valid = { today: '2026-09-26', currentStreak: 0, bestStreak: 0, completedCount: 0, activityDays: [], bestPositions: {} };
  assert.deepEqual(parseWordProfileStats(valid), valid);
  for (const bad of [null, {}, { ...valid, today: '2026-02-30' }, { ...valid, currentStreak: -1 }, { ...valid, bestStreak: -1 },
    { ...valid, activityDays: ['bad'] }, { ...valid, bestPositions: { daily: { rank: 0 } } }]) {
    assert.throws(() => parseWordProfileStats(bad));
  }
});
