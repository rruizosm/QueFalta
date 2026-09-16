import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

async function load(file) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(`../../src/components/bottom-tabs-pager/${file}.ts`, import.meta.url), 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}
const { releaseTarget, fastMotion } = await load('physics');
const { TAB_MOTION: m } = await load('constants');
const release = (position, origin, velocity) => releaseTarget(position, origin, velocity, 5, m.distanceThreshold, m.releaseVelocity);

test('short slow swipes return to the current page, in both directions', () => {
  assert.equal(release(2.15, 2, 100), 2);
  assert.equal(release(1.85, 2, -100), 2);
});
test('crossing the displacement threshold commits without flick velocity', () => {
  assert.equal(release(2.3, 2, 0), 3);
  assert.equal(release(1.7, 2, 0), 1);
});
test('short flicks commit in the release direction', () => {
  assert.equal(release(2.04, 2, 1100), 3);
  assert.equal(release(1.96, 2, -1100), 1);
});
test('reversing direction returns toward the starting page', () => {
  assert.equal(release(2.6, 2, -1200), 2);
  assert.equal(release(1.4, 2, 1200), 2);
});
test('long drags can travel across more than one page', () => {
  assert.equal(release(2.4, 0, 0), 3);
  assert.equal(release(1.6, 4, 0), 1);
});
test('edges never select an out-of-range tab, even at extreme velocity', () => {
  assert.equal(release(0, 0, -10000), 0);
  assert.equal(release(4, 4, 10000), 4);
  for (let position = 0; position <= 4; position += 0.04) {
    for (const velocity of [-5000, -651, 0, 651, 5000]) {
      const target = release(position, Math.round(position), velocity);
      assert.ok(Number.isInteger(target) && target >= 0 && target < 5);
    }
  }
});
test('slow and stopped content is sharp; fast content has bounded 3–5 sigma', () => {
  const amount = (speed) => fastMotion(speed, m.blurVelocity, m.fullBlurVelocity);
  assert.equal(amount(0), 0);
  assert.equal(amount(m.blurVelocity), 0);
  assert.ok(amount(m.blurVelocity + 1) * m.maxBlurSigma >= 3);
  assert.equal(amount(m.fullBlurVelocity) * m.maxBlurSigma, 5);
  assert.equal(amount(100000), 1);
});
