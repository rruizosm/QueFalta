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
import { useCart } from '../context/CartContext';
import { useProfile } from '../context/ProfileContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { fetchMyGroups, fetchGroupItems, type GroupSummary, type GroupItem } from '../api/groups';
import ProgressBar from '../components/ProgressBar';
import MemberAvatars from '../components/MemberAvatars';
import HardShadow from '../components/HardShadow';
import ProfileChecklistCard from '../components/ProfileChecklistCard';

export default function HomeScreen() {
  const styles = useThemedStyles(themedStyles);
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
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
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
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
            <Text style={styles.greeting}>{t('home.greeting', { name: profile?.name?.split(' ')[0] ?? 'Rubén' })}</Text>
            <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
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
                  {cartLoading
                    ? t('common.loading')
                    : totalItems === 0
                      ? t('home.cartEmpty')
                      : totalItems - doneItems === 0
                        ? t('home.cartAllDone')
                        : t('home.cartRemaining', { n: totalItems - doneItems })}
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

        {/* CTA: añade productos desde el catálogo */}
        <TouchableOpacity
          onPress={() => navigation.navigate('Catalog')}
          activeOpacity={0.85}
          style={styles.ctaWrap}
        >
          <HardShadow style={styles.ctaInner}>
            <View style={styles.ctaIconBox}>
              <Ionicons name="basket-outline" size={22} color={colors.white} />
            </View>
            <View style={styles.ctaTextCol}>
              <Text style={styles.ctaTitle}>{t('home.ctaTitle')}</Text>
              <Text style={styles.ctaSub}>{t('home.ctaSub')}</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.inkFaint} />
          </HardShadow>
        </TouchableOpacity>

        {/* CTA: abre tus favoritos (antes una pestaña inferior) */}
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
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  seeAll: { fontSize: 13, fontFamily: fonts.semibold, color: colors.accent },

  // ── CTA "Añade al carrito" ────────────────────────────────────
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
  // 16 + los 8 del último groupRow = 24, igual que el hueco sobre "Mis grupos" (ctaWrap).
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
