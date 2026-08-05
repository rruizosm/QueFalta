import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import {
  NavigationContainer, createNavigationContainerRef,
  DefaultTheme, DarkTheme, type Theme,
} from '@react-navigation/native';
import {
  createBottomTabNavigator, BottomTabBar, type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import {
  RootTabParamList,
  HomeStackParamList,
  CatalogStackParamList,
  GroupsStackParamList,
} from '../types';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useNotifications } from '../context/NotificationsContext';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { joinGroup } from '../api/groups';
import {
  addNotificationResponseListener,
  getInitialNotificationData,
  type PushData,
} from '../lib/notifications';

import HomeScreen       from '../screens/HomeScreen';
import FavoritesScreen  from '../screens/FavoritesScreen';
import NewArrivalsScreen from '../screens/NewArrivalsScreen';
import PriceChangesScreen from '../screens/PriceChangesScreen';
import OffersScreen from '../screens/OffersScreen';
import ProfileScreen    from '../screens/ProfileScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import PrivacySecurityScreen from '../screens/PrivacySecurityScreen';
import CatalogStoresScreen from '../screens/CatalogStoresScreen';
import AppearanceScreen from '../screens/AppearanceScreen';
import LanguageScreen from '../screens/LanguageScreen';
import HistoryScreen from '../screens/HistoryScreen';
import FriendsScreen from '../screens/FriendsScreen';
import HelpScreen from '../screens/HelpScreen';
import AboutScreen from '../screens/AboutScreen';
import CatalogScreen    from '../screens/CatalogScreen';
import SubCategoryScreen from '../screens/SubCategoryScreen';
import ProductsScreen   from '../screens/ProductsScreen';
import BonpreuProductsScreen from '../screens/BonpreuProductsScreen';
import CarrefourProductsScreen from '../screens/CarrefourProductsScreen';
import BonareaProductsScreen from '../screens/BonareaProductsScreen';
import ConsumProductsScreen from '../screens/ConsumProductsScreen';
import DiaProductsScreen from '../screens/DiaProductsScreen';
import SorliProductsScreen from '../screens/SorliProductsScreen';
import CondisProductsScreen from '../screens/CondisProductsScreen';
import AmetllerProductsScreen from '../screens/AmetllerProductsScreen';
import AldiProductsScreen from '../screens/AldiProductsScreen';
import HiperdinoProductsScreen from '../screens/HiperdinoProductsScreen';
import AlcampoProductsScreen from '../screens/AlcampoProductsScreen';
import PlusfrescProductsScreen from '../screens/PlusfrescProductsScreen';
import TapestryProductsScreen from '../screens/TapestryProductsScreen';
import ListScreen       from '../screens/ListScreen';
import GroupsScreen     from '../screens/GroupsScreen';
import GroupDetailScreen from '../screens/GroupDetailScreen';
import GroupMembersScreen from '../screens/GroupMembersScreen';
import AddMemberScreen from '../screens/AddMemberScreen';
import LoginScreen      from '../screens/LoginScreen';
import OnboardingNavigator from '../screens/onboarding/OnboardingNavigator';
import RegionGateScreen from '../screens/onboarding/RegionGateScreen';
import RegionSettingsScreen from '../screens/RegionSettingsScreen';
import BootLoader       from '../components/BootLoader';
import ReviewPrompt     from '../components/ReviewPrompt';
import { glassAvailable } from '../components/GlassSurface';
import LiquidGlassTabBar, {
  LIQUID_TABBAR_HEIGHT, liquidTabBarBottom,
} from '../components/LiquidGlassTabBar';

const Tab          = createBottomTabNavigator<RootTabParamList>();
const HomeStack    = createNativeStackNavigator<HomeStackParamList>();
const CatalogStack = createNativeStackNavigator<CatalogStackParamList>();
const GroupsStack  = createNativeStackNavigator<GroupsStackParamList>();

export const navigationRef = createNavigationContainerRef<RootTabParamList>();

/** Tiempo mínimo que se ve el BootLoader (logo + animación de carga) al aparecer
 *  un usuario: arranque con sesión cacheada y, sobre todo, inicio de sesión. */
const BOOT_MIN_MS = 2000;

/** Tope del arranque: las llamadas de sesión/perfil van SIN timeout, así que con
 *  la red colgada (típico en Android al abrir la app mientras renegocia Wi-Fi/
 *  datos) `booting` no se apagaría nunca y el logo quedaba clavado hasta matar
 *  la app. Pasado el tope se arranca con lo que haya. */
