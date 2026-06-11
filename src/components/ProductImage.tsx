import { Image } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';

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
  return (
    <Image
      source={uri}
      style={style}
      contentFit="contain"
      cachePolicy="memory-disk"
      transition={150}
      recyclingKey={uri}
    />
  );
}
