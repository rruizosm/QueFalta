import { useCallback, useMemo, useState } from 'react';
import { fonts } from '../constants/typography';
import {
  View,
  Text,
  SectionList,
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
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { GroupsStackParamList } from '../types';
import {
  fetchGroupDetail,
  fetchGroupItems,
  getInviteLink,
  updateGroupIcon,
  type GroupSummary,
  type GroupItem,
} from '../api/groups';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import MemberAvatars from '../components/MemberAvatars';
import ProgressBar from '../components/ProgressBar';
import ProductImage from '../components/ProductImage';
import StoreProductModal, { type ProductRef } from '../components/StoreProductModal';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import { STORE_META, groupByStore, storeOfItem, type Store } from '../constants/stores';
import { groupByZone, sortZoneItems, type ShopZone } from '../constants/zones';
import { mergeCartItems, type MergedCartItem } from '../api/lists';
import GroupIconPickerSheet from '../components/GroupIconPickerSheet';
import { DEFAULT_GROUP_ICON } from '../constants/groupIcons';

type GroupDetailRouteProp = RouteProp<GroupsStackParamList, 'GroupDetail'>;
type GroupCartSection = {
  key: string;
  store: Store;
  zone: ShopZone;
  firstOfStore: boolean;
  storeCount: number;
  storeInCart: number;
  data: MergedCartItem[];
};

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
  const { session } = useAuth();
  const { updateActiveCartIcon } = useCart();
  const toast = useToast();
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
  const [iconPickerVisible, setIconPickerVisible] = useState(false);
  const [savingIcon, setSavingIcon] = useState(false);

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

  const handleSaveIcon = async (iconEmoji: string) => {
    if (!group || savingIcon) return;
    setSavingIcon(true);
    try {
      await updateGroupIcon(groupId, iconEmoji);
      setGroup({ ...group, iconEmoji });
      await updateActiveCartIcon(groupId, iconEmoji);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('group.iconSaved'));
      setIconPickerVisible(false);
    } catch {
      toast.show(t('group.iconSaveError'), 'error');
    } finally {
      setSavingIcon(false);
    }
  };

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

  // El detalle y la vista expandida comparten una única preparación. Antes se
  // fusionaba/agrupaba varias veces por render y se mantenían dos copias enteras.
  const merged = useMemo(() => mergeCartItems(items), [items]);
  const { totalCost, hasPrices, doneItems } = useMemo(() => ({
    totalCost: merged.reduce(
      (sum, item) => sum + (item.unitPrice != null ? item.unitPrice * item.quantity : 0),
      0,
    ),
    hasPrices: merged.some((item) => item.unitPrice != null),
    doneItems: merged.filter((item) => item.inCart).length,
  }), [merged]);
  const progress = merged.length > 0 ? doneItems / merged.length : 0;

  const cartSections = useMemo<GroupCartSection[]>(() => (
    groupByStore(merged).flatMap((storeGroup) => {
      const storeInCart = storeGroup.data.filter((item) => item.inCart).length;
      return groupByZone(storeGroup.data).map((zoneGroup, zoneIndex) => ({
        key: `${storeGroup.store}:${zoneGroup.zone.key}`,
        store: storeGroup.store,
        zone: zoneGroup.zone,
        firstOfStore: zoneIndex === 0,
        storeCount: storeGroup.data.length,
        storeInCart,
        data: sortZoneItems(zoneGroup.data),
      }));
    })
  ), [merged]);

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
            accessibilityRole={detailTarget ? 'button' : undefined}
            accessibilityLabel={detailTarget ? item.productName : undefined}
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
          {!!item.note && (
            <Text style={styles.listItemNote} numberOfLines={2}>{item.note}</Text>
          )}
          {!!item.noteProduct && (
            <View style={styles.listItemNoteProduct}>
              {item.noteProduct.imageUrl ? (
                <ProductImage uri={item.noteProduct.imageUrl} style={styles.listItemNoteProductImage} />
              ) : (
                <Ionicons name="link-outline" size={12} color={colors.accent} />
              )}
              <Text style={styles.listItemNoteProductText} numberOfLines={1}>
                {t('list.noteLinkedProduct', {
                  product: item.noteProduct.name,
                  store: STORE_META[item.noteProduct.store].name,
                })}
              </Text>
            </View>
          )}
        </View>
        {lineTotal != null && (
          <Text style={[styles.listItemPrice, item.inCart && styles.listItemPriceDone]}>
            {formatEuro(lineTotal)}
          </Text>
        )}
      </View>
    );
  };

  const renderCartSectionHeader = (section: GroupCartSection) => {
    const meta = STORE_META[section.store];
    return (
      <View style={styles.cartRowsSurface}>
        {section.firstOfStore && (
          <View style={styles.storeHeader}>
            {meta.icon ? (
              <Image source={meta.icon} style={styles.storeHeaderIcon} resizeMode="cover" />
            ) : (
              <Ionicons name="pricetag-outline" size={13} color={colors.inkSoft} />
            )}
            <Text style={styles.storeHeaderText}>{meta.name}</Text>
            <Text style={styles.storeHeaderCount}>{section.storeInCart}/{section.storeCount}</Text>
          </View>
        )}
        <View style={styles.zoneHeader}>
          <Text style={styles.zoneHeaderEmoji}>{section.zone.emoji}</Text>
          <Text style={styles.zoneHeaderText}>{t(`zones.${section.zone.key}`)}</Text>
        </View>
      </View>
    );
  };

  const header = (
    <View style={[styles.header, { paddingTop: headerTop }]}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={glassAvailable ? styles.backBtnGlass : styles.backBtn}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
      >
        <Ionicons name="arrow-back" size={22} color={colors.ink} />
      </TouchableOpacity>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {group?.name ?? t('group.detailTitle')}
      </Text>
      {group ? (
        <TouchableOpacity
          onPress={handleShare}
          style={styles.shareBtn}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={t('group.shareTitle')}
        >
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

      {!cartExpanded && (
        <SectionList
          sections={cartSections}
          keyExtractor={(item) => item.ids[0]}
          renderItem={({ item }) => (
            <View style={styles.cartRowsSurface}>{renderCartItem(item)}</View>
          )}
          renderSectionHeader={({ section }) => renderCartSectionHeader(section)}
          stickySectionHeadersEnabled={false}
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
          initialNumToRender={10}
          maxToRenderPerBatch={8}
          windowSize={7}
          ListHeaderComponent={(
            <>
              <TouchableOpacity
                style={[styles.section, styles.membersSection]}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('GroupMembers', { groupId })}
                accessibilityRole="button"
                accessibilityLabel={t('group.membersTitle', { n: group.members.length })}
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

              {group.ownerId === session?.user.id && (
                <TouchableOpacity
                  style={[styles.section, styles.iconSection]}
                  activeOpacity={0.72}
                  onPress={() => setIconPickerVisible(true)}
                  accessibilityRole="button"
                  accessibilityLabel={t('group.iconAction')}
                >
                  <View style={styles.groupIconPreview}>
                    <Text style={styles.groupIconEmoji}>{group.iconEmoji ?? DEFAULT_GROUP_ICON}</Text>
                  </View>
                  <View style={styles.groupIconCopy}>
                    <Text style={styles.groupIconTitle}>{t('group.iconAction')}</Text>
                    <Text style={styles.groupIconSubtitle}>{t('group.iconActionSubtitle')}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={colors.accent} />
                </TouchableOpacity>
              )}

              <View style={[styles.section, items.length > 0 && styles.cartIntroSection]}>
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
                      accessibilityRole="button"
                      accessibilityLabel={t('group.expandCartA11y')}
                    >
                      <Ionicons name="expand-outline" size={17} color={colors.accent} />
                    </TouchableOpacity>
                  )}
                </View>

                {items.length > 0 ? (
                  <View style={styles.progressWrap}>
                    <ProgressBar progress={progress} height={6} />
                    <Text style={styles.progressSub}>
                      {t('group.cartProgress', { done: doneItems, total: merged.length, pct: Math.round(progress * 100) })}
                    </Text>
                  </View>
                ) : (
                  <Text style={styles.emptyCart}>{t('group.emptyCart')}</Text>
                )}
              </View>
            </>
          )}
        />
      )}

      {/* Total bar */}
      {!cartExpanded && hasPrices && items.length > 0 && (
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
              accessibilityRole="button"
              accessibilityLabel={t('group.collapseCartA11y')}
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

          <SectionList
            sections={cartSections}
            keyExtractor={(item) => item.ids[0]}
            renderItem={({ item }) => (
              <View style={styles.cartRowsSurface}>{renderCartItem(item, true)}</View>
            )}
            renderSectionHeader={({ section }) => renderCartSectionHeader(section)}
            stickySectionHeadersEnabled={false}
            contentContainerStyle={[styles.modalScroll, { paddingBottom: 90 + tabBarOffset }]}
            showsVerticalScrollIndicator={false}
            initialNumToRender={12}
            maxToRenderPerBatch={8}
            windowSize={7}
          />

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

      <GroupIconPickerSheet
        visible={iconPickerVisible}
        selectedIcon={group.iconEmoji}
        busy={savingIcon}
        onSave={handleSaveIcon}
        onClose={() => { if (!savingIcon) setIconPickerVisible(false); }}
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
  cartIntroSection: { marginBottom: 6 },
  cartRowsSurface: {
    backgroundColor: colors.white,
    paddingHorizontal: 13,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
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
  iconSection: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 10,
  },
  groupIconPreview: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  groupIconEmoji: { fontSize: 24, lineHeight: 30 },
  groupIconCopy: { flex: 1, minWidth: 0 },
  groupIconTitle: { fontSize: 13.5, fontFamily: fonts.bold, color: colors.ink },
  groupIconSubtitle: { marginTop: 2, fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft },
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
  listItemNote: { fontSize: 11, lineHeight: 15, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 3 },
  listItemNoteProduct: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  listItemNoteProductImage: { width: 18, height: 18, borderRadius: 5, backgroundColor: colors.surfaceAlt },
  listItemNoteProductText: { flex: 1, fontSize: 10.5, fontFamily: fonts.semibold, color: colors.accent },
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
