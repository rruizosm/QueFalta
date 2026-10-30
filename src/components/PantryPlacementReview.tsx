import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTranslation } from '../context/LanguageContext';
import { useThemedStyles } from '../context/ThemeContext';
import type { PantryProduct, PantryShelfLabel } from '../lib/pantryLayout';
import ProductImage from './ProductImage';

export default function PantryPlacementReview({ products, shelfLabels, shelfChoices, onChooseShelf, onBack, onClose }: {
  products: readonly PantryProduct[];
  shelfLabels: Readonly<Record<string, PantryShelfLabel>>;
  shelfChoices: ReadonlyMap<string, number>;
  onChooseShelf: (key: string, shelf: number | null) => void;
  onBack: () => void;
  onClose: () => void;
}) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const shelves = Object.entries(shelfLabels).sort(([a], [b]) => Number(a) - Number(b));
  const shelfName = (index: string, label: PantryShelfLabel) =>
    [label.emoji, label.name.trim() || t('pantry.shelfNumber', { number: Number(index) + 1 })].filter(Boolean).join(' ');
  return <View style={styles.body} testID="pantry-placement-review">
    <View style={styles.header}>
      <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel={t('common.back')} style={styles.iconButton}>
        <Ionicons name="chevron-back" size={24} color={colors.ink} />
      </Pressable>
      <Text style={styles.title} accessibilityRole="header">{t('pantry.locateProducts')}</Text>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.iconButton}>
        <Ionicons name="close" size={24} color={colors.ink} />
      </Pressable>
    </View>
    <FlatList data={products} keyExtractor={product => `${product.store ?? 'mercadona'}:${product.id}`}
      contentContainerStyle={styles.list} extraData={{ expandedKey, shelfChoices, shelfLabels }}
      renderItem={({ item }) => {
        const key = `${item.store ?? 'mercadona'}:${item.id}`;
        const chosen = shelfChoices.get(key);
        const label = chosen === undefined ? undefined : shelfLabels[String(chosen)];
        const currentName = label ? shelfName(String(chosen), label) : t('pantry.noShelfSelected');
        const expanded = expandedKey === key;
        const choose = (shelf: number | null) => { onChooseShelf(key, shelf); setExpandedKey(null); };
        return <View style={styles.card} testID={`pantry-placement-${key}`}>
          <View style={styles.product}>
            <ProductImage uri={item.illustrationUrl} style={styles.image} />
            <Text style={styles.productName}>{item.name}</Text>
          </View>
          <Pressable testID={`pantry-choose-shelf-${key}`} accessibilityRole="button"
            accessibilityLabel={t('pantry.chooseProductShelf', { name: item.name, shelf: currentName })}
            accessibilityState={{ expanded }} onPress={() => setExpandedKey(expanded ? null : key)} style={styles.chooseButton}>
            <Ionicons name="albums-outline" size={18} color={colors.accent} />
            <Text style={styles.chooseText}>{currentName}</Text>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={colors.accent} />
          </Pressable>
          {expanded && <View style={styles.options}>
            <Pressable testID={`pantry-shelf-none-${key}`} accessibilityRole="radio" accessibilityState={{ checked: !label }}
              style={styles.option} onPress={() => choose(null)}>
              <Text style={styles.optionText}>{t('pantry.noShelfSelected')}</Text>
              {!label && <Ionicons name="checkmark" size={20} color={colors.accent} />}
            </Pressable>
            {shelves.map(([index, shelf]) => <Pressable key={index} testID={`pantry-shelf-${key}-${index}`}
              accessibilityRole="radio" accessibilityState={{ checked: chosen === Number(index) }}
              style={styles.option} onPress={() => choose(Number(index))}>
              <Text style={styles.optionText}>{shelfName(index, shelf)}</Text>
              {chosen === Number(index) && <Ionicons name="checkmark" size={20} color={colors.accent} />}
            </Pressable>)}
            {!shelves.length && <Text style={styles.hint}>{t('pantry.noLabeledShelves')}</Text>}
            <Text style={styles.hint}>{t('pantry.noShelfSelectedHint')}</Text>
            <Text style={styles.hint}>{t('pantry.shelfGroupHint')}</Text>
          </View>}
        </View>;
      }} />
  </View>;
}

const themedStyles = () => StyleSheet.create({
  body: { flex: 1, minHeight: 0 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8 },
  iconButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: fonts.semibold, fontSize: 20, color: colors.ink },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 12 },
  card: { borderRadius: 20, padding: 12, gap: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border },
  product: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  image: { width: 56, height: 56, borderRadius: 10 },
  productName: { flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: colors.ink },
  chooseButton: { flexDirection: 'row', alignItems: 'center', minHeight: 44, padding: 10, gap: 8,
    borderRadius: 14, backgroundColor: colors.accentLight },
  chooseText: { flex: 1, fontFamily: fonts.semibold, fontSize: 14, color: colors.accent },
  options: { gap: 4 },
  option: { minHeight: 44, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionText: { flex: 1, fontFamily: fonts.medium, fontSize: 14, color: colors.ink },
  hint: { fontFamily: fonts.regular, fontSize: 13, color: colors.inkSoft, paddingHorizontal: 10, paddingBottom: 8 },
});
