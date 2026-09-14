const {
  withAppBuildGradle,
  withGradleProperties,
} = require('@expo/config-plugins');

const upsertGradleProperty = (properties, key, value) => {
  const current = properties.find((item) => item.type === 'property' && item.key === key);
  if (current) current.value = value;
  else properties.push({ type: 'property', key, value });
};

/**
 * Keeps release-only Android safeguards reproducible after every Expo prebuild.
 * EAS injects the real upload keystore after prebuild; a local release remains
 * unsigned unless the developer configures production credentials explicitly.
 */
module.exports = function withAndroidReleaseHardening(config) {
  config = withGradleProperties(config, (gradleConfig) => {
    upsertGradleProperty(
      gradleConfig.modResults,
      'android.enableMinifyInReleaseBuilds',
      'true',
    );
    upsertGradleProperty(
      gradleConfig.modResults,
      'android.enableShrinkResourcesInReleaseBuilds',
      'true',
    );
    // AGP 8.12 supports the integrated code/resource graph, but only enables
    // it automatically from AGP 9 onwards.
    upsertGradleProperty(
      gradleConfig.modResults,
      'android.r8.optimizedResourceShrinking',
      'true',
    );
    return gradleConfig;
  });

  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') return gradleConfig;

    const legacyDefaultRules = 'getDefaultProguardFile("proguard-android.txt")';
    const optimizedDefaultRules = 'getDefaultProguardFile("proguard-android-optimize.txt")';
    const source = gradleConfig.modResults.contents.replaceAll(
      legacyDefaultRules,
      optimizedDefaultRules,
    );
    const buildTypesStart = source.indexOf('buildTypes {');
    const releaseStart = source.indexOf('release {', buildTypesStart);
    const releaseEnd = source.indexOf('\n        }', releaseStart);
    const unsafeSigning = 'signingConfig signingConfigs.debug';
    const signingStart = source.indexOf(unsafeSigning, releaseStart);

    if (
      buildTypesStart >= 0
      && releaseStart >= 0
      && releaseEnd > releaseStart
      && signingStart > releaseStart
      && signingStart < releaseEnd
    ) {
      gradleConfig.modResults.contents =
        source.slice(0, signingStart)
        + '// Release signing is injected by EAS Build; never fall back to the debug key.'
        + source.slice(signingStart + unsafeSigning.length);
    } else gradleConfig.modResults.contents = source;
    return gradleConfig;
  });
};
