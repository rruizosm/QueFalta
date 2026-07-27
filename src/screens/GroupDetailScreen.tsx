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
  Share,
  Platform,
  Image,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { GroupsStackParamList } from '../types';
import {
  fetchGroupDetail,
  fetchGroupItems,
  getInviteLink,
  type GroupSummary,
  type GroupItem,
} from '../api/groups';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import MemberAvatars from '../components/MemberAvatars';
import ProgressBar from '../components/ProgressBar';
import ProductImage from '../components/ProductImage';
import StoreProductModal, { type ProductRef } from '../components/StoreProductModal';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import { STORE_META, groupByStore, storeOfItem } from '../constants/stores';
import { groupByZone, sortZoneItems } from '../constants/zones';
import { mergeCartItems, type MergedCartItem } from '../api/lists';

type GroupDetailRouteProp = RouteProp<GroupsStackParamList, 'GroupDetail'>;

const formatEuro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;

// Referencia {tienda, id} para abrir la ficha de un artículo en cualquier súper
// (ver ListScreen.productRefOf). null = ítem manual/sin id → no abre ficha.
function productRefOf(item: MergedCartItem): ProductRef | null {
  const store = storeOfItem(item);
  if (store === 'otros') return null;
  const id = store === 'mercadona' ? item.mercadonaProductId : item.storeProductId;
  return id ? { store, id } : null;
}

