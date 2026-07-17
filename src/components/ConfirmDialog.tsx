/**
 * ConfirmDialog — diálogo de confirmación centrado, con el estilo de la app
 * (HardShadow + paleta), en lugar del Alert nativo del sistema.
 * En iOS 26 (glassAvailable) la tarjeta es una superficie de Liquid Glass con
 * esquinas redondeadas; en fallback (Android / iOS ≤ 18) queda la tarjeta
 * opaca de siempre. Los botones van en color sólido en ambos modos (nada de
 * glass anidado); el de confirmar usa el accent elegido por el usuario.
 */
import { Modal, View, Text, TouchableOpacity, Pressable, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import HardShadow from './HardShadow';
import GlassSurface, { glassAvailable } from './GlassSurface';

interface Props {
  visible: boolean;
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Pinta el botón de confirmar en rojo (acciones destructivas). */
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const confirmText = confirmLabel ?? t('common.ok');
  const cancelText = cancelLabel ?? t('common.cancel');

  const content = (
    <>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.btn, styles.btnCancel]} onPress={onCancel} activeOpacity={0.7}>
          <Text style={styles.btnCancelText}>{cancelText}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, destructive ? styles.btnDanger : styles.btnConfirm]}
          onPress={onConfirm}
          activeOpacity={0.85}
        >
          <Text style={styles.btnConfirmText}>{confirmText}</Text>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        {glassAvailable ? (
          <GlassSurface style={styles.cardGlass}>{content}</GlassSurface>
        ) : (
          <HardShadow style={styles.card}>{content}</HardShadow>
        )}
      </View>
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  overlay: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 28, backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: { width: '100%', padding: 22, gap: 12 },
  // Tarjeta de cristal: mismas medidas, con esquinas redondeadas (el borde y
  // el material los pone el propio glass).
  cardGlass: { width: '100%', padding: 22, gap: 12, borderRadius: 24, overflow: 'hidden' },
  title: { fontSize: 19, fontFamily: fonts.bold, color: colors.ink },
  message: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  btn: { flex: 1, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  btnCancel: { borderWidth: 1, borderColor: colors.border },
  btnCancelText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.inkSoft },
  btnConfirm: { backgroundColor: colors.accent },
  btnDanger: { backgroundColor: '#d6452b' },
  btnConfirmText: { fontSize: 14, fontFamily: fonts.bold, color: colors.white },
});
