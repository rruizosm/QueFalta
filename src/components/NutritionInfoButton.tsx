import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, LayoutAnimation, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import type { CatalogStore } from '../constants/stores';
import { fetchOpenFoodFactsNutrition, type OpenFoodFactsNutrition } from '../api/openFoodFacts';
import { parseCatalogNutrition, parseMercadonaNutrition } from '../api/mercadonaNutrition';
import {
  foodIndexColor, foodIndexTextColor, foodPointColor, foodPointTextColor,
  type FoodIndexComponentId, type FoodIndexPoint,
} from '../lib/foodIndex';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';

interface Props {
  store: CatalogStore;
  ean?: string | null;
  /** Muestra el detalle dentro de la ficha en vez de abrir un modal. */
  inline?: boolean;
  /** Tabla nutrition del espejo, usada si no hay EAN o OFF no devuelve un Nutri-Score aplicable. */
  fallbackNutrition?: unknown | null;
  fallbackProductName?: string | null;
  fallbackCategoryName?: string | null;
  fallbackIngredients?: string | null;
}

const componentLabelKey: Record<FoodIndexComponentId, string> = {
  nutrition: 'nutrition.index.nutrition',
  processing: 'nutrition.index.processing',
  sustainability: 'nutrition.index.sustainability',
};

const pointLabelKey: Record<string, string> = {
  energy: 'nutrition.index.points.energy',
  sugars: 'nutrition.index.points.sugars',
  saturated_fat: 'nutrition.index.points.saturated_fat',
  salt: 'nutrition.index.points.salt',
  sweeteners: 'nutrition.index.points.sweeteners',
  fiber: 'nutrition.index.points.fiber',
  fruits_vegetables_legumes: 'nutrition.index.points.fruits_vegetables_legumes',
  proteins: 'nutrition.index.points.proteins',
};

const levelKey = (score: number) => {
  if (score >= 80) return 'nutrition.index.levelExcellent';
  if (score >= 60) return 'nutrition.index.levelGood';
  if (score >= 40) return 'nutrition.index.levelAverage';
  if (score >= 20) return 'nutrition.index.levelLow';
  return 'nutrition.index.levelVeryLow';
};

const fmt = (value: number | null, unit: string, locale: string) =>
  value == null
    ? null
    : `${value.toLocaleString(locale, { maximumFractionDigits: 1 })} ${unit}`;

const pointValue = (point: FoodIndexPoint, locale: string) => {
  if (point.id === 'sweeteners') return locale.startsWith('ca') ? 'Present' : 'Presente';
  const value = point.value.toLocaleString(locale, { maximumFractionDigits: 1 });
  const unit = point.unit ? ` ${point.unit}` : '';
  return point.unit === '%' ? `${value}${unit}` : `${value}${unit} / 100 g/ml`;
};

const hasApplicableNutriScore = (info: OpenFoodFactsNutrition | null) =>
  info?.source === 'openfoodfacts' && /^[A-E]$/.test(info.nutriScoreGrade ?? '');

const resolveNutritionSource = (
  openFoodFactsInfo: OpenFoodFactsNutrition | null,
  fallbackInfo: OpenFoodFactsNutrition | null,
) => hasApplicableNutriScore(openFoodFactsInfo)
  ? openFoodFactsInfo
  : fallbackInfo ?? openFoodFactsInfo;

