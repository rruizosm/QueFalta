import { useCallback, useEffect, useMemo, useState } from 'react';
import { fonts } from '../constants/typography';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Image,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { getMeta, DEFAULT_HOME_CATEGORY_IDS } from '../constants/categoryMeta';
import { useCart } from '../context/CartContext';
import { useProfile } from '../context/ProfileContext';
import { useFavorites } from '../context/FavoritesContext';
import { useThemedStyles } from '../context/ThemeContext';
import { fetchMyGroups, fetchGroupItems, type GroupSummary, type GroupItem } from '../api/groups';
import {
  fetchCategories,
  fetchSuggestedProducts,
  type N1Category,
  type MercadonaProduct,
} from '../api/mercadona';
import type { FavoriteProduct } from '../types';
import { retailerOf, type BonpreuProduct } from '../api/catalog';
import ProductDetailModal from '../components/ProductDetailModal';
import BonpreuProductModal from '../components/BonpreuProductModal';
import ProgressBar from '../components/ProgressBar';
import MemberAvatars from '../components/MemberAvatars';
import HardShadow from '../components/HardShadow';

export default function HomeScreen() {
  const styles = useThemedStyles(themedStyles);
  const navigation = useNavigation<any>();
  const { activeCart } = useCart();
  const { profile } = useProfile();
  const {
    categories: favCategories,
    products: favProducts,
    isCategoryFavorite,
  } = useFavorites();

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [cartItems, setCartItems] = useState<GroupItem[]>([]);
  const [cartLoading, setCartLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [liveCategories, setLiveCategories] = useState<N1Category[]>([]);
  const [suggested, setSuggested] = useState<MercadonaProduct[]>([]);
  const [detailProductId, setDetailProductId] = useState<string | null>(null);
  const [bpDetail, setBpDetail] = useState<BonpreuProduct | null>(null);

  const load = useCallback(() => {
    const groupsP = fetchMyGroups()
      .then(setGroups)
      .catch(() => setGroups([]))
      .finally(() => setGroupsLoading(false));

    let cartP: Promise<unknown> = Promise.resolve();
    if (activeCart) {
      setCartLoading(true);
      cartP = fetchGroupItems(activeCart.groupId)
        .then(setCartItems)
        .catch(() => setCartItems([]))
        .finally(() => setCartLoading(false));
    } else {
      setCartItems([]);
    }
    return Promise.all([groupsP, cartP]);
  }, [activeCart]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  // Categorías reales de Mercadona + productos sugeridos (una vez).
  useEffect(() => {
    fetchCategories().then(setLiveCategories).catch(() => {});
    fetchSuggestedProducts(8).then(setSuggested).catch(() => {});
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const doneItems = cartItems.filter((i) => i.inCart).length;
  const totalItems = cartItems.length;
  const progress = totalItems > 0 ? doneItems / totalItems : 0;

  const navigateToCart = () => {
    if (activeCart) {
      navigation.navigate('Groups', {
        screen: 'GroupDetail',
        params: { groupId: activeCart.groupId },
      });
    }
  };

  // Chips del catálogo: favoritas (resueltas contra las live) o las 6 por defecto.
  const chipCats = useMemo<N1Category[]>(() => {
    if (liveCategories.length === 0) return [];
    const favResolved = favCategories
      .map((f) => liveCategories.find((c) => String(c.id) === f.refId))
      .filter((c): c is N1Category => !!c);
    if (favResolved.length > 0) return favResolved;
    return DEFAULT_HOME_CATEGORY_IDS
      .map((id) => liveCategories.find((c) => c.id === id))
      .filter((c): c is N1Category => !!c);
  }, [liveCategories, favCategories]);

  const suggestedItems = useMemo<FavoriteProduct[]>(
    () =>
      suggested.map((p) => ({
        refId: p.id,
        name: p.display_name,
        imageUrl: p.thumbnail ?? null,
        price: p.price_instructions.unit_price,
      })),
    [suggested],
  );
  const productItems = favProducts.length > 0 ? favProducts : suggestedItems;

  const fmtPrice = (price?: string | null) =>
    price ? `${parseFloat(price).toFixed(2).replace('.', ',')} €` : '';

  const goToSubcategories = (cat: N1Category) => {
    const { emoji, color } = getMeta(cat.name);
    navigation.navigate('Catalog', {
      screen: 'SubCategory',
      params: { categoryName: cat.name, emoji, color, subcategories: cat.categories },
    });
  };

  const openProductDetail = (item: FavoriteProduct) => {
    if (retailerOf(item.refId) === 'esclat') {
      setBpDetail({
        id: item.refId,
        displayName: item.name,
        brand: null,
        packaging: null,
        thumbnail: item.imageUrl ?? null,
        unitPrice: item.price != null ? parseFloat(item.price) : null,
        priceFormat: null,
        categoryName: null,
      });
    } else {
      setDetailProductId(item.refId);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >

        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Hola, {profile?.name?.split(' ')[0] ?? 'Rubén'} 👋</Text>
            <Text style={styles.subtitle}>¿Qué necesitas hoy?</Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.navigate('Profile')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.8}
          >
            {profile?.avatarUrl ? (
              <Image source={{ uri: profile.avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: profile?.color ?? colors.accent }]}>
                <Text style={styles.avatarText}>{profile?.initials ?? 'RU'}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Active cart card */}
        {activeCart ? (
          <TouchableOpacity onPress={navigateToCart} activeOpacity={0.85} style={styles.cardWrap}>
            <HardShadow style={{ backgroundColor: colors.accent, padding: 16 }}>
              {/* Top row */}
              <View style={styles.cartHeader}>
                <View style={styles.cartTitleRow}>
                  <View style={styles.cartIconBox}>
                    <Ionicons name="cart-outline" size={22} color={colors.white} />
                  </View>
                  <View>
                    <Text style={styles.cartEyebrow}>CARRITO ACTIVO</Text>
                    <Text style={styles.cartName}>{activeCart.groupName}</Text>
                  </View>
                </View>
                <Text style={styles.cartFraction}>{doneItems}/{totalItems}</Text>
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
                  {cartLoading
                    ? 'Cargando…'
                    : totalItems === 0
                      ? 'La cesta está vacía'
                      : totalItems - doneItems === 0
                        ? '¡Todo recogido! 🎉'
                        : `Quedan ${totalItems - doneItems} artículos`}
                </Text>
                <TouchableOpacity style={styles.cartChip} onPress={navigateToCart}>
                  <Text style={styles.cartChipText}>Ver cesta</Text>
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
              <Text style={styles.noCartTitle}>Sin carrito activo</Text>
              <Text style={styles.noCartSub}>
                Activa el carrito de un grupo para empezar a comprar.
              </Text>
              <View style={styles.noCartBtn}>
                <Text style={styles.noCartBtnText}>Ir a Grupos →</Text>
              </View>
            </HardShadow>
          </TouchableOpacity>
        )}

        {/* Catálogo */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Catálogo</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Catalog')}>
            <Text style={styles.seeAll}>Ver todo</Text>
          </TouchableOpacity>
        </View>
        {chipCats.length === 0 ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesRow}
          >
            {chipCats.map((cat) => {
              const { emoji, color } = getMeta(cat.name);
              const fav = isCategoryFavorite(String(cat.id));
              return (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.categoryChip, { backgroundColor: color + '1e' }]}
                  onPress={() => goToSubcategories(cat)}
                  activeOpacity={0.8}
                >
                  {fav && <Ionicons name="star" size={11} color={color} style={styles.chipStar} />}
                  <Text style={styles.categoryEmoji}>{emoji}</Text>
                  <Text style={[styles.categoryChipName, { color }]} numberOfLines={1}>
                    {cat.name.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* Productos */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            {favProducts.length > 0 ? 'Tus productos' : 'Productos sugeridos'}
          </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Catalog')}>
            <Text style={styles.seeAll}>Ver todo</Text>
          </TouchableOpacity>
        </View>
        {productItems.length === 0 ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.productsRow}
          >
            {productItems.map((item) => (
              <TouchableOpacity
                key={item.refId}
                style={styles.productCard}
                activeOpacity={0.85}
                onPress={() => openProductDetail(item)}
              >
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.productCardImg} resizeMode="contain" />
                ) : (
                  <View style={[styles.productCardImg, styles.productCardImgPlaceholder]}>
                    <Text style={{ fontSize: 26 }}>🛒</Text>
                  </View>
                )}
                <Text style={styles.productCardName} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.productCardPrice}>{fmtPrice(item.price)}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* Mis grupos */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Mis grupos</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Groups')}>
            <Text style={styles.seeAll}>Ver todo</Text>
          </TouchableOpacity>
        </View>
        {groupsLoading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
        ) : groups.length === 0 ? (
          <Text style={styles.noGroups}>No perteneces a ningún grupo todavía.</Text>
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
                  {group.members.length} {group.members.length === 1 ? 'miembro' : 'miembros'}
                  {activeCart?.groupId === group.id ? ' · Carrito activo' : ''}
                </Text>
              </View>
              {group.members.length > 0 && (
                <MemberAvatars members={group.members} maxVisible={3} size={28} />
              )}
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      <ProductDetailModal productId={detailProductId} onClose={() => setDetailProductId(null)} />
      <BonpreuProductModal product={bpDetail} onClose={() => setBpDetail(null)} />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  scroll: { padding: 16, paddingTop: 56, paddingBottom: 32 },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greeting: { fontSize: 24, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.accent,
  },
  avatarText: { color: colors.white, fontFamily: fonts.bold, fontSize: 15 },

  // ── Cart card ─────────────────────────────────────────────────
  cardWrap: { marginBottom: 28 },

  cartHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', gap: 12, marginBottom: 0,
  },
  cartTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  cartIconBox: {
    width: 40, height: 40,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  cartEyebrow: {
    fontSize: 10.5, fontFamily: fonts.bold, color: 'rgba(255,255,255,0.80)',
    textTransform: 'uppercase', letterSpacing: 1.4,
  },
  cartName: { fontSize: 19, fontFamily: fonts.bold, color: colors.white, marginTop: 2 },
  cartFraction: { fontSize: 26, fontFamily: fonts.bold, color: colors.white },
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
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  seeAll: { fontSize: 13, fontFamily: fonts.semibold, color: colors.accent },

  // ── Categories ────────────────────────────────────────────────
  categoriesRow: { gap: 9, paddingBottom: 20 },
  categoryChip: {
    alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 10,
    minWidth: 64, gap: 4,
  },
  categoryEmoji: { fontSize: 22 },
  categoryChipName: { fontSize: 11, fontFamily: fonts.semibold },
  chipStar: { position: 'absolute', top: 4, right: 4 },

  // ── Products ──────────────────────────────────────────────────
  productsRow: { gap: 10, paddingBottom: 20 },
  productCard: {
    width: 116,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    padding: 10,
  },
  productCardImg: { width: '100%', height: 76 },
  productCardImgPlaceholder: {
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  productCardName: {
    fontSize: 11.5, fontFamily: fonts.semibold, color: colors.ink,
    marginTop: 8, lineHeight: 15, minHeight: 30,
  },
  productCardPrice: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.accent, marginTop: 4 },

  // ── Groups ────────────────────────────────────────────────────
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
