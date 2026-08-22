import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Linking, Alert, AppState,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import Constants from 'expo-constants';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import ProfileRow from '../components/ProfileRow';
import UserAvatar from '../components/UserAvatar';
import VerifiedBadge from '../components/VerifiedBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import PaywallModal from '../components/PaywallModal';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import { REGION_ALL } from '../constants/regions';
import { PAYWALL_ENABLED, limitsApply } from '../constants/limits';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import { fetchIncomingRequestCount } from '../api/friends';
import {
  getPlusSubscriptionManagement,
  openPlusSubscriptionManagement,
  type PlusSubscriptionManagement,
} from '../lib/purchases';

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const { accentKey } = useTheme();
  const { t, lang } = useTranslation();
  const { session, signOut } = useAuth();
  const { profile, loading, isPremium } = useProfile();
  const plusFeaturesLocked = !loading && limitsApply(isPremium);
  const appVersion = `v${Constants.expoConfig?.version ?? '1.0.0'}`;

  const [signOutVisible, setSignOutVisible] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [plusManagement, setPlusManagement] = useState<PlusSubscriptionManagement | null>(null);
  // La cabecera mide headerTop + botón (38) + padding inferior (10). Reservar
  // esa altura desde el primer frame evita que el contenido nazca bajo el
  // cristal y salte cuando onLayout informa de la misma medida.
  const [headerH, setHeaderH] = useState(glassAvailable ? headerTop + 48 : 0);
  const glassInset = glassAvailable ? headerH : 0;

  // Badge de solicitudes de amistad pendientes. Al enfocar (no solo al montar):
  // así se refresca al volver de Amigos tras aceptar/rechazar.
  useFocusEffect(
    useCallback(() => {
      const uid = session?.user.id;
      if (!uid) return;
      let cancelled = false;
      fetchIncomingRequestCount(uid)
        .then((n) => { if (!cancelled) setPendingRequests(n); })
        .catch(() => {});
      return () => { cancelled = true; };
    }, [session?.user.id]),
  );

  // Al volver de la tienda, consulta de nuevo plan, renovación o cancelación.
  // Si RevenueCat confirma que no hay entitlement de tienda pero Supabase sí
  // mantiene Plus, se trata de una concesión de cortesía para testers.
  useFocusEffect(
    useCallback(() => {
      if (!isPremium) {
        setPlusManagement(null);
        return;
      }
      let cancelled = false;
      const refreshManagement = (showLoading: boolean) => {
        if (showLoading) setPlusManagement(null);
        getPlusSubscriptionManagement().then((result) => {
          if (!cancelled) setPlusManagement(result);
        });
      };
      refreshManagement(true);
      const appStateSubscription = AppState.addEventListener('change', (state) => {
        // Los enlaces de tienda sacan temporalmente la app a segundo plano. Al
        // volver, recoge una cancelación o cambio de plan sin reabrir Perfil.
        if (state === 'active') refreshManagement(false);
      });
      return () => {
        cancelled = true;
        appStateSubscription.remove();
      };
    }, [isPremium]),
  );

  const handleSignOut = () => setSignOutVisible(true);

  const handlePlusPress = async () => {
    if (!isPremium) {
      setPaywallVisible(true);
      return;
    }
    if (!plusManagement || plusManagement.kind === 'none') return;
    try {
      const opened = await openPlusSubscriptionManagement(
        plusManagement.kind === 'store' ? plusManagement.managementURL : null,
      );
      if (!opened) throw new Error('Subscription management unavailable');
      // La hoja nativa de iOS no siempre cambia AppState; al cerrarla refresca
      // también aquí. Los enlaces externos se vuelven a consultar al regresar.
      setPlusManagement(await getPlusSubscriptionManagement());
    } catch {
      Alert.alert(t('profile.plusManageErrorTitle'), t('profile.plusManageErrorMessage'));
    }
  };

  const initials  = profile?.initials ?? '??';
  const avatarBg  = profile?.color   ?? colors.accent;
  const avatarUrl = profile?.avatarUrl ?? null;


  // Nombre localizado de la CCAA ('ES' = Toda España; null solo puede darse si
  // el fetch del perfil falló — tras el gate nunca queda sin responder).
  const region = profile?.region ?? null;
  const regionSummary =
    region === null ? t('region.notSet')
    : region === REGION_ALL ? t('region.all')
    : t(`region.names.${region}`);

  const plusValue = (() => {
    if (!isPremium) return t('profile.plusDiscover');
    if (!plusManagement) return t('common.loading');
    if (plusManagement.kind === 'none') return t('profile.plusCourtesy');
    if (plusManagement.kind === 'unavailable') return t('profile.plusActiveShort');
    if (!plusManagement.willRenew && plusManagement.expirationDate) {
      const date = new Intl.DateTimeFormat(lang === 'ca' ? 'ca-ES' : 'es-ES', {
        day: 'numeric', month: 'short',
      }).format(new Date(plusManagement.expirationDate));
      return t('profile.plusUntil', { date });
    }
    if (plusManagement.periodType.toUpperCase() === 'TRIAL') return t('profile.plusTrial');
    const plan = `${plusManagement.productIdentifier}:${plusManagement.productPlanIdentifier ?? ''}`;
    if (plan.toLowerCase().includes('annual')) return t('profile.plusAnnual');
    if (plan.toLowerCase().includes('monthly')) return t('profile.plusMonthly');
    return t('profile.plusManage');
  })();

  const plusRowEnabled = !isPremium
    || (!!plusManagement && plusManagement.kind !== 'none');

  const header = (
    <View style={[styles.header, { paddingTop: headerTop }]}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={[styles.backBtn, glassAvailable && styles.backBtnGlass]}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="arrow-back" size={22} color={colors.ink} />
      </TouchableOpacity>
      <View style={styles.headerTitleWrap}>
        <View style={styles.headerIcon}>
          <Ionicons name="person-outline" size={18} color={colors.accent} />
        </View>
        <Text style={styles.title}>{t('profile.title')}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      {!glassAvailable && header}

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: glassInset + 60 }} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: bottomPad, paddingTop: glassInset ? glassInset + 12 : 6 },
          ]}
        >

          {/* Identity card */}
          <View style={styles.identityCard}>
            <View style={styles.avatarFrame}>
              <UserAvatar avatarUrl={avatarUrl} initials={initials} color={avatarBg} size={60} />
            </View>

            {/* Public identity */}
            <View style={styles.identityText}>
              <View style={styles.identityNameRow}>
                {profile?.username ? (
                  <Text
                    style={styles.identityName}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                  >
                    @{profile.username}
                  </Text>
                ) : null}
                {isPremium ? <VerifiedBadge size={17} tone="gold" /> : null}
              </View>
            </View>

            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => navigation.navigate('EditProfile')}
              activeOpacity={0.8}
            >
              <Ionicons name="create-outline" size={14} color={colors.white} />
              <Text style={styles.editBtnText}>{t('profile.edit')}</Text>
            </TouchableOpacity>
          </View>

          {/* CUENTA */}
          <Text style={styles.sectionLabel}>{t('profile.sectionAccount')}</Text>
          <View style={styles.section}>
            {(PAYWALL_ENABLED || isPremium) && (
              <ProfileRow
                icon="sparkles-outline"
                label={t('profile.plusSubscription')}
                value={plusValue}
                onPress={plusRowEnabled ? handlePlusPress : undefined}
                right={plusRowEnabled ? 'chevron' : 'none'}
                rounded
              />
            )}
            <ProfileRow
              icon="notifications-outline"
              label={t('profile.notifications')}
              onPress={() => navigation.navigate('Notifications')}
              rounded
            />
            <ProfileRow
              icon="pricetag-outline"
              label={t('profile.priceAlerts')}
              locked={plusFeaturesLocked}
              onPress={() => {
                if (plusFeaturesLocked) {
                  setPaywallVisible(true);
                  return;
                }
                navigation.navigate('PriceAlerts');
              }}
              rounded
            />
            <ProfileRow
              icon="receipt-outline"
              label={t('profile.purchaseHistory')}
              onPress={() => navigation.navigate('History')}
              rounded
            />
            <ProfileRow
              icon="pie-chart-outline"
              label={t('profile.statistics')}
              locked={plusFeaturesLocked}
              onPress={() => {
                if (plusFeaturesLocked) {
                  setPaywallVisible(true);
                  return;
                }
                navigation.navigate('Statistics');
              }}
              rounded
            />
            <ProfileRow
              icon="shield-checkmark-outline"
              label={t('profile.privacySecurity')}
              onPress={() => navigation.navigate('PrivacySecurity')}
              last
              rounded
            />
          </View>

          {/* PREFERENCIAS */}
          <Text style={styles.sectionLabel}>{t('profile.sectionPreferences')}</Text>
          <View style={styles.section}>
            <ProfileRow
              icon="storefront-outline"
              label={t('profile.stores')}
              onPress={() => navigation.navigate('CatalogStores')}
              rounded
            />
            <ProfileRow
              icon="location-outline"
              label={t('profile.region')}
              value={regionSummary}
              onPress={() => navigation.navigate('RegionSettings')}
              rounded
            />
            <ProfileRow
              icon="color-palette-outline"
              label={t('profile.appearance')}
              value={t(`appearance.accents.${accentKey}`)}
              onPress={() => navigation.navigate('Appearance')}
              rounded
            />
            <ProfileRow
              icon="language-outline"
              label={t('profile.language')}
              value={t(`language.options.${lang}`)}
              onPress={() => navigation.navigate('Language')}
              last
              rounded
            />
          </View>

          {/* GRUPOS */}
          <Text style={styles.sectionLabel}>{t('profile.sectionSocial')}</Text>
          <View style={styles.section}>
            <ProfileRow
              icon="people-circle-outline"
              label={t('profile.friends')}
              badge={pendingRequests}
              onPress={() => navigation.navigate('Friends')}
              last
              rounded
            />
          </View>

          {/* SOPORTE */}
          <Text style={styles.sectionLabel}>{t('profile.sectionSupport')}</Text>
          <View style={styles.section}>
            <ProfileRow
              icon="logo-instagram"
              label={t('profile.instagram')}
              onPress={() => Linking.openURL('https://www.instagram.com/quefalta.app/')}
              rounded
            />
            <ProfileRow
              icon="help-circle-outline"
              label={t('profile.help')}
              onPress={() => navigation.navigate('Help')}
              rounded
            />
            <ProfileRow
              icon="sync-outline"
              label={t('profile.catalogSyncStatus')}
              onPress={() => navigation.navigate('CatalogSyncStatus')}
              rounded
            />
            <ProfileRow
              icon="information-circle-outline"
              label={t('profile.about')}
              value={appVersion}
              onPress={() => navigation.navigate('About')}
              last
              rounded
            />
          </View>

          {/* Sign out */}
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={17} color="#d6452b" />
            <Text style={styles.signOutText}>{t('profile.signOut')}</Text>
          </TouchableOpacity>

        </ScrollView>
      )}

      {glassAvailable && (
        <View
          style={styles.chrome}
          onLayout={(event) => {
            const next = event.nativeEvent.layout.height;
            setHeaderH((current) => Math.abs(current - next) > 0.5 ? next : current);
          }}
        >
          <GlassSurface style={styles.chromeGlass} fallbackColor={colors.paper}>
            {header}
          </GlassSurface>
        </View>
      )}

      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />

      <ConfirmDialog
        visible={signOutVisible}
        title={t('profile.signOut')}
        message={t('profile.signOutConfirm')}
        confirmLabel={t('profile.signOut')}
        onConfirm={() => { setSignOutVisible(false); signOut(); }}
        onCancel={() => setSignOutVisible(false)}
      />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 10, gap: 12,
    // paddingTop inline (useHeaderTopPadding)
  },
  backBtn: {
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, borderRadius: 19,
  },
  backBtnGlass: { backgroundColor: 'transparent', borderWidth: 0 },
  headerTitleWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.accentLight,
  },
  title: { flex: 1, fontSize: 22, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  // ── Identity card ─────────────────────────────────────────────
  identityCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 12, borderRadius: 20,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  avatarFrame: { padding: 3, borderRadius: 34, backgroundColor: colors.accentLight },
  identityText: { flex: 1, minWidth: 0, justifyContent: 'center' },
  identityNameRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  identityName: { flexShrink: 1, fontSize: 18, fontFamily: fonts.bold, color: colors.ink },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingHorizontal: 11, paddingVertical: 8, borderRadius: 14,
    backgroundColor: colors.accent,
  },
  editBtnText: { fontSize: 12, fontFamily: fonts.bold, color: colors.white },

  // ── Sections ──────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 16, fontFamily: fonts.bold, color: colors.ink,
    marginTop: 22, marginBottom: 9,
  },
  section: {
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, borderRadius: 18, overflow: 'hidden',
  },

  // ── Sign out ──────────────────────────────────────────────────
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 20,
    paddingVertical: 13, borderRadius: 18,
    borderWidth: 1, borderColor: 'rgba(214,69,43,0.5)',
    backgroundColor: 'rgba(214,69,43,0.06)',
  },
  signOutText: { fontSize: 14, fontFamily: fonts.bold, color: '#d6452b' },

  chrome: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  chromeGlass: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
