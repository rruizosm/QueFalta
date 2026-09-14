import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useIsFocused } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useReducedMotion } from '../hooks/useReducedMotion';

export default function DailyWordButton({ onPress }: { onPress: () => void }) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  const focused = useIsFocused();
  const [active, setActive] = useState(AppState.currentState === 'active');
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setActive(state === 'active'));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    sweep.setValue(0);
    if (reduced || !focused || !active) return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(sweep, { toValue: 1, duration: 2000, easing: Easing.inOut(Easing.ease), useNativeDriver: true, isInteraction: false }),
      Animated.delay(1500),
    ]));
    loop.start();
    return () => loop.stop();
  }, [sweep, reduced, focused, active]);
  return (
    <View style={styles.wrap}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.button}
        accessibilityRole="button" accessibilityLabel={t('wordGame.title')}>
        <LinearGradient colors={[colors.accent, '#6245b0']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        {!reduced && <Animated.View pointerEvents="none" style={[styles.sweep, { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-90, 270] }) }, { rotate: '20deg' }] }]}>
          <LinearGradient colors={['transparent', 'rgba(255,255,255,0.32)', 'transparent']} style={StyleSheet.absoluteFill} />
        </Animated.View>}
        <View style={styles.tile}><Text style={styles.letter}>P</Text></View>
        <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>{t('wordGame.title')}</Text>
        <Ionicons name="sparkles" size={14} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}
const themedStyles = () => StyleSheet.create({
  wrap: { flex: 1, alignItems: 'flex-start', minWidth: 0 },
  button: { minHeight: 44, borderRadius: 16, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 8, maxWidth: '100%' },
  sweep: { position: 'absolute', left: 0, top: -20, bottom: -20, width: 70 },
  tile: { width: 25, height: 25, borderRadius: 7, borderWidth: 1, borderColor: '#ffffff80', backgroundColor: '#ffffff24', alignItems: 'center', justifyContent: 'center' },
  letter: { fontFamily: fonts.bold, color: '#fff', fontSize: 17 },
  label: { fontFamily: fonts.bold, color: '#fff', fontSize: 15, flexShrink: 1 },
});
