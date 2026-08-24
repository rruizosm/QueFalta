import { useSafeAreaInsets } from 'react-native-safe-area-context';

const BASE_FOOTER_PADDING = 28;
const SAFE_AREA_GAP = 12;

/** Keeps product actions above system navigation while preserving their visual gap. */
export function useProductDetailFooterPadding(): number {
  const { bottom } = useSafeAreaInsets();
  return Math.max(BASE_FOOTER_PADDING, bottom + SAFE_AREA_GAP);
}
