import { Image, Platform, StatusBar, View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { SpaceGrotesk_400Regular } from '@expo-google-fonts/space-grotesk/400Regular';
import { SpaceGrotesk_500Medium } from '@expo-google-fonts/space-grotesk/500Medium';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk/600SemiBold';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';
import * as SplashScreen from 'expo-splash-screen';
import Navigation from './src/navigation';
import { LanguageProvider } from './src/context/LanguageContext';
import { ThemeProvider } from './src/context/ThemeContext';
import { AuthProvider } from './src/context/AuthContext';
import { ProfileProvider } from './src/context/ProfileContext';
import { NotificationsProvider } from './src/context/NotificationsContext';
import { CartProvider } from './src/context/CartContext';
import { FavoritesProvider } from './src/context/FavoritesContext';
import { ToastProvider } from './src/context/ToastContext';
import { configureNotificationHandler } from './src/lib/notifications';

SplashScreen.preventAutoHideAsync().catch(() => {});
// El splash nativo entrega el relevo al BootLoader con un fundido suave (lo
// oculta BootLoader en su primer layout, no aquí).
SplashScreen.setOptions({ duration: 280, fade: true });
// Red de seguridad (sobre todo Android): si el primer layout del BootLoader no
// llega (arranque retenido o bug nativo del splash), descubre la app a los 4 s
// en vez de dejar el icono clavado. No-op si BootLoader ya lo ocultó.
setTimeout(() => { SplashScreen.hideAsync().catch(() => {}); }, 4000);
configureNotificationHandler();

const STARTUP_LOGO = require('./assets/quefalta-logo-blue.png');

/** Respaldo pintado por React mientras expo-font termina. Tiene exactamente el
 * mismo fondo e imagen que el storyboard nativo, así el watchdog nunca descubre
 * una ventana negra aunque una inicialización tarde más de lo previsto. */
function FontBootstrapScreen() {
  return (
    <View
      style={startup.container}
      onLayout={() => SplashScreen.hideAsync().catch(() => {})}
      accessibilityRole="progressbar"
      accessibilityLabel="Cargando"
    >
      <StatusBar barStyle="dark-content" backgroundColor="#E1EBF7" />
      <Image source={STARTUP_LOGO} resizeMode="contain" style={startup.logo} accessible={false} />
    </View>
  );
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  // Si la carga de fuentes FALLA hay que arrancar igualmente (con la fuente del
  // sistema): quedarse en null dejaría el splash nativo en pantalla para siempre.
  if (!fontsLoaded && !fontError) return <FontBootstrapScreen />;

  const inner = (
    // SafeAreaProvider en la raíz: expone los insets del sistema (barra de
    // navegación de Android, home indicator de iOS) a toda la app, incluida la
    // barra de pestañas, para que nada se solape con los botones del sistema.
    <SafeAreaProvider>
    {/* LanguageProvider retiene el render hasta aplicar el idioma. El tema vive
        bajo AuthProvider para aislar sus preferencias locales por cuenta. */}
    <LanguageProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AuthProvider>
          <ThemeProvider>
            <ProfileProvider>
              <NotificationsProvider>
                <CartProvider>
                  <FavoritesProvider>
                    <ToastProvider>
                      <Navigation />
                    </ToastProvider>
                  </FavoritesProvider>
                </CartProvider>
              </NotificationsProvider>
            </ProfileProvider>
          </ThemeProvider>
        </AuthProvider>
      </GestureHandlerRootView>
    </LanguageProvider>
    </SafeAreaProvider>
  );

  if (Platform.OS !== 'web') return inner;

  return (
    <View style={web.backdrop}>
      <View style={web.phone}>
        {inner}
      </View>
    </View>
  );
}

const web = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1a1a1a',
  },
  phone: {
    width: 390,
    height: 844,
    borderRadius: 50,
    overflow: 'hidden',
    borderWidth: 10,
    borderColor: '#2a2a2a',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 24 },
    shadowOpacity: 0.6,
    shadowRadius: 48,
  },
});

const startup = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E1EBF7',
  },
  logo: {
    width: 180,
    height: 150,
  },
});