const BOOT_MAX_MS = 10000;

function AppTabBar(props: BottomTabBarProps) {
  return glassAvailable ? <LiquidGlassTabBar {...props} /> : <BottomTabBar {...props} />;
}

function parseInviteUrl(url: string): string | null {
  const parsed = Linking.parse(url);
  const segments = [parsed.hostname, ...(parsed.path ? parsed.path.split('/') : [])].filter(Boolean) as string[];
  const idx = segments.indexOf('join');
  return idx >= 0 && segments[idx + 1] ? segments[idx + 1] : null;
}

function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="HomeMain"    component={HomeScreen} />
      <HomeStack.Screen name="Favorites"   component={FavoritesScreen} />
      <HomeStack.Screen name="NewArrivals" component={NewArrivalsScreen} />
      <HomeStack.Screen name="PriceChanges" component={PriceChangesScreen} />
      <HomeStack.Screen name="Offers"      component={OffersScreen} />
      <HomeStack.Screen name="Profile"     component={ProfileScreen} />
      <HomeStack.Screen name="EditProfile" component={EditProfileScreen} />
      <HomeStack.Screen name="PrivacySecurity" component={PrivacySecurityScreen} />
      <HomeStack.Screen name="CatalogStores" component={CatalogStoresScreen} />
      <HomeStack.Screen name="RegionSettings" component={RegionSettingsScreen} />
      <HomeStack.Screen name="Appearance" component={AppearanceScreen} />
      <HomeStack.Screen name="Language" component={LanguageScreen} />
      <HomeStack.Screen name="History" component={HistoryScreen} />
      <HomeStack.Screen name="Friends" component={FriendsScreen} />
      <HomeStack.Screen name="Help" component={HelpScreen} />
      <HomeStack.Screen name="About" component={AboutScreen} />
    </HomeStack.Navigator>
  );
}

function CatalogNavigator() {
  return (
    <CatalogStack.Navigator screenOptions={{ headerShown: false }}>
      <CatalogStack.Screen name="CatalogHome" component={CatalogScreen} />
      <CatalogStack.Screen name="SubCategory" component={SubCategoryScreen} />
      <CatalogStack.Screen name="Products"    component={ProductsScreen} />
      <CatalogStack.Screen name="BonpreuProducts" component={BonpreuProductsScreen} />
      <CatalogStack.Screen name="CarrefourProducts" component={CarrefourProductsScreen} />
      <CatalogStack.Screen name="BonareaProducts" component={BonareaProductsScreen} />
      <CatalogStack.Screen name="ConsumProducts" component={ConsumProductsScreen} />
      <CatalogStack.Screen name="DiaProducts" component={DiaProductsScreen} />
      <CatalogStack.Screen name="SorliProducts" component={SorliProductsScreen} />
      <CatalogStack.Screen name="EroskiProducts" component={TapestryProductsScreen} />
      <CatalogStack.Screen name="CapraboProducts" component={TapestryProductsScreen} />
      <CatalogStack.Screen name="CondisProducts" component={CondisProductsScreen} />
      <CatalogStack.Screen name="AmetllerProducts" component={AmetllerProductsScreen} />
      <CatalogStack.Screen name="AldiProducts" component={AldiProductsScreen} />
      <CatalogStack.Screen name="HiperdinoProducts" component={HiperdinoProductsScreen} />
      <CatalogStack.Screen name="AlcampoProducts" component={AlcampoProductsScreen} />
      <CatalogStack.Screen name="PlusfrescProducts" component={PlusfrescProductsScreen} />
    </CatalogStack.Navigator>
  );
}

function GroupsNavigator() {
  return (
    <GroupsStack.Navigator screenOptions={{ headerShown: false }}>
      <GroupsStack.Screen name="GroupsHome"   component={GroupsScreen} />
      <GroupsStack.Screen name="GroupDetail"  component={GroupDetailScreen} />
      <GroupsStack.Screen name="GroupMembers" component={GroupMembersScreen} />
      <GroupsStack.Screen name="AddMember"   component={AddMemberScreen} />
    </GroupsStack.Navigator>
  );
}

/** Tema de React Navigation derivado de la paleta de la app: evita el flash
 *  blanco del contenedor entre transiciones (sobre todo en modo oscuro). */
function navTheme(scheme: 'light' | 'dark'): Theme {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: {
      ...base.colors,
      background: colors.paper,
      card:       colors.white,
      text:       colors.ink,
      border:     colors.border,
      primary:    colors.accent,
    },
  };
}

