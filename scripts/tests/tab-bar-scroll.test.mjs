import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const { outputText } = ts.transpileModule(readFileSync(new URL('../../src/components/bottom-tabs-pager/tabBarScrollPhysics.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { TAB_BAR_SCROLL: m, beginScrollIntent, advanceScrollIntent, tabBarTopReduction } =
  await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

function scroll(y = 0, initial = 0) {
  const state = beginScrollIntent(y, initial);
  let progress = initial;
  return (nextY) => {
    const result = advanceScrollIntent(state, nextY, progress);
    progress = result.expand ? 0 : result.progress;
    return { ...result, progress };
  };
}
test('downward scroll has a continuous dead zone and bounded progress', () => {
  const step = scroll();
  assert.equal(step(12).progress, 0);
  assert.equal(step(18).progress, 0);
  assert.equal(step(19).progress, 0.01);
  assert.equal(step(68).progress, 0.5);
  assert.equal(step(118).progress, 1);
  assert.equal(step(10000).progress, 1);
});
test('slow deliberate upward travel expands once; micro reversals do not flap', () => {
  const step = scroll(500, 1);
  for (const y of [498, 497, 496, 495, 494, 492]) assert.equal(step(y).expand, false);
  assert.equal(step(490).expand, true);
  assert.equal(step(470).expand, false);
  for (const y of [472, 471, 473, 470, 474, 471]) assert.equal(step(y).progress, 0);
});
test('an upward flick expands even when its first event reaches the top', () => {
  assert.equal(scroll(500, 1)(0).expand, true);
});
test('tap/tab rearming starts from the restored offset, never from zero', () => {
  const step = scroll(3000, 0);
  assert.equal(step(3000).progress, 0);
  assert.equal(step(3018).progress, 0);
  assert.equal(step(3019).progress, 0.01);
});
test('direction reversal requires another deliberate downward movement', () => {
  const step = scroll();
  assert.equal(step(118).progress, 1);
  assert.equal(step(108).expand, true);
  assert.equal(step(110).progress, 0);
  assert.equal(step(126).progress, 0);
  assert.equal(step(127).progress, 0.01);
});
test('stationary events never compact a short list', () => {
  const step = scroll();
  for (let i = 0; i < 30; i++) assert.equal(step(0).progress, 0);
});
test('spacer follows the actual capsule top edge and safe area remains clear', () => {
  let last = 0;
  for (let p = 0; p <= 1; p += 0.01) {
    const reduction = tabBarTopReduction(p);
    assert.ok(reduction >= last);
    assert.ok(reduction < 9);
    last = reduction;
  }
  assert.equal(tabBarTopReduction(0), 0);
  assert.equal(tabBarTopReduction(-1), 0);
  assert.equal(tabBarTopReduction(2), tabBarTopReduction(1));
  assert.ok(m.compactHeight * m.compactScale >= m.minTouchTarget);
  for (const screenWidth of [320, 375, 393, 430, 768]) {
    const barWidth = Math.min(460, screenWidth - 36);
    assert.ok((barWidth - 16) / 5 * m.compactScale >= m.minTouchTarget);
  }
  assert.ok(10 - m.compactTranslateY + m.compactHeight * (1 - m.compactScale) / 2 > 0);
});
test('one-pixel noise does not erase deliberate direction travel', () => {
  const down = scroll();
  for (const y of [4, 3, 8, 7, 12, 11, 16, 15, 20, 19, 24]) down(y);
  assert.equal(down(28).progress, 0.1);
  const up = scroll(100, 1);
  for (const y of [97, 98, 95, 96, 93, 94, 91, 92]) assert.equal(up(y).expand, false);
  assert.equal(up(90).expand, true);
});
