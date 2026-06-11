/**
 * NameInputSheet — bottom sheet con un campo de texto y botón de confirmar,
 * mismo lenguaje que ActionSheet (papel, bordes rectos, cabecera con icono).
 * Usado para crear grupo (GroupsScreen) y renombrar grupo (GroupMembersScreen).
 */
import { useEffect, useState, type ComponentProps } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import HardShadow from './HardShadow';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

interface Props {
  visible: boolean;
  title: string;
  subtitle?: string;
  /** icono de la caja de la cabecera (por defecto people) */
  icon?: IoniconName;
  label?: string;
  placeholder?: string;
  /** valor con el que se abre el campo (p. ej. el nombre actual al renombrar) */
  initialValue?: string;
  maxLength?: number;
  submitLabel: string;
  submitIcon?: IoniconName;
  /** mientras es true se muestra spinner y no se puede cerrar */
  busy?: boolean;
  onSubmit: (value: string) => void;
  onClose: () => void;
}

export default function NameInputSheet({
  visible,
  title,
  subtitle,
  icon = 'people',
  label = 'Nombre del grupo',
  placeholder = 'Casa, Familia, Piso 3ºB…',
  initialValue = '',
  maxLength = 50,
  submitLabel,
  submitIcon = 'add',
  busy = false,
  onSubmit,
  onClose,
}: Props) {
  const styles = useThemedStyles(themedStyles);
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (visible) setValue(initialValue);
  }, [visible, initialValue]);

  const canSubmit = !!value.trim() && !busy;
  const submit = () => { if (canSubmit) onSubmit(value.trim()); };
  const close = () => { if (!busy) onClose(); };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.root}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.iconBox}>
              <Ionicons name={icon} size={22} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{title}</Text>
              {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={close} disabled={busy} hitSlop={8}>
              <Ionicons name="close" size={18} color={colors.inkSoft} />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <Text style={styles.inputLabel}>{label}</Text>
            <View style={styles.inputWrap}>
              <TextInput
                style={styles.input}
                placeholder={placeholder}
                placeholderTextColor={colors.inkFaint}
                value={value}
                onChangeText={setValue}
                autoFocus
                maxLength={maxLength}
                returnKeyType="done"
                onSubmitEditing={submit}
              />
              {value.length > 0 && (
                <TouchableOpacity onPress={() => setValue('')} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.inkFaint} />
                </TouchableOpacity>
              )}
            </View>
            <Text style={styles.inputCounter}>{value.length}/{maxLength}</Text>

            <TouchableOpacity
              onPress={submit}
              disabled={!canSubmit}
              activeOpacity={0.85}
              style={[styles.submitWrap, !canSubmit && styles.submitDisabled]}
            >
              <HardShadow style={styles.submitBtn}>
                {busy ? (
                  <ActivityIndicator size="small" color={colors.white} />
                ) : (
                  <>
                    <Ionicons name={submitIcon} size={19} color={colors.white} />
                    <Text style={styles.submitText}>{submitLabel}</Text>
                  </>
                )}
              </HardShadow>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const themedStyles = () => StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    backgroundColor: colors.paper,
    borderTopWidth: 1, borderTopColor: colors.ink,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  iconBox: {
    width: 44, height: 44,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 19, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.2 },
  subtitle: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white,
  },
  body: { paddingHorizontal: 20, paddingTop: 18 },
  inputLabel: {
    fontSize: 11.5, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.ink,
    paddingHorizontal: 14,
  },
  input: { flex: 1, paddingVertical: 14, fontSize: 16, fontFamily: fonts.medium, color: colors.ink },
  inputCounter: {
    fontSize: 11, fontFamily: fonts.medium, color: colors.inkFaint,
    alignSelf: 'flex-end', marginTop: 6,
  },
  submitWrap: { marginTop: 16 },
  submitDisabled: { opacity: 0.45 },
  submitBtn: {
    backgroundColor: colors.accent,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 7, paddingVertical: 15,
  },
  submitText: { fontSize: 15, fontFamily: fonts.bold, color: colors.white },
});
