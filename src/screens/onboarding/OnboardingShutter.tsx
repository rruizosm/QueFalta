import { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';
import { fonts } from '../../constants/typography';
import { useTranslation } from '../../context/LanguageContext';
import { useReducedMotion } from '../../hooks/useReducedMotion';

const MASCOT = require('../../../assets/mascot/berenjena-persiana.png');
const SEATED_MASCOT = require('../../../assets/mascot/berenjena-sentada-ok.png');
const SLATS = Array.from({ length: 26 }, (_, index) => index);
const APP_BLUE = colors.blue;

interface Props {
  children: React.ReactNode;
  onSettled?: () => void;
}

/**
 * Persiana a pantalla completa del primer paso. Todo el formulario vive dentro
 * de ella; la mascota viaja agarrada al borde inferior durante la bajada.
 */
export default function OnboardingShutter({ children, onSettled }: Props) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const shutterY = useRef(new Animated.Value(-height - 40)).current;
  const mascotLanding = useRef(new Animated.Value(0)).current;
  const pullingMascotOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reducedMotion) {
      shutterY.setValue(0);
      mascotLanding.setValue(1);
      pullingMascotOpacity.setValue(0);
      onSettled?.();
      return undefined;
    }

    shutterY.setValue(-height - 40);
    mascotLanding.setValue(0);
    pullingMascotOpacity.setValue(1);
    const shutterAnimation = Animated.sequence([
      Animated.timing(shutterY, {
        toValue: 9,
        duration: 980,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(shutterY, {
        toValue: 0,
        damping: 12,
        stiffness: 165,
        mass: 0.72,
        useNativeDriver: true,
      }),
    ]);

    const landingAnimation = Animated.spring(mascotLanding, {
      toValue: 1,
      damping: 10,
      stiffness: 145,
      mass: 0.72,
      useNativeDriver: true,
    });
    const mascotTransition = Animated.sequence([
      Animated.timing(pullingMascotOpacity, {
        toValue: 0,
        duration: 130,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      landingAnimation,
    ]);

    shutterAnimation.start(({ finished }) => {
      if (!finished) return;
      mascotTransition.start(({ finished: landed }) => {
        if (landed) onSettled?.();
      });
    });
    return () => {
      shutterAnimation.stop();
      mascotTransition.stop();
    };
  }, [height, mascotLanding, onSettled, pullingMascotOpacity, reducedMotion, shutterY]);

  const shellWidth = Math.min(width - 40, 560);
  const mascotWidth = Math.min(150, width * 0.38);
  const mascotHeight = mascotWidth * 1.5;
  const seatedWidth = Math.min(142, width * 0.36);
  const seatedHeight = seatedWidth * 1.5;
  const seatedTranslateY = mascotLanding.interpolate({
    inputRange: [0, 1],
    outputRange: [-Math.min(height * 0.72, 540), 0],
  });
  const seatedScale = mascotLanding.interpolate({
    inputRange: [0, 0.82, 1],
    outputRange: [0.92, 1.04, 1],
  });

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={APP_BLUE} />

      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.shutter,
          { transform: [{ translateY: shutterY }] },
        ]}
      >
        <View style={styles.shutterSurface}>
          <View style={styles.slats} pointerEvents="none">
            {SLATS.map((slat) => <View key={slat} style={styles.slat} />)}
          </View>

          <KeyboardAvoidingView
            style={styles.keyboardAvoider}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={[
                styles.scrollContent,
                {
                  paddingTop: insets.top + 34,
                  paddingBottom: Math.max(insets.bottom + 34, 48),
                },
              ]}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.shell, { width: shellWidth }]}>
                <View
                  style={styles.intro}
                  accessible
                  accessibilityRole="header"
                  accessibilityLabel={`${t('onboarding.shutterTitle')}. ${t('onboarding.shutterSubtitle')}`}
                >
                  <Animated.Image
                    source={SEATED_MASCOT}
                    resizeMode="contain"
                    style={[
                      styles.seatedMascot,
                      {
                        width: seatedWidth,
                        height: seatedHeight,
                        transform: [
                          { translateY: seatedTranslateY },
                          { scale: seatedScale },
                        ],
                      },
                    ]}
                    accessible={false}
                  />
                  <Text style={styles.title}>{t('onboarding.shutterTitle')}</Text>
                  <Text style={styles.subtitle}>{t('onboarding.shutterSubtitle')}</Text>
                </View>
                <View style={styles.form}>{children}</View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>

        </View>
        <View style={styles.bottomRail} pointerEvents="none" />
        <Animated.Image
          source={MASCOT}
          resizeMode="contain"
          style={[
            styles.mascot,
            {
              width: mascotWidth,
              height: mascotHeight,
              bottom: -(mascotHeight - 55),
              opacity: pullingMascotOpacity,
            },
          ]}
          accessible={false}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#fbf6ee',
  },
  shutter: {
    overflow: 'visible',
  },
  shutterSurface: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: APP_BLUE,
  },
  slats: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-evenly',
  },
  slat: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.11)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(13,53,101,0.18)',
  },
  keyboardAvoider: {
    flex: 1,
    zIndex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  shell: {
    alignSelf: 'center',
  },
  intro: {
    minHeight: 250,
    paddingTop: 184,
    alignItems: 'center',
  },
  seatedMascot: {
    position: 'absolute',
    top: 0,
    alignSelf: 'center',
    zIndex: 2,
  },
  title: {
    color: '#ffffff',
    fontSize: 31,
    lineHeight: 37,
    fontFamily: fonts.bold,
    textAlign: 'center',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.88)',
    fontSize: 15,
    lineHeight: 21,
    fontFamily: fonts.medium,
    textAlign: 'center',
    marginTop: 7,
  },
  form: {
    marginTop: 24,
  },
  bottomRail: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 14,
    zIndex: 3,
    backgroundColor: '#255b9c',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.36)',
  },
  mascot: {
    position: 'absolute',
    alignSelf: 'center',
    zIndex: 2,
  },
});
