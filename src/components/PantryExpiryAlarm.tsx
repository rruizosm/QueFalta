import { StyleSheet, Text, View } from 'react-native';
import { fonts } from '../constants/typography';

/** Informational only: taps pass through to the product. */
export default function PantryExpiryAlarm() {
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" style={styles.target}>
    <View style={styles.face}><Text style={styles.symbol}>!</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  target: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  face: { width: 23.76, height: 23.76, borderRadius: 11.88, backgroundColor: '#C62828',
    alignItems: 'center', justifyContent: 'center' },
  symbol: { fontFamily: fonts.bold, fontSize: 16, lineHeight: 20, includeFontPadding: false,
    color: '#FFFFFF', textAlign: 'center' },
});
