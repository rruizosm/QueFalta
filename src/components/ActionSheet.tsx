/**
 * ActionSheet — bottom sheet de acciones con el mismo formato que el de
 * expulsar/transferir miembro en GroupMembersScreen. Reutilizable: cabecera con
 * un "leading" (emoji en caja de color o imagen), título/subtítulo, lista de
 * acciones y botón Cancelar.
 */
import {
  View, Text, Image, Modal, Pressable, TouchableOpacity, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export interface SheetAction {
  icon: IoniconName;
  label: string;
  /** color del icono y el texto (por defecto tinta) */
  tint?: string;
  onPress: () => void;
}

type Leading =
  | { type: 'emoji'; emoji: string; color: string }
  | { type: 'image'; uri?: string | null; fallbackEmoji?: string };

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  leading?: Leading;
  actions: SheetAction[];
}

export default function ActionSheet({ visible, onClose, title, subtitle, leading, actions }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.sheetRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            {leading?.type === 'emoji' && (
              <View style={[styles.leadingBox, { backgroundColor: leading.color + '1e' }]}>
                <Text style={styles.leadingEmoji}>{leading.emoji}</Text>
              </View>
            )}
            {leading?.type === 'image' && (
              leading.uri ? (
                <Image source={{ uri: leading.uri }} style={styles.leadingImage} resizeMode="contain" />
              ) : (
                <View style={[styles.leadingBox, { backgroundColor: colors.surfaceAlt }]}>
                  <Text style={styles.leadingEmoji}>{leading.fallbackEmoji ?? '🛒'}</Text>
                </View>
              )
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.sheetTitle} numberOfLines={2}>{title}</Text>
              {!!subtitle && <Text style={styles.sheetSubtitle} numberOfLines={1}>{subtitle}</Text>}
            </View>
          </View>

          {actions.map((a, i) => (
            <TouchableOpacity
              key={`${a.label}-${i}`}
              style={styles.sheetAction}
              activeOpacity={0.7}
              onPress={a.onPress}
            >
              <Ionicons name={a.icon} size={20} color={a.tint ?? colors.ink} />
              <Text style={[styles.sheetActionText, a.tint ? { color: a.tint } : null]}>{a.label}</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={styles.sheetCancel} activeOpacity={0.7} onPress={onClose}>
            <Text style={styles.sheetCancelText}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  sheetRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingBottom: 30,
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  leadingBox: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  leadingEmoji: { fontSize: 20 },
  leadingImage: { width: 40, height: 40 },
  sheetTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  sheetSubtitle: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
  sheetAction: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    paddingHorizontal: 18, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetActionText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
  sheetCancel: { alignItems: 'center', paddingVertical: 16, marginTop: 4 },
  sheetCancelText: { fontSize: 15, fontFamily: fonts.bold, color: colors.inkSoft },
});
