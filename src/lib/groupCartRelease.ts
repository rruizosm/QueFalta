import { requireOptionalNativeModule } from 'expo';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { isVersionAtLeast, releaseVersionForHost } from './appVersion';

export const GROUP_CART_LIMIT_MIN_VERSION = '1.3.2';

/** La versión de la build instalada no cambia al recibir una actualización OTA. */
function installedAppVersion(): string | null {
  // Expo Go y web no llevan el binario de QuéFalta: durante desarrollo usamos
  // la versión del proyecto. El dev client y las builds usan su versión nativa.
  return releaseVersionForHost(
    requireOptionalNativeModule<{ nativeApplicationVersion?: string }>('ExpoApplication')
      ?.nativeApplicationVersion ?? null,
    Constants.expoConfig?.version ?? null,
    Platform.OS === 'web' || Constants.appOwnership === 'expo',
  );
}

export const GROUP_CART_LIMIT_RELEASE_ENABLED = isVersionAtLeast(
  installedAppVersion(), GROUP_CART_LIMIT_MIN_VERSION,
);
