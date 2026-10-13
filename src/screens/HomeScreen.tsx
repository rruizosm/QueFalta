import { PagerNativeScrollView as ScrollView } from '../components/bottom-tabs-pager/PagerNativeScroll';
import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fonts } from '../constants/typography';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Animated,
  RefreshControl,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/colors';
import { useCart } from '../context/CartContext';
import { useProfile } from '../context/ProfileContext';
import { useNotifications } from '../context/NotificationsContext';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import type { GroupItem } from '../api/groups';
import { fetchListItems } from '../api/lists';
import { fetchPurchases, fetchPurchaseItems, type Purchase } from '../api/purchases';
import ProgressBar from '../components/ProgressBar';
import HardShadow from '../components/HardShadow';
import UserAvatar from '../components/UserAvatar';
import NotificationsSheet from '../components/NotificationsSheet';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import AmbientBubbleBackdrop from '../components/AmbientBubbleBackdrop';
import ActiveCartIcon from '../components/ActiveCartIcon';
import DailyWordButton from '../components/DailyWordButton';
import PaywallModal from '../components/PaywallModal';
import ResponsivePromotionCard from '../components/ResponsivePromotionCard';
import { useSponsorCampaign } from '../hooks/useSponsorCampaign';
import { useSponsorMetrics } from '../hooks/useSponsorMetrics';
import { promotionImageUrl } from '../api/sponsorCampaigns';
import { campaignDestination } from '../lib/sponsorCampaign';
import { GroupCartLimitError } from '../lib/groupCartLimit';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { consumeHomeTransition } from '../lib/homeTransition';
import {
  hasStartupCache,
  peekStartupCache,
  startupKeys,
  writeStartupCache,
} from '../lib/startupCache';

// Snapshot del carrito activo en disco, por usuario+grupo (la clave incluye el
// userId para no filtrar datos entre cuentas del mismo móvil). Permite pintar
// "Quedan N artículos" al instante al abrir Home, mientras se revalida en
// segundo plano — igual que la caché en disco del avatar.
const cartCacheKey = (userId: string, groupId: string) => `@homeCart:${userId}:${groupId}`;