export default function Navigation() {
  const { session, loading } = useAuth();
  // Suscribe al tema: re-evalúa screenOptions y el tema del contenedor al cambiar accent/modo.
  const { scheme } = useTheme();
  const theme = navTheme(scheme);
  // Suscribe al idioma: re-renderiza los títulos de las pestañas al cambiarlo.
  const { t } = useTranslation();
  const { show: showToast } = useToast();
  const { profile, loading: profileLoading } = useProfile();
  const { unreadCount } = useNotifications();
  const userId = session?.user.id;
  // Solo Android lo necesita: con edge-to-edge dibuja la barra bajo los botones de
  // navegación y, al fijarle una `height` numérica, BottomTabBar deja de reservar
  // ese hueco solo (de ahí el solape). En iOS la barra ya se veía bien con la
  // altura fija, así que ahí no sumamos nada.
  const insets = useSafeAreaInsets();
  const bottomInset = Platform.OS === 'android' ? insets.bottom : 0;
  // Con la barra flotante de cristal (iOS 26) el "alto" que reserva react-nav
  // para que useTabBarBottomPadding empuje el contenido = alto de la barra + su
  // separación real al borde inferior (la barra se pinta en absolute; ver
  // LiquidGlassTabBar). liquidTabBarBottom ya mete la barra dentro del área
  // segura, así que NO se vuelve a sumar insets.bottom.
  const glassTabBarHeight = LIQUID_TABBAR_HEIGHT + liquidTabBarBottom(insets.bottom);

  // Tiempo mínimo que se ve el BootLoader (logo + animación de carga): 2 s cada
  // vez que aparece un usuario. Cubre el arranque en frío con sesión cacheada y,
  // sobre todo, el inicio de sesión (antes el logo solo parpadeaba lo que tardara
  // el fetch del perfil). El temporizador se re-arma al cambiar userId (login).
  // Se ancla a userId, así que sin sesión (arranque sin login / logout) no aplica
  // mínimo: se va al login al instante.
  const [minTimePassed, setMinTimePassed] = useState(false);
  useEffect(() => {
    if (!userId) return;
    setMinTimePassed(false);
    const id = setTimeout(() => setMinTimePassed(true), BOOT_MIN_MS);
    return () => clearTimeout(id);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    const handleUrl = async (url: string | null) => {
      if (!url) return;
      const groupId = parseInviteUrl(url);
      if (!groupId) return;
      try {
        const joined = await joinGroup(groupId, userId);
        if (joined) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          showToast(t('nav.joinedGroup'));
        }
      } catch { /* already a member or RLS */ }
      if (navigationRef.isReady()) {
        (navigationRef.navigate as any)('Groups', {
          screen: 'GroupDetail',
          params: { groupId },
        });
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));
    return () => sub.remove();
  }, [userId]);

  // Tap en una notificación push → abre la pantalla correspondiente. Cubre el
  // arranque en frío (getInitialNotificationData) y la app ya abierta (listener).
  useEffect(() => {
    if (!userId) return;

    const handleData = (data: PushData) => {
      if (!navigationRef.isReady()) return;
      if ((data.type === 'cart' || data.type === 'group_invite') && data.groupId) {
        (navigationRef.navigate as any)('Groups', {
          screen: 'GroupDetail',
          params: { groupId: data.groupId },
        });
      } else if (data.type === 'friend') {
        (navigationRef.navigate as any)('Home', { screen: 'Friends' });
      }
    };

    getInitialNotificationData().then((data) => { if (data) handleData(data); });
    const sub = addNotificationResponseListener(handleData);
    return () => sub.remove();
  }, [userId]);

  // Arranque: mantén el BootLoader visible mientras se resuelve la sesión y, si
  // la hay, el primer fetch del perfil (evita parpadear el onboarding antes de
  // saber si onboarded_at existe), o hasta cumplir el tiempo mínimo. Es lo
  // primero que se renderiza en cada arranque → es quien oculta el splash nativo.
  const bootingRaw =
    loading || (!!session && (profileLoading || !minTimePassed));

  // Tope de arranque: si esta fase no acaba en BOOT_MAX_MS (fetch colgado),
  // fuerza la salida. Sin sesión → login (si el refresh llega después,
  // onAuthStateChange mete al usuario solo); con sesión y sin perfil → app con
  // lo cacheado (el gate de onboarding ya tolera profile null). El flag se
  // re-arma por fase (arranque, login) para no saltarse el mínimo del login.
  const [bootTimedOut, setBootTimedOut] = useState(false);
  useEffect(() => {
    if (!bootingRaw) {
      setBootTimedOut(false);
      return;
    }
    const id = setTimeout(() => setBootTimedOut(true), BOOT_MAX_MS);
    return () => clearTimeout(id);
  }, [bootingRaw]);

  const booting = bootingRaw && !bootTimedOut;
  if (booting) return <BootLoader />;

  if (!session) {
    return (
      <NavigationContainer theme={theme}>
        <LoginScreen />
      </NavigationContainer>
    );
  }

  // Primera vez: perfil cargado pero aún sin completar el alta → asistente.
  // Si el perfil falló al cargar (profile === null) NO bloqueamos: caemos a la
  // app como hacía antes, en vez de dejar la pantalla en blanco.
  if (profile && !profile.onboardedAt) {
    return (
      <NavigationContainer theme={theme}>
        <OnboardingNavigator />
      </NavigationContainer>
    );
  }

  // Usuario ya incorporado pero sin comunidad autónoma (columna nueva → todos
  // los existentes empiezan con region NULL): gate de UNA sola pregunta, sin
  // repetir el asistente. Los nuevos nunca llegan aquí (el onboarding ya fija
  // region en su paso 3). Al guardar, applyProfile re-renderiza y entra al Home.
  if (profile && profile.onboardedAt && !profile.region) {
    return (
      <NavigationContainer theme={theme}>
        <RegionGateScreen />
      </NavigationContainer>
    );
  }

  return (<>
    <NavigationContainer ref={navigationRef} theme={theme}>
      <Tab.Navigator
        tabBar={(props) => <AppTabBar {...props} />}
        screenOptions={({ route }) => ({
          headerShown: false,
          // Premonta todas las pestañas durante el arranque (no perezosas) y
          // congela las inactivas: el primer cambio de pestaña ya es instantáneo
          // (sin el frame de montaje que dejaba imágenes/textos a medias).
          lazy: false,
          freezeOnBlur: true,
          tabBarActiveTintColor:   colors.accent,
          tabBarInactiveTintColor: colors.inkSoft,
          // Con glass (iOS 26) la barra la pinta LiquidGlassTabBar (flotante,
          // con su propio cristal e iconos); aquí solo importa `height`, que
          // alimenta useBottomTabBarHeight → useTabBarBottomPadding. Sin glass,
          // la BottomTabBar clásica con el estilo de siempre (Android intacto).
          tabBarStyle: glassAvailable
            ? { height: glassTabBarHeight, backgroundColor: 'transparent', borderTopWidth: 0 }
            : {
                backgroundColor: colors.white,
                borderTopColor:  colors.border,
                borderTopWidth:  1,
                paddingBottom:   10 + bottomInset,
                paddingTop:       6,
                height:          70 + bottomInset,
              },
          tabBarLabelStyle: {
            fontSize:    11,
            fontFamily:  fonts.bold,
          },
          tabBarIcon: ({ color, focused }) => {
            const iconMap: Record<string, { active: keyof typeof Ionicons.glyphMap; inactive: keyof typeof Ionicons.glyphMap }> = {
              Home:      { active: 'home',   inactive: 'home-outline' },
              Catalog:   { active: 'grid',   inactive: 'grid-outline' },
              List:      { active: 'basket', inactive: 'basket-outline' },
              Groups:    { active: 'people', inactive: 'people-outline' },
            };
            const icons = iconMap[route.name];
            return <Ionicons name={focused ? icons.active : icons.inactive} size={22} color={color} />;
          },
        })}
      >
        <Tab.Screen
          name="Home"
          component={HomeNavigator}
          options={{
            title: t('tabs.home'),
            // Insignia de no leídas: refleja el mismo unreadCount que la campana del Home.
            tabBarBadge: unreadCount > 0 ? (unreadCount > 9 ? '9+' : unreadCount) : undefined,
            tabBarBadgeStyle: { backgroundColor: '#df4b2e', color: '#ffffff', fontFamily: fonts.bold, fontSize: 10 },
          }}
        />
        <Tab.Screen name="Catalog"   component={CatalogNavigator} options={{ title: t('tabs.catalog') }} />
        <Tab.Screen name="List"      component={ListScreen}        options={{ title: t('tabs.cart') }} />
        <Tab.Screen name="Groups"    component={GroupsNavigator}   options={{ title: t('tabs.groups') }} />
      </Tab.Navigator>
    </NavigationContainer>
    <ReviewPrompt />
  </>);
}
