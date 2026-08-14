import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Alert, Linking,
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
import {
  getNotificationsEnabled, setNotificationsEnabled,
  hasPermission, requestPermission, sendTestNotification,
  registerForPushNotificationsAsync, unregisterPushNotificationsAsync,
} from '../lib/notifications';
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

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const { accentKey } = useTheme();
  const { t, lang } = useTranslation();
  const { session, signOut } = useAuth();
  const { profile, loading, isPremium } = useProfile();
  const historyLocked = !loading && limitsApply(isPremium);
  const statisticsLocked = !loading && limitsApply(isPremium);
  const email = session?.user.email ?? '';
  const appVersion = `v${Constants.expoConfig?.version ?? '1.0.0'}`;

  const [notifications, setNotifications] = useState(false);
  const [signOutVisible, setSignOutVisible] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [headerH, setHeaderH] = useState(0);
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

  // Reflect the saved preference (and revoked OS permission) on mount.
  useEffect(() => {
    (async () => {
      const [pref, granted] = await Promise.all([getNotificationsEnabled(), hasPermission()]);
      setNotifications(pref && granted);
    })();
  }, []);

  const handleToggleNotifications = async (value: boolean) => {
    const uid = session?.user.id;
    if (!value) {
      setNotifications(false);
      await setNotificationsEnabled(false);
      // Deja de recibir push en este dispositivo.
      if (uid) unregisterPushNotificationsAsync(uid).catch(() => {});
      return;
    }

    const granted = (await hasPermission()) || (await requestPermission());
    if (!granted) {
      Alert.alert(
        t('profile.notifPermTitle'),
        t('profile.notifPermMsg'),
        [
          { text: t('common.cancel'), style: 'cancel' },
          { text: t('profile.openSettings'), onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    setNotifications(true);
    await setNotificationsEnabled(true);
    await sendTestNotification();
    // Registra el push token (no-op en Expo Go/web): así llegan también las push.
    if (uid) registerForPushNotificationsAsync(uid).catch(() => {});
  };

  const handleSignOut = () => setSignOutVisible(true);

  const initials  = profile?.initials ?? '??';
  const avatarBg  = profile?.color   ?? colors.accent;
  const name      = profile?.name    ?? '';
  const avatarUrl = profile?.avatarUrl ?? null;


  // Nombre localizado de la CCAA ('ES' = Toda España; null solo puede darse si
  // el fetch del perfil falló — tras el gate nunca queda sin responder).
  const region = profile?.region ?? null;
  const regionSummary =
    region === null ? t('region.notSet')
    : region === REGION_ALL ? t('region.all')
    : t(`region.names.${region}`);

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

            {/* Name + email */}
            <View style={styles.identityText}>
              <View style={styles.identityNameRow}>
                <Text style={styles.identityName} numberOfLines={1}>{name}</Text>
                {profile?.verified ? <VerifiedBadge size={17} /> : null}
              </View>
              <Text style={styles.identityEmail} numberOfLines={1} ellipsizeMode="tail">{email}</Text>
              {profile?.username ? (
                <Text style={styles.identityUsername}>@{profile.username}</Text>
              ) : null}
            </View>

            {/* Edit button */}
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => navigation.navigate('EditProfile')}
              activeOpacity={0.8}
            >
              <Ionicons name="create-outline" size={14} color={colors.white} />
              <Text style={styles.editBtnText}>{t('profile.edit')}</Text>
            </TouchableOpacity>
          </View>

          {/* QUÉFALTA PLUS — oculto mientras el paywall esté apagado (Fase 4). */}
          {PAYWALL_ENABLED && (
            <TouchableOpacity
              onPress={() => { if (!isPremium) setPaywallVisible(true); }}
              activeOpacity={isPremium ? 1 : 0.85}
              style={{ marginTop: 14 }}
            >
              <View style={styles.plusCard}>
                <View style={styles.plusIcon}>
                  <Ionicons name="sparkles" size={18} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.plusTitle}>QuéFalta Plus</Text>
                  <Text style={styles.plusText}>
                    {isPremium
                      ? t('profile.plusActive')
                      : t('profile.plusInactive')}
                  </Text>
                </View>
                {isPremium ? (
                  <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                ) : (
                  <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
                )}
              </View>
            </TouchableOpacity>
          )}

          {/* CUENTA */}
          <Text style={styles.sectionLabel}>{t('profile.sectionAccount')}</Text>
          <View style={styles.section}>
            <ProfileRow
              icon="notifications-outline"
              label={t('profile.notifications')}
              right="switch"
              switchValue={notifications}
              onSwitchChange={handleToggleNotifications}
              rounded
            />
            <ProfileRow
              icon="receipt-outline"
              label={t('profile.purchaseHistory')}
              locked={historyLocked}
              onPress={() => {
                if (historyLocked) {
                  setPaywallVisible(true);
                  return;
                }
                navigation.navigate('History');
              }}
              rounded
            />
            <ProfileRow
              icon="pie-chart-outline"
              label={t('profile.statistics')}
              locked={statisticsLocked}
              onPress={() => {
                if (statisticsLocked) {
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
        <View style={styles.chrome} onLayout={(event) => setHeaderH(event.nativeEvent.layout.height)}>
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
  identityText: { flex: 1, minWidth: 0 },
  identityNameRow: { flexDirection: 'row', alignItems: 'center' },
  identityName: { flexShrink: 1, fontSize: 18, fontFamily: fonts.bold, color: colors.ink },
  identityEmail: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
  identityUsername: { fontSize: 12, fontFamily: fonts.medium, color: colors.accent, marginTop: 1 },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 11, paddingVertical: 8, borderRadius: 14,
    backgroundColor: colors.accent,
  },
  editBtnText: { fontSize: 12, fontFamily: fonts.bold, color: colors.white },

  // ── QuéFalta Plus ─────────────────────────────────────────────
  plusCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 12, borderRadius: 18,
    backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border,
  },
  plusIcon: {
    width: 38, height: 38, borderRadius: 13,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  plusTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.ink },
  plusText: { fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1 },

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
