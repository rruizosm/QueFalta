import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useCart } from '../context/CartContext';
import { fetchMyGroups, type GroupSummary } from '../api/groups';

export default function DefaultGroupScreen() {
  const navigation = useNavigation<any>();
  const { defaultGroup, setDefaultGroup, clearDefaultGroup } = useCart();

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    fetchMyGroups()
      .then(setGroups)
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, []));

  const handleSelect = async (group: GroupSummary) => {
    await setDefaultGroup(group.id, group.name);
    navigation.goBack();
  };

  const handleClear = async () => {
    await clearDefaultGroup();
    navigation.goBack();
  };

  const selectedId = defaultGroup?.groupId ?? null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Grupo por defecto</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          <Text style={styles.hint}>
            Al abrir la app, el carrito de este grupo se activará automáticamente si no tienes otro activo.
          </Text>

          <View style={styles.section}>
            {/* Sin asignar */}
            <Row
              label="Sin asignar"
              muted
              selected={selectedId === null}
              onPress={handleClear}
              last={groups.length === 0}
            />
            {groups.map((g, i) => (
              <Row
                key={g.id}
                label={g.name}
                selected={selectedId === g.id}
                onPress={() => handleSelect(g)}
                last={i === groups.length - 1}
              />
            ))}
          </View>

          {groups.length === 0 && (
            <Text style={styles.empty}>No perteneces a ningún grupo todavía.</Text>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function Row({
  label, selected, onPress, last = false, muted = false,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  last?: boolean;
  muted?: boolean;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.row, !last && styles.rowBorder]}>
        <Text style={[styles.rowLabel, muted && { color: colors.inkSoft }]} numberOfLines={1}>
          {label}
        </Text>
        {selected && <Ionicons name="checkmark" size={20} color={colors.accent} />}
      </View>
    </TouchableOpacity>
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

  hint: {
    fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft,
    marginTop: 6, marginBottom: 14, lineHeight: 17,
  },
  section: {
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, gap: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },

  empty: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 16 },
});
