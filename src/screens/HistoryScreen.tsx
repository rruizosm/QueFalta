import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { fetchPurchases, type Purchase } from '../api/purchases';

const formatEuro = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function HistoryScreen() {
  const navigation = useNavigation<any>();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

  // Group purchases by month (newest first; purchases already sorted desc).
  const months = useMemo(() => {
    const map = new Map<string, { label: string; total: number; items: Purchase[] }>();
    for (const p of purchases) {
      const d = new Date(p.completedAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!map.has(key)) {
        map.set(key, {
          label: cap(d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })),
          total: 0,
          items: [],
        });
      }
      const m = map.get(key)!;
      m.total += p.total;
      m.items.push(p);
    }
    return Array.from(map.values());
  }, [purchases]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Historial de compra</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 60 }} />
      ) : purchases.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="receipt-outline" size={48} color={colors.inkFaint} />
          <Text style={styles.emptyTitle}>Aún no hay compras</Text>
          <Text style={styles.emptyText}>
            Cuando finalices una lista, aparecerá aquí con su gasto.
          </Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
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
                {m.items.map((p, i) => (
                  <View key={p.id} style={[styles.row, i < m.items.length - 1 && styles.rowBorder]}>
                    <View style={styles.rowIcon}>
                      <Ionicons name="cart-outline" size={18} color={colors.accent} />
                    </View>
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowName} numberOfLines={1}>{p.groupName ?? 'Grupo'}</Text>
                      <Text style={styles.rowMeta}>
                        {cap(new Date(p.completedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }))}
                        {' · '}{p.itemCount} {p.itemCount === 1 ? 'artículo' : 'artículos'}
                      </Text>
                    </View>
                    <Text style={styles.rowTotal}>{formatEuro(p.total)}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 10, gap: 12,
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

  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 10 },
  emptyTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink, textAlign: 'center' },
  emptyText: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center', lineHeight: 20 },
});
