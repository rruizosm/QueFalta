import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';

/**
 * Avatar de usuario: muestra su foto de perfil si la tiene y, si no, las
 * iniciales sobre su color. Único punto de verdad para representar a una
 * persona en grupos, amigos, asignaciones, etc. (expo-image cachea la foto
 * en memoria+disco, así que las listas no re-descargan).
 */
export default function UserAvatar({
  avatarUrl,
  initials,
  color,
  size,
  style,
}: {
  avatarUrl?: string | null;
  initials: string;
  color: string;
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(themedStyles);
  const base = { width: size, height: size, borderRadius: size / 2 };
  if (avatarUrl) {
    return (
      <Image
        source={avatarUrl}
        style={[base, style as any]}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={100}
        recyclingKey={avatarUrl}
      />
    );
  }
  return (
    <View style={[styles.fallback, base, { backgroundColor: color }, style]}>
      <Text style={[styles.initials, { fontSize: size * 0.37 }]}>{initials}</Text>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center' },
  initials: { color: colors.white, fontFamily: fonts.bold },
});
