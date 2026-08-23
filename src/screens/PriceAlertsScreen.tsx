import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { FREE_PRICE_ALERT_LIMIT, limitsApply } from '../constants/limits';
import { fonts } from '../constants/typography';
import { CATALOG_STORES } from '../constants/stores';
import {
  deletePriceAlert,
  fetchPriceAlerts,
  setPriceAlertActive,
  type PriceAlertRule,
} from '../api/priceAlerts';
import { freePriceAlertRule } from '../lib/freeTierAllowances';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useTranslation } from '../context/LanguageContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import ProfileSubscreenHeader from '../components/ProfileSubscreenHeader';
import PriceAlertEditorModal from '../components/PriceAlertEditorModal';
import PaywallModal from '../components/PaywallModal';

export default function PriceAlertsScreen() {
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const { t } = useTranslation();
  const toast = useToast();
  const { session } = useAuth();
  const { isPremium } = useProfile();
  const [items, setItems] = useState<PriceAlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editing, setEditing] = useState<PriceAlertRule | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const freeLimitsApply = limitsApply(isPremium);
  const freeRuleId = useMemo(() => freePriceAlertRule(items)?.id ?? null, [items]);

  const load = useCallback(async () => {
    const userId = session?.user.id;
    if (!userId) return;
    try {
      setItems(await fetchPriceAlerts(userId));
    } catch {
      toast.show(t('priceAlerts.loadError'), 'error');
    } finally {
      setLoading(false);
    }
  }, [session?.user.id, t, toast]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openNew = () => {
    if (freeLimitsApply && items.length >= FREE_PRICE_ALERT_LIMIT) { setPaywallVisible(true); return; }
    setEditing(null);
    setEditorVisible(true);
  };

  const openEdit = (rule: PriceAlertRule) => {
    if (freeLimitsApply && rule.id !== freeRuleId) { setPaywallVisible(true); return; }
    setEditing(rule);
    setEditorVisible(true);
  };

  const toggle = async (rule: PriceAlertRule, active: boolean) => {
    const userId = session?.user.id;
    if (!userId) return;
    if (active && freeLimitsApply && rule.id !== freeRuleId) { setPaywallVisible(true); return; }
    setItems((current) => current.map((item) => item.id === rule.id ? { ...item, active } : item));
    setBusyId(rule.id);
    try {
      await setPriceAlertActive(userId, rule.id, active);
    } catch {
      setItems((current) => current.map((item) => item.id === rule.id ? { ...item, active: rule.active } : item));
      toast.show(t('priceAlerts.saveError'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const remove = (rule: PriceAlertRule) => {
    const userId = session?.user.id;
    if (!userId) return;
    Alert.alert(t('priceAlerts.deleteTitle'), t('priceAlerts.deleteMessage', { name: rule.label }), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePriceAlert(userId, rule.id);
            setItems((current) => current.filter((item) => item.id !== rule.id));
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch {
            toast.show(t('priceAlerts.deleteError'), 'error');
          }
        },
      },
    ]);
  };

  const storesText = (rule: PriceAlertRule) => {
    const names = rule.stores.map((key) => CATALOG_STORES.find((store) => store.key === key)?.name ?? key);
    if (names.length <= 2) return names.join(' · ');
    return t('priceAlerts.storeCount', { n: names.length });
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />
      <ProfileSubscreenHeader
        title={t('priceAlerts.title')}
        icon="notifications-outline"
        headerTop={headerTop}
        right={(
          <TouchableOpacity onPress={openNew} style={styles.headerAdd} accessibilityRole="button" accessibilityLabel={t('priceAlerts.newTitle')}>
            <Ionicons name="add" size={21} color={colors.white} />
          </TouchableOpacity>
        )}
      />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: headerTop + 66, paddingBottom: bottomPad }]}
      >
        <Text style={styles.intro}>{t('priceAlerts.intro')}</Text>
        {freeLimitsApply ? (
          <View style={styles.freeAllowance}>
            <Ionicons name="gift-outline" size={17} color={colors.accent} />
            <Text style={styles.freeAllowanceText}>{t('priceAlerts.freeAllowance')}</Text>
          </View>
        ) : null}

        {loading ? (
          <ActivityIndicator size="large" color={colors.accent} style={styles.loader} />
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Ionicons name="notifications-outline" size={32} color={colors.accent} /></View>
            <Text style={styles.emptyTitle}>{t('priceAlerts.empty')}</Text>
            <Text style={styles.emptyText}>{t('priceAlerts.emptyHint')}</Text>
            <TouchableOpacity onPress={openNew} style={styles.primaryBtn} activeOpacity={0.85}>
              <Ionicons name="add" size={18} color={colors.white} />
              <Text style={styles.primaryText}>{t('priceAlerts.createFirst')}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.list}>
            {items.map((rule) => {
              const allowed = !freeLimitsApply || rule.id === freeRuleId;
              const active = allowed && rule.active;
              const triggerText = rule.kind === 'new_arrival'
                ? t('priceAlerts.newArrivalSummary')
                : [
                rule.notifyPriceDrop ? t('priceAlerts.dropSummary', { n: rule.minDropPct }) : null,
                rule.notifyNewOffer ? t('priceAlerts.offerSummary') : null,
              ].filter(Boolean).join(' · ');
              return (
                <TouchableOpacity key={rule.id} style={[styles.card, !active && styles.cardPaused]} onPress={() => openEdit(rule)} activeOpacity={0.82}>
                  <View style={styles.cardTop}>
                    <View style={styles.ruleIcon}>
                      <Text style={styles.ruleEmoji}>{rule.emoji}</Text>
                    </View>
                    <View style={styles.ruleCopy}>
                      <Text style={styles.ruleTitle} numberOfLines={2}>{rule.label}</Text>
                      {rule.kind === 'keyword' && rule.query ? <Text style={styles.queryText}>“{rule.query}”</Text> : null}
                    </View>
                    {busyId === rule.id ? <ActivityIndicator size="small" color={colors.accent} /> : (
                      <Switch
                        value={active}
                        onValueChange={(value) => toggle(rule, value)}
                        onTouchEnd={(event) => event.stopPropagation()}
                        trackColor={{ true: colors.accentMid }}
                        thumbColor={active ? colors.accent : colors.inkFaint}
                      />
                    )}
                  </View>
                  <Text style={styles.ruleMeta}>{storesText(rule)}</Text>
                  <Text style={styles.ruleMeta}>{triggerText}</Text>
                  {!allowed ? <Text style={styles.pausedTag}>{t('priceAlerts.paused')}</Text> : null}
                  <TouchableOpacity
                    onPress={(event) => { event.stopPropagation(); remove(rule); }}
                    style={styles.deleteBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t('priceAlerts.deleteTitle')}
                  >
                    <Ionicons name="trash-outline" size={16} color={colors.red} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <PriceAlertEditorModal
        visible={editorVisible}
        onClose={() => setEditorVisible(false)}
        initialRule={editing}
        onSaved={(saved) => setItems((current) => {
          const exists = current.some((item) => item.id === saved.id);
          return exists
            ? current.map((item) => item.id === saved.id ? saved : item)
            : [saved, ...current];
        })}
      />
      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
      />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { paddingHorizontal: 14 },
  headerAdd: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accent },
  intro: { fontSize: 13, lineHeight: 19, fontFamily: fonts.medium, color: colors.inkSoft, marginBottom: 14 },
  freeAllowance: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 10, backgroundColor: colors.accentLight, borderWidth: 1, borderColor: colors.accentMid, marginBottom: 14 },
  freeAllowanceText: { flex: 1, fontSize: 11.5, lineHeight: 16, fontFamily: fonts.semibold, color: colors.accent },
  loader: { marginTop: 70 },
  empty: { alignItems: 'center', paddingHorizontal: 26, paddingTop: 72 },
  emptyIcon: { width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight, marginBottom: 14 },
  emptyTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink },
  emptyText: { fontSize: 13, lineHeight: 19, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center', marginTop: 6 },
  primaryBtn: { marginTop: 18, minHeight: 46, paddingHorizontal: 18, borderRadius: 13, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: 7 },
  primaryText: { fontSize: 13.5, fontFamily: fonts.bold, color: colors.white },
  list: { gap: 9 },
  card: { position: 'relative', borderRadius: 15, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, padding: 12 },
  cardPaused: { opacity: 0.72 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  ruleIcon: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
  ruleEmoji: { fontSize: 21 },
  ruleCopy: { flex: 1, minWidth: 0 },
  ruleTitle: { fontSize: 14, lineHeight: 18, fontFamily: fonts.bold, color: colors.ink },
  queryText: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
  ruleMeta: { fontSize: 11.5, lineHeight: 16, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 7, paddingRight: 32 },
  pausedTag: { alignSelf: 'flex-start', marginTop: 8, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: colors.accentLight, fontSize: 10.5, fontFamily: fonts.bold, color: colors.accent },
  deleteBtn: { position: 'absolute', right: 8, bottom: 8, width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
});
