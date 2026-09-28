import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const screen = readFileSync(new URL('../../src/screens/DailyWordScreen.tsx', import.meta.url), 'utf8');
const copy = readFileSync(new URL('../../src/i18n/wordGame.ts', import.meta.url), 'utf8');
const streakBanner = readFileSync(new URL('../../src/components/WordStreakBanner.tsx', import.meta.url), 'utf8');

test('el resultado final elimina el mensaje de otra oportunidad y su sol', () => {
  assert.doesNotMatch(screen, /sunny-outline|wordGame\.lost/);
  assert.doesNotMatch(copy, /Mañana, otra oportunidad|Demà, una altra oportunitat/);
  assert.match(screen, /game\.status === 'won' && <View style=\{styles\.resultHeading\}>/);
});

test('la puntuación se destaca sin tarjeta y el tiempo aparece debajo', () => {
  const score = screen.indexOf('<View style={styles.scoreGroup}');
  const time = screen.indexOf('<View style={styles.timeBlock}>', score);
  assert(score >= 0 && time > score);
  assert.match(screen, /scoreGroup: \{ alignItems: 'center' \}/);
  assert.doesNotMatch(screen, /scoreGroup: \{[^\n]*(?:backgroundColor|borderColor|shadowColor|elevation)/);
  assert.match(screen, /bigScore: \{[^\n]*fontSize: 42/);
});

test('la finalización local muestra durante 4 s la racha actual con el fuego de Perfil', () => {
  assert.match(screen, /status && status !== 'playing'.*setPendingStreak/s);
  assert.match(screen, /stats\.currentStreak > 0/);
  assert.match(streakBanner, /WORD_STREAK_BANNER_DURATION_MS = 4_000/);
  assert.match(streakBanner, /name="flame-outline"/);
  assert.match(copy, /streakBannerLabel: 'Racha actual'.*streakBannerDayMany: 'días'/);
  assert.match(copy, /streakBannerLabel: 'Ratxa actual'.*streakBannerDayMany: 'dies'/);
});

test('el banner solo se monta cuando existe una racha recién completada', () => {
  assert.doesNotMatch(screen, /FORCE_STREAK_BANNER_PREVIEW|STREAK_BANNER_PREVIEW_DAYS/);
  assert.match(screen, /\{streakBanner !== null && <WordStreakBanner/);
  assert.doesNotMatch(streakBanner, /persistent/);
});

test('el banner replica el ancho útil y la altura de fila de la cabecera', () => {
  assert.match(streakBanner, /left: Math\.max\(16, insets\.left\)/);
  assert.match(streakBanner, /right: Math\.max\(16, insets\.right\)/);
  assert.match(streakBanner, /width: '100%', height: 56/);
});

test('el contador sube desde la racha previa y el fuego se mueve', () => {
  assert.match(streakBanner, /STREAK_NUMBER_DELAY_MS = 300/);
  assert.match(streakBanner, /previousStreak = Math\.max\(0, streak - 1\)/);
  assert.match(streakBanner, /outputRange: \[0, -28\]/);
  assert.match(streakBanner, /outputRange: \[28, 0\]/);
  assert.match(streakBanner, /Animated\.loop/);
  assert.match(streakBanner, /outputRange: \[1, 1\.16, 1\]/);
  assert.match(streakBanner, /fontSize: 18/);
  assert.match(streakBanner, /fontSize: 24/);
});
