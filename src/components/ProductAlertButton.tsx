import { useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import type { CatalogStore } from '../constants/stores';
import { limitsApply, PAYWALL_ENABLED } from '../constants/limits';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import {
  fetchPriceAlerts,
  type PriceAlertRule,
} from '../api/priceAlerts';
import { freePriceAlertRule } from '../lib/freeTierAllowances';
import { useAuth } from '../context/AuthContext';
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
  const { session } = useAuth();
  const [editorVisible, setEditorVisible] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [initialRule, setInitialRule] = useState<PriceAlertRule | null>(null);
  const [checking, setChecking] = useState(false);
  const [blocked, setBlocked] = useState(false);

  if (!PAYWALL_ENABLED) return null;

  const open = async () => {
    if (!limitsApply(isPremium)) {
      setInitialRule(null);
      setEditorVisible(true);
      return;
    }
    const userId = session?.user.id;
    if (!userId || checking) return;
    setChecking(true);
    try {
      const rules = await fetchPriceAlerts(userId);
      const freeRule = freePriceAlertRule(rules);
      const exactRule = rules.find((rule) => (
        rule.kind === 'exact'
        && rule.exactStore === store
        && rule.exactProductId === productId
      ));
      if (rules.length === 0 || (exactRule && exactRule.id === freeRule?.id)) {
        setInitialRule(exactRule ?? null);
        setBlocked(false);
        setEditorVisible(true);
      } else {
        setBlocked(true);
        setPaywallVisible(true);
      }
    } catch {
      // El guardarraíl del servidor vuelve a validar el cupo al guardar.
      setInitialRule(null);
      setEditorVisible(true);
    } finally {
      setChecking(false);
    }
  };

  const ink = colors.accent;
  const button = (
    <TouchableOpacity
      style={styles.button}
      onPress={open}
      disabled={checking}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={t('priceAlerts.exactCta')}
    >
      {checking
        ? <ActivityIndicator size="small" color={ink} />
        : <Ionicons name="notifications-outline" size={15} color={ink} />}
      <Text style={styles.text}>{t('priceAlerts.exactCta')}</Text>
      {blocked ? <Ionicons name="lock-closed" size={11} color={colors.accent} /> : null}
    </TouchableOpacity>
  );

  return (
    <>
      <View style={[
        styles.buttonBackground,
        overlay && styles.overlay,
        Platform.OS === 'android' && styles.overlayAndroid,
      ]}>
        {button}
      </View>
      <PriceAlertEditorModal
        visible={editorVisible}
        onClose={() => setEditorVisible(false)}
        exactTarget={{ store, productId }}
        initialRule={initialRule}
        onSaved={(rule) => setInitialRule(rule)}
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
  overlayAndroid: { shadowOpacity: 0, elevation: 0 },
  text: { fontSize: 11.5, fontFamily: fonts.bold, color: colors.accent },
});
