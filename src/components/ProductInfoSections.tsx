import { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  LayoutAnimation, Platform, UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import GlassSurface from './GlassSurface';

// LayoutAnimation necesita habilitarse a mano en Android para animar el desplegado.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface ProductInfoItem {
  /** Clave estable para el `key` de React. */
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  /** Texto de la característica. Si viene vacío/nulo, la fila no se pinta. */
  text?: string | null;
  onPress?: () => void;
}

/**
 * Lista de características del producto al estilo "ficha": una tarjeta redondeada
 * con filas (icono + título + valor) separadas por hairlines. Cada fila se
 * despliega al tocarla (el valor se trunca a una línea mientras está plegada).
 * Las filas sin texto se descartan; si no queda ninguna, no pinta nada.
 */
export default function ProductInfoSections({ items }: { items: ProductInfoItem[] }) {
  const styles = useThemedStyles(themedStyles);
  const visible = items
    .filter((i) => (i.text && i.text.trim().length > 0) || i.onPress)
    .sort((a, b) => {
      if (a.key === 'nutrition') return -1;
      if (b.key === 'nutrition') return 1;
      return 0;
    });
  if (visible.length === 0) return null;

  return (
    <GlassSurface style={styles.card} fallbackColor={colors.white}>
      {visible.map((item, idx) => (
        <View key={item.key}>
          {idx > 0 ? <View style={styles.separator} /> : null}
          <Row item={item} />
        </View>
      ))}
    </GlassSurface>
  );
}

function Row({ item }: { item: ProductInfoItem }) {
  const styles = useThemedStyles(themedStyles);
  const [expanded, setExpanded] = useState(false);
  const value = item.text?.trim() ?? null;

  const toggle = () => {
    if (item.onPress) {
      item.onPress();
      return;
    }
    LayoutAnimation.configureNext(
      LayoutAnimation.create(160, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
    );
    setExpanded((e) => !e);
  };

  return (
    <TouchableOpacity activeOpacity={0.6} onPress={toggle}>
      <View style={styles.row}>
        <View style={styles.iconWrap}>
          <Ionicons name={item.icon} size={20} color={colors.accent} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>{item.title}</Text>
          {value ? (
            <Text style={styles.value} numberOfLines={expanded ? undefined : 1}>
              {value}
            </Text>
          ) : null}
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.inkFaint}
          style={{ transform: [{ rotate: expanded ? '90deg' : '0deg' }] }}
        />
      </View>
    </TouchableOpacity>
  );
}

const themedStyles = () => StyleSheet.create({
  card: {
    marginTop: 18,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 13,
    gap: 12,
  },
  iconWrap: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1 },
  title: { fontSize: 14.5, fontFamily: fonts.bold, color: colors.ink },
  value: { fontSize: 13, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2, lineHeight: 18 },
  // El separador arranca a la altura del texto (deja libre el icono), como en la referencia.
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 70 },
});
