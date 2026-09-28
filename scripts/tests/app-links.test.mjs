import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const path = new URL('../../src/lib/appLinks.ts', import.meta.url);
const { outputText } = ts.transpileModule(readFileSync(path, 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
});
const { parseAppLink, WORD_GAME_SHARE_URL } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

test('el enlace compartido de la palabra lleva a Inicio', () => {
  assert.equal(WORD_GAME_SHARE_URL, 'https://quefalta.es/inicio?v=3');
  assert.deepEqual(parseAppLink(WORD_GAME_SHARE_URL), { type: 'home' });
  assert.deepEqual(parseAppLink('quefalta://inicio'), { type: 'home' });
});

test('las invitaciones de grupo conservan su destino', () => {
  assert.deepEqual(parseAppLink('https://quefalta.es/join/group-123'), {
    type: 'groupInvite',
    groupId: 'group-123',
  });
});

test('ignora rutas y dominios ajenos', () => {
  assert.equal(parseAppLink('https://example.com/inicio'), null);
  assert.equal(parseAppLink('https://quefalta.es/palabra'), null);
  assert.equal(parseAppLink('https://quefalta.es/%E0%A4%A'), null);
  assert.equal(parseAppLink('not a url'), null);
});
