import { Image } from 'expo-image';
import { productImageSource } from './productImageSource';
import { createImagePrefetchQueue } from './imagePrefetchQueue';

const enqueue = createImagePrefetchQueue((uri) => Image.prefetch(uri, { cachePolicy: 'memory-disk' }));

/** Reuse the exact display URLs with two speculative downloads globally at most. */
export function prefetchProductImages(uris: (string | null)[]): () => void {
  return enqueue(uris.slice(0, 12).filter((uri): uri is string => !!uri).map((uri) => productImageSource(uri)));
}
