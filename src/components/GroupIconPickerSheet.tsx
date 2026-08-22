import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { DEFAULT_GROUP_ICON, GROUP_ICON_OPTIONS } from '../constants/groupIcons';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';

interface Props {
  visible: boolean;
  selectedIcon: string | null;
  busy: boolean;
  onSave: (icon: string) => void;
  onClose: () => void;
}

export default function GroupIconPickerSheet({ visible, selectedIcon, busy, onSave, onClose }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(selectedIcon ?? DEFAULT_GROUP_ICON);

  useEffect(() => {
    if (visible) setDraft(selectedIcon ?? DEFAULT_GROUP_ICON);
  }, [selectedIcon, visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reducedMotion ? 'none' : 'slide'}
      onRequestClose={() => { if (!busy) onClose(); }}
    >
      <View style={styles.root}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { if (!busy) onClose(); }} />
        <View
          style={[styles.sheet, { paddingBottom: Platform.OS === 'ios' ? Math.max(insets.bottom, 18) : Math.max(insets.bottom + 10, 24) }]}
          accessibilityViewIsModal
        >
          <View style={styles.header}>
            <View style={styles.titleIcon}>
              <Text style={styles.titleEmoji}>{draft}</Text>
            </View>
            <View style={styles.titleCopy}>
              <Text style={styles.title}>{t('group.iconTitle')}</Text>
              <Text style={styles.subtitle}>{t('group.iconSubtitle')}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              disabled={busy}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
            >
              <Ionicons name="close" size={20} color={colors.ink} />
            </TouchableOpacity>
          </View>

          <FlatList
            data={GROUP_ICON_OPTIONS}
            keyExtractor={(icon) => icon}
            numColumns={6}
            style={styles.grid}
            contentContainerStyle={styles.gridContent}
            columnWrapperStyle={styles.gridRow}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const selected = item === draft;
              return (
                <TouchableOpacity
                  style={[styles.iconButton, selected && styles.iconButtonSelected]}
                  onPress={() => setDraft(item)}
                  activeOpacity={0.72}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={t('group.iconOption')}
                >
                  <Text style={styles.iconEmoji}>{item}</Text>
                </TouchableOpacity>
              );
            }}
          />

          <TouchableOpacity
            style={styles.saveButton}
            onPress={() => onSave(draft)}
            disabled={busy}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityState={{ busy, disabled: busy }}
          >
            {busy
              ? <ActivityIndicator size="small" color={colors.white} />
              : <Text style={styles.saveText}>{t('common.save')}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(20, 25, 32, 0.35)' },
  sheet: {
    maxHeight: '78%',
    backgroundColor: colors.paper,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 16,
    paddingHorizontal: 16,
    gap: 14,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  titleIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  titleEmoji: { fontSize: 23, lineHeight: 29 },
  titleCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, fontFamily: fonts.bold, color: colors.ink },
  subtitle: { marginTop: 2, fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft },
  closeButton: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center', justifyContent: 'center',
  },
  grid: { flexGrow: 0 },
  gridContent: { gap: 8, paddingVertical: 2 },
  gridRow: { justifyContent: 'space-between' },
  iconButton: {
    width: 48, height: 48, borderRadius: 15,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
  },
  iconButtonSelected: {
    borderWidth: 2,
    borderColor: colors.accent,
    backgroundColor: colors.accentLight,
  },
  iconEmoji: { fontSize: 25, lineHeight: 31 },
  saveButton: {
    height: 50, borderRadius: 25,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  saveText: { fontSize: 15, fontFamily: fonts.bold, color: colors.white },
});