const formatEuro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function HomeScreen() {
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(56);
  const bottomPad = useTabBarBottomPadding(20);
  const reducedMotion = useReducedMotion();
  const navigation = useNavigation<any>();
  const { t, lang } = useTranslation();
  const locale = lang === 'ca' ? 'ca-ES' : 'es-ES';
  const { activeCart, loadItemsIntoGroupCart } = useCart();
  const { profile } = useProfile();
  const { unreadCount } = useNotifications();
  const toast = useToast();
  const [notifOpen, setNotifOpen] = useState(false);
  // En iOS Liquid Glass la cabecera mide de forma determinista 108 pt
  // (padding superior 56 + avatar 40 + padding inferior 12). Partir de esa
  // altura evita que el ScrollView nazca bajo el cristal y salte tras onLayout.
  const [headerH, setHeaderH] = useState(glassAvailable ? 108 : 0);
  const enteringFromOnboarding = useRef(consumeHomeTransition()).current;
  const entryOpacity = useRef(new Animated.Value(enteringFromOnboarding ? 1 : 0)).current;
  const [entryCoverVisible, setEntryCoverVisible] = useState(enteringFromOnboarding);
  const [layoutReady, setLayoutReady] = useState(false);
  const [revealDeadlineReached, setRevealDeadlineReached] = useState(false);

  const userId = profile?.id ?? null;
  const { campaign, refresh: refreshCampaign } = useSponsorCampaign(userId);

  const cachedCartItems = userId && activeCart
    ? peekStartupCache<GroupItem[]>(startupKeys.listItems(userId, activeCart.listId))
    : null;
  const [cartItems, setCartItems] = useState<GroupItem[]>(cachedCartItems ?? []);
  // Grupo cuyos artículos ya hemos traído frescos de la red. Distingue "aún
  // cargando" de "carrito vacío de verdad" sin un flag que haga parpadear
  // "Cargando…" en cada visita. El ref espeja el estado para leerlo dentro de
  // callbacks asíncronos (evita la carrera caché-vs-red al cambiar de carrito).
  const [loadedGroup, setLoadedGroup] = useState<string | null>(cachedCartItems ? activeCart?.groupId ?? null : null);
  const loadedGroupRef = useRef<string | null>(cachedCartItems ? activeCart?.groupId ?? null : null);
  const [refreshing, setRefreshing] = useState(false);
  const purchaseCacheKey = userId ? startupKeys.lastPurchase(userId) : null;
  const cachedPurchase = purchaseCacheKey ? peekStartupCache<Purchase>(purchaseCacheKey) : null;
  const [lastPurchase, setLastPurchase] = useState<Purchase | null>(cachedPurchase);
  const [purchaseLoading, setPurchaseLoading] = useState(
    purchaseCacheKey ? !hasStartupCache(purchaseCacheKey) : true,
  );
  const [repeating, setRepeating] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const sponsorMetrics = useSponsorMetrics(userId, campaign?.id ?? null,
    notifOpen || paywallVisible || entryCoverVisible, headerH || headerTop + 52, bottomPad);
  const cartRequestIdRef = useRef(0);

  const load = useCallback(() => {
    const purchasesP = fetchPurchases()
      .then((list) => {
        const next = list[0] ?? null;
        setLastPurchase(next);
        if (userId) writeStartupCache(startupKeys.lastPurchase(userId), next);
      })
      .catch(() => {})
      .finally(() => setPurchaseLoading(false));

    let cartP: Promise<unknown> = Promise.resolve();
    const cartRequestId = ++cartRequestIdRef.current;
    if (activeCart) {
      const { groupId, listId } = activeCart;
      cartP = fetchListItems(listId)
        .then((items) => {
          if (cartRequestId !== cartRequestIdRef.current) return;
          setCartItems(items);
          loadedGroupRef.current = groupId;
          setLoadedGroup(groupId);
          if (userId) {
            AsyncStorage.setItem(cartCacheKey(userId, groupId), JSON.stringify(items)).catch(() => {});
            writeStartupCache(startupKeys.listItems(userId, listId), items);
          }
        })
        .catch(() => {});
    } else {
      setCartItems([]);
      loadedGroupRef.current = null;
      setLoadedGroup(null);
    }
    return Promise.all([cartP, purchasesP]);
  }, [activeCart, userId]);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { cartRequestIdRef.current += 1; };
  }, [load]));

  // El cover solo existe en el salto final del onboarding. Da como máximo
  // 900 ms para resolver los snapshots; después revela igualmente para que una
  // red lenta nunca pueda bloquear la entrada.
  useEffect(() => {
    if (!entryCoverVisible) return;
    const id = setTimeout(() => setRevealDeadlineReached(true), 900);
    return () => clearTimeout(id);
  }, [entryCoverVisible]);

  const homeDataReady = !purchaseLoading;
  useEffect(() => {
    if (!entryCoverVisible || !layoutReady || (!homeDataReady && !revealDeadlineReached)) return;
    if (reducedMotion) {
      entryOpacity.setValue(0);
      setEntryCoverVisible(false);
      return;
    }
    Animated.timing(entryOpacity, {
      toValue: 0,
      duration: 260,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setEntryCoverVisible(false);
    });
  }, [
    entryCoverVisible,
    entryOpacity,
    homeDataReady,
    layoutReady,
    reducedMotion,
    revealDeadlineReached,
  ]);

  // Hidrata el contador desde la caché en disco al abrir Home o cambiar de
  // carrito: "Quedan N artículos" aparece al instante mientras load() revalida.
  // No pisa datos ya frescos del mismo grupo (guard por ref).
  useEffect(() => {
    const gid = activeCart?.groupId ?? null;
    if (!gid || !userId) return;
    if (loadedGroupRef.current === gid) return; // ya hay datos frescos en memoria
    setCartItems([]); // es otro carrito: no muestres el contador del anterior
    let cancelled = false;
    AsyncStorage.getItem(cartCacheKey(userId, gid)).then((raw) => {
      if (cancelled || !raw || loadedGroupRef.current === gid) return;
      try { setCartItems(JSON.parse(raw) as GroupItem[]); } catch { /* ignore */ }
    });
    return () => { cancelled = true; };
  }, [activeCart?.groupId, userId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([load(), refreshCampaign()]);
    setRefreshing(false);
  }, [load, refreshCampaign]);

  const doneItems = cartItems.filter((item) => item.inCart).length;
  const totalItems = cartItems.length;
  const remaining = totalItems - doneItems;
  const progress = totalItems > 0 ? doneItems / totalItems : 0;
  const cartReady = totalItems > 0 || loadedGroup === activeCart?.groupId;

  const navigateToCart = () => {
    if (!activeCart) return;
    navigation.navigate('Groups', {
      screen: 'GroupDetail',
      params: { groupId: activeCart.groupId },
    });
  };

  // "Repetir compra" de la más reciente: mismo flujo que HistoryScreen. La más
  // reciente siempre es repetible en el plan gratuito, así que aquí no hay gate.
  const repeatLastPurchase = async () => {
    if (!lastPurchase || repeating) return;
    setRepeating(true);
    try {
      const items = await fetchPurchaseItems(lastPurchase.id);
      if (items.length === 0) {
        toast.show(t('history.noDetail'), 'error');
        return;
      }
      await loadItemsIntoGroupCart(
        lastPurchase.groupId,
        lastPurchase.groupName ?? t('history.groupFallback'),
        items,
        lastPurchase.groupIcon,
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('history.loaded', {
        n: items.length,
        group: lastPurchase.groupName ?? t('history.theGroupFallback'),
      }));
      navigation.navigate('List');
    } catch (cause) {
      if (cause instanceof GroupCartLimitError) setPaywallVisible(true);
      else toast.show(t('history.repeatError'), 'error');
    } finally {
      setRepeating(false);
    }
  };

  const header = (
    <View style={[styles.header, { paddingTop: headerTop }]}>
      <DailyWordButton onPress={() => navigation.navigate('DailyWord')} />
      <View style={styles.headerActions}>
        <TouchableOpacity
          onPress={() => setNotifOpen(true)}
          style={styles.bellBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('notifications.a11yOpen')}
        >
          <View style={styles.bellSurface}>
            <Ionicons name="notifications-outline" size={20} color={colors.accent} />
          </View>
          {unreadCount > 0 ? (
            <View style={styles.bellBadge}>
              <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => navigation.navigate('Profile')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('profile.title')}
        >
          <UserAvatar
            avatarUrl={profile?.avatarUrl ?? null}
            userId={profile?.id}
            initials={profile?.initials ?? 'RU'}
            color={profile?.color ?? colors.accent}
            size={40}
            style={styles.avatarRing}
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container} onLayout={() => setLayoutReady(true)}>
      <AmbientBubbleBackdrop />
      <StatusBar
        barStyle={entryCoverVisible ? 'light-content' : colors.statusBar}
        backgroundColor={entryCoverVisible ? colors.blue : colors.paper}
      />
      {!glassAvailable && header}
      <ScrollView tabBarScroll
        onScroll={sponsorMetrics.onScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: glassAvailable ? headerH + 12 : 4, paddingBottom: bottomPad },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
            progressViewOffset={glassAvailable ? headerH : 0}
          />
        }
      >
        {/* Resumen del carrito activo: conserva la carga instantánea desde caché
            y la revalidación en segundo plano que ya gestiona esta pantalla. */}
        {activeCart ? (
          <TouchableOpacity
            onPress={navigateToCart}
            activeOpacity={0.85}
            style={styles.cardWrap}
          >
            <HardShadow style={styles.cartCard}>
              <View
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.cartBackdrop}
              >
                <LinearGradient
                  colors={['rgba(0,0,0,0.18)', 'rgba(255,255,255,0.10)']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.cartGlowLarge} />
                <View style={styles.cartGlowSmall} />
              </View>

              <View style={styles.cartHeader}>
                <View style={styles.cartIconBox}>
                  <ActiveCartIcon size={21} color={colors.white} />
                </View>
                <View style={styles.cartTitleCol}>
                  <View style={styles.cartEyebrowRow}>
                    <Text style={styles.cartEyebrow}>{t('home.cartActive')}</Text>
                    <Text style={styles.cartFraction}>{doneItems}/{totalItems}</Text>
                  </View>
                  <Text style={styles.cartName} numberOfLines={1}>{activeCart.groupName}</Text>
                </View>
              </View>

              <View style={styles.cartProgress}>
                <ProgressBar
                  progress={progress}
                  height={7}
                  color={colors.white}
                  trackColor="rgba(255,255,255,0.25)"
                />
              </View>

              <View style={styles.cartBottom}>
                <Text style={styles.cartSub}>
                  {!cartReady
                    ? t('common.loading')
                    : totalItems === 0
                      ? t('home.cartEmpty')
                      : remaining === 0
                        ? t('home.cartAllDone')
                        : t('home.cartRemaining', { n: remaining })}
                </Text>
                <View style={styles.cartChip}>
                  <Text style={styles.cartChipText}>{t('home.viewCart')}</Text>
                  <Ionicons name="arrow-forward" size={13} color={colors.white} />
                </View>
              </View>
            </HardShadow>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => navigation.navigate('Groups')}
            activeOpacity={0.85}
            style={styles.cardWrap}
          >
            <HardShadow style={styles.noCartCard}>
              <View style={styles.noCartIcon}>
                <Ionicons name="cart-outline" size={24} color={colors.accent} />
              </View>
              <View style={styles.noCartCopy}>
                <Text style={styles.noCartTitle}>{t('home.noCartTitle')}</Text>
                <Text style={styles.noCartSub}>{t('home.noCartSub')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.inkFaint} />
            </HardShadow>
          </TouchableOpacity>
        )}

        {/* Accesos rápidos a los cuatro listados secundarios. Favoritos vive
            aquí como destino propio: Inicio ya no renderiza sus productos. */}
        <View style={styles.quickBlocks}>
          {[
            { key: 'newArrivals', route: 'NewArrivals', icon: 'sparkles-outline', mark: 'NOV' },
            { key: 'offers', route: 'Offers', icon: 'pricetags-outline', mark: 'OFE' },
            { key: 'priceChanges', route: 'PriceChanges', icon: 'trending-down-outline', mark: 'PRE' },
            { key: 'favorites', route: 'Favorites', icon: 'star-outline', mark: 'FAV' },
          ].map((b) => (
            <TouchableOpacity
              key={b.key}
              onPress={() => navigation.navigate(b.route)}
              style={styles.quickTile}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={b.key === 'favorites'
                ? t('home.favCtaTitle')
                : t(`${b.key}.a11yOpen`)}
            >
              <HardShadow style={styles.quickInner}>
                <Text
                  aria-hidden
                  accessible={false}
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                  style={styles.quickWatermark}
                >
                  {b.mark}
                </Text>
                <View style={styles.quickTopRow}>
                  <View style={styles.quickIconBox}>
                    <Ionicons name={b.icon as any} size={22} color={colors.white} />
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.inkFaint} />
                </View>
                <View style={styles.quickTextCol}>
                  <Text style={styles.quickTitle} numberOfLines={2}>
                    {b.key === 'favorites' ? t('home.favCtaTitle') : t(`${b.key}.title`)}
                  </Text>
                </View>
              </HardShadow>
            </TouchableOpacity>
          ))}
        </View>

        {campaign && <ResponsivePromotionCard
          key={`${campaign.id}:${campaign.updated_at}`}
          source={{ uri: promotionImageUrl(campaign.image_path) }}
          bannerRef={sponsorMetrics.bannerRef}
          onImageReady={sponsorMetrics.onImageReady}
          onClick={sponsorMetrics.onClick}
          label={t('home.adLabel')}
          accessibilityLabel={`${t('home.adLabel')} · ${campaign.sponsor_name}. ${lang === 'ca' ? campaign.accessibility_label_ca : campaign.accessibility_label_es}`}
          accessibilityHint={t('home.adOpenHint')}
          destinationUrl={campaignDestination(campaign, Platform.OS) ?? undefined}
          onOpenError={() => toast.show(t('home.adOpenError'), 'error')}
        />}

        {/* Última compra: repetirla con un toque; la tarjeta abre el historial */}
        {lastPurchase && (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('home.lastPurchase')}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('History')}>
                <Text style={styles.seeAll}>{t('home.seeAll')}</Text>
              </TouchableOpacity>
            </View>
            <HardShadow style={styles.lastBuyInner}>
              <TouchableOpacity
                onPress={() => navigation.navigate('History')}
                activeOpacity={0.85}
                style={styles.lastBuyRow}
              >
                <View style={styles.lastBuyIcon}>
                    <Ionicons name="receipt-outline" size={20} color={colors.accent} />
                  </View>
                <View style={styles.lastBuyInfo}>
                    <Text style={styles.lastBuyName} numberOfLines={1}>
                      {lastPurchase.groupName ?? t('history.groupFallback')}
                    </Text>
                    <Text style={styles.lastBuyMeta}>
                      {cap(new Date(lastPurchase.completedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' }))}
                      {' · '}{lastPurchase.itemCount} {lastPurchase.itemCount === 1 ? t('history.item') : t('history.items')}
                    </Text>
                  </View>
                <Text style={styles.lastBuyTotal}>{formatEuro(lastPurchase.total)}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.repeatBtn}
                onPress={repeatLastPurchase}
                disabled={repeating}
                activeOpacity={0.85}
              >
                {repeating ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Ionicons name="refresh" size={15} color={colors.white} />
                    <Text style={styles.repeatText}>{t('history.repeat')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </HardShadow>
          </View>
        )}

      </ScrollView>

      {glassAvailable && (
        <View
          style={styles.chrome}
          onLayout={(event) => {
            const next = event.nativeEvent.layout.height;
            setHeaderH((current) => Math.abs(current - next) > 0.5 ? next : current);
          }}
        >
          <GlassSurface style={styles.chromeGlass} fallbackColor={colors.paper}>
            {header}
          </GlassSurface>
        </View>
      )}

      <NotificationsSheet visible={notifOpen} onClose={() => setNotifOpen(false)} />
      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />
      {entryCoverVisible && (
        <Animated.View
          pointerEvents="auto"
          style={[styles.entryCover, { opacity: entryOpacity }]}
          accessibilityViewIsModal
          accessibilityLabel={t('common.loading')}
        >
          <ActivityIndicator color="#ffffff" />
        </Animated.View>
      )}
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { padding: 16, paddingBottom: 32 },
  entryCover: {
    ...StyleSheet.absoluteFill,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blue,
  },

  header: {
    flexDirection: 'row', alignItems: 'center',
    gap: 10, paddingHorizontal: 16, paddingBottom: 12,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  avatarRing: { borderWidth: 1, borderColor: colors.accent },

  // ── Campana de notificaciones ─────────────────────────────────
  bellBtn: { width: 38, height: 38 },
  bellSurface: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute', top: -2, right: -2,
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: '#df4b2e',
    borderWidth: 2, borderColor: colors.paper,
    alignItems: 'center', justifyContent: 'center',
  },
  bellBadgeText: { fontSize: 9.5, fontFamily: fonts.bold, color: '#ffffff' },

  // ── Carrito activo ─────────────────────────────────────────────
  cardWrap: { marginBottom: 20 },
  cartCard: {
    padding: 16,
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    borderRadius: 18,
    overflow: 'hidden',
  },
  cartBackdrop: { ...StyleSheet.absoluteFill },
  cartGlowLarge: {
    position: 'absolute', width: 172, height: 172, borderRadius: 86,
    backgroundColor: 'rgba(255,255,255,0.34)', right: -58, top: -92, opacity: 0.5,
  },
  cartGlowSmall: {
    position: 'absolute', width: 88, height: 88, borderRadius: 44,
    backgroundColor: 'rgba(0,0,0,0.16)', left: -35, bottom: -50, opacity: 0.72,
  },
  cartHeader: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  cartTitleCol: { flex: 1, minWidth: 0 },
  cartIconBox: {
    width: 40, height: 40, borderRadius: 14, flexShrink: 0,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center', justifyContent: 'center',
  },
  cartEyebrowRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8,
  },
  cartEyebrow: {
    fontSize: 10.5, fontFamily: fonts.bold, color: 'rgba(255,255,255,0.82)',
    textTransform: 'uppercase', letterSpacing: 1.3,
  },
  cartName: {
    fontSize: 19, lineHeight: 23, fontFamily: fonts.bold, color: colors.white, marginTop: 2,
  },
  cartFraction: { fontSize: 18, fontFamily: fonts.bold, color: colors.white, flexShrink: 0 },
  cartProgress: { marginTop: 14 },
  cartBottom: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', gap: 10, marginTop: 14,
  },
  cartSub: {
    flex: 1, fontSize: 12.5, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.86)',
  },
  cartChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  cartChipText: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.white },
  noCartCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderColor: colors.border, borderRadius: 18,
  },
  noCartIcon: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  noCartCopy: { flex: 1, minWidth: 0 },
  noCartTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.ink },
  noCartSub: {
    fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2,
  },

  // ── Accesos rápidos 2 × 2 ─────────────────────────────────────
  quickBlocks: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20,
  },
  quickTile: { flexBasis: '47%', flexGrow: 1, minWidth: 0, minHeight: 112 },
  quickInner: {
    flex: 1, padding: 13, position: 'relative', overflow: 'hidden', isolation: 'isolate',
    borderColor: colors.border, borderRadius: 18,
  },
  quickTopRow: {
    zIndex: 1, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  quickIconBox: {
    width: 42, height: 42, borderRadius: 14, flexShrink: 0,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  quickTextCol: { zIndex: 1, flex: 1, minWidth: 0, justifyContent: 'flex-end', marginTop: 12 },
  quickTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.ink },
  quickWatermark: {
    position: 'absolute', right: -5, bottom: -15, zIndex: 0,
    fontSize: 70, lineHeight: 76, fontWeight: '800', letterSpacing: -6,
    color: colors.accent, opacity: 0.1, filter: [{ blur: 1.8 }],
    transform: [{ rotate: '-8deg' }],
  },

  // ── Sections ──────────────────────────────────────────────────
  sectionWrap: { marginTop: 20, marginBottom: 20 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  seeAll: { fontSize: 13, fontFamily: fonts.semibold, color: colors.accent },

  // ── Última compra ─────────────────────────────────────────────
  lastBuyInner: { padding: 14, borderColor: colors.border, borderRadius: 18 },
  lastBuyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lastBuyIcon: {
    width: 40, height: 40, borderRadius: 14, flexShrink: 0,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  lastBuyInfo: { flex: 1, minWidth: 0 },
  lastBuyName: { fontSize: 14.5, fontFamily: fonts.bold, color: colors.ink },
  lastBuyMeta: { fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
  lastBuyTotal: { fontSize: 15, fontFamily: fonts.bold, color: colors.accent, flexShrink: 0 },
  repeatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: colors.accent,
    paddingVertical: 11, marginTop: 12, borderRadius: 14,
  },
  repeatText: { fontSize: 13, fontFamily: fonts.bold, color: colors.white },

  // ── Cabecera Glass ─────────────────────────────────────────────
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  chromeGlass: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
});
