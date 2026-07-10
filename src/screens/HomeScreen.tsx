import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fonts } from '../constants/typography';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { useCart } from '../context/CartContext';
import { useProfile } from '../context/ProfileContext';
import { useNotifications } from '../context/NotificationsContext';
import { useFavorites } from '../context/FavoritesContext';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { fetchMyGroups, fetchGroupItems, type GroupSummary, type GroupItem } from '../api/groups';
import { fetchPurchases, fetchPurchaseItems, type Purchase } from '../api/purchases';
import { favoriteToUI, type UIProduct } from '../lib/productAdapters';
import { STORE_META } from '../constants/stores';
import ProgressBar from '../components/ProgressBar';
import MemberAvatars from '../components/MemberAvatars';
import HardShadow from '../components/HardShadow';
import ProfileChecklistCard from '../components/ProfileChecklistCard';
import UserAvatar from '../components/UserAvatar';
import NotificationsSheet from '../components/NotificationsSheet';
import GlassSurface from '../components/GlassSurface';
import ProductImage from '../components/ProductImage';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';

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
  const bottomPad = useTabBarBottomPadding(32);
  const navigation = useNavigation<any>();
  const { t, lang } = useTranslation();
  const locale = lang === 'ca' ? 'ca-ES' : 'es-ES';
  const { activeCart, addToActiveCart, loadItemsIntoGroupCart } = useCart();
  const { profile } = useProfile();
  const { unreadCount } = useNotifications();
  const { products: favProducts } = useFavorites();
  const toast = useToast();
  const [notifOpen, setNotifOpen] = useState(false);

  const userId = profile?.id ?? null;

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [cartItems, setCartItems] = useState<GroupItem[]>([]);
  // Grupo cuyos artículos ya hemos traído frescos de la red. Distingue "aún
  // cargando" de "carrito vacío de verdad" sin un flag que haga parpadear
  // "Cargando…" en cada visita. El ref espeja el estado para leerlo dentro de
  // callbacks asíncronos (evita la carrera caché-vs-red al cambiar de carrito).
  const [loadedGroup, setLoadedGroup] = useState<string | null>(null);
  const loadedGroupRef = useRef<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastPurchase, setLastPurchase] = useState<Purchase | null>(null);
  const [repeating, setRepeating] = useState(false);
  // Favoritos en vuelo hacia el carrito (clave `store:id`): pinta el spinner en
  // su tesela y evita el doble toque, sin bloquear el resto del carrusel.
  const [addingFavs, setAddingFavs] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    const groupsP = fetchMyGroups()
      .then(setGroups)
      .catch(() => setGroups([]))
      .finally(() => setGroupsLoading(false));

    const purchasesP = fetchPurchases()
      .then((list) => setLastPurchase(list[0] ?? null))
      .catch(() => {});

    let cartP: Promise<unknown> = Promise.resolve();
    if (activeCart) {
      const { groupId } = activeCart;
      cartP = fetchGroupItems(groupId)
        .then((items) => {
          setCartItems(items);
          loadedGroupRef.current = groupId;
          setLoadedGroup(groupId);
          if (userId) {
            AsyncStorage.setItem(cartCacheKey(userId, groupId), JSON.stringify(items)).catch(() => {});
          }
        })
        .catch(() => {});
    } else {
      setCartItems([]);
    }
    return Promise.all([groupsP, cartP, purchasesP]);
  }, [activeCart, userId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

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
    await load();
    setRefreshing(false);
  }, [load]);

  const doneItems = cartItems.filter((i) => i.inCart).length;
  const totalItems = cartItems.length;
  const progress = totalItems > 0 ? doneItems / totalItems : 0;
  const remaining = totalItems - doneItems;
  // Listo cuando hay datos (de caché o red) o ya confirmamos que el carrito de
  // este grupo está vacío. Si no, seguimos en la primera carga → "Cargando…".
  const cartReady = totalItems > 0 || loadedGroup === activeCart?.groupId;

  const navigateToCart = () => {
    if (activeCart) {
      navigation.navigate('Groups', {
        screen: 'GroupDetail',
        params: { groupId: activeCart.groupId },
      });
    }
  };

  // Carrusel: los favoritos más recientes (el contexto ya los ordena así).
  const favTiles = useMemo(() => favProducts.slice(0, 10).map(favoriteToUI), [favProducts]);

  // Añade 1 ud del favorito al carrito activo. Mismo item que construye
  // StoreProductList; los favoritos no guardan categoría → zona "Otros".
  const addFavToCart = async (p: UIProduct) => {
    if (!activeCart) {
      Alert.alert(t('product.noCartTitle'), t('product.noCartMsg'));
      return;
    }
    const k = `${p.store}:${p.id}`;
    setAddingFavs((m) => ({ ...m, [k]: true }));
    try {
      await addToActiveCart([{
        productName: p.name,
        quantity: 1,
        unit: 'ud',
        categoryEmoji: null,
        categoryName: p.categoryName,
        mercadonaProductId: p.store === 'mercadona' ? p.id : null,
        storeProductId: p.id,
        unitPrice: p.unitPrice,
        imageUrl: p.imageUrl,
      }]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('product.addedOne', { n: 1, group: activeCart.groupName }));
      load(); // revalida el "Quedan N artículos" de la tarjeta del carrito
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      toast.show(t('product.addError'), 'error');
    } finally {
      setAddingFavs((m) => {
        const next = { ...m };
        delete next[k];
        return next;
      });
    }
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
      );
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('history.loaded', {
        n: items.length,
        group: lastPurchase.groupName ?? t('history.theGroupFallback'),
      }));
      navigation.navigate('List');
    } catch {
      toast.show(t('history.repeatError'), 'error');
    } finally {
      setRepeating(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingTop: headerTop, paddingBottom: bottomPad }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >

        {/* Header */}
        <View style={styles.header}>
          {/* Grupo de accesos: campana + novedades + cambios de precios + ofertas
              (mismos círculos glass); el avatar queda solo a la derecha. */}
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => setNotifOpen(true)}
              style={styles.bellBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.8}
              accessibilityLabel={t('notifications.a11yOpen')}
            >
              {/* Círculo de cristal (iOS 26) con tinte de acento; fallback = círculo
                  blanco de siempre. El badge va FUERA (no lo recorta overflow). */}
              <GlassSurface
                style={styles.bellGlass}
                tintColor={colors.accentLight}
                interactive
                fallbackColor={colors.white}
              >
                <Ionicons name="notifications-outline" size={22} color={colors.accent} />
              </GlassSurface>
              {unreadCount > 0 ? (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('NewArrivals')}
              style={styles.bellBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.8}
              accessibilityLabel={t('newArrivals.a11yOpen')}
            >
              <GlassSurface
                style={styles.bellGlass}
                tintColor={colors.accentLight}
                interactive
                fallbackColor={colors.white}
              >
                <Ionicons name="sparkles-outline" size={21} color={colors.accent} />
              </GlassSurface>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('PriceChanges')}
              style={styles.bellBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.8}
              accessibilityLabel={t('priceChanges.a11yOpen')}
            >
              <GlassSurface
                style={styles.bellGlass}
                tintColor={colors.accentLight}
                interactive
                fallbackColor={colors.white}
              >
                <Ionicons name="trending-down-outline" size={22} color={colors.accent} />
              </GlassSurface>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('Offers')}
              style={styles.bellBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              activeOpacity={0.8}
              accessibilityLabel={t('offers.a11yOpen')}
            >
              <GlassSurface
                style={styles.bellGlass}
                tintColor={colors.accentLight}
                interactive
                fallbackColor={colors.white}
              >
                <Ionicons name="pricetags-outline" size={21} color={colors.accent} />
              </GlassSurface>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Profile')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.8}
          >
            <UserAvatar
              avatarUrl={profile?.avatarUrl ?? null}
              initials={profile?.initials ?? 'RU'}
              color={profile?.color ?? colors.accent}
              size={44}
              style={styles.avatarRing}
            />
          </TouchableOpacity>
        </View>

        {/* Checklist de pasos opcionales pendientes (se oculta sola al completarlos) */}
        <ProfileChecklistCard groupCount={groups.length} />

        {/* Active cart card */}
        {activeCart ? (
          <TouchableOpacity onPress={navigateToCart} activeOpacity={0.85} style={styles.cardWrap}>
            <HardShadow style={{ backgroundColor: colors.accent, padding: 16 }}>
              {/* Top row */}
              <View style={styles.cartHeader}>
                <View style={styles.cartIconBox}>
                  <Ionicons name="cart-outline" size={22} color={colors.white} />
                </View>
                <View style={styles.cartTitleCol}>
                  <View style={styles.cartEyebrowRow}>
                    <Text style={styles.cartEyebrow}>{t('home.cartActive')}</Text>
                    <Text style={styles.cartFraction}>{doneItems}/{totalItems}</Text>
                  </View>
                  <Text style={styles.cartName} numberOfLines={1}>{activeCart.groupName}</Text>
                </View>
              </View>

              {/* Progress */}
              <View style={{ marginTop: 14 }}>
                <ProgressBar
                  progress={progress}
                  height={7}
                  color={colors.white}
                  trackColor="rgba(255,255,255,0.25)"
                />
              </View>

              {/* Bottom row */}
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
                <TouchableOpacity style={styles.cartChip} onPress={navigateToCart}>
                  <Text style={styles.cartChipText}>{t('home.viewCart')}</Text>
                  <Ionicons name="arrow-forward" size={13} color={colors.white} />
                </TouchableOpacity>
              </View>
            </HardShadow>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => navigation.navigate('Groups')}
            activeOpacity={0.85}
            style={styles.cardWrap}
          >
            <HardShadow style={{ padding: 20, alignItems: 'center', gap: 6 }}>
              <Ionicons name="cart-outline" size={32} color={colors.inkFaint} />
              <Text style={styles.noCartTitle}>{t('home.noCartTitle')}</Text>
              <Text style={styles.noCartSub}>{t('home.noCartSub')}</Text>
              <View style={styles.noCartBtn}>
                <Text style={styles.noCartBtnText}>{t('home.goToGroups')}</Text>
              </View>
            </HardShadow>
          </TouchableOpacity>
        )}

        {/* Tus favoritos: carrusel con añadido de un toque. Sin favoritos aún,
            la tarjeta CTA de siempre como puerta de entrada a la pantalla. */}
        {favTiles.length > 0 ? (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('home.yourFavorites')}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('Favorites')}>
                <Text style={styles.seeAll}>{t('home.seeAll')}</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.favStrip}
              contentContainerStyle={styles.favStripContent}
            >
              {favTiles.map((p) => {
                const k = `${p.store}:${p.id}`;
                const adding = !!addingFavs[k];
                return (
                  <TouchableOpacity
                    key={k}
                    style={styles.favTile}
                    onPress={() => addFavToCart(p)}
                    activeOpacity={0.7}
                    disabled={adding}
                    accessibilityLabel={p.name}
                  >
                    <View style={styles.favImgWrap}>
                      {p.imageUrl ? (
                        <ProductImage uri={p.imageUrl} style={styles.favImg} />
                      ) : (
                        <Ionicons name="image-outline" size={22} color={colors.inkFaint} />
                      )}
                      {STORE_META[p.store]?.icon ? (
                        <Image source={STORE_META[p.store].icon} style={styles.favStoreIcon} resizeMode="contain" />
                      ) : null}
                      <View style={styles.favAddBadge}>
                        {adding ? (
                          <ActivityIndicator size="small" color={colors.white} />
                        ) : (
                          <Ionicons name="add" size={17} color={colors.white} />
                        )}
                      </View>
                    </View>
                    <Text style={styles.favName} numberOfLines={2}>{p.name}</Text>
                    {p.priceLabel ? <Text style={styles.favPrice}>{p.priceLabel}</Text> : null}
                  </TouchableOpacity>
                );
              })}
              {favProducts.length > favTiles.length && (
                <TouchableOpacity
                  style={styles.favMoreTile}
                  onPress={() => navigation.navigate('Favorites')}
                  activeOpacity={0.7}
                >
                  <Ionicons name="star" size={20} color={colors.accent} />
                  <Text style={styles.favMoreText}>{t('home.seeAll')}</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        ) : (
          <TouchableOpacity
            onPress={() => navigation.navigate('Favorites')}
            activeOpacity={0.85}
            style={styles.ctaWrap}
          >
            <HardShadow style={styles.ctaInner}>
              <View style={styles.ctaIconBox}>
                <Ionicons name="star-outline" size={22} color={colors.white} />
              </View>
              <View style={styles.ctaTextCol}>
                <Text style={styles.ctaTitle}>{t('home.favCtaTitle')}</Text>
                <Text style={styles.ctaSub}>{t('home.favCtaSub')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.inkFaint} />
            </HardShadow>
          </TouchableOpacity>
        )}

        {/* Última compra: repetirla con un toque; la tarjeta abre el historial */}
        {lastPurchase && (
          <View style={styles.sectionWrap}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('home.lastPurchase')}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('History')}>
                <Text style={styles.seeAll}>{t('home.seeAll')}</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('History')} activeOpacity={0.85}>
              <HardShadow style={styles.lastBuyInner}>
                <View style={styles.lastBuyRow}>
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
                </View>
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
            </TouchableOpacity>
          </View>
        )}

        {/* Mis grupos */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('home.myGroups')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Groups')}>
            <Text style={styles.seeAll}>{t('home.seeAll')}</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.groupsBlock}>
          {groupsLoading ? (
            <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
          ) : groups.length === 0 ? (
            <Text style={styles.noGroups}>{t('home.noGroups')}</Text>
          ) : (
            groups.map((group) => (
              <TouchableOpacity
                key={group.id}
                style={styles.groupRow}
                onPress={() =>
                  navigation.navigate('Groups', {
                    screen: 'GroupDetail',
                    params: { groupId: group.id },
                  })
                }
                activeOpacity={0.8}
              >
                <View style={styles.groupRowLeft}>
                  <Text style={styles.groupRowName}>{group.name}</Text>
                  <Text style={styles.groupRowSub}>
                    {group.members.length} {group.members.length === 1 ? t('home.member') : t('home.members')}
                    {activeCart?.groupId === group.id ? t('home.cartActiveSuffix') : ''}
                  </Text>
                </View>
                {group.members.length > 0 && (
                  <MemberAvatars members={group.members} maxVisible={3} size={28} />
                )}
              </TouchableOpacity>
            ))
          )}
        </View>

      </ScrollView>

      <NotificationsSheet visible={notifOpen} onClose={() => setNotifOpen(false)} />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  // paddingTop inline (useHeaderTopPadding)
  scroll: { padding: 16, paddingBottom: 32 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  // Campana + novedades + cambios de precios + ofertas, agrupados a la izquierda.
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatarRing: { borderWidth: 1, borderColor: colors.accent },

  // ── Campana de notificaciones ─────────────────────────────────
  // El botón es solo el contexto de posición del badge; el círculo lo pinta
  // bellGlass (cristal en iOS 26, blanco en fallback).
  bellBtn: { width: 44, height: 44 },
  bellGlass: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1, borderColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  bellBadge: {
    position: 'absolute', top: -2, right: -2,
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4,
    backgroundColor: '#df4b2e',
    borderWidth: 2, borderColor: colors.paper,
    alignItems: 'center', justifyContent: 'center',
  },
  bellBadgeText: { fontSize: 9.5, fontFamily: fonts.bold, color: '#ffffff' },

  // ── Cart card ─────────────────────────────────────────────────
  cardWrap: { marginBottom: 24 },

  cartHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
  },
  cartTitleCol: { flex: 1, minWidth: 0 },
  cartIconBox: {
    width: 40, height: 40, flexShrink: 0,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  cartEyebrowRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', gap: 8,
  },
  cartEyebrow: {
    fontSize: 10.5, fontFamily: fonts.bold, color: 'rgba(255,255,255,0.80)',
    textTransform: 'uppercase', letterSpacing: 1.4,
  },
  cartName: { fontSize: 19, lineHeight: 23, fontFamily: fonts.bold, color: colors.white, marginTop: 2 },
  cartFraction: { fontSize: 20, fontFamily: fonts.bold, color: colors.white, flexShrink: 0 },
  cartBottom: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginTop: 14,
  },
  cartSub: { fontSize: 12.5, fontFamily: fonts.medium, color: 'rgba(255,255,255,0.85)' },
  cartChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.20)',
  },
  cartChipText: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.white },

  // ── No cart card ──────────────────────────────────────────────
  noCartTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  noCartSub: {
    fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft,
    textAlign: 'center', marginBottom: 4,
  },
  noCartBtn: {
    marginTop: 8, backgroundColor: colors.accent,
    paddingHorizontal: 18, paddingVertical: 11,
  },
  noCartBtnText: { color: colors.white, fontFamily: fonts.bold, fontSize: 14 },

  // ── Sections ──────────────────────────────────────────────────
  // Ritmo vertical unificado: 24 entre bloques (cardWrap, sectionWrap, ctaWrap).
  sectionWrap: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  seeAll: { fontSize: 13, fontFamily: fonts.semibold, color: colors.accent },

  // ── Carrusel de favoritos ─────────────────────────────────────
  // El strip sangra hasta los bordes de la pantalla (compensa el padding 16
  // del scroll) para que las teselas entren/salgan por el borde real.
  favStrip: { marginHorizontal: -16 },
  favStripContent: { paddingHorizontal: 16, gap: 10 },
  favTile: { width: 104 },
  favImgWrap: {
    width: '100%', aspectRatio: 1,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 6, overflow: 'hidden',
  },
  favImg: { width: '100%', height: '100%' },
  favStoreIcon: { position: 'absolute', top: 4, left: 4, width: 14, height: 14 },
  favAddBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 24, height: 24,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  // minHeight reserva 2 líneas → precios alineados (igual que ProductGridCard).
  favName: { fontSize: 11.5, fontFamily: fonts.semibold, color: colors.ink, lineHeight: 14, minHeight: 28 },
  favPrice: { fontSize: 12, fontFamily: fonts.bold, color: colors.accent, marginTop: 2 },
  favMoreTile: {
    width: 104, aspectRatio: 1,
    backgroundColor: colors.accentLight,
    borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  favMoreText: { fontSize: 12, fontFamily: fonts.bold, color: colors.accent },

  // ── Última compra ─────────────────────────────────────────────
  lastBuyInner: { padding: 14 },
  lastBuyRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lastBuyIcon: {
    width: 40, height: 40, flexShrink: 0,
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
    paddingVertical: 11, marginTop: 12,
  },
  repeatText: { fontSize: 13, fontFamily: fonts.bold, color: colors.white },

  // ── CTA de favoritos (solo cuando aún no hay favoritos) ───────
  ctaWrap: { marginBottom: 24 },
  ctaInner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  ctaIconBox: {
    width: 42, height: 42, flexShrink: 0,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  ctaTextCol: { flex: 1, minWidth: 0 },
  ctaTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.ink },
  ctaSub: { fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1 },

  // ── Groups ────────────────────────────────────────────────────
  // 16 + los 8 del último groupRow = 24, igual que el hueco entre secciones (sectionWrap).
  groupsBlock: { marginBottom: 16 },
  noGroups: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, marginBottom: 16 },
  groupRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.white,
    padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: colors.border,
  },
  groupRowLeft: { flex: 1 },
  groupRowName: { fontSize: 14, fontFamily: fonts.semibold, color: colors.ink },
  groupRowSub: { fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
});
