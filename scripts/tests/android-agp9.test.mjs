import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../../plugins/withAndroidAgp9.js', import.meta.url), 'utf8');

function harness(enabled) {
  const callbacks = {};
  const files = new Map();
  const core = '/fixture/expo-modules-core/expo-module-gradle-plugin/src/main/kotlin/expo/modules/plugin/android/AndroidLibraryExtension.kt';
  const react = '/fixture/@react-native/gradle-plugin/react-native-gradle-plugin/src/main/kotlin/com/facebook/react/ReactPlugin.kt';
  files.set(core, '  this.compileSdk = compileSdk\n    this@defaultConfig.targetSdk = targetSdk');
  files.set(react, '    configureBuildConfigFieldsForLibraries(project)\n    configureNamespaceForLibraries(project)');
  const api = {
    withDangerousMod(config, [, callback]) { callbacks.native = callback; return config; },
    withGradleProperties(config, callback) { callbacks.properties = callback; return config; },
    withProjectBuildGradle(config, callback) { callbacks.gradle = callback; return config; },
  };
  const requireMock = (name) => {
    if (name === '@expo/config-plugins') return api;
    if (name === 'node:path') return path;
    if (name === 'node:fs/promises') return {
      async readFile(file) { assert.ok(files.has(file)); return files.get(file); },
      async writeFile(file, content) { files.set(file, content); },
    };
    throw new Error(`Unexpected import: ${name}`);
  };
  requireMock.resolve = (name) => `/fixture/${name}`;
  const context = { module: { exports: {} }, require: requireMock, process: { env: { QUEFALTA_AGP9: enabled } } };
  vm.runInNewContext(source, context);
  const config = {};
  assert.equal(context.module.exports(config), config);
  return { callbacks, files, core, react };
}

test('AGP 9 no modifica la configuración sin opt-in', () => {
  assert.deepEqual(Object.keys(harness(undefined).callbacks), []);
});

test('adaptaciones nativas AGP 9 son idempotentes y conservan el target de aplicación', async () => {
  const { callbacks, files, core, react } = harness('1');
  const mod = { modRequest: { projectRoot: '/fixture' } };
  await callbacks.native(mod);
  const first = [...files];
  await callbacks.native(mod);
  assert.deepEqual([...files], first);
  assert.match(files.get(core), /lint.targetSdk = targetSdk/);
  assert.doesNotMatch(files.get(core), /this@defaultConfig.targetSdk/);
  assert.match(files.get(react), /withPlugin\("com.android.application"\)/);
  files.set(react, 'unexpected upstream source');
  await assert.rejects(callbacks.native(mod), /review patch/);
});

test('AGP 9 fija versión y propiedades sin duplicarlas', () => {
  const { callbacks } = harness('1');
  const properties = { modResults: [] };
  callbacks.properties(properties);
  callbacks.properties(properties);
  assert.equal(properties.modResults.length, 3);
  assert.ok(properties.modResults.every(({ value }) => value === 'false'));
  const gradle = { modResults: { contents: "classpath('com.android.tools.build:gradle')" } };
  callbacks.gradle(gradle);
  callbacks.gradle(gradle);
  assert.equal(gradle.modResults.contents, "classpath('com.android.tools.build:gradle:9.0.1')");
  assert.throws(() => callbacks.gradle({ modResults: { contents: '' } }), /not found/);
});
