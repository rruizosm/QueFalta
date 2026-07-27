import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CatalogStore } from '../constants/stores';
import { fetchProductPriceChange, type ProductPriceChange } from '../api/catalog';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useProfile } from '../context/ProfileContext';

interface Props {
  store: CatalogStore;
  productId: string;
  price: string | null;
  size?: string | null;
  /** Precio tachado de una promoción del supermercado, si no hay cambio semanal. */
  fallbackPreviousPrice?: string | null;
  /** Precio anterior de una promoción real: prevalece sobre un cambio semanal. */
  promotionPreviousPrice?: string | null;
  /** Una rebaja real destaca el precio vigente en verde, como Cambios de precios. */
  priceTone?: 'default' | 'down' | 'up';
}

const euro = (value: number) => `${value.toFixed(2).replace('.', ',')} €`;

export default function ProductPriceLine({
  store, productId, price, size = null, fallbackPreviousPrice = null, promotionPreviousPrice = null, priceTone = 'default',
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const { profile } = useProfile();
  const [change, setChange] = useState<ProductPriceChange | null>(null);

  useEffect(() => {
    let cancelled = false;
    setChange(null);
    fetchProductPriceChange(store, productId, profile?.postalCode ?? null)
      .then((result) => { if (!cancelled) setChange(result); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [store, productId, profile?.postalCode]);

  const previousPrice = promotionPreviousPrice ?? (change ? euro(change.previousPrice) : fallbackPreviousPrice);
  const badgeColor = change?.direction === 'down' ? colors.ok : colors.red;
  const badgeText = change?.direction === 'down'
    ? t('product.priceChange.down')
    : t('product.priceChange.up');

  return (
    <View style={styles.row}>
      <View style={styles.prices}>
        {price ? <Text style={[styles.price, priceTone === 'down' && styles.priceDown, priceTone === 'up' && styles.priceUp]}>{price}</Text> : null}
        {previousPrice ? <Text style={styles.previousPrice}>{previousPrice}</Text> : null}
        {size ? <Text style={styles.size}>{size}</Text> : null}
      </View>
      {change && !promotionPreviousPrice ? (
        <View style={[styles.badge, { backgroundColor: badgeColor }]}>
          <Text style={styles.badgeText}>{badgeText}</Text>
        </View>
      ) : null}
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12 },
  prices: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 8 },
  price: { fontSize: 25, fontFamily: fonts.bold, color: colors.accent },
  priceDown: { color: colors.ok },
  priceUp: { color: colors.red },
  previousPrice: { fontSize: 15, fontFamily: fonts.semibold, color: colors.inkSoft, textDecorationLine: 'line-through' },
  size: { fontSize: 13.5, fontFamily: fonts.medium, color: colors.inkSoft },
  badge: { marginLeft: 'auto', paddingHorizontal: 7, paddingVertical: 4, borderRadius: 7 },
  badgeText: { fontSize: 10.5, fontFamily: fonts.bold, color: colors.white },
});
