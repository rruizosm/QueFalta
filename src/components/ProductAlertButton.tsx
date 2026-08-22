import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { CatalogStore } from '../constants/stores';
import { PAYWALL_ENABLED } from '../constants/limits';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useProfile } from '../context/ProfileContext';
import { useTranslation } from '../context/LanguageContext';
import { useThemedStyles } from '../context/ThemeContext';
import PaywallModal from './PaywallModal';
import PriceAlertEditorModal from './PriceAlertEditorModal';

interface Props {
  store: CatalogStore;
  productId: string;
  overlay?: boolean;
}

export default function ProductAlertButton({ store, productId, overlay = false }: Props) {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const { isPremium } = useProfile();
  const [editorVisible, setEditorVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  if (!PAYWALL_ENABLED) return null;

  const open = () => {
    if (isPremium) setEditorVisible(true);
    else setPaywallVisible(true);
  };

  const ink = colors.accent;
  const button = (
    <TouchableOpacity
      style={styles.button}
      onPress={open}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={t('priceAlerts.exactCta')}
    >
      <Ionicons name="notifications-outline" size={15} color={ink} />
      <Text style={styles.text}>{t('priceAlerts.exactCta')}</Text>
      {!isPremium ? <Ionicons name="lock-closed" size={11} color={colors.accent} /> : null}
    </TouchableOpacity>
  );

  return (
    <>
      <View style={[styles.buttonBackground, overlay && styles.overlay]}>
        {button}
      </View>
      <PriceAlertEditorModal
        visible={editorVisible}
        onClose={() => setEditorVisible(false)}
        exactTarget={{ store, productId }}
      />
      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
      />
    </>
  );
}

const themedStyles = () => StyleSheet.create({
  buttonBackground: {
    alignSelf: 'flex-start', marginTop: 8, borderRadius: 10,
    backgroundColor: colors.accentLight,
    borderWidth: 1,
    borderColor: colors.accentMid,
  },
  button: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 9, paddingVertical: 7, borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  overlay: {
    position: 'absolute', top: 10, right: 10, zIndex: 3, marginTop: 0,
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 }, elevation: 3,
  },
  text: { fontSize: 11.5, fontFamily: fonts.bold, color: colors.accent },
});
