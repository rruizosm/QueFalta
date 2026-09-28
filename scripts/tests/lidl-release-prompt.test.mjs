import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const prompt = read('src/components/LidlReleasePrompt.tsx');
const promptState = read('src/lib/lidlReleasePrompt.ts');
const profileApi = read('src/api/profile.ts');
const navigation = read('src/navigation/index.tsx');
const onboarding = read('src/screens/onboarding/StoresScreen.tsx');
const translations = read('src/i18n/translations.ts');
const appConfig = read('app.json');
const androidConfig = existsSync(new URL('../../android/app/build.gradle', import.meta.url))
  ? read('android/app/build.gradle') : null;
const iosConfig = existsSync(new URL('../../ios/QuFalta.xcodeproj/project.pbxproj', import.meta.url))
  ? read('ios/QuFalta.xcodeproj/project.pbxproj') : null;

test('1.3.1 pide una respuesta obligatoria con el logo de Lidl', () => {
  assert.match(prompt, /LIDL_LOGO = require\('\.\.\/\.\.\/assets\/stores\/lidl\.png'\)/);
  assert.match(prompt, /<Modal[\s\S]*onRequestClose=\{\(\) => \{\}\}/);
  assert.doesNotMatch(prompt, /testID=".*backdrop|accessibilityLabel=\{t\('common\.close'\)\}/);
  assert.match(prompt, /answer\('yes'\)/);
  assert.match(prompt, /answer\('no'\)/);
});

test('sí añade Lidl y no lo excluye, guardando antes de cerrar', () => {
  assert.match(prompt, /choice === 'yes' \? \[\.\.\.withoutLidl, 'lidl' as const\] : withoutLidl/);
  assert.match(prompt, /orderedRequest\.length > 0[\s\S]*store !== 'lidl'/);
  assert.match(prompt, /await updateProfile\(profile\.id, \{ catalogStores \}\)/);
  assert.match(prompt, /applyProfile\(\{ catalogStores \}\)/);
  assert.match(prompt, /writeLidlReleaseAnswer\(profile\.id, choice\)/);
  assert.match(prompt, /catch \{\s*setSaveError\(true\)/);
});

test('la decisión se aísla por versión y usuario, y las altas nuevas quedan marcadas', () => {
  assert.match(promptState, /LIDL_RELEASE_PROMPT_VERSION = '1\.3\.1'/);
  assert.match(promptState, /`\$\{LIDL_RELEASE_ANSWER_PREFIX\}\$\{LIDL_RELEASE_PROMPT_VERSION\}:\$\{userId\}`/);
  assert.match(onboarding, /writeLidlReleaseAnswer\(userId, selected\.includes\('lidl'\) \? 'yes' : 'no'\)/);
});

test('los avisos no se solapan con el requisito postal ni con la decisión de Lidl', () => {
  assert.match(navigation, /!needsPostalCode && !lidlPromptResolved/);
  assert.match(navigation, /<LidlReleasePrompt onResolved=\{handleLidlPromptResolved\} \/>/);
  assert.match(navigation, /!needsPostalCode && lidlPromptResolved && bmPromptResolved && eljamonPromptResolved \? <WhatsNewPrompt \/>/);
  assert.match(navigation, /!needsPostalCode && lidlPromptResolved && bmPromptResolved && eljamonPromptResolved \? <NativeStoreReviewPrompt \/>/);
});

test('Lidl deja de activarse silenciosamente al normalizar perfiles antiguos', () => {
  assert.match(profileApi, /const historicalStores = CATALOG_STORE_KEYS\.filter\(\(key\) => key !== 'lidl' && key !== 'bm' && key !== 'eljamon'\)/);
  assert.match(profileApi, /return valid\.length \? valid : historicalStores/);
  assert.doesNotMatch(profileApi, /historicalStores\.every/);
});

test('copy obligatorio disponible en castellano y catalán', () => {
  assert.match(translations, /required: 'Respuesta obligatoria'/);
  assert.match(translations, /title: 'Lidl ya está en QuéFalta'/);
  assert.match(translations, /yes: 'Sí, añadir Lidl'/);
  assert.match(translations, /required: 'Resposta obligatòria'/);
  assert.match(translations, /title: 'Lidl ja és a QuèFalta'/);
  assert.match(translations, /yes: 'Sí, afegeix Lidl'/);
});

test('la versión comercial queda alineada en Expo y los proyectos nativos presentes', () => {
  const version = JSON.parse(appConfig).expo.version;
  assert.match(version, /^1\.3\.\d+$/);
  const pattern = version.replaceAll('.', '\\.');
  if (androidConfig != null) assert.match(androidConfig, new RegExp(`versionName \"${pattern}\"`));
  if (iosConfig != null) assert.equal((iosConfig.match(new RegExp(`MARKETING_VERSION = ${pattern};`, 'g')) ?? []).length, 2);
});
