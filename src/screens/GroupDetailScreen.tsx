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
import MemberAvatars from '../components/MemberAvatars';
import ProgressBar from '../components/ProgressBar';
import ProductImage from '../components/ProductImage';
import StoreProductModal, { type ProductRef } from '../components/StoreProductModal';
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

  if (loading) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 120 }} />
      </View>
    );
  }

  if (error || !group) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.ink} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('group.detailTitle')}</Text>
          <View style={{ width: 38 }} />
        </View>
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>{t('group.detailLoadError')}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{group.name}</Text>
        <TouchableOpacity onPress={handleShare} style={styles.shareBtn}>
          <Ionicons name="share-social-outline" size={19} color={colors.accent} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
      >

        {/* Members */}
        <TouchableOpacity
          style={styles.section}
          activeOpacity={0.7}
          onPress={() => navigation.navigate('GroupMembers', { groupId })}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('group.membersTitle', { n: group.members.length })}</Text>
            <View style={styles.manageHint}>
              <Text style={styles.manageHintText}>{t('group.manage')}</Text>
              <Ionicons name="chevron-forward" size={15} color={colors.accent} />
            </View>
          </View>
          {group.members.length > 0 && (
            <MemberAvatars members={group.members} maxVisible={6} size={32} />
          )}
          <View style={styles.membersNames}>
            {group.members.slice(0, 4).map((m, i) => (
              <Text key={m.id} style={styles.memberName}>
                {m.name}{i < Math.min(group.members.length, 4) - 1 ? ', ' : ''}
              </Text>
            ))}
            {group.members.length > 4 && (
              <Text style={styles.memberName}>{t('group.moreMembers', { n: group.members.length - 4 })}</Text>
            )}
          </View>
        </TouchableOpacity>

        {/* Cesta del grupo */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('group.groupCart')}</Text>
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
        <View style={styles.totalBar}>
          <Text style={styles.totalBarLabel}>{t('list.totalEstimated')}</Text>
          <Text style={styles.totalBarAmount}>{formatEuro(totalCost)}</Text>
        </View>
      )}

      {/* Expanded cart overlay */}
      {cartExpanded && (
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle} numberOfLines={1}>{t('group.cartOf', { name: group.name })}</Text>
            <TouchableOpacity onPress={() => setCartExpanded(false)} style={styles.backBtn}>
              <Ionicons name="contract-outline" size={20} color={colors.ink} />
            </TouchableOpacity>
          </View>

          {items.length > 0 && (
            <View style={styles.modalProgress}>
              <ProgressBar progress={progress} height={6} />
              <Text style={styles.progressSub}>
                {t('group.cartProgress', { done: doneItems, total: merged.length, pct: Math.round(progress * 100) })}
              </Text>
            </View>
          )}

          <ScrollView
            contentContainerStyle={styles.modalScroll}
            showsVerticalScrollIndicator={false}
          >
            {renderCartList(items, true)}
          </ScrollView>

          {hasPrices && (
            <View style={styles.totalBar}>
              <Text style={styles.totalBarLabel}>{t('list.totalEstimated')}</Text>
              <Text style={styles.totalBarAmount}>{formatEuro(totalCost)}</Text>
            </View>
          )}
        </View>
      )}

      <StoreProductModal
        target={detailTarget}
        onClose={() => setDetailTarget(null)}
        fullScreen
      />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  // ── Header ────────────────────────────────────────────────────
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12, gap: 12,
  },
  backBtn: {
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  headerTitle: { flex: 1, fontSize: 21, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  shareBtn: {
    width: 38, height: 38,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },

  scroll: { paddingHorizontal: 16, paddingBottom: 90 },

  // ── Sections ─────────────────────────────────────────────────
  section: {
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    padding: 14, marginBottom: 10, gap: 10,
  },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 14, fontFamily: fonts.bold, color: colors.ink },
  expandBtn: {
    width: 30, height: 30,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  membersNames: { flexDirection: 'row', flexWrap: 'wrap' },
  memberName: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft },
  manageHint: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  manageHintText: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.accent },

  progressWrap: { gap: 6 },
  progressSub: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'right' },

  emptyCart: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, paddingVertical: 6 },

  // ── Store sub-header dentro de la cesta ───────────────────────
  storeHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    marginTop: 8, marginBottom: 2,
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
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    gap: 10,
  },
  listItemDone: { opacity: 0.55 },
  listItemThumb: {
    width: 34, height: 34, borderRadius: 5,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  listItemThumbBig: {
    width: 44, height: 44, borderRadius: 6,
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
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.white,
    borderTopWidth: 1, borderTopColor: colors.border,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
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
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12, gap: 12,
  },
  modalTitle: { flex: 1, fontSize: 21, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  modalProgress: { paddingHorizontal: 16, paddingBottom: 8, gap: 6 },
  modalScroll: { paddingHorizontal: 16, paddingBottom: 90 },
});
