import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../../src/components/SlidingSegments.tsx', import.meta.url),
  'utf8',
);

test('centra el fondo seleccionado de los segmentos compactos densos', () => {
  assert.match(source, /compact && dense && styles\.pillDenseCompact/);
  assert.match(source, /pillDenseCompact:\s*\{[\s\S]*?top:\s*PAD \+ 1/);
  assert.match(source, /pillDenseCompact:\s*\{[\s\S]*?bottom:\s*PAD \+ 1/);
  assert.match(source, /pillDenseCompact:\s*\{[\s\S]*?borderRadius:\s*DENSE_COMPACT_SEG_W \/ 2/);
  assert.doesNotMatch(source, /CenteredOptionsIcon|optionsIconOptical/);
});
