import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import { supabase } from '../lib/supabase';
import { privateAvatarPath } from '../api/profile';
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
  userId,
  initials,
  color,
  size,
  style,
}: {
  avatarUrl?: string | null;
  /** Perfil dueño de la foto. Hace que Storage aplique su policy de privacidad. */
  userId?: string | null;
  initials: string;
  color: string;
  size: number;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(themedStyles);
  const base = { width: size, height: size, borderRadius: size / 2 };
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const privatePath = privateAvatarPath(avatarUrl ?? null);
  const publicUrl = avatarUrl && !avatarUrl.startsWith('private:')
    ? /^https:\/\//i.test(avatarUrl)
      ? avatarUrl
      : userId
        ? supabase.storage.from('avatars').getPublicUrl(`${userId}/avatar.jpg`).data.publicUrl
        : null
    : null;

  useEffect(() => {
    let active = true;
    setSignedUrl(null);
    setFailed(false);
    if (!privatePath) return () => { active = false; };
    // Caducidad corta: si se elimina una amistad, no emitimos URLs nuevas y la
    // que pudiera haberse obtenido antes deja de servir en pocos minutos.
    supabase.storage.from('avatars-private').createSignedUrl(privatePath, 5 * 60)
      .then(({ data }) => { if (active) setSignedUrl(data?.signedUrl ?? null); })
      .catch(() => { if (active) setSignedUrl(null); });
    return () => { active = false; };
  }, [avatarUrl, privatePath]);

  if ((signedUrl || publicUrl) && !failed) {
    return (
      <Image
        source={signedUrl ?? publicUrl}
        style={[base, style as any]}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={100}
        recyclingKey={signedUrl ?? publicUrl}
        onError={() => setFailed(true)}
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
