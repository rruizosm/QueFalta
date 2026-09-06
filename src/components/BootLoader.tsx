/**
 * Continuidad estática del splash nativo mientras se prepara el estado inicial.
 * Se reutiliza durante la carga de fuentes para conservar imagen, tamaño y
 * posición en todo el arranque, sin una segunda presentación de marca.
 */
import { Image, View, StyleSheet, StatusBar } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useTranslation } from '../context/LanguageContext';

const LOGO = require('../../assets/quefalta-logo-blue.png');
const LOGO_BG = '#E1EBF7';

export default function BootLoader() {
  const { t } = useTranslation();

  return (
    <View
      style={styles.container}
      onLayout={() => SplashScreen.hideAsync().catch(() => {})}
      accessibilityRole="progressbar"
      accessibilityLabel={t('common.loading')}
      accessibilityState={{ busy: true }}
    >
      <StatusBar barStyle="dark-content" backgroundColor={LOGO_BG} />
      <Image source={LOGO} resizeMode="contain" style={styles.logo} accessible={false} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: LOGO_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 180,
    height: 180,
  },
});
