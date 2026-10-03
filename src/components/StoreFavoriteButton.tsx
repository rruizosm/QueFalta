import { type StyleProp, type ViewStyle } from 'react-native';
import StoreCardActionButton from './StoreCardActionButton';

interface Props {
  active: boolean;
  onPress: () => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}

/** Estrella de favorito con la misma superficie que el botón de información. */
export default function StoreFavoriteButton({
  active, onPress, accessibilityLabel, style,
}: Props) {
  return (
    <StoreCardActionButton
      icon={active ? 'star' : 'star-outline'}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      selected={active}
      style={style}
    />
  );
}
