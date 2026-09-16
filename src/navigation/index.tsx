import { useCallback, useEffect, useState } from 'react';
import {
  NavigationContainer, createNavigationContainerRef,
  DefaultTheme, DarkTheme, type Theme,
} from '@react-navigation/native';
import CreateRecipeModal from '../components/CreateRecipeModal';
import { RecipeCreatorProvider } from '../context/RecipeCreatorContext';
import { recipeCreatorOptions, type AppStackParamList } from './recipeCreator';
import { createAppPagerNavigator } from './createAppPagerNavigator';
import { PagerGestureBoundary } from '../components/bottom-tabs-pager/PagerGestureBoundary';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { QUE_COCINO_ENABLED } from '../constants/limits';
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
import { useCart } from '../context/CartContext';
import { joinGroup } from '../api/groups';
import { recipeFeed } from '../lib/recipeFeed';
import { prefetchProductImages } from '../lib/prefetchProductImages';
import {
  addNotificationResponseListener,
  consumeInitialNotificationData,
  type PushData,
} from '../lib/notifications';

import HomeScreen       from '../screens/HomeScreen';
import DailyWordScreen from '../screens/DailyWordScreen';
import QueCocinoScreen  from '../screens/QueCocinoScreen';
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
import NotificationsScreen from '../screens/NotificationsScreen';
import PriceAlertsScreen from '../screens/PriceAlertsScreen';
import PriceAlertResultsScreen from '../screens/PriceAlertResultsScreen';
import StatisticsScreen from '../screens/StatisticsScreen';
import GeneralStatisticsScreen from '../screens/GeneralStatisticsScreen';
import FriendsScreen from '../screens/FriendsScreen';
import HelpScreen from '../screens/HelpScreen';
import AboutScreen from '../screens/AboutScreen';
import CatalogSyncStatusScreen from '../screens/CatalogSyncStatusScreen';
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
import LidlProductsScreen from '../screens/LidlProductsScreen';
import GadisProductsScreen from '../screens/GadisProductsScreen';
import FroizProductsScreen from '../screens/FroizProductsScreen';
import AhorramasProductsScreen from '../screens/AhorramasProductsScreen';
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
import ProfileLoadErrorScreen from '../screens/ProfileLoadErrorScreen';
import BootLoader       from '../components/BootLoader';
import NativeStoreReviewPrompt from '../components/NativeStoreReviewPrompt';
import WhatsNewPrompt from '../components/WhatsNewPrompt';
import LidlReleasePrompt from '../components/LidlReleasePrompt';

const Tab          = createAppPagerNavigator<RootTabParamList>();
const AppStack = createNativeStackNavigator<AppStackParamList>();
const HomeStack    = createNativeStackNavigator<HomeStackParamList>();
const CatalogStack = createNativeStackNavigator<CatalogStackParamList>();
const GroupsStack  = createNativeStackNavigator<GroupsStackParamList>();

export const navigationRef = createNavigationContainerRef<AppStackParamList>();

/** Tope del arranque: las llamadas de sesión/perfil van SIN timeout, así que con
 *  la red colgada (típico en Android al abrir la app mientras renegocia Wi-Fi/
 *  datos) `booting` no se apagaría nunca y el logo quedaba clavado hasta matar
 *  la app. Pasado el tope se arranca con lo que haya. */
const BOOT_MAX_MS = 10000;

function parseInviteUrl(url: string): string | null {
  const parsed = Linking.parse(url);
  const segments = [parsed.hostname, ...(parsed.path ? parsed.path.split('/') : [])].filter(Boolean) as string[];
  const idx = segments.indexOf('join');
  return idx >= 0 && segments[idx + 1] ? segments[idx + 1] : null;
}

function pagerScreenLayout({ children }: { children: React.ReactNode }) {
  return <PagerGestureBoundary>{children}</PagerGestureBoundary>;
}

function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }} screenLayout={pagerScreenLayout}>
      <HomeStack.Screen name="HomeMain"    component={HomeScreen} />
      <HomeStack.Screen name="DailyWord" component={DailyWordScreen} />
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
      <HomeStack.Screen name="Notifications" component={NotificationsScreen} />
      <HomeStack.Screen name="PriceAlerts" component={PriceAlertsScreen} />
      <HomeStack.Screen name="PriceAlertResults" component={PriceAlertResultsScreen} />
      <HomeStack.Screen name="Statistics" component={StatisticsScreen} />
      <HomeStack.Screen name="GeneralStatistics" component={GeneralStatisticsScreen} />
      <HomeStack.Screen name="Friends" component={FriendsScreen} />
      <HomeStack.Screen name="Help" component={HelpScreen} />
      <HomeStack.Screen name="CatalogSyncStatus" component={CatalogSyncStatusScreen} />
      <HomeStack.Screen name="About" component={AboutScreen} />
    </HomeStack.Navigator>
  );
}

