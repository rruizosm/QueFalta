/** Paso 2 (OBLIGATORIO) — Elegir supermercados del catálogo. Mínimo uno.
 *  Replica la persiana azul del primer paso, sin indicador de progreso. La
 *  mascota con carrito permanece fija y completa sobre la selección. */
import { useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../constants/colors';
import { fonts } from '../../constants/typography';
import { useAuth } from '../../context/AuthContext';
import { useProfile } from '../../context/ProfileContext';
import { useToast } from '../../context/ToastContext';
import { useTranslation } from '../../context/LanguageContext';
import { updateProfile } from '../../api/profile';
import { CATALOG_STORES, CATALOG_STORE_KEYS, type CatalogStore } from '../../constants/stores';
import { storeInRegion } from '../../constants/regions';
import AmbientBubbleBackdrop from '../../components/AmbientBubbleBackdrop';

const CART_MASCOT = require('../../../assets/mascot/berenjena-carrito-transicion.png');
const APP_BLUE = colors.blue;
const lidlStore = CATALOG_STORES.find((store) => store.key === 'lidl');
const ONBOARDING_STORES = CATALOG_STORES.flatMap((store) => {
  if (store.key === 'lidl') return [];
  return store.key === 'mercadona' && lidlStore ? [store, lidlStore] : [store];
});

export default function StoresScreen() {
  const { height, width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const { profile, applyProfile } = useProfile();
  const toast = useToast();
  const userId = session?.user.id ?? '';

  // Solo los súpers de la CCAA elegida en el paso anterior ('ES' = todos).
  const region = profile?.region ?? null;
  const shown = ONBOARDING_STORES.filter((store) => storeInRegion(store.key, region));

  // En una entrada nueva empieza vacío. Si el paso ya se guardó y se vuelve
  // atrás desde una reanudación, recupera exactamente la selección persistida.
  const [selected, setSelected] = useState<CatalogStore[]>(
    (profile?.onboardingStep ?? 0) >= 2 ? (profile?.catalogStores ?? []) : [],
  );
  const [saving, setSaving] = useState(false);
  const shellWidth = Math.min(width - 40, 560);
  const columns = width >= 620 ? 3 : 2;
  const gap = 10;
  const cardWidth = (shellWidth - gap * (columns - 1)) / columns;
  const maxMascotWidthForHeight = height < 500 ? 190 : height < 700 ? 280 : 420;
  const mascotWidth = Math.min(
    width - 64,
    width >= 620 ? 420 : 340,
    maxMascotWidthForHeight,
  );
  const mascotHeight = mascotWidth / 1.5;
  const compactHeight = height < 700;

  const toggle = (key: CatalogStore) => {
    Haptics.selectionAsync();
    const isOn = selected.includes(key);
    const next = isOn ? selected.filter((store) => store !== key) : [...selected, key];
    setSelected(CATALOG_STORE_KEYS.filter((store) => next.includes(store)));
  };

  const handleContinue = async () => {
    setSaving(true);
    try {
      await updateProfile(userId, { catalogStores: selected, onboardingStep: 2 });
      applyProfile({ catalogStores: selected, onboardingStep: 2 });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      navigation.navigate('Avatar');
    } catch {
      toast.show(t('onboarding.saveError'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={APP_BLUE} />
      <AmbientBubbleBackdrop showGradient={false} onBlue />

      <TouchableOpacity
        onPress={() => navigation.navigate('Username')}
        style={[styles.backButton, { top: insets.top + 8 }]}
        hitSlop={8}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
      >
        <Ionicons name="arrow-back" size={20} color={APP_BLUE} />
      </TouchableOpacity>

      <View
        style={[styles.summary, { top: insets.top + 8 }]}
        accessibilityLabel={`${selected.length}/${shown.length}`}
      >
        <Ionicons name="storefront" size={16} color="#ffffff" />
        <Text style={styles.summaryText}>{selected.length}/{shown.length}</Text>
      </View>

      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + (compactHeight ? 12 : 18),
            width: shellWidth,
          },
        ]}
        accessible
        accessibilityRole="header"
        accessibilityLabel={t('onboarding.storesTitle')}
      >
        <Image
          source={CART_MASCOT}
          style={{ width: mascotWidth, height: mascotHeight }}
          contentFit="contain"
          transition={0}
          accessible={false}
        />
        <Text
          style={[styles.title, compactHeight && styles.titleCompact]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.68}
          maxFontSizeMultiplier={1.5}
        >
          {t('onboarding.storesTitle')}
        </Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { width: shellWidth, paddingBottom: 14 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {shown.map((store) => {
            const selectedStore = selected.includes(store.key);
            return (
              <TouchableOpacity
                key={store.key}
                activeOpacity={0.8}
                onPress={() => toggle(store.key)}
                style={[
                  styles.card,
                  { width: cardWidth },
                  selectedStore && styles.cardSelected,
                ]}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: selectedStore }}
              >
                {store.icon ? (
                  <Image
                    source={store.icon}
                    style={styles.icon}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                    transition={0}
                  />
                ) : (
                  <View style={[styles.icon, styles.iconEmpty]}>
                    <Ionicons name="storefront" size={18} color="#7a6f64" />
                  </View>
                )}
                <Text style={styles.cardName} numberOfLines={1}>{store.name}</Text>
                <Ionicons
                  name={selectedStore ? 'checkmark-circle' : 'ellipse-outline'}
                  size={20}
                  color={selectedStore ? APP_BLUE : '#8b8178'}
                />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 14, 24) }]}>
        <TouchableOpacity
          style={[
            styles.continueButton,
            (selected.length === 0 || saving) && styles.continueButtonDisabled,
          ]}
          onPress={handleContinue}
          disabled={selected.length === 0 || saving}
          activeOpacity={0.86}
          accessibilityRole="button"
          accessibilityState={{ disabled: selected.length === 0 || saving, busy: saving }}
        >
          {saving ? (
            <ActivityIndicator color={APP_BLUE} />
          ) : (
            <>
              <Text style={styles.continueText}>{t('onboarding.continue')}</Text>
              <Ionicons name="arrow-forward" size={18} color={APP_BLUE} />
            </>
          )}
        </TouchableOpacity>
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    overflow: 'hidden',
    backgroundColor: APP_BLUE,
  },
  backButton: {
    position: 'absolute',
    left: 18,
    zIndex: 4,
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  header: {
    flexShrink: 0,
    zIndex: 2,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  title: {
    alignSelf: 'stretch',
    color: '#ffffff',
    fontSize: 30,
    lineHeight: 36,
    fontFamily: fonts.bold,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 15,
  },
  titleCompact: {
    fontSize: 27,
    lineHeight: 32,
    marginBottom: 10,
  },
  scroll: {
    flex: 1,
    width: '100%',
    zIndex: 2,
  },
  scrollContent: {
    alignSelf: 'center',
  },
  summary: {
    position: 'absolute',
    right: 18,
    zIndex: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.34)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
  },
  summaryText: {
    fontSize: 12.5,
    fontFamily: fonts.bold,
    color: '#ffffff',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  card: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 11,
    paddingVertical: 13,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.76)',
    backgroundColor: '#ffffff',
  },
  cardSelected: {
    borderColor: '#b8d7ff',
    backgroundColor: '#eaf3ff',
  },
  icon: {
    width: 26,
    height: 26,
    flexShrink: 0,
  },
  iconEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#f6efe3',
  },
  cardName: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.semibold,
    color: '#2b2521',
  },
  footer: {
    width: '100%',
    zIndex: 3,
    alignItems: 'center',
    paddingTop: 12,
    paddingHorizontal: 20,
    backgroundColor: APP_BLUE,
  },
  continueButton: {
    width: '100%',
    maxWidth: 560,
    minHeight: 54,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
  },
  continueButtonDisabled: {
    opacity: 0.48,
  },
  continueText: {
    fontSize: 15.5,
    fontFamily: fonts.bold,
    color: APP_BLUE,
  },
});
