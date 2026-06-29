import { Platform, View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
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

SplashScreen.preventAutoHideAsync();
// El splash nativo entrega el relevo al BootLoader con un fundido suave (lo
// oculta BootLoader en su primer layout, no aquí).
SplashScreen.setOptions({ duration: 280, fade: true });
configureNotificationHandler();

export default function App() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  if (!fontsLoaded) return null;

  const inner = (
    // SafeAreaProvider en la raíz: expone los insets del sistema (barra de
    // navegación de Android, home indicator de iOS) a toda la app, incluida la
    // barra de pestañas, para que nada se solape con los botones del sistema.
    <SafeAreaProvider>
    {/* LanguageProvider y ThemeProvider primero: retienen el render (splash
        visible) hasta aplicar idioma y color guardados, para que los textos y los
        StyleSheet se creen ya con la preferencia correcta (sin flash). */}
    <LanguageProvider>
      <ThemeProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <AuthProvider>
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
          </AuthProvider>
        </GestureHandlerRootView>
      </ThemeProvider>
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
