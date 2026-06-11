import { useCallback, useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Alert, Image, Linking,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors, ACCENT_OPTIONS } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useTheme, useThemedStyles } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useCart } from '../context/CartContext';
import {
  getNotificationsEnabled, setNotificationsEnabled,
  hasPermission, requestPermission, sendTestNotification,
} from '../lib/notifications';
import HardShadow from '../components/HardShadow';
import ProfileRow from '../components/ProfileRow';
import ConfirmDialog from '../components/ConfirmDialog';
import PaywallModal from '../components/PaywallModal';
import { CATALOG_STORES, CATALOG_STORE_KEYS } from '../constants/stores';
import { PAYWALL_ENABLED } from '../constants/limits';
import { fetchIncomingRequestCount } from '../api/friends';

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const styles = useThemedStyles(themedStyles);
  const { accentKey } = useTheme();
  const { session, signOut } = useAuth();
  const { profile, loading, isPremium } = useProfile();
  const { defaultGroup } = useCart();
  const email = session?.user.email ?? '';

  const [notifications, setNotifications] = useState(false);
  const [signOutVisible, setSignOutVisible] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [paywallVisible, setPaywallVisible] = useState(false);

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
    if (!value) {
      setNotifications(false);
      await setNotificationsEnabled(false);
      return;
    }

    const granted = (await hasPermission()) || (await requestPermission());
    if (!granted) {
      Alert.alert(
        'Permiso necesario',
        'Activa las notificaciones para LaCompra en los ajustes de tu dispositivo.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }

    setNotifications(true);
    await setNotificationsEnabled(true);
    await sendTestNotification();
  };

  const handleSignOut = () => setSignOutVisible(true);

  const initials  = profile?.initials ?? '??';
  const avatarBg  = profile?.color   ?? colors.accent;
  const name      = profile?.name    ?? '';
  const avatarUrl = profile?.avatarUrl ?? null;

  const catalogStores = profile?.catalogStores ?? CATALOG_STORE_KEYS;
  const storesSummary =
    catalogStores.length >= CATALOG_STORE_KEYS.length
      ? 'Todos'
      : catalogStores
          .map((k) => CATALOG_STORES.find((s) => s.key === k)?.name)
          .filter(Boolean)
          .join(', ') || 'Ninguno';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Perfil</Text>
        <View style={{ width: 38 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* Identity card */}
          <HardShadow style={styles.identityCard}>
            {/* Avatar */}
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                <Text style={styles.avatarInitials}>{initials}</Text>
              </View>
            )}

            {/* Name + email */}
            <View style={styles.identityText}>
              <Text style={styles.identityName} numberOfLines={1}>{name}</Text>
              <Text style={styles.identityEmail} numberOfLines={1} ellipsizeMode="tail">{email}</Text>
              {profile?.username ? (
                <Text style={styles.identityUsername}>@{profile.username}</Text>
              ) : null}
            </View>

            {/* Edit button */}
            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => navigation.navigate('EditProfile')}
            >
              <Ionicons name="create-outline" size={14} color={colors.accent} />
              <Text style={styles.editBtnText}>Editar</Text>
            </TouchableOpacity>
          </HardShadow>

          {/* QUÉFALTA PLUS — oculto mientras el paywall esté apagado (Fase 4). */}
          {PAYWALL_ENABLED && (
            <TouchableOpacity
              onPress={() => { if (!isPremium) setPaywallVisible(true); }}
              activeOpacity={isPremium ? 1 : 0.85}
              style={{ marginTop: 14 }}
            >
              <HardShadow style={styles.plusCard}>
                <View style={styles.plusIcon}>
                  <Ionicons name="sparkles" size={18} color={colors.white} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.plusTitle}>QuéFalta Plus</Text>
                  <Text style={styles.plusText}>
                    {isPremium
                      ? 'Suscripción activa. ¡Gracias por apoyar la app!'
                      : 'Grupos ilimitados, comparador completo y más'}
                  </Text>
                </View>
                {isPremium ? (
                  <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
                ) : (
                  <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
                )}
              </HardShadow>
            </TouchableOpacity>
          )}

          {/* CUENTA */}
          <Text style={styles.sectionLabel}>Cuenta</Text>
          <View style={styles.section}>
            <ProfileRow
              icon="notifications-outline"
              label="Notificaciones"
              right="switch"
              switchValue={notifications}
              onSwitchChange={handleToggleNotifications}
            />
            <ProfileRow
              icon="receipt-outline"
              label="Historial de compra"
              onPress={() => navigation.navigate('History')}
            />
            <ProfileRow
              icon="shield-checkmark-outline"
              label="Privacidad y seguridad"
              onPress={() => navigation.navigate('PrivacySecurity')}
              last
            />
          </View>

          {/* PREFERENCIAS */}
          <Text style={styles.sectionLabel}>Preferencias</Text>
          <View style={styles.section}>
            <ProfileRow
              icon="people-outline"
              label="Grupo por defecto"
              value={defaultGroup?.groupName ?? 'Sin asignar'}
              onPress={() => navigation.navigate('DefaultGroup')}
            />
            <ProfileRow
              icon="storefront-outline"
              label="Supermercados"
              value={storesSummary}
              onPress={() => navigation.navigate('CatalogStores')}
            />
            <ProfileRow
              icon="color-palette-outline"
              label="Apariencia"
              value={ACCENT_OPTIONS.find((o) => o.key === accentKey)?.name}
              onPress={() => navigation.navigate('Appearance')}
              last
            />
          </View>

          {/* GRUPOS */}
          <Text style={styles.sectionLabel}>Social</Text>
          <View style={styles.section}>
            <ProfileRow
              icon="people-circle-outline"
              label="Amigos"
              badge={pendingRequests}
              onPress={() => navigation.navigate('Friends')}
              last
            />
          </View>

          {/* SOPORTE */}
          <Text style={styles.sectionLabel}>Soporte</Text>
          <View style={styles.section}>
            <ProfileRow
              icon="help-circle-outline"
              label="Ayuda"
              onPress={() => {}}
            />
            <ProfileRow
              icon="information-circle-outline"
              label="Acerca de LaCompra"
              value="v2.0"
              last
            />
          </View>

          {/* Sign out */}
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={17} color="#d6452b" />
            <Text style={styles.signOutText}>Cerrar sesión</Text>
          </TouchableOpacity>

        </ScrollView>
      )}

      <PaywallModal visible={paywallVisible} onClose={() => setPaywallVisible(false)} />

      <ConfirmDialog
        visible={signOutVisible}
        title="Cerrar sesión"
        message="¿Seguro que quieres cerrar sesión?"
        confirmLabel="Cerrar sesión"
        destructive
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
    paddingHorizontal: 16, paddingTop: 52, paddingBottom: 10, gap: 12,
  },
  backBtn: {
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  title: { flex: 1, fontSize: 22, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  // ── Identity card ─────────────────────────────────────────────
  identityCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 13, 
  },
  avatar: {
    width: 54, height: 54, borderRadius: 27,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInitials: { fontSize: 20, fontFamily: fonts.bold, color: colors.white },
  identityText: { flex: 1, minWidth: 0 },
  identityName: { fontSize: 19, fontFamily: fonts.bold, color: colors.ink },
  identityEmail: { fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 2 },
  identityUsername: { fontSize: 12, fontFamily: fonts.medium, color: colors.accent, marginTop: 1 },
  editBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 7,
    borderWidth: 1, borderColor: colors.accent,
  },
  editBtnText: { fontSize: 12, fontFamily: fonts.bold, color: colors.accent },

  // ── QuéFalta Plus ─────────────────────────────────────────────
  plusCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: 14, gap: 12,
  },
  plusIcon: {
    width: 38, height: 38,
    backgroundColor: colors.accent,
    alignItems: 'center', justifyContent: 'center',
  },
  plusTitle: { fontSize: 15, fontFamily: fonts.bold, color: colors.ink },
  plusText: { fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft, marginTop: 1 },

  // ── Sections ──────────────────────────────────────────────────
  sectionLabel: {
    fontSize: 10.5, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1.4,
    marginTop: 14, marginBottom: 4,
  },
  section: {
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14,
  },

  // ── Sign out ──────────────────────────────────────────────────
  signOutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 20,
    paddingVertical: 13,
    borderWidth: 1, borderColor: 'rgba(214,69,43,0.5)',
    backgroundColor: 'rgba(214,69,43,0.06)',
  },
  signOutText: { fontSize: 14, fontFamily: fonts.bold, color: '#d6452b' },
});
