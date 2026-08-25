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
    return gradleConfig;
  });

  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') return gradleConfig;

    const source = gradleConfig.modResults.contents;
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
    }
    return gradleConfig;
  });
};
