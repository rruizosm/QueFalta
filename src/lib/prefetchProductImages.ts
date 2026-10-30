import { Image } from 'expo-image';
import { productImageSource } from './productImageSource';
import { createImagePrefetchQueue, type ImagePrefetchHandle } from './imagePrefetchQueue';

const enqueue = createImagePrefetchQueue((uri) => Image.prefetch(uri, { cachePolicy: 'memory-disk' }));

const displaySources = (uris: (string | null)[]) => (
  uris
    .slice(0, 12)
    .filter((uri): uri is string => !!uri)
    .map((uri) => productImageSource(uri))
);

/** Reuse the exact display URLs with two speculative downloads globally at most. */
export function prefetchProductImages(uris: (string | null)[]): () => void {
  return enqueue(displaySources(uris)).cancel;
}

/** Shelf photos use the original URL: warm those exact bytes in the shared queue. */
export function prefetchPantryImages(uris: string[]): () => void {
  return enqueue([...new Set(uris)].slice(0, 12)).cancel;
}

/** Same bounded prefetch, exposing when the first visible image batch has settled. */
export function prepareProductImages(uris: (string | null)[]): ImagePrefetchHandle {
  return enqueue(displaySources(uris));
}
