import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { CompatibleWebView as WebView, type WebViewHandle } from './CompatibleWebView';
import { pantryVisibleBoundsScript, type PantryVisibleBounds } from '../lib/pantryVisibleBounds';
import { pantryImageDataUrl } from '../lib/pantryImageData';
import type { PantryItem } from '../lib/pantryLayout';

// Metadata only, keyed by the exact image URL; never stock or account data.
export const pantryImageBoundsCache = new Map<string, PantryVisibleBounds>();

function validBounds(bounds: PantryVisibleBounds | undefined): bounds is PantryVisibleBounds {
  return !!bounds && [bounds.left, bounds.top, bounds.right, bounds.bottom].every(value =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1)
    && bounds.left < bounds.right && bounds.top < bounds.bottom;
}

/** Saved geometry is authoritative only for the exact image URL it measured. */
export function pantryMeasurementPlan(urls: readonly string[], items: readonly PantryItem[] = []) {
  const known = new Map(pantryImageBoundsCache);
  for (const item of items) {
    if (item.boundsImageUrl === item.product.illustrationUrl && validBounds(item.visibleBounds)) {
      known.set(item.boundsImageUrl, item.visibleBounds);
    }
  }
  const pending: string[] = [];
  const reusable: [string, PantryVisibleBounds][] = [];
  for (const url of new Set(urls)) {
    const bounds = known.get(url);
    if (bounds) reusable.push([url, bounds]);
    else pending.push(url);
  }
  return { pending, reusable };
}

function PantryImageBoundsProbe({ urls, items, onBounds }: {
  urls: readonly string[];
  items?: readonly PantryItem[];
  onBounds: (url: string, bounds: PantryVisibleBounds) => void;
}) {
  const plan = pantryMeasurementPlan(urls, items);
  // Metadata updates must not restart in-flight downloads for unrelated photos.
  const urlKey = JSON.stringify(urls);
  // Freeze this batch while measurements arrive. Removing each completed URL
  // would cancel and restart the other downloads after every saved result.
  const batchUrls = useMemo<string[]>(() => JSON.parse(urlKey), [urlKey]);
  const reusableKey = JSON.stringify(plan.reusable);
  useEffect(() => {
    const reusable: [string, PantryVisibleBounds][] = JSON.parse(reusableKey);
    for (const [url, bounds] of reusable) onBounds(url, bounds);
  }, [reusableKey, onBounds]);
  // Most launches need no browser process, network download or pixel decoding.
  return plan.pending.length > 0 ? <PantryImageDecoder urls={batchUrls} items={items} onBounds={onBounds} /> : null;
}
const source = { html: `<!doctype html><html><body><script>
  const measure = ${pantryVisibleBoundsScript};
  window.measurePantryImage = function(url, dataUrl) {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const bounds = measure(ctx.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
        if (bounds) window.ReactNativeWebView.postMessage(JSON.stringify({ url, bounds }));
        canvas.width = canvas.height = 0;
      } catch (_) {}
    };
    image.src = dataUrl;
  };
</script></body></html>` };

/** Native fetch + a single decoder for the active inventory, including overflow. */
function PantryImageDecoder({ urls, items, onBounds }: {
  urls: readonly string[];
  items?: readonly PantryItem[];
  onBounds: (url: string, bounds: PantryVisibleBounds) => void;
}) {
  const web = useRef<WebViewHandle>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const { pending: queue } = pantryMeasurementPlan(urls, items);
    if (!ready) return;
    let active = true;
    const requests = new Set<AbortController>();
    const work = async () => {
      while (active && queue.length) {
        const url = queue.shift()!;
        const request = new AbortController();
        requests.add(request);
        const timeout = setTimeout(() => request.abort(), 15000);
        try {
          const dataUrl = await pantryImageDataUrl(url, request.signal);
          if (active) web.current?.injectJavaScript(`window.measurePantryImage(${JSON.stringify(url)},${JSON.stringify(dataUrl)});true;`);
        } catch { /* Keep conservative spacing; retry next inventory visit. */ }
        finally { clearTimeout(timeout); requests.delete(request); }
      }
    };
    void work(); void work();
    return () => { active = false; requests.forEach(request => request.abort()); };
  // Geometry arriving during this batch must not abort its remaining requests.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, urls, onBounds]);
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" style={styles.hidden}>
    <WebView ref={web} source={source} originWhitelist={['*']} javaScriptEnabled scrollEnabled={false}
      onLoadEnd={() => setReady(true)}
      onShouldStartLoadWithRequest={request => request.url === 'about:blank'}
      onMessage={({ nativeEvent }) => {
        try {
          const { url, bounds } = JSON.parse(nativeEvent.data);
          if (!urls.includes(url) || !validBounds(bounds)) return;
          if (pantryImageBoundsCache.size >= 512) {
            const oldest = pantryImageBoundsCache.keys().next().value;
            if (oldest) pantryImageBoundsCache.delete(oldest);
          }
          pantryImageBoundsCache.set(url, bounds);
          onBounds(url, bounds);
        } catch { /* Ignore malformed decoder messages. */ }
      }} />
  </View>;
}
const styles = StyleSheet.create({ hidden: { position: 'absolute', width: 1, height: 1, opacity: 0, overflow: 'hidden' } });
export default memo(PantryImageBoundsProbe);
