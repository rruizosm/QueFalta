import { useCallback, useState } from 'react';
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
import { CATEGORIES } from '../constants/data';
import { useCart } from '../context/CartContext';
import { useProfile } from '../context/ProfileContext';
import { fetchMyGroups, fetchGroupItems, type GroupSummary, type GroupItem } from '../api/groups';
import ProgressBar from '../components/ProgressBar';
import MemberAvatars from '../components/MemberAvatars';
import HardShadow from '../components/HardShadow';

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { activeCart } = useCart();
  const { profile } = useProfile();

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(true);
  const [cartItems, setCartItems] = useState<GroupItem[]>([]);
  const [cartLoading, setCartLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

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
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesRow}
        >
          {CATEGORIES.slice(0, 6).map((cat) => (
            <TouchableOpacity
              key={cat.id}
              style={[styles.categoryChip, { backgroundColor: cat.color + '1e' }]}
              onPress={() =>
                navigation.navigate('Catalog', {
                  screen: 'SubCategory',
                  params: { categoryId: cat.id, categoryName: cat.name },
                })
              }
            >
              <Text style={styles.categoryEmoji}>{cat.emoji}</Text>
              <Text style={[styles.categoryChipName, { color: cat.color }]} numberOfLines={1}>
                {cat.name.split(' ')[0]}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

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
    </View>
  );
}

const styles = StyleSheet.create({
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
