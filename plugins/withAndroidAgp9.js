const { withProjectBuildGradle, withGradleProperties, withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs/promises');
const path = require('node:path');

// Opt-in while the native dependencies are being validated with AGP 9.
module.exports = function withAndroidAgp9(config) {
  if (process.env.QUEFALTA_AGP9 !== '1') return config;
  config = withDangerousMod(config, ['android', async (mod) => {
    const expoRoot = path.dirname(require.resolve('expo/package.json', {
      paths: [mod.modRequest.projectRoot],
    }));
    const coreRoot = path.dirname(require.resolve('expo-modules-core/package.json', {
      paths: [expoRoot],
    }));
    const sourcePath = path.join(coreRoot,
      'expo-module-gradle-plugin/src/main/kotlin/expo/modules/plugin/android/AndroidLibraryExtension.kt');
    const source = await fs.readFile(sourcePath, 'utf8');
    const legacy = '    this@defaultConfig.targetSdk = targetSdk';
    const replacement = '    // AGP 9: library target SDK belongs to lint; app target SDK is unchanged.';
    const marker = '  lint.targetSdk = targetSdk';
    if (!source.includes(marker)) {
      if (!source.includes(legacy)) throw new Error('AGP 9 audit: Expo SDK setter changed; review patch');
      const updated = source.replace(legacy, replacement)
        .replace('  this.compileSdk = compileSdk', `  this.compileSdk = compileSdk\n${marker}`);
      if (!updated.includes(marker)) throw new Error('AGP 9 audit: cannot set library lint target SDK');
      await fs.writeFile(sourcePath, updated);
    }
    const reactPluginRoot = path.dirname(require.resolve('@react-native/gradle-plugin/package.json', {
      paths: [mod.modRequest.projectRoot],
    }));
    const reactPath = path.join(reactPluginRoot,
      'react-native-gradle-plugin/src/main/kotlin/com/facebook/react/ReactPlugin.kt');
    const reactSource = await fs.readFile(reactPath, 'utf8');
    const globalCalls = '    configureBuildConfigFieldsForLibraries(project)\n    configureNamespaceForLibraries(project)';
    const guardedCalls = '    // AGP 9: register global library callbacks only from the app plugin.\n'
      + '    project.pluginManager.withPlugin("com.android.application") {\n'
      + '      configureBuildConfigFieldsForLibraries(project)\n'
      + '      configureNamespaceForLibraries(project)\n    }';
    if (!reactSource.includes(guardedCalls)) {
      if (!reactSource.includes(globalCalls)) throw new Error('AGP 9 audit: React global callbacks changed; review patch');
      await fs.writeFile(reactPath, reactSource.replace(globalCalls, guardedCalls));
    }
    return mod;
  }]);
  config = withGradleProperties(config, (mod) => {
    // Expo/RN still use the external Kotlin plugin and legacy Android DSL.
    // Expo autolinking registers Provider directories in sourceSets. Its preBuild
    // already explicitly depends on generatePackagesList; no inferred task edge is needed.
    for (const key of ['android.builtInKotlin', 'android.newDsl', 'android.sourceset.disallowProvider']) {
      const existing = mod.modResults.find((item) => item.type === 'property' && item.key === key);
      if (existing) existing.value = 'false';
      else mod.modResults.push({ type: 'property', key, value: 'false' });
    }
    return mod;
  });
  return withProjectBuildGradle(config, (mod) => {
    const pattern = /classpath\(['"]com\.android\.tools\.build:gradle(?::[^'"]+)?['"]\)/g;
    if (!pattern.test(mod.modResults.contents)) {
      throw new Error('AGP 9 audit: Android Gradle plugin declaration not found');
    }
    mod.modResults.contents = mod.modResults.contents.replace(
      pattern, "classpath('com.android.tools.build:gradle:9.0.1')",
    );
    return mod;
  });
};
