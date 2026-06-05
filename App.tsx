import { useCallback } from 'react';
import { Platform, View, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  useFonts,
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import * as SplashScreen from 'expo-splash-screen';
import Navigation from './src/navigation';
import { AuthProvider } from './src/context/AuthContext';
import { ProfileProvider } from './src/context/ProfileContext';
import { CartProvider } from './src/context/CartContext';
import { configureNotificationHandler } from './src/lib/notifications';

SplashScreen.preventAutoHideAsync();
configureNotificationHandler();

export default function App() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });

  const onLayout = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  const inner = (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onLayout}>
      <AuthProvider>
        <ProfileProvider>
          <CartProvider>
            <Navigation />
          </CartProvider>
        </ProfileProvider>
      </AuthProvider>
    </GestureHandlerRootView>
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
