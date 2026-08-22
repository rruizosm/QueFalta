import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { CATALOG_STORES, type CatalogStore } from '../constants/stores';
import { storeInRegion } from '../constants/regions';
import { OFFER_STORES } from '../api/catalog';
import {
  alertLocationIds,
  priceAlertEmoji,
  previewPriceAlert,
  savePriceAlert,
  type PriceAlertRule,
  type PriceAlertPreviewItem,
} from '../api/priceAlerts';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useTranslation } from '../context/LanguageContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useToast } from '../context/ToastContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface ExactTarget {
  store: CatalogStore;
  productId: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved?: (rule: PriceAlertRule) => void;
  exactTarget?: ExactTarget | null;
  initialRule?: PriceAlertRule | null;
}

const DROP_OPTIONS = [0, 5, 10, 15, 20];

const euro = (value: number | null) => value == null
  ? null
  : `${value.toFixed(2).replace('.', ',')} €`;

export default function PriceAlertEditorModal({
  visible,
  onClose,
  onSaved,
  exactTarget = null,
  initialRule = null,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const reducedMotion = useReducedMotion();
  const { t } = useTranslation();
  const toast = useToast();
  const { session } = useAuth();
  const { profile } = useProfile();
  const kind = exactTarget || initialRule?.kind === 'exact' ? 'exact' : 'keyword';
  const exactStore = exactTarget?.store ?? initialRule?.exactStore ?? null;
  const exactProductId = exactTarget?.productId ?? initialRule?.exactProductId ?? null;

  const availableStores = useMemo(() => {
    if (!profile) return [];
    const preferred = new Set(profile.catalogStores);
    return CATALOG_STORES.filter((store) => (
      preferred.has(store.key) && storeInRegion(store.key, profile.region)
    ));
  }, [profile]);
  const allowedStoreKeys = useMemo(
    () => new Set(availableStores.map((store) => store.key)),
    [availableStores],
  );
  const defaultStores = useMemo(
    () => availableStores.map((store) => store.key),
    [availableStores],
  );

  const [label, setLabel] = useState('');
  const [query, setQuery] = useState('');
  const [stores, setStores] = useState<CatalogStore[]>([]);
  const [priceDrop, setPriceDrop] = useState(true);
  const [newOffer, setNewOffer] = useState(true);
  const [newArrival, setNewArrival] = useState(false);
  const [minDrop, setMinDrop] = useState(5);
  const [preview, setPreview] = useState<PriceAlertPreviewItem[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLabel(initialRule?.label ?? '');
    const isNewArrival = initialRule?.kind === 'new_arrival';
    setQuery(isNewArrival ? '' : initialRule?.query ?? '');
    setStores(initialRule
      ? initialRule.stores.filter((store) => allowedStoreKeys.has(store))
      : defaultStores);
    setPriceDrop(isNewArrival ? false : initialRule?.notifyPriceDrop ?? true);
    setNewOffer(isNewArrival ? false : initialRule?.notifyNewOffer ?? true);
    setNewArrival(isNewArrival);
    setMinDrop(isNewArrival ? 0 : initialRule?.minDropPct ?? 5);
    setPreview([]);
    setPreviewError(false);
  }, [visible, initialRule, allowedStoreKeys, defaultStores]);

  const effectiveStores = useMemo(
    () => kind === 'exact' && exactStore ? [exactStore] : stores,
    [kind, exactStore, stores],
  );
  const canPreview = !newArrival && (kind === 'exact'
    ? !!exactStore && !!exactProductId
    : query.trim().length >= 2 && effectiveStores.length > 0);

  useEffect(() => {
    if (!visible || !canPreview) {
      setPreview([]);
      setPreviewLoading(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      setPreviewError(false);
      previewPriceAlert({
        kind,
        query,
        stores: effectiveStores,
        exactStore,
        exactProductId,
        region: profile?.region ?? null,
        locationIds: alertLocationIds(profile?.postalCode),
        limit: 8,
      })
        .then((items) => {
          if (cancelled) return;
          setPreview(items);
          if (kind === 'exact' && !initialRule && items[0]) {
            setLabel((current) => current.trim() ? current : items[0].displayName);
          }
        })
        .catch(() => { if (!cancelled) setPreviewError(true); })
        .finally(() => { if (!cancelled) setPreviewLoading(false); });
    }, kind === 'keyword' ? 350 : 0);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [
    visible, canPreview, kind, query, exactStore, exactProductId,
    profile?.region, profile?.postalCode, initialRule,
    effectiveStores,
  ]);

  const toggleStore = (store: CatalogStore) => {
    setStores((current) => current.includes(store)
      ? current.filter((item) => item !== store)
      : [...current, store]);
  };

  const offersSupported = effectiveStores.some((store) => OFFER_STORES.includes(store));
  useEffect(() => {
    if (!offersSupported || newArrival) setNewOffer(false);
  }, [offersSupported, newArrival]);

  const toggleNewArrival = (enabled: boolean) => {
    setNewArrival(enabled);
    setPreview([]);
    setPreviewLoading(false);
    setPreviewError(false);
    if (enabled) {
      setQuery('');
      setPriceDrop(false);
      setNewOffer(false);
      setMinDrop(0);
    } else {
      setPriceDrop(true);
      setNewOffer(offersSupported);
      setMinDrop(5);
    }
  };

  const emoji = useMemo(
    () => newArrival ? '🆕' : priceAlertEmoji(label, query, preview[0]?.categoryName),
    [newArrival, label, query, preview],
  );

  const save = async () => {
    const userId = session?.user.id;
    if (!userId) return;
    const saveKind = newArrival ? 'new_arrival' : kind;
    const finalLabel = label.trim()
      || (newArrival ? t('priceAlerts.newArrivalDefaultName') : query.trim() || preview[0]?.displayName)
      || '';
    const validTarget = newArrival ? effectiveStores.length > 0 : canPreview;
    const validTrigger = newArrival || priceDrop || newOffer;
    if (!finalLabel || !validTarget || !validTrigger) {
      toast.show(t('priceAlerts.validation'), 'error');
      return;
    }
    setSaving(true);
    try {
      const rule = await savePriceAlert({
        id: initialRule?.id,
        userId,
        kind: saveKind,
        emoji,
        label: finalLabel,
        query: newArrival ? null : query,
        exactStore,
        exactProductId,
        stores: effectiveStores,
        locationIds: alertLocationIds(profile?.postalCode),
        notifyPriceDrop: newArrival ? false : priceDrop,
        notifyNewOffer: newArrival ? false : newOffer,
        minDropPct: newArrival ? 0 : minDrop,
        active: initialRule?.active ?? true,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('priceAlerts.saved'));
      onSaved?.(rule);
      onClose();
    } catch {
      toast.show(t('priceAlerts.saveError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const total = preview[0]?.totalCount ?? 0;

  return (
    <Modal visible={visible} transparent animationType={reducedMotion ? 'none' : 'slide'} onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.grabber} />
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              <Text style={styles.headerEmoji}>{emoji}</Text>
            </View>
            <View style={styles.headerCopy}>
              <Text style={styles.title}>{t(kind === 'exact' ? 'priceAlerts.exactTitle' : 'priceAlerts.newTitle')}</Text>
              <Text style={styles.subtitle}>{t('priceAlerts.editorSubtitle')}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button">
              <Ionicons name="close" size={20} color={colors.inkSoft} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            {kind === 'keyword' && !newArrival ? (
              <>
                <Text style={styles.label}>{t('priceAlerts.words')}</Text>
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder={t('priceAlerts.wordsPlaceholder')}
                  placeholderTextColor={colors.inkFaint}
                  style={styles.input}
                  autoCapitalize="none"
                  returnKeyType="search"
                />

              </>
            ) : null}

            {kind === 'keyword' ? (
              <>
                <Text style={styles.label}>{t('priceAlerts.stores')}</Text>
                <View style={styles.chips}>
                  {availableStores.map((store) => {
                    const selected = stores.includes(store.key);
                    return (
                      <TouchableOpacity
                        key={store.key}
                        onPress={() => toggleStore(store.key)}
                        style={[styles.chip, selected && styles.chipActive]}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: selected }}
                      >
                        <Text style={[styles.chipText, selected && styles.chipTextActive]}>{store.name}</Text>
                        {store.icon ? (
                          <Image
                            source={store.icon}
                            style={styles.storeChipLogo}
                            contentFit="contain"
                            accessible={false}
                          />
                        ) : (
                          <Ionicons
                            name="storefront-outline"
                            size={17}
                            color={selected ? colors.accent : colors.inkSoft}
                          />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            ) : null}

            <Text style={styles.label}>{t('priceAlerts.name')}</Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              placeholder={t('priceAlerts.namePlaceholder')}
              placeholderTextColor={colors.inkFaint}
              style={styles.input}
              maxLength={100}
            />

            <Text style={styles.label}>{t('priceAlerts.triggers')}</Text>
            <View style={styles.optionsCard}>
              {!newArrival ? (
                <View style={styles.optionRow}>
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>{t('priceAlerts.priceDrop')}</Text>
                    <Text style={styles.optionText}>{t('priceAlerts.priceDropHint')}</Text>
                  </View>
                  <Switch value={priceDrop} onValueChange={setPriceDrop} trackColor={{ true: colors.accentMid }} thumbColor={priceDrop ? colors.accent : colors.inkFaint} />
                </View>
              ) : null}
              {!newArrival && offersSupported ? (
                <View style={[styles.optionRow, styles.optionDivider]}>
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>{t('priceAlerts.newOffer')}</Text>
                    <Text style={styles.optionText}>{t('priceAlerts.newOfferHint')}</Text>
                  </View>
                  <Switch value={newOffer} onValueChange={setNewOffer} trackColor={{ true: colors.accentMid }} thumbColor={newOffer ? colors.accent : colors.inkFaint} />
                </View>
              ) : null}
              {kind === 'keyword' ? (
                <View style={[styles.optionRow, !newArrival && styles.optionDivider]}>
                  <View style={styles.optionCopy}>
                    <Text style={styles.optionTitle}>{t('priceAlerts.newArrival')}</Text>
                    <Text style={styles.optionText}>{t('priceAlerts.newArrivalHint')}</Text>
                  </View>
                  <Switch
                    value={newArrival}
                    onValueChange={toggleNewArrival}
                    trackColor={{ true: colors.accentMid }}
                    thumbColor={newArrival ? colors.accent : colors.inkFaint}
                  />
                </View>
              ) : null}
            </View>

            {priceDrop && !newArrival ? (
              <>
                <Text style={styles.label}>{t('priceAlerts.minimumDrop')}</Text>
                <View style={styles.chips}>
                  {DROP_OPTIONS.map((value) => (
                    <TouchableOpacity
                      key={value}
                      onPress={() => setMinDrop(value)}
                      style={[styles.chip, minDrop === value && styles.chipActive]}
                    >
                      <Text style={[styles.chipText, minDrop === value && styles.chipTextActive]}>
                        {value === 0 ? t('priceAlerts.anyDrop') : `${value}%`}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.previewHeader}>
              <Text style={styles.label}>{t('priceAlerts.preview')}</Text>
              {!newArrival && previewLoading ? <ActivityIndicator size="small" color={colors.accent} /> : null}
            </View>
            {newArrival ? (
              <Text style={styles.previewHint}>{t('priceAlerts.previewUnavailableForNewArrival')}</Text>
            ) : !canPreview ? (
              <Text style={styles.previewHint}>{t('priceAlerts.previewHint')}</Text>
            ) : previewError ? (
              <Text style={styles.errorText}>{t('priceAlerts.previewError')}</Text>
            ) : !previewLoading && total === 0 ? (
              <Text style={styles.previewHint}>{t('priceAlerts.noMatches')}</Text>
            ) : (
              <View style={styles.previewCard}>
                <Text style={styles.matchCount}>{t('priceAlerts.matchCount', { n: total })}</Text>
                {preview.map((item) => (
                  <View key={`${item.store}:${item.productId}`} style={styles.productRow}>
                    <Image source={item.thumbnail ? { uri: item.thumbnail } : undefined} style={styles.productImage} contentFit="contain" />
                    <View style={styles.productCopy}>
                      <Text style={styles.productName} numberOfLines={2}>{item.displayName}</Text>
                      <Text style={styles.productMeta}>{CATALOG_STORES.find((store) => store.key === item.store)?.name ?? item.store}{euro(item.unitPrice) ? ` · ${euro(item.unitPrice)}` : ''}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity onPress={save} disabled={saving} style={styles.saveBtn} activeOpacity={0.85}>
              {saving ? <ActivityIndicator size="small" color={colors.white} /> : (
                <>
                  <Ionicons name="notifications" size={17} color={colors.white} />
                  <Text style={styles.saveText}>{t(initialRule ? 'priceAlerts.update' : 'priceAlerts.create')}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.28)' },
  sheet: { maxHeight: '94%', backgroundColor: colors.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  grabber: { width: 38, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerIcon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight },
  headerEmoji: { fontSize: 21 },
  headerCopy: { flex: 1 },
  title: { fontSize: 18, fontFamily: fonts.bold, color: colors.ink },
  subtitle: { fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1 },
  closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  content: { padding: 16, paddingBottom: 28 },
  label: { fontSize: 12, fontFamily: fonts.bold, color: colors.inkSoft, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 14, marginBottom: 7 },
  input: { minHeight: 48, borderRadius: 13, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, color: colors.ink, paddingHorizontal: 13, fontFamily: fonts.medium, fontSize: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: 10, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  chipText: { fontSize: 12, fontFamily: fonts.semibold, color: colors.inkSoft },
  chipTextActive: { color: colors.accent },
  storeChipLogo: { width: 18, height: 18, borderRadius: 4 },
  optionsCard: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, paddingHorizontal: 12 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  optionDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  optionCopy: { flex: 1 },
  optionTitle: { fontSize: 14, fontFamily: fonts.semibold, color: colors.ink },
  optionText: { fontSize: 11.5, lineHeight: 16, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
  previewHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  previewHint: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, lineHeight: 18 },
  errorText: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.red },
  previewCard: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, padding: 10 },
  matchCount: { fontSize: 12, fontFamily: fonts.bold, color: colors.accent, marginBottom: 4 },
  productRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 7, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  productImage: { width: 42, height: 42, borderRadius: 9, backgroundColor: colors.paper },
  productCopy: { flex: 1, minWidth: 0 },
  productName: { fontSize: 12.5, lineHeight: 16, fontFamily: fonts.semibold, color: colors.ink },
  productMeta: { fontSize: 11, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
  footer: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.paper },
  saveBtn: { minHeight: 48, borderRadius: 13, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  saveText: { fontSize: 14, fontFamily: fonts.bold, color: colors.white },
});