function CatalogNavigator() {
  return (
    <CatalogStack.Navigator screenOptions={{ headerShown: false }} screenLayout={pagerScreenLayout}>
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
      <CatalogStack.Screen name="LidlProducts" component={LidlProductsScreen} />
      <CatalogStack.Screen name="GadisProducts" component={GadisProductsScreen} />
      <CatalogStack.Screen name="FroizProducts" component={FroizProductsScreen} />
      <CatalogStack.Screen name="AhorramasProducts" component={AhorramasProductsScreen} />
      <CatalogStack.Screen name="HiperdinoProducts" component={HiperdinoProductsScreen} />
      <CatalogStack.Screen name="AlcampoProducts" component={AlcampoProductsScreen} />
      <CatalogStack.Screen name="PlusfrescProducts" component={PlusfrescProductsScreen} />
    </CatalogStack.Navigator>
  );
}

function GroupsNavigator() {
  return (
    <GroupsStack.Navigator screenOptions={{ headerShown: false }} screenLayout={pagerScreenLayout}>
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
  const { scheme, ready: themeReady } = useTheme();
  const theme = navTheme(scheme);
  // Suscribe al idioma: re-renderiza los títulos de las pestañas al cambiarlo.
  const { t, ready: languageReady } = useTranslation();
  const { show: showToast } = useToast();
  const { profile, loading: profileLoading, error: profileError, refresh: refreshProfile } = useProfile();
  const { hydrated: cartHydrated } = useCart();
  const userId = session?.user.id;
  // Si esta instancia ya ha mostrado el login, una sesión nueva procede de ese
  // flujo. Mientras llega su perfil conservamos la misma pantalla y saltamos
  // directamente al onboarding/app, sin intercalar el BootLoader de arranque.
  const [loginWasShown, setLoginWasShown] = useState(false);
  // Un tap puede llegar mientras aun se resuelve sesion/perfil o antes de que
  // React Navigation monte el arbol autenticado. Se conserva hasta onReady.
  const [pendingPushData, setPendingPushData] = useState<PushData | null>(null);
  const [lidlPromptResolvedFor, setLidlPromptResolvedFor] = useState<string | null>(null);
  const lidlPromptResolved = !!userId && lidlPromptResolvedFor === userId;
  const handleLidlPromptResolved = useCallback(() => {
    if (userId) setLidlPromptResolvedFor(userId);
  }, [userId]);
  useEffect(() => {
    if (!loading && !session) setLoginWasShown(true);
  }, [loading, session]);
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
        navigationRef.navigate('Tabs', { screen: 'Groups', params: {
          screen: 'GroupDetail', params: { groupId },
        } }, { pop: true });
      }
    };

    Linking.getInitialURL().then(handleUrl);
    const sub = Linking.addEventListener('url', (e) => handleUrl(e.url));
    return () => sub.remove();
  }, [showToast, t, userId]);

  const openPushDestination = useCallback((data: PushData): boolean => {
    if (!navigationRef.isReady()) return false;
    if ((data.type === 'cart' || data.type === 'group_invite') && data.groupId) {
      navigationRef.navigate('Tabs', { screen: 'Groups', params: {
        screen: 'GroupDetail', params: { groupId: data.groupId },
      } }, { pop: true });
      return true;
    }
    if (data.type === 'friend') {
      // Amigos vive dentro del stack de Perfil/Inicio.
      navigationRef.navigate('Tabs', { screen: 'Home', params: { screen: 'Friends' } }, { pop: true });
      return true;
    }
    if (data.type === 'price_alert') {
      navigationRef.navigate('Tabs', { screen: 'Home', params: data.notificationId ? {
        screen: 'PriceAlertResults',
        params: {
          notificationId: data.notificationId,
          ruleId: data.ruleId,
          title: data.rule,
        },
      } : { screen: 'PriceAlerts' } }, { pop: true });
      return true;
    }
    return false;
  }, []);

  const flushPendingPush = useCallback(() => {
    if (pendingPushData && openPushDestination(pendingPushData)) {
      setPendingPushData(null);
    }
  }, [openPushDestination, pendingPushData]);

  // Tap en una notificación push → abre la pantalla correspondiente. Cubre el
  // arranque en frío y la app ya abierta; si el navegador todavía no existe,
  // deja el destino en cola hasta el onReady del árbol autenticado.
  useEffect(() => {
    if (!userId) return;

    const handleData = (data: PushData) => {
      if (!openPushDestination(data)) setPendingPushData(data);
    };

    consumeInitialNotificationData().then((data) => { if (data) handleData(data); });
    const sub = addNotificationResponseListener(handleData);
    return () => sub.remove();
  }, [openPushDestination, userId]);

  // Arranque: mantén el BootLoader solo mientras se resuelve la sesión inicial
  // y, con sesión cacheada, su primer perfil. Tras iniciar sesión desde Login,
  // la propia portada permanece visible durante ese fetch para que el siguiente
  // frame sea ya onboarding o app, sin una pantalla de marca intermedia.
  const bootingRaw = !languageReady
    || loading
    || !themeReady
    || (!!session && (profileLoading || !cartHydrated));

  const canWarmRecipes = QUE_COCINO_ENABLED && !bootingRaw && !!profile?.onboardedAt;
  useEffect(() => {
    if (!userId || !canWarmRecipes) return;
    let cancelled = false;
    let cancelImages: (() => void) | undefined;
    const warmImages = () => {
      cancelImages?.();
      cancelImages = prefetchProductImages(
        (recipeFeed.snapshot(userId).recipes ?? []).slice(0, 4).map((recipe) => recipe.imageUrl),
      );
    };
    // Start after Home's first render, without mounting the recipe tab or blocking boot.
    const timer = setTimeout(() => {
      warmImages();
      void recipeFeed.refresh(userId).then(() => { if (!cancelled) warmImages(); });
    }, 350);
    return () => { cancelled = true; clearTimeout(timer); cancelImages?.(); };
  }, [canWarmRecipes, userId]);

  // Tope de arranque: si esta fase no acaba en BOOT_MAX_MS (fetch colgado),
  // fuerza la salida. Sin sesión → login (si el refresh llega después,
  // onAuthStateChange mete al usuario solo); con sesión y sin perfil → pantalla
  // recuperable de reintento. El flag se re-arma por fase (arranque, login)
  // para conservar la recuperación también tras iniciar sesión.
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
  if (booting) {
    if (session && loginWasShown) {
      return (
        <NavigationContainer theme={theme}>
          <LoginScreen />
        </NavigationContainer>
      );
    }
    return <BootLoader />;
  }

  if (!session) {
    return (
      <NavigationContainer theme={theme}>
        <LoginScreen />
      </NavigationContainer>
    );
  }

  // Nunca se entra en la app sin haber podido resolver el perfil. Un fallo de
  // red o el timeout de arranque ofrece recuperación, especialmente importante
  // para cuentas nuevas que todavía deben pasar por el onboarding.
  if (!profile && (profileError || bootTimedOut || !profileLoading)) {
    return (
      <NavigationContainer theme={theme}>
        <ProfileLoadErrorScreen onRetry={refreshProfile} />
      </NavigationContainer>
    );
  }

  // Primera vez: perfil cargado pero aún sin completar el alta → asistente.
  if (profile && !profile.onboardedAt) {
    return (
      <NavigationContainer theme={theme}>
        <OnboardingNavigator />
      </NavigationContainer>
    );
  }

  // En 1.3.1 todas las cuentas ya incorporadas necesitan un código postal. La
  // app se monta detrás para que el requisito aparezca como modal real; el gate
  // no admite cierre y desaparece únicamente cuando el perfil guarda un CP.
  const needsPostalCode = !!profile?.onboardedAt && !profile.postalCode;

  return (<>
    <NavigationContainer ref={navigationRef} theme={theme} onReady={flushPendingPush}>
      <RecipeCreatorProvider>
        <AppStack.Navigator screenOptions={{ headerShown: false }}>
          <AppStack.Screen name="Tabs" component={AppTabs} />
          <AppStack.Screen name="NewRecipe" component={CreateRecipeModal} options={recipeCreatorOptions} />
        </AppStack.Navigator>
      </RecipeCreatorProvider>
    </NavigationContainer>
    {needsPostalCode ? <RegionGateScreen /> : null}
    {!needsPostalCode && !lidlPromptResolved ? (
      <LidlReleasePrompt onResolved={handleLidlPromptResolved} />
    ) : null}
    {!needsPostalCode && lidlPromptResolved ? <WhatsNewPrompt /> : null}
    {!needsPostalCode && lidlPromptResolved ? <NativeStoreReviewPrompt /> : null}
  </>);
}

function AppTabs() {
  const { t } = useTranslation();
  const { unreadCount } = useNotifications();
  return (
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          lazy: true,
          // The custom pager keeps visited scenes mounted and warms neighbors.
          // Navigation/focus is still owned by React Navigation's TabRouter.
        }}
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
        {QUE_COCINO_ENABLED && (
          <Tab.Screen
            name="QueCocino"
            component={QueCocinoScreen}
            options={{
              title: t('queCocino.title'),
              tabBarAccessibilityLabel: t('queCocino.open'),
            }}
          />
        )}
        <Tab.Screen name="List"      component={ListScreen}        options={{ title: t('tabs.cart') }} />
        <Tab.Screen name="Groups"    component={GroupsNavigator}   options={{ title: t('tabs.groups') }} />
      </Tab.Navigator>
  );
}
