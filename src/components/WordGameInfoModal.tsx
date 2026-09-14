import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';

/** Solid app-owned surface: native alerts may use translucent system material. */
export default function WordGameInfoModal({ visible, title, body, closeLabel, onClose }: {
  visible: boolean; title: string; body: string; closeLabel: string; onClose: () => void;
}) {
  const styles = useThemedStyles(themedStyles);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
    <View style={[styles.overlay, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20,
      paddingLeft: insets.left + 20, paddingRight: insets.right + 20 }]}>
      <View accessibilityViewIsModal style={[styles.card, { maxHeight: height - insets.top - insets.bottom - 40 }]}>
        <ScrollView contentContainerStyle={styles.content} bounces={false}>
          <Text accessibilityRole="header" style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
        </ScrollView>
        <TouchableOpacity onPress={onClose} accessibilityRole="button" style={styles.close}>
          <Text style={styles.closeText}>{closeLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>;
}

const themedStyles = () => StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  card: { width: '100%', maxWidth: 440, flexShrink: 1, borderRadius: 24, overflow: 'hidden', backgroundColor: colors.paper },
  content: { padding: 24 },
  title: { fontFamily: fonts.bold, fontSize: 21, color: colors.ink, marginBottom: 18 },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 23, color: colors.ink },
  close: { flexShrink: 0, minHeight: 52, alignItems: 'center', justifyContent: 'center', padding: 14, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.paper },
  closeText: { fontFamily: fonts.bold, fontSize: 16, color: colors.accent },
});
