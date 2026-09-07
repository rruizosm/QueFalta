/** Use Lidl's published rendition, shared by rows, grids, detail and prefetch.
 * Arbitrary smaller sizes trigger a slow CDN transform cached for only 300 s;
 * the catalog's 384 px rendition has a long-lived cache and is already small.
 */
export function productImageSource(uri: string): string {
  try {
    const url = new URL(uri);
    if (url.protocol !== 'https:' || url.hostname !== 'static-product-catalog.lidlplus.com') return uri;
    // The remote placeholder carries no product information; draw our local one.
    if (/\/images\/common\/ImagePlaceholder[^/]*\.png$/i.test(url.pathname)) return '';
    const transform = url.searchParams.get('im');
    if (transform != null && !/^Resize=\(\d+\)$/.test(transform)) return uri;
    if (transform) return uri.replace(/([?&]im=)[^&]*/, '$1Resize=(384)');
    if (!url.pathname.startsWith('/images/productdata/')) return uri;
    return `${uri}${url.search ? '&' : '?'}im=Resize=(384)`;
  } catch { return uri; }
}
