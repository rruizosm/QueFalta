import { useState } from 'react';
import {
  ActivityIndicator,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTranslation } from '../context/LanguageContext';
import { useThemedStyles } from '../context/ThemeContext';

export default function ProfileLoadErrorScreen({ onRetry }: { onRetry: () => Promise<void> }) {
  const { t } = useTranslation();
  const styles = useThemedStyles(themedStyles);
  const insets = useSafeAreaInsets();
  const [retrying, setRetrying] = useState(false);

  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />
      <View style={styles.icon} accessibilityElementsHidden>
        <Ionicons name="cloud-offline-outline" size={38} color={colors.blue} />
      </View>
      <Text style={styles.title} accessibilityRole="header">{t('onboarding.profileLoadTitle')}</Text>
      <Text style={styles.body}>{t('onboarding.profileLoadText')}</Text>
      <TouchableOpacity
        style={[styles.button, retrying && styles.buttonDisabled]}
        onPress={retry}
        disabled={retrying}
        accessibilityRole="button"
        accessibilityState={{ disabled: retrying, busy: retrying }}
        activeOpacity={0.84}
      >
        {retrying
          ? <ActivityIndicator color="#ffffff" />
          : <Text style={styles.buttonText}>{t('common.retry')}</Text>}
      </TouchableOpacity>
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    backgroundColor: colors.paper,
  },
  icon: {
    width: 82,
    height: 82,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(47,108,181,0.12)',
    marginBottom: 24,
  },
  title: {
    maxWidth: 420,
    color: colors.ink,
    fontSize: 27,
    lineHeight: 33,
    fontFamily: fonts.bold,
    textAlign: 'center',
  },
  body: {
    maxWidth: 420,
    marginTop: 10,
    color: colors.inkSoft,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.medium,
    textAlign: 'center',
  },
  button: {
    minWidth: 190,
    minHeight: 54,
    marginTop: 28,
    paddingHorizontal: 24,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.blue,
  },
  buttonDisabled: { opacity: 0.62 },
  buttonText: { color: '#ffffff', fontSize: 16, fontFamily: fonts.bold },
});
