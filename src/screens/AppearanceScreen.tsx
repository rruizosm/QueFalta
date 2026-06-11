import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, ACCENT_OPTIONS, type AccentKey } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTheme } from '../context/ThemeContext';

export default function AppearanceScreen() {
  const navigation = useNavigation<any>();
  const { accentKey, setAccentKey } = useTheme();

  const select = (key: AccentKey) => {
    if (key === accentKey) return;
    setAccentKey(key);
    Haptics.selectionAsync();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Apariencia</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.hint}>
          Elige el color principal de la app. Se aplica al instante y se
          recuerda en este dispositivo.
        </Text>

        <Text style={styles.sectionLabel}>Color</Text>
        <View style={styles.section}>
          {ACCENT_OPTIONS.map((opt, i) => {
            const on = opt.key === accentKey;
            const last = i === ACCENT_OPTIONS.length - 1;
            return (
              <TouchableOpacity
                key={opt.key}
                activeOpacity={0.7}
                onPress={() => select(opt.key)}
                style={[styles.row, !last && styles.rowBorder]}
              >
                <View style={[styles.swatch, { backgroundColor: opt.hex }]} />
                <Text style={styles.rowLabel}>{opt.name}</Text>
                <Ionicons
                  name={on ? 'checkmark-circle' : 'ellipse-outline'}
                  size={22}
                  color={on ? colors.accent : colors.inkFaint}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
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

  hint: {
    fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft,
    marginTop: 6, marginBottom: 14, lineHeight: 17,
  },
  sectionLabel: {
    fontSize: 10.5, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1.4,
    marginBottom: 4,
  },
  section: {
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, gap: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  swatch: { width: 26, height: 26, borderRadius: 13 },
  rowLabel: { flex: 1, fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
});
