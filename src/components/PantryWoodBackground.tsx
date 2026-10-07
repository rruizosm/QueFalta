import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { useTheme } from '../context/ThemeContext';

const OAK_TEXTURE = require('../../assets/pantry/oak-background.jpg');

/** One uninterrupted wood surface; shelves provide their own contact shadows. */
function PantryWoodBackground() {
  const { scheme } = useTheme();
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" aria-hidden
    testID="pantry-wood-background" style={[StyleSheet.absoluteFill, styles.base]}>
    <Image source={OAK_TEXTURE} style={StyleSheet.absoluteFill} contentFit="cover"
      transition={0} accessible={false} pointerEvents="none" />
    <View style={[StyleSheet.absoluteFill, styles.softTone]} />
    {scheme === 'dark' && <View style={[StyleSheet.absoluteFill, styles.dark]} />}
  </View>;
}

const styles = StyleSheet.create({
  base: { backgroundColor: '#B38252' },
  // A warm wash softens the grain and separates the back from the oak shelves.
  softTone: { backgroundColor: 'rgba(245, 234, 216, 0.44)' },
  dark: { backgroundColor: 'rgba(36, 22, 12, 0.42)' },
});

export default memo(PantryWoodBackground);
