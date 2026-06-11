import { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { fetchSimilarProducts, type SimilarProduct } from '../api/catalog';
import { CATALOG_STORES, CATALOG_STORE_KEYS, type CatalogStore } from '../constants/stores';
import { useProfile } from '../context/ProfileContext';
import { useThemedStyles } from '../context/ThemeContext';
import StoreProductModal, { type ProductRef } from './StoreProductModal';
import PaywallModal from './PaywallModal';

interface Props {
  /** Nombre del producto origen (needle del matching). null/'' = no pinta nada. */
  productName: string | null;
  /** Tienda del producto origen: se excluye de la comparativa. */
  excludeStore: CatalogStore;
}

const STORE_META = Object.fromEntries(CATALOG_STORES.map((s) => [s.key, s]));
const euro = (n: number): string => `${n.toFixed(2).replace('.', ',')} €`;
const perUnitLabel = (v: number | null, u: string | null): string | null =>
  v == null ? null : `${v.toFixed(2).replace('.', ',')} €/${u === 'l' ? 'L' : u === 'kg' ? 'kg' : (u ?? '')}`;

/** Sección "Más barato en otros súper": el equivalente más barato por €/unidad en
 *  cada tienda activa del perfil (RPC similar_products), excluyendo la tienda del
 *  producto abierto. Sin candidatos → no pinta nada (mejor hueco que match malo). */
export default function SimilarProductsSection({ productName, excludeStore }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { profile } = useProfile();
  const [similars, setSimilars] = useState<SimilarProduct[]>([]);
  const [loading, setLoading] = useState(false);
  // Producto abierto encima al tocar una fila (se vuelve a éste al cerrarlo).
  const [target, setTarget] = useState<ProductRef | null>(null);
  // Filas locked (teaser free del RPC) → paywall en vez de detalle.
  const [paywallVisible, setPaywallVisible] = useState(false);

  useEffect(() => {
    setTarget(null);
    if (!productName) { setSimilars([]); setLoading(false); return; }
    const enabled = profile?.catalogStores ?? CATALOG_STORE_KEYS;
    const targets = enabled.filter((s) => s !== excludeStore);
    if (targets.length === 0) { setSimilars([]); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    fetchSimilarProducts(productName, targets)
      .then((r) => { if (!cancelled) setSimilars(r); })
      .catch(() => { if (!cancelled) setSimilars([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [productName, excludeStore, profile?.catalogStores]);

  if (!loading && similars.length === 0) return null;

  return (
    <View style={styles.compareSection}>
      <Text style={styles.sectionTitle}>Más barato en otros súper</Text>
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 10, alignSelf: 'flex-start' }} />
      ) : (
        similars.map((s) => {
          const meta = STORE_META[s.store];
          const ppu = perUnitLabel(s.pricePerUnit, s.pricePerUnitUnit);
          return (
            <TouchableOpacity
              key={`${s.store}-${s.id ?? 'locked'}`}
              style={styles.compareRow}
              activeOpacity={0.7}
              onPress={() =>
                s.locked || !s.id
                  ? setPaywallVisible(true)
                  : setTarget({ store: s.store, id: s.id })
              }
            >
              {meta?.icon ? (
                <Image source={meta.icon} style={styles.compareIcon} resizeMode="cover" />
              ) : (
                <View style={[styles.compareIcon, styles.compareIconEmpty]}>
                  <Ionicons name="storefront" size={14} color={colors.inkSoft} />
                </View>
              )}
              <View style={styles.compareInfo}>
                <Text style={styles.compareStore}>{meta?.name ?? s.store}</Text>
                <Text style={styles.compareName} numberOfLines={1}>
                  {s.locked ? 'Hay una opción más barata' : s.displayName}
                </Text>
              </View>
              {s.locked ? (
                <View style={styles.lockBox}>
                  <Ionicons name="lock-closed" size={13} color={colors.accent} />
                </View>
              ) : (
                <View style={styles.comparePriceBox}>
                  {s.priceTotal != null ? <Text style={styles.comparePrice}>{euro(s.priceTotal)}</Text> : null}
                  {ppu ? <Text style={styles.comparePerUnit}>{ppu}</Text> : null}
                </View>
              )}
              <Ionicons name="chevron-forward" size={15} color={colors.inkFaint} />
            </TouchableOpacity>
          );
        })
      )}

      {/* Detalle del producto tocado, apilado encima; su X vuelve aquí. */}
      <StoreProductModal target={target} onClose={() => setTarget(null)} />

      {/* Paywall apilado encima (mismo patrón de modal anidado). */}
      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        subtitle="Desbloquea el comparador para ver el producto y su precio"
      />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  compareSection: { marginTop: 18 },
  sectionTitle: {
    fontSize: 10.5, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1.4, marginBottom: 5,
  },
  compareRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 11, paddingVertical: 9, marginTop: 8,
  },
  compareIcon: { width: 24, height: 24 },
  compareIconEmpty: {
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surfaceAlt,
  },
  compareInfo: { flex: 1, minWidth: 0 },
  compareStore: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.ink },
  compareName: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1 },
  comparePriceBox: { alignItems: 'flex-end' },
  lockBox: {
    width: 26, height: 26,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  comparePrice: { fontSize: 14, fontFamily: fonts.bold, color: colors.accent },
  comparePerUnit: { fontSize: 11, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1 },
});
