import { useEffect, useState } from 'react';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View, type ImageStyle, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Imagen de producto con caché en memoria+disco (expo-image). Sustituye al
 * <Image> de react-native, que apenas cachea en disco y obliga a re-descargar
 * cada miniatura al reentrar en una subcategoría (la causa del "tarda en cargar
 * las imágenes"). En listas: la primera carga hace una transición suave y las
 * reentradas/scroll son instantáneas. `recyclingKey` evita que al reciclar una
 * fila de FlatList se vea un instante la imagen del producto anterior.
 */
export default function ProductImage({
  uri,
  style,
}: {
  uri: string;
  style: StyleProp<ImageStyle>;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [uri]);

  return (
    <View style={[styles.frame, style as StyleProp<ViewStyle>]}>
      <View style={styles.placeholder} pointerEvents="none">
        <Ionicons name="basket-outline" size={20} color="rgba(105,96,88,0.38)" />
      </View>
      {!failed && (
        <Image
          source={uri}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          cachePolicy="memory-disk"
          transition={150}
          recyclingKey={uri}
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: 'hidden' },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(150,132,114,0.10)',
  },
});