function NutritionDisclosureShell({
  inline, visible, onClose, children,
}: {
  inline: boolean;
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();

  if (inline) {
    return visible ? <View style={styles.inlineBody}>{children}</View> : null;
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{t('nutrition.title')}</Text>
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.ink} />
            </TouchableOpacity>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.modalBody}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export function useNutritionInfoDisclosure({
  store, ean, inline = false, fallbackNutrition, fallbackProductName, fallbackCategoryName, fallbackIngredients,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t, lang } = useTranslation();
  const locale = lang === 'ca' ? 'ca-ES' : 'es-ES';
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<OpenFoodFactsNutrition | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState(false);

  const fallbackInfo = useMemo(
    () => {
      const context = {
        productName: fallbackProductName,
        categoryName: fallbackCategoryName,
        ingredients: fallbackIngredients,
      };
      return store === 'mercadona'
        ? parseMercadonaNutrition(fallbackNutrition, context)
        : parseCatalogNutrition(fallbackNutrition, context);
    },
    [store, fallbackNutrition, fallbackProductName, fallbackCategoryName, fallbackIngredients],
  );
  const active = !!ean || !!fallbackInfo;

  useEffect(() => {
    setInfo(null);
    setNotFound(false);
    setError(false);
    setLoading(false);
    setVisible(false);
    if (!active) return;
    if (!ean) {
      setInfo(fallbackInfo);
      if (!fallbackInfo) setNotFound(true);
      return;
    }

    let cancelled = false;
    fetchOpenFoodFactsNutrition(ean)
      .then((data) => {
        if (cancelled) return;
        const resolved = resolveNutritionSource(data, fallbackInfo);
        if (resolved) setInfo(resolved);
        else setNotFound(true);
      })
      .catch(() => {
        if (!cancelled && fallbackInfo) setInfo(fallbackInfo);
      });
    return () => { cancelled = true; };
  }, [active, ean, fallbackInfo]);

  const open = async () => {
    if (!active) return;
    if (inline && visible) {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(160, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
      );
      setVisible(false);
      return;
    }
    if (inline) {
      LayoutAnimation.configureNext(
        LayoutAnimation.create(160, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
      );
    }
    setVisible(true);
    setNotFound(false);
    setError(false);
    if (info) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const data = ean ? await fetchOpenFoodFactsNutrition(ean) : null;
      const resolved = resolveNutritionSource(data, fallbackInfo);
      if (resolved) setInfo(resolved);
      else setNotFound(true);
    } catch {
      if (fallbackInfo) setInfo(fallbackInfo);
      else setError(true);
    } finally {
      setLoading(false);
    }
  };

  const rows = info ? [
    [t('nutrition.energy'), fmt(info.nutriments.energyKcal, 'kcal', locale)],
    [t('nutrition.fat'), fmt(info.nutriments.fat, 'g', locale)],
    [t('nutrition.saturatedFat'), fmt(info.nutriments.saturatedFat, 'g', locale)],
    [t('nutrition.carbohydrates'), fmt(info.nutriments.carbohydrates, 'g', locale)],
    [t('nutrition.sugars'), fmt(info.nutriments.sugars, 'g', locale)],
    [t('nutrition.fiber'), fmt(info.nutriments.fiber, 'g', locale)],
    [t('nutrition.proteins'), fmt(info.nutriments.proteins, 'g', locale)],
    [t('nutrition.salt'), fmt(info.nutriments.salt, 'g', locale)],
  ].filter((row): row is [string, string] => !!row[1]) : [];

  const index = info?.foodIndex ?? null;
  const formula = index?.components
    .map((component) => `${component.weight}% ${t(componentLabelKey[component.id]).toLocaleLowerCase()}`)
    .join(' + ');

  const renderPoints = (
    titleKey: string,
    hintKey: string,
    emptyKey: string,
    points: FoodIndexPoint[],
  ) => {
    const total = points.reduce((sum, point) => sum + point.points, 0);
    const maximum = points.reduce((sum, point) => sum + point.pointsMax, 0);
    return (
      <View style={styles.pointSection}>
      <Text style={styles.sectionTitle}>
        {maximum > 0 ? `${t(titleKey)}: ${total}/${maximum}` : t(titleKey)}
      </Text>
      <Text style={styles.sectionHint}>{t(hintKey)}</Text>
      {points.length > 0 ? (
        <View style={styles.pointList}>
          {points.map((point) => {
            const color = foodPointColor(point);
            const labelKey = pointLabelKey[point.id];
            const label = labelKey ? t(labelKey) : point.id.replace(/_/g, ' ');
            return (
              <View key={`${point.kind}:${point.id}`} style={styles.pointRow}>
                <View style={styles.pointHeader}>
                  <View style={[styles.pointDot, { backgroundColor: color }]} />
                  <View style={styles.pointBody}>
                    <Text style={styles.pointLabel}>{label}</Text>
                    <Text style={styles.pointValue}>{pointValue(point, locale)}</Text>
                  </View>
                  <View style={[styles.pointBadge, { backgroundColor: color }]}>
                    <Text style={[styles.pointBadgeText, { color: foodPointTextColor(point) }]}>
                      {t('nutrition.index.pointScore', {
                        score: point.points,
                        max: point.pointsMax,
                      })}
                    </Text>
                  </View>
                </View>
                <View style={styles.pointTrack}>
                  <View
                    style={[
                      styles.pointFill,
                      {
                        width: `${point.points / point.pointsMax * 100}%`,
                        backgroundColor: color,
                      },
                    ]}
                  />
                </View>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.emptyPoints}>{t(emptyKey)}</Text>
      )}
      </View>
    );
  };

  const renderInfoSection = (
    titleKey: string,
    hintKey: string,
    emptyKey: string,
    items: Array<{ label: string; detail: string }>,
    color: string,
  ) => (
    <View style={styles.pointSection}>
      <Text style={styles.sectionTitle}>{t(titleKey)}</Text>
      <Text style={styles.sectionHint}>{t(hintKey)}</Text>
      {items.length > 0 ? (
        <View style={styles.pointList}>
          {items.map((item) => (
            <View key={item.label} style={styles.pointRow}>
              <View style={styles.pointHeader}>
                <View style={[styles.pointDot, { backgroundColor: color }]} />
                <View style={styles.pointBody}>
                  <Text style={styles.pointLabel}>{item.label}</Text>
                  <Text style={styles.pointValue}>{item.detail}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.emptyPoints}>{t(emptyKey)}</Text>
      )}
    </View>
  );

  const disclosure = (
    <NutritionDisclosureShell
      inline={inline}
      visible={visible}
      onClose={() => setVisible(false)}
    >
            {loading ? (
              <ActivityIndicator size="large" color={colors.accent} style={styles.loader} />
            ) : error ? (
              <Text style={styles.message}>{t('nutrition.error')}</Text>
            ) : notFound ? (
              <Text style={styles.message}>{t('nutrition.notFound')}</Text>
            ) : info ? (
              <>
                {!inline && info.productName ? <Text style={styles.productName}>{info.productName}</Text> : null}

                {index ? (
                  <>
                    {!inline ? <View style={styles.indexHero}>
                      <View
                        style={[
                          styles.indexCircle,
                          { backgroundColor: foodIndexColor(index.score) },
                        ]}
                      >
                        <Text
                          style={[
                            styles.indexScore,
                            { color: foodIndexTextColor(index.score) },
                          ]}
                        >
                          {index.score}
                        </Text>
                        <Text
                          style={[
                            styles.indexMax,
                            { color: foodIndexTextColor(index.score) },
                          ]}
                        >
                          /100
                        </Text>
                      </View>
                      <View style={styles.indexHeroBody}>
                        <Text style={styles.indexTitle}>{t('nutrition.index.title')}</Text>
                        <Text
                          style={[
                            styles.indexLevel,
                            { color: foodIndexColor(index.score) },
                          ]}
                        >
                          {t(levelKey(index.score))}
                        </Text>
                        <Text style={styles.indexFormula}>{formula}</Text>
                      </View>
                    </View> : null}

                    <Text style={styles.sectionTitle}>{t('nutrition.index.howCalculated')}</Text>
                    <Text style={styles.sectionHint}>{t('nutrition.index.calculationNote')}</Text>
                    <View style={styles.componentList}>
                      {index.components.map((component) => {
                        const color = foodIndexColor(component.score);
                        return (
                          <View key={component.id} style={styles.componentRow}>
                            <View style={styles.componentHeader}>
                              <Text style={styles.componentLabel}>
                                {t(componentLabelKey[component.id])}
                              </Text>
                              <Text style={styles.componentValue}>
                                {t('nutrition.index.componentResult', {
                                  score: Math.round(component.score),
                                  weight: component.weight,
                                  contribution: (component.score * component.weight / 100)
                                    .toLocaleString(locale, { maximumFractionDigits: 1 }),
                                })}
                              </Text>
                            </View>
                            <View style={styles.componentTrack}>
                              <View
                                style={[
                                  styles.componentFill,
                                  { width: `${component.score}%`, backgroundColor: color },
                                ]}
                              />
                            </View>
                          </View>
                        );
                      })}
                    </View>
                    {index.components.length < 3 ? (
                      <View style={styles.partialNote}>
                        <Ionicons name="information-circle-outline" size={17} color={colors.inkSoft} />
                        <Text style={styles.partialNoteText}>{t('nutrition.index.partialNote')}</Text>
                      </View>
                    ) : null}

                    {renderPoints(
                      'nutrition.index.positiveTitle',
                      'nutrition.index.positiveOfficialHint',
                      'nutrition.index.noPositive',
                      index.positivePoints,
                    )}
                    {renderPoints(
                      'nutrition.index.negativeOfficialTitle',
                      'nutrition.index.negativeOfficialHint',
                      'nutrition.index.noNegative',
                      index.negativePoints,
                    )}
                  </>
                ) : (
                  <Text style={styles.message}>{t('nutrition.index.notAvailable')}</Text>
                )}

                {info.source === 'openfoodfacts' ? (
                  <>
                    {renderInfoSection(
                      'nutrition.processing.title',
                      'nutrition.processing.hint',
                      'nutrition.processing.none',
                      info.novaGroup === 4 ? [{
                        label: t('nutrition.processing.ultraProcessedTitle'),
                        detail: t('nutrition.processing.ultraProcessedDetail'),
                      }] : [],
                      '#c83b32',
                    )}
                    {renderInfoSection(
                      'nutrition.additives.title',
                      'nutrition.additives.hint',
                      'nutrition.additives.none',
                      info.additives.map((additive) => ({
                        label: additive.code,
                        detail: additive.name ?? t('nutrition.additives.itemDetail'),
                      })),
                      '#d09a23',
                    )}
                  </>
                ) : null}

                <Text style={styles.sectionTitle}>{t('nutrition.index.valuesTitle')}</Text>
                {rows.length > 0 ? (
                  <View style={styles.rows}>
                    {rows.map(([label, value]) => (
                      <View key={label} style={styles.row}>
                        <Text style={styles.rowLabel}>{label}</Text>
                        <Text style={styles.rowValue}>{value}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.message}>{t('nutrition.noNutrients')}</Text>
                )}

                <Text style={styles.source}>
                  {t(
                    info.source === 'mercadona'
                      ? 'nutrition.sourceMercadona'
                      : info.source === 'catalog'
                        ? 'nutrition.sourceCatalog'
                        : 'nutrition.source',
                  )}
                </Text>
                <Text style={styles.disclaimer}>{t('nutrition.index.disclaimer')}</Text>
              </>
            ) : null}
    </NutritionDisclosureShell>
  );

  return {
    active,
    open,
    modal: inline ? null : disclosure,
    inlineContent: inline ? disclosure : null,
    expanded: visible,
    info,
  };
}

export default function NutritionInfoButton({ store, ean }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const nutrition = useNutritionInfoDisclosure({ store, ean });

  return (
    <>
      <TouchableOpacity
        style={[styles.button, !nutrition.active && styles.buttonDisabled]}
        onPress={nutrition.open}
        disabled={!nutrition.active}
        activeOpacity={0.75}
        accessibilityLabel={t('nutrition.button')}
      >
        <Ionicons
          name="nutrition-outline"
          size={14}
          color={nutrition.active ? colors.accent : colors.inkFaint}
        />
        <Text
          style={[styles.buttonText, !nutrition.active && styles.buttonTextDisabled]}
          numberOfLines={2}
        >
          {t('nutrition.button')}
        </Text>
      </TouchableOpacity>
      {nutrition.modal}
    </>
  );
}

const themedStyles = () => StyleSheet.create({
  button: {
    marginLeft: 'auto',
    maxWidth: 150,
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: colors.accentMid,
    backgroundColor: colors.accentLight,
  },
  buttonDisabled: {
    borderColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  buttonText: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 13,
    fontFamily: fonts.bold,
    color: colors.accent,
    textAlign: 'center',
  },
  buttonTextDisabled: { color: colors.inkFaint },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '88%',
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalTitle: { flex: 1, fontSize: 18, fontFamily: fonts.bold, color: colors.ink },
  closeBtn: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
  },
  modalBody: { padding: 16, paddingBottom: 22 },
  inlineBody: { paddingTop: 1 },
  loader: { marginVertical: 36 },
  message: {
    fontSize: 14,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
    lineHeight: 20,
    marginTop: 14,
  },
  productName: {
    fontSize: 13,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
    marginBottom: 12,
  },
  indexHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    padding: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
  },
  indexCircle: {
    width: 82,
    height: 82,
    borderRadius: 41,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indexScore: {
    fontSize: 33,
    lineHeight: 35,
    fontFamily: fonts.bold,
  },
  indexMax: {
    fontSize: 11,
    lineHeight: 13,
    fontFamily: fonts.bold,
  },
  indexHeroBody: { flex: 1, minWidth: 0 },
  indexTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink },
  indexLevel: { fontSize: 13.5, fontFamily: fonts.bold, marginTop: 2 },
  indexFormula: {
    fontSize: 12,
    lineHeight: 16,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
    marginTop: 5,
  },
  sectionTitle: {
    fontSize: 15,
    fontFamily: fonts.bold,
    color: colors.ink,
    marginTop: 20,
  },
  sectionHint: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
    marginTop: 3,
  },
  componentList: {
    marginTop: 10,
    gap: 12,
    padding: 13,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
  },
  componentRow: { gap: 7 },
  componentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    gap: 12,
  },
  componentLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.bold,
    color: colors.ink,
  },
  componentValue: {
    fontSize: 11.5,
    fontFamily: fonts.semibold,
    color: colors.inkSoft,
    textAlign: 'right',
  },
  componentTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
  },
  componentFill: { height: '100%', borderRadius: 4 },
  partialNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    marginTop: 10,
    padding: 10,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 11,
  },
  partialNoteText: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 16,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
  },
  pointSection: { marginTop: 1 },
  pointList: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    backgroundColor: colors.white,
    overflow: 'hidden',
  },
  pointRow: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pointHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  pointDot: { width: 10, height: 10, borderRadius: 5 },
  pointBody: { flex: 1, minWidth: 0 },
  pointLabel: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.ink },
  pointValue: {
    fontSize: 10.5,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
    marginTop: 1,
  },
  pointBadge: {
    minWidth: 48,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 9,
    alignItems: 'center',
  },
  pointBadgeText: { fontSize: 11, fontFamily: fonts.bold, color: '#ffffff' },
  pointTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.surfaceAlt,
    overflow: 'hidden',
    marginTop: 8,
    marginLeft: 19,
  },
  pointFill: { height: '100%', borderRadius: 3 },
  emptyPoints: {
    fontSize: 12,
    lineHeight: 17,
    fontFamily: fonts.medium,
    color: colors.inkSoft,
    marginTop: 9,
  },
  rows: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft },
  rowValue: { fontSize: 13, fontFamily: fonts.bold, color: colors.ink },
  source: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: fonts.medium,
    color: colors.inkFaint,
    marginTop: 15,
  },
  disclaimer: {
    fontSize: 10.5,
    lineHeight: 15,
    fontFamily: fonts.medium,
    color: colors.inkFaint,
    marginTop: 5,
  },
});
