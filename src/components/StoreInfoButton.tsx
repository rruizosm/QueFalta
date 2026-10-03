import { type StyleProp, type ViewStyle } from 'react-native';
import StoreCardActionButton from './StoreCardActionButton';

interface Props {
  onPress: () => void;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}

/** Objetivo táctil común de las tarjetas de información del selector de súper. */
export default function StoreInfoButton({ onPress, accessibilityLabel, style }: Props) {
  return (
    <StoreCardActionButton
      icon="information-circle-outline"
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={style}
    />
  );
}
