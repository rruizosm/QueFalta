const { withAndroidManifest, createRunOncePlugin } = require('@expo/config-plugins');

// Google Play uses this manifest declaration to filter out large and
// extra-large screen configurations while keeping all standard phone
// densities available.
const PHONE_SCREEN_SIZES = ['small', 'normal'];
const PHONE_SCREEN_DENSITIES = [
  'ldpi',
  'mdpi',
  'hdpi',
  'xhdpi',
  'xxhdpi',
  'xxxhdpi',
];

function withPhoneOnlyAndroid(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = modConfig.modResults.manifest;

    manifest['compatible-screens'] = [
      {
        screen: PHONE_SCREEN_SIZES.flatMap((screenSize) =>
          PHONE_SCREEN_DENSITIES.map((screenDensity) => ({
            $: {
              'android:screenSize': screenSize,
              'android:screenDensity': screenDensity,
            },
          })),
        ),
      },
    ];

    return modConfig;
  });
}

module.exports = createRunOncePlugin(
  withPhoneOnlyAndroid,
  'with-phone-only-android',
  '1.0.0',
);
