import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const path = new URL('../../src/lib/wordGameShare.ts', import.meta.url);
const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { buildWordGameShareMessage } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

test('el resultado compartido conserva filas y colores sin incluir letras', () => {
  const message = buildWordGameShareMessage({
    title: 'Palabra de hoy · QuéFalta',
    day: '2026-09-19',
    scoreLine: '2/6 · 85 puntos',
    feedbackRows: [
      ['absent', 'present', 'correct', 'absent', 'correct'],
      ['correct', 'correct', 'correct', 'correct', 'correct'],
    ],
    url: 'https://quefalta.es/inicio?v=3',
  });

  assert.match(message, /⬛🟨🟩⬛🟩\n🟩🟩🟩🟩🟩/);
  assert.equal(message.includes('QUESO'), false);
  assert.equal(message.includes('ARROZ'), false);
  assert.match(message, /2\/6 · 85 puntos/);
  assert.equal(message.includes(' · ES'), false);
  assert.equal(message.includes(' · CA'), false);
  assert.match(message, /https:\/\/quefalta\.es\/inicio\?v=3$/);
});
