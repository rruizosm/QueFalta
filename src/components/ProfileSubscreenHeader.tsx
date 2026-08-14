import React from 'react';
import { LayoutChangeEvent, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import GlassSurface, { glassAvailable } from './GlassSurface';

interface Props {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  headerTop: number;
  onLayout?: (event: LayoutChangeEvent) => void;
  right?: React.ReactNode;
}

/**
 * Cabecera compartida de los destinos de Perfil. En iOS con Liquid Glass se
 * superpone al contenido; en el resto conserva una cabecera opaca en flujo.
 */
export default function ProfileSubscreenHeader({ title, icon, headerTop, onLayout, right }: Props) {
  const navigation = useNavigation<any>();
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();

  const content = (
    <View style={[styles.header, { paddingTop: headerTop }]}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={[styles.backBtn, glassAvailable && styles.backBtnGlass]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
      >
        <Ionicons name="arrow-back" size={22} color={colors.ink} />
      </TouchableOpacity>
      <View style={styles.titleWrap}>
        <View style={styles.titleIcon}>
          <Ionicons name={icon} size={18} color={colors.accent} />
        </View>
        <Text style={styles.title} numberOfLines={1}>{title}</Text>
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </View>
  );

  if (!glassAvailable) return content;

  return (
    <View style={styles.chrome} onLayout={onLayout}>
      <GlassSurface style={styles.chromeGlass} fallbackColor={colors.paper}>
        {content}
      </GlassSurface>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  chrome: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  chromeGlass: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 10, gap: 12,
  },
  backBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  backBtnGlass: { backgroundColor: 'transparent', borderWidth: 0 },
  titleWrap: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleIcon: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { flex: 1, fontSize: 21, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  right: { marginLeft: 'auto' },
});
