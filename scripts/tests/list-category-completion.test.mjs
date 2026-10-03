import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const screen = readFileSync(
  new URL('../../src/screens/ListScreen.tsx', import.meta.url),
  'utf8',
);

test('la cesta pliega automáticamente una categoría al completar su último producto', () => {
  assert.match(screen, /zoneGroup\.count > 0 && zoneGroup\.inCart === zoneGroup\.count/);
  assert.match(screen, /newlyCompleted\.forEach[\s\S]+next\.add\(key\)/);
  assert.match(screen, /automaticallyCollapsedZones\.current\.add\(key\)/);
});

test('el pliegue automático se revierte ante fallo y no impide reabrir manualmente', () => {
  assert.match(screen, /noLongerCompleted\.forEach[\s\S]+next\.delete\(key\)/);
  assert.match(screen, /automaticallyCollapsedZones\.current\.delete\(key\)/);
  assert.match(screen, /toggleZone[\s\S]+automaticallyCollapsedZones\.current\.delete\(key\)/);
});

test('la cabecera completada usa el color de acento dinámico', () => {
  assert.match(screen, /completed=\{zoneCompleted\}/);
  assert.match(screen, /zoneHeaderDone: \{ backgroundColor: colors\.accent \}/);
  assert.match(screen, /zoneHeaderTextDone: \{ color: '#ffffff' \}/);
});

test('las categorías completadas entran estabilizadas sin parpadeo inicial', () => {
  assert.match(screen, /initialCompletedZones[\s\S]+mergeCartItems\(cachedItems \?\? \[\]\)/);
  assert.match(screen, /useState<Set<string>>\([\s\S]+new Set\(initialCompletedZones\)/);
  assert.match(screen, /previouslyCompletedZones = useRef<Set<string>>\(new Set\(initialCompletedZones\)\)/);
  assert.match(screen, /nextCompletedZones[\s\S]+previouslyCompletedZones\.current = nextCompletedZones/);
  assert.match(screen, /completedBeforeMeasurement = completed && width === 0/);
  assert.match(screen, /useLayoutEffect\(\(\) => \{[\s\S]+renderedListId\.current === listId/);
  assert.match(screen, /activeListId\.current !== requestedListId/);
  assert.match(screen, /if \(!loading && itemsListId === listId && listId && userId\)/);
  assert.match(screen, /if \(itemsListId !== listId\) return/);
});
