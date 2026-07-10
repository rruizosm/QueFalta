import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Image,
  StyleSheet, StatusBar, ActivityIndicator, RefreshControl,
  LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useCart } from '../context/CartContext';
import { useProfile } from '../context/ProfileContext';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { FREE_LIMITS, limitsApply } from '../constants/limits';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import { fetchPurchases, fetchPurchaseItems, type Purchase } from '../api/purchases';
import PaywallModal from '../components/PaywallModal';
import type { NewListItem } from '../api/lists';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const formatEuro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function HistoryScreen() {
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const { t, lang } = useTranslation();
  const locale = lang === 'ca' ? 'ca-ES' : 'es-ES';
  const navigation = useNavigation<any>();
  const { loadItemsIntoGroupCart } = useCart();
  const { isPremium } = useProfile();
  const toast = useToast();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [repeatingId, setRepeatingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [itemsCache, setItemsCache] = useState<Record<string, NewListItem[]>>({});
  const [itemsLoadingId, setItemsLoadingId] = useState<string | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);

  // Gate free (Fase 2 MONETIZACION.md): ver el historial es libre, pero solo se
  // pueden REPETIR las N compras más recientes (vienen ordenadas desc).
  const repeatableIds = useMemo(
    () => new Set(purchases.slice(0, FREE_LIMITS.maxRepeatableHistory).map((p) => p.id)),
    [purchases],
  );
  const isRepeatLocked = (p: Purchase) =>
    limitsApply(isPremium) && !repeatableIds.has(p.id);

  const load = useCallback(() => {
    return fetchPurchases()
      .then(setPurchases)
      .catch(() => setPurchases([]))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const toggleExpand = async (p: Purchase) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (expandedId === p.id) { setExpandedId(null); return; }
    setExpandedId(p.id);
    if (!itemsCache[p.id]) {
      setItemsLoadingId(p.id);
      try {
        const items = await fetchPurchaseItems(p.id);
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setItemsCache((c) => ({ ...c, [p.id]: items }));
      } catch {
        toast.show(t('history.detailError'), 'error');
      } finally {
        setItemsLoadingId(null);
      }
    }
  };

  const handleRepeat = async (p: Purchase) => {
    if (repeatingId) return;
    setRepeatingId(p.id);
    try {
      const items = itemsCache[p.id] ?? await fetchPurchaseItems(p.id);
      if (items.length === 0) {
        toast.show(t('history.noDetail'), 'error');
        return;
      }
      await loadItemsIntoGroupCart(p.groupId, p.groupName ?? t('history.groupFallback'), items);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('history.loaded', { n: items.length, group: p.groupName ?? t('history.theGroupFallback') }));
      navigation.navigate('List');
    } catch {
      toast.show(t('history.repeatError'), 'error');
    } finally {
      setRepeatingId(null);
    }
  };

  // Group purchases by month (newest first; purchases already sorted desc).
  const months = useMemo(() => {
    const map = new Map<string, { label: string; total: number; items: Purchase[] }>();
    for (const p of purchases) {
      const d = new Date(p.completedAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!map.has(key)) {
        map.set(key, {
          label: cap(d.toLocaleDateString(locale, { month: 'long', year: 'numeric' })),
          total: 0,
          items: [],
        });
      }
      const m = map.get(key)!;
      m.total += p.total;
      m.items.push(p);
    }
    return Array.from(map.values());
  }, [purchases, locale]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <View style={[styles.header, { paddingTop: headerTop }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>{t('profile.purchaseHistory')}</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 60 }} />
      ) : purchases.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="receipt-outline" size={48} color={colors.inkFaint} />
          <Text style={styles.emptyTitle}>{t('history.emptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('history.emptyText')}</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad }]}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
          }
        >
          {months.map((m) => (
            <View key={m.label} style={styles.monthBlock}>
              <View style={styles.monthHeader}>
                <Text style={styles.monthLabel}>{m.label}</Text>
                <Text style={styles.monthTotal}>{formatEuro(m.total)}</Text>
              </View>
              <View style={styles.section}>
                {m.items.map((p, i) => {
                  const expanded = expandedId === p.id;
                  const prods = itemsCache[p.id];
                  const showBorder = i < m.items.length - 1 || expanded;
                  return (
                    <View key={p.id}>
                      <TouchableOpacity
                        style={[styles.row, showBorder && styles.rowBorder]}
                        activeOpacity={0.7}
                        onPress={() => toggleExpand(p)}
                      >
                        <View style={styles.rowIcon}>
                          <Ionicons name="cart-outline" size={18} color={colors.accent} />
                        </View>
                        <View style={styles.rowInfo}>
                          <Text style={styles.rowName} numberOfLines={1}>{p.groupName ?? t('history.groupFallback')}</Text>
                          <Text style={styles.rowMeta}>
                            {cap(new Date(p.completedAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' }))}
                            {' · '}{p.itemCount} {p.itemCount === 1 ? t('history.item') : t('history.items')}
                          </Text>
                        </View>
                        <Text style={styles.rowTotal}>{formatEuro(p.total)}</Text>
                        <Ionicons
                          name={expanded ? 'chevron-up' : 'chevron-down'}
                          size={16}
                          color={colors.inkFaint}
                        />
                      </TouchableOpacity>

                      {expanded && (
                        <View style={[styles.expanded, showBorder && styles.rowBorder]}>
                          {itemsLoadingId === p.id ? (
                            <ActivityIndicator size="small" color={colors.accent} style={{ paddingVertical: 16 }} />
                          ) : prods && prods.length > 0 ? (
                            <>
                              {prods.map((it, idx) => (
                                <View key={idx} style={styles.prodRow}>
                                  {it.imageUrl ? (
                                    <Image source={{ uri: it.imageUrl }} style={styles.prodThumb} resizeMode="contain" />
                                  ) : (
                                    <View style={styles.prodThumb}>
                                      <Text style={{ fontSize: 15 }}>{it.categoryEmoji ?? '🛒'}</Text>
                                    </View>
                                  )}
                                  <View style={styles.prodInfo}>
                                    <Text style={styles.prodName} numberOfLines={1}>{it.productName}</Text>
                                    <Text style={styles.prodQty}>{it.quantity} {it.unit ?? 'ud'}</Text>
                                  </View>
                                  {it.unitPrice != null && (
                                    <Text style={styles.prodPrice}>{formatEuro(it.unitPrice * it.quantity)}</Text>
                                  )}
                                </View>
                              ))}
                              {isRepeatLocked(p) ? (
                                <TouchableOpacity
                                  style={styles.repeatBtnLocked}
                                  onPress={() => setPaywallVisible(true)}
                                  activeOpacity={0.85}
                                >
                                  <Ionicons name="lock-closed" size={15} color={colors.accent} />
                                  <Text style={styles.repeatLockedText}>{t('history.repeatPlus')}</Text>
                                </TouchableOpacity>
                              ) : (
                                <TouchableOpacity
                                  style={styles.repeatBtn}
                                  onPress={() => handleRepeat(p)}
                                  disabled={!!repeatingId}
                                  activeOpacity={0.85}
                                >
                                  {repeatingId === p.id ? (
                                    <ActivityIndicator size="small" color={colors.white} />
                                  ) : (
                                    <>
                                      <Ionicons name="refresh" size={16} color={colors.white} />
                                      <Text style={styles.repeatText}>{t('history.repeat')}</Text>
                                    </>
                                  )}
                                </TouchableOpacity>
                              )}
                            </>
                          ) : (
                            <Text style={styles.noDetail}>{t('history.noDetail')}</Text>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        subtitle={t('history.paywallSubtitle', { n: FREE_LIMITS.maxRepeatableHistory })}
      />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 10, gap: 12,
    // paddingTop inline (useHeaderTopPadding)
  },
  backBtn: {
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  title: { flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  monthBlock: { marginTop: 16 },
  monthHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: 8,
  },
  monthLabel: { fontSize: 15, fontFamily: fonts.bold, color: colors.ink },
  monthTotal: { fontSize: 15, fontFamily: fonts.bold, color: colors.accent },

  section: {
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowIcon: {
    width: 34, height: 34,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  rowInfo: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14, fontFamily: fonts.semibold, color: colors.ink },
  rowMeta: { fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
  rowTotal: { fontSize: 14, fontFamily: fonts.bold, color: colors.ink },

  // ── Expanded product list ─────────────────────────────────────
  expanded: { paddingVertical: 6 },
  prodRow: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    paddingVertical: 8,
  },
  prodThumb: {
    width: 32, height: 32, borderRadius: 5,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  prodInfo: { flex: 1, minWidth: 0 },
  prodName: { fontSize: 13, fontFamily: fonts.semibold, color: colors.ink },
  prodQty: { fontSize: 11, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1 },
  prodPrice: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.accent },
  noDetail: { fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft, paddingVertical: 12 },
  repeatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: colors.accent,
    paddingVertical: 11, marginTop: 8, marginBottom: 4,
  },
  repeatText: { fontSize: 13.5, fontFamily: fonts.bold, color: colors.white },
  repeatBtnLocked: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: colors.accentLight,
    borderWidth: 1, borderColor: colors.accent,
    paddingVertical: 11, marginTop: 8, marginBottom: 4,
  },
  repeatLockedText: { fontSize: 13.5, fontFamily: fonts.bold, color: colors.accent },

  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center', lineHeight: 20 },
});
