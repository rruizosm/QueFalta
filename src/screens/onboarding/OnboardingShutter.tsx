import { useEffect } from 'react';
import {
  Image,
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
import AmbientBubbleBackdrop from '../../components/AmbientBubbleBackdrop';

const SEATED_MASCOT = require('../../../assets/mascot/berenjena-sentada-ok.png');
const APP_BLUE = colors.blue;

interface Props {
  children: React.ReactNode;
  onSettled?: () => void;
}

/**
 * Persiana estática a pantalla completa del primer paso. El formulario y la
 * mascota sentada aparecen directamente en su posición final.
 */
export default function OnboardingShutter({ children, onSettled }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  useEffect(() => {
    onSettled?.();
  }, [onSettled]);

  const shellWidth = Math.min(width - 40, 560);
  const seatedWidth = Math.min(142, width * 0.36);
  const seatedHeight = seatedWidth * 1.5;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={APP_BLUE} />

      <View style={styles.shutterSurface}>
        <AmbientBubbleBackdrop showGradient={false} onBlue />
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
                <Image
                  source={SEATED_MASCOT}
                  resizeMode="contain"
                  style={[
                    styles.seatedMascot,
                    {
                      width: seatedWidth,
                      height: seatedHeight,
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#fbf6ee',
  },
  shutterSurface: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    backgroundColor: APP_BLUE,
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
});
