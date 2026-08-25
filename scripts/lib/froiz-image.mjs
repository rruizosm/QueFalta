const FROIZ_IMAGE_ACCOUNT = 'laxGYDNZyT04iZVpzPzryw';
const FROIZ_IMAGE_BASE = `https://imagedelivery.net/${FROIZ_IMAGE_ACCOUNT}`;

/**
 * Devuelve una URL estable de Cloudflare Images.
 *
 * La API de Froiz incluye también `image`, una ruta firmada y temporal que ya
 * contiene el identificador de cuenta. Usar esa ruta con FROIZ_IMAGE_BASE
 * duplicaba el identificador y generaba un 404. `image_id` permite construir la
 * variante pública sin firma; el parseo de `image` queda como fallback.
 */
export function froizImageUrl(product) {
  const pathImageId = typeof product?.image === 'string'
    ? product.image.match(/^\/[^/]+\/([^/?]+)\//)?.[1]
    : null;
  const imageId = product?.image_id || pathImageId;
  return imageId ? `${FROIZ_IMAGE_BASE}/${imageId}/desktop` : null;
}
