import { useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  Animated,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';
import { fonts } from '../../constants/typography';
import { useProfile } from '../../context/ProfileContext';
import { useTranslation } from '../../context/LanguageContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { requestHomeTransition } from '../../lib/homeTransition';
import type { OnboardingStackParamList } from '../../types';
import OnboardingSlats from './OnboardingSlats';

const MASCOT = require('../../../assets/mascot/berenjena-sentada-ok.png');
type Props = NativeStackScreenProps<OnboardingStackParamList, 'Done'>;

export default function DoneScreen({ route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { applyProfile } = useProfile();
  const reducedMotion = useReducedMotion();
  const entrance = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(t('onboarding.doneTitle'));
    if (reducedMotion) {
      entrance.setValue(1);
      return;
    }
    Animated.spring(entrance, {
      toValue: 1,
      damping: 16,
      stiffness: 130,
      mass: 0.8,
      useNativeDriver: true,
    }).start();
  }, [entrance, reducedMotion, t]);

  const enterApp = () => {
    requestHomeTransition();
    applyProfile({ onboardedAt: route.params.onboardedAt, onboardingStep: 5 });
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 28 }]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.blue} />
      <OnboardingSlats />
      <Animated.View
        style={[
          styles.content,
          {
            opacity: entrance,
            transform: [{ scale: entrance.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1] }) }],
          },
        ]}
      >
        <View style={styles.successBadge} accessibilityElementsHidden>
          <Ionicons name="checkmark" size={34} color={colors.blue} />
        </View>
        <Image source={MASCOT} style={styles.mascot} contentFit="contain" accessible={false} />
        <Text style={styles.title} accessibilityRole="header">{t('onboarding.doneTitle')}</Text>
        <Text style={styles.subtitle}>{t('onboarding.doneSubtitle')}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={enterApp}
          accessibilityRole="button"
          activeOpacity={0.86}
        >
          <Text style={styles.buttonText}>{t('onboarding.doneCta')}</Text>
          <Ionicons name="arrow-forward" size={19} color={colors.blue} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    overflow: 'hidden',
    backgroundColor: colors.blue,
  },
  content: { width: '100%', maxWidth: 520, alignItems: 'center', zIndex: 1 },
  successBadge: {
    width: 66,
    height: 66,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    marginBottom: 8,
  },
  mascot: { width: 150, height: 190 },
  title: {
    color: '#ffffff',
    fontSize: 31,
    lineHeight: 38,
    fontFamily: fonts.bold,
    textAlign: 'center',
  },
  subtitle: {
    maxWidth: 410,
    marginTop: 10,
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    lineHeight: 23,
    fontFamily: fonts.medium,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    minHeight: 58,
    marginTop: 30,
    paddingHorizontal: 22,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
  },
  buttonText: { color: colors.blue, fontSize: 16, fontFamily: fonts.bold },
});