export default function GroupDetailScreen() {
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  // Con tab bar de cristal: eleva las barras de total (pantalla y overlay de
  // cesta expandida) por encima del cristal y agranda los paddingBottom igual.
  const tabBarOffset = useTabBarBottomPadding(0);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const route = useRoute<GroupDetailRouteProp>();
  const { groupId } = route.params;

  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [items, setItems] = useState<GroupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [cartExpanded, setCartExpanded] = useState(false);
  const [detailTarget, setDetailTarget] = useState<ProductRef | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  const load = useCallback(() => {
    setError(false);
    return Promise.all([fetchGroupDetail(groupId), fetchGroupItems(groupId)])
      .then(([g, its]) => { setGroup(g); setItems(its); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [groupId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleShare = async () => {
    const link = getInviteLink(groupId);
    const message = t('group.shareMessage', { name: group?.name ?? '', link });
    if (Platform.OS === 'web') {
      const nav = (globalThis as any).navigator;
      try {
        if (nav?.share) await nav.share({ title: t('group.shareTitle'), text: message, url: link });
        else if (nav?.clipboard) {
          await nav.clipboard.writeText(link);
          (globalThis as any).alert?.(t('group.linkCopied'));
        }
      } catch { /* user cancelled */ }
      return;
    }
    try { await Share.share({ message }); } catch { /* user cancelled */ }
  };

  const merged = mergeCartItems(items);
  const totalCost = merged
    .filter((i) => i.unitPrice != null)
    .reduce((sum, i) => sum + i.unitPrice! * i.quantity, 0);
  const hasPrices = merged.some((i) => i.unitPrice != null);

  const doneItems = merged.filter((i) => i.inCart).length;
  const progress = merged.length > 0 ? doneItems / merged.length : 0;

  const renderCartItem = (item: MergedCartItem, big = false) => {
    const lineTotal = item.unitPrice != null ? item.unitPrice * item.quantity : null;
    const detailTarget = productRefOf(item);
    return (
      <View
        key={item.ids[0]}
        style={[styles.listItem, item.inCart && styles.listItemDone]}
      >
        {(item.imageUrl || item.categoryEmoji) ? (
          <TouchableOpacity
            activeOpacity={0.7}
            disabled={!detailTarget}
            onPress={() => detailTarget && setDetailTarget(detailTarget)}
          >
            {item.imageUrl ? (
              <ProductImage
                uri={item.imageUrl}
                style={big ? styles.listItemThumbBig : styles.listItemThumb}
              />
            ) : (
              <View style={big ? styles.listItemThumbBig : styles.listItemThumb}>
                <Text style={[styles.listItemEmoji, big && styles.listItemEmojiBig]}>
                  {item.categoryEmoji}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ) : null}
        <View style={styles.listItemContent}>
          <Text style={[
            styles.listItemName,
            big && styles.listItemNameBig,
            item.inCart && styles.listItemNameDone,
          ]}>
            {item.productName}
          </Text>
          <Text style={styles.listItemUnit}>{item.quantity} {item.unit}</Text>
        </View>
        {lineTotal != null && (
          <Text style={[styles.listItemPrice, item.inCart && styles.listItemPriceDone]}>
            {formatEuro(lineTotal)}
          </Text>
        )}
      </View>
    );
  };

  // Lista de la cesta: fusiona duplicados y agrupa Tienda → Zona del súper
  // (pasillo); dentro de cada zona, pendientes primero y alfabético.
  const renderCartList = (its: GroupItem[], big = false) =>
    groupByStore(mergeCartItems(its)).map((g) => {
      const meta = STORE_META[g.store];
      const inCart = g.data.filter((i) => i.inCart).length;
      return (
        <View key={g.store}>
          <View style={styles.storeHeader}>
            {meta.icon ? (
              <Image source={meta.icon} style={styles.storeHeaderIcon} resizeMode="cover" />
            ) : (
              <Ionicons name="pricetag-outline" size={13} color={colors.inkSoft} />
            )}
            <Text style={styles.storeHeaderText}>{meta.name}</Text>
            <Text style={styles.storeHeaderCount}>{inCart}/{g.data.length}</Text>
          </View>
          {groupByZone(g.data).map((z) => (
            <View key={z.zone.key}>
              <View style={styles.zoneHeader}>
                <Text style={styles.zoneHeaderEmoji}>{z.zone.emoji}</Text>
                <Text style={styles.zoneHeaderText}>{t(`zones.${z.zone.key}`)}</Text>
              </View>
              {sortZoneItems(z.data).map((item) => renderCartItem(item, big))}
            </View>
          ))}
        </View>
      );
    });

  const header = (
    <View style={[styles.header, { paddingTop: headerTop }]}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={glassAvailable ? styles.backBtnGlass : styles.backBtn}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={22} color={colors.ink} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {group?.name ?? t('group.detailTitle')}
      </Text>
      {group ? (
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn} activeOpacity={0.75}>
          <Ionicons name="share-social-outline" size={19} color={colors.accent} />
        </TouchableOpacity>
      ) : (
        <View style={{ width: 38 }} />
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
        {!glassAvailable && header}
        <ActivityIndicator
          size="large"
          color={colors.accent}
          style={{ marginTop: (glassAvailable ? headerHeight : 0) + 60 }}
        />
        {glassAvailable && (
          <View style={styles.chrome} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
            <GlassSurface style={styles.chromeGlass} fallbackColor={colors.paper}>
              {header}
            </GlassSurface>
          </View>
        )}
      </View>
    );
  }

  if (error || !group) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
        {!glassAvailable && header}
        <View style={[styles.centerBox, glassAvailable && { paddingTop: headerHeight }]}>
          <Text style={styles.emptyText}>{t('group.detailLoadError')}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
        {glassAvailable && (
          <View style={styles.chrome} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
            <GlassSurface style={styles.chromeGlass} fallbackColor={colors.paper}>
              {header}
            </GlassSurface>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      {!glassAvailable && header}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingTop: glassAvailable ? headerHeight + 8 : 0,
            paddingBottom: 90 + tabBarOffset,
          },
        ]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >

        {/* Members */}
        <TouchableOpacity
          style={[styles.section, styles.membersSection]}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('GroupMembers', { groupId })}
        >
          <View style={styles.memberSummaryRow}>
            <View style={styles.memberAvatarsWrap}>
              {group.members.length > 0 ? (
                <MemberAvatars members={group.members} maxVisible={4} size={30} />
              ) : (
                <Ionicons name="people-outline" size={20} color={colors.accent} />
              )}
            </View>
            <View style={styles.manageBtn}>
              <Text style={styles.manageHintText}>{t('group.manage')}</Text>
              <Ionicons name="chevron-forward" size={17} color={colors.accent} />
            </View>
          </View>
        </TouchableOpacity>

        {/* Cesta del grupo */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionTitleRow}>
              <View style={styles.sectionIcon}>
                <Ionicons name="basket-outline" size={16} color={colors.accent} />
              </View>
              <Text style={styles.sectionTitle}>{t('group.groupCart')}</Text>
            </View>
            {items.length > 0 && (
              <TouchableOpacity
                onPress={() => setCartExpanded(true)}
                style={styles.expandBtn}
                hitSlop={8}
              >
                <Ionicons name="expand-outline" size={17} color={colors.accent} />
              </TouchableOpacity>
            )}
          </View>

          {items.length > 0 && (
            <View style={styles.progressWrap}>
              <ProgressBar progress={progress} height={6} />
              <Text style={styles.progressSub}>
                {t('group.cartProgress', { done: doneItems, total: merged.length, pct: Math.round(progress * 100) })}
              </Text>
            </View>
          )}

          {items.length === 0 ? (
            <Text style={styles.emptyCart}>{t('group.emptyCart')}</Text>
          ) : (
            renderCartList(items)
          )}
        </View>

      </ScrollView>

      {/* Total bar */}
      {hasPrices && items.length > 0 && (
        <GlassSurface
          style={[styles.totalBar, { bottom: tabBarOffset + 8 }]}
          tintColor={colors.accentLight}
          fallbackColor={colors.white}
        >
          <Text style={styles.totalBarLabel}>{t('list.totalEstimated')}</Text>
          <Text style={styles.totalBarAmount}>{formatEuro(totalCost)}</Text>
        </GlassSurface>
      )}

      {/* Expanded cart overlay */}
      {cartExpanded && (
        <View style={styles.modalContainer}>
          <GlassSurface style={[styles.modalHeader, { paddingTop: headerTop }]} fallbackColor={colors.paper}>
            <Text style={styles.modalTitle} numberOfLines={1}>{t('group.cartOf', { name: group.name })}</Text>
            <TouchableOpacity
              onPress={() => setCartExpanded(false)}
              style={glassAvailable ? styles.backBtnGlass : styles.backBtn}
            >
              <Ionicons name="contract-outline" size={20} color={colors.ink} />
            </TouchableOpacity>
          </GlassSurface>

          {items.length > 0 && (
            <View style={styles.modalProgress}>
              <ProgressBar progress={progress} height={6} />
              <Text style={styles.progressSub}>
                {t('group.cartProgress', { done: doneItems, total: merged.length, pct: Math.round(progress * 100) })}
              </Text>
            </View>
          )}

          <ScrollView
            contentContainerStyle={[styles.modalScroll, { paddingBottom: 90 + tabBarOffset }]}
            showsVerticalScrollIndicator={false}
          >
            {renderCartList(items, true)}
          </ScrollView>

          {hasPrices && (
            <GlassSurface
              style={[styles.totalBar, { bottom: tabBarOffset + 8 }]}
              tintColor={colors.accentLight}
              fallbackColor={colors.white}
            >
              <Text style={styles.totalBarLabel}>{t('list.totalEstimated')}</Text>
              <Text style={styles.totalBarAmount}>{formatEuro(totalCost)}</Text>
            </GlassSurface>
          )}
        </View>
      )}

      <StoreProductModal
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
        fullScreen
      />

      {glassAvailable && !cartExpanded && (
        <View style={styles.chrome} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
          <GlassSurface style={styles.chromeGlass} fallbackColor={colors.paper}>
            {header}
          </GlassSurface>
        </View>
      )}
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  // ── Header ────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 10, gap: 10,
    // paddingTop inline (useHeaderTopPadding)
  },
  backBtn: {
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, borderRadius: 19,
  },
  backBtnGlass: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  shareBtn: {
    width: 38, height: 38,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center', borderRadius: 19,
  },

  scroll: { paddingHorizontal: 16, paddingBottom: 90 },

  // ── Sections ─────────────────────────────────────────────────
  section: {
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    padding: 13, marginBottom: 10, gap: 9, borderRadius: 18,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionIcon: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionTitle: { fontSize: 14, fontFamily: fonts.bold, color: colors.ink },
  expandBtn: {
    width: 30, height: 30,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center', borderRadius: 15,
  },
  membersSection: { paddingVertical: 11 },
  memberSummaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  memberAvatarsWrap: {
    minWidth: 38, height: 38, justifyContent: 'center',
  },
  manageBtn: {
    height: 30, borderRadius: 15, paddingLeft: 10, paddingRight: 7,
    flexDirection: 'row', gap: 1,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  manageHintText: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.accent },

  progressWrap: { gap: 6 },
  progressSub: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'right' },

  emptyCart: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, paddingVertical: 6 },

  // ── Store sub-header dentro de la cesta ───────────────────────
  storeHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    marginTop: 7, marginBottom: 2,
    paddingHorizontal: 8, paddingVertical: 5,
    backgroundColor: colors.surfaceAlt, borderRadius: 10,
  },
  storeHeaderIcon: { width: 16, height: 16 },
  storeHeaderText: { fontSize: 12, fontFamily: fonts.bold, color: colors.ink, flex: 1 },
  storeHeaderCount: { fontSize: 11, fontFamily: fonts.bold, color: colors.inkSoft },
  zoneHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    marginTop: 6, marginBottom: 4, paddingLeft: 2,
  },
  zoneHeaderEmoji: { fontSize: 11 },
  zoneHeaderText: {
    flex: 1, fontSize: 10, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1.1,
  },

  // ── Cart rows ─────────────────────────────────────────────────
  listItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    gap: 10,
  },
  listItemDone: { opacity: 0.55 },
  listItemThumb: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  listItemThumbBig: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  listItemEmoji: { fontSize: 17 },
  listItemEmojiBig: { fontSize: 22 },
  listItemContent: { flex: 1 },
  listItemName: { fontSize: 13.5, fontFamily: fonts.semibold, color: colors.ink },
  listItemNameBig: { fontSize: 15 },
  listItemNameDone: { textDecorationLine: 'line-through', color: colors.inkSoft },
  listItemUnit: { fontSize: 11, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1 },
  listItemPrice: { fontSize: 13, fontFamily: fonts.bold, color: colors.accent },
  listItemPriceDone: { color: colors.inkFaint },

  // ── Total bar ─────────────────────────────────────────────────
  totalBar: {
    position: 'absolute', bottom: 0, left: 12, right: 12,
    borderWidth: 1, borderColor: colors.border, borderRadius: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    overflow: 'hidden',
  },
  totalBarLabel: { fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft },
  totalBarAmount: { fontSize: 22, fontFamily: fonts.bold, color: colors.ink },

  // ── States ────────────────────────────────────────────────────
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center' },
  retryText: { fontSize: 14, fontFamily: fonts.bold, color: colors.accent },

  // ── Expanded overlay ──────────────────────────────────────────
  modalContainer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: colors.paper, zIndex: 10,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12, gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    // paddingTop inline (useHeaderTopPadding)
  },
  modalTitle: { flex: 1, fontSize: 21, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  modalProgress: { paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  modalScroll: { paddingHorizontal: 16, paddingBottom: 90 },

  chrome: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 },
  chromeGlass: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
