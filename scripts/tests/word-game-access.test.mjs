import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/lib/wordGameAccess.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { hasActiveWordGameBlock, formatWordGameBlockedUntil } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

test('el bloqueo de Palabra solo está activo mientras la fecha sea futura', () => {
  const now = Date.parse('2026-10-05T12:00:00Z');
  assert.equal(hasActiveWordGameBlock(null, now), false);
  assert.equal(hasActiveWordGameBlock('invalid', now), false);
  assert.equal(hasActiveWordGameBlock('2026-10-05T11:59:59Z', now), false);
  assert.equal(hasActiveWordGameBlock('2026-10-05T12:00:00Z', now), false);
  assert.equal(hasActiveWordGameBlock('2026-10-05T12:00:01Z', now), true);
});

test('la fecha del bloqueo se presenta en la zona horaria de Madrid', () => {
  const formatted = formatWordGameBlockedUntil('2026-10-05T22:30:00Z', 'es');
  assert.match(formatted, /6/);
  assert.match(formatted, /octubre/);
  assert.match(formatted, /00:30/);
});
