import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const screen = readFileSync(
  new URL('../../src/screens/PriceAlertsScreen.tsx', import.meta.url),
  'utf8',
);

test('la cabecera de alertas cabe completa y el switch activo usa el accent sólido', () => {
  assert.match(screen, /titleFontSize=\{17\}/);
  assert.match(screen, /trackColor=\{\{ false: colors\.border, true: colors\.accent \}\}/);
  assert.match(screen, /thumbColor=\{colors\.white\}/);
  assert.match(screen, /accessibilityState=\{\{ checked: active \}\}/);
});
