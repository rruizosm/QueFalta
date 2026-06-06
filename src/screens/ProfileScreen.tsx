import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Alert, Image, Linking,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
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

export default function ProfileScreen() {
  const navigation = useNavigation<any>();
  const { session, signOut } = useAuth();
  const { profile, loading } = useProfile();
  const { defaultGroup } = useCart();
  const email = session?.user.email ?? '';

  const [notifications, setNotifications] = useState(false);
  const [signOutVisible, setSignOutVisible] = useState(false);

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
              icon="moon-outline"
              label="Apariencia"
              value="Claro"
              last
            />
          </View>

          {/* GRUPOS */}
          <Text style={styles.sectionLabel}>Social</Text>
          <View style={styles.section}>
            <ProfileRow
              icon="people-circle-outline"
              label="Amigos"
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

const styles = StyleSheet.create({
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
