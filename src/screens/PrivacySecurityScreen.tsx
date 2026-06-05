import { useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, Alert, Linking, ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useToast } from '../context/ToastContext';
import { updateProfile } from '../api/profile';
import { deleteAccount } from '../api/account';
import ProfileRow from '../components/ProfileRow';
import ConfirmDialog from '../components/ConfirmDialog';

const PRIVACY_POLICY_URL = 'https://quefalta.es/privacidad';

export default function PrivacySecurityScreen() {
  const navigation = useNavigation<any>();
  const { signOut } = useAuth();
  const { profile, applyProfile } = useProfile();
  const toast = useToast();

  const [discoverable, setDiscoverable] = useState(profile?.discoverable ?? true);
  const [savingDiscoverable, setSavingDiscoverable] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [signOutAllVisible, setSignOutAllVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);

  const handleToggleDiscoverable = async (value: boolean) => {
    if (!profile) return;
    setDiscoverable(value);
    setSavingDiscoverable(true);
    try {
      await updateProfile(profile.id, { discoverable: value });
      applyProfile({ discoverable: value });
    } catch {
      setDiscoverable(!value); // revertir si falla
      toast.show('No se pudo guardar la preferencia.', 'error');
    } finally {
      setSavingDiscoverable(false);
    }
  };

  const confirmDeleteAccount = async () => {
    setDeleteVisible(false);
    setDeleting(true);
    try {
      await deleteAccount();
      // Al borrarse el usuario, AuthContext detecta el cierre de sesión y vuelve al login.
    } catch (e: any) {
      setDeleting(false);
      toast.show(
        e?.message?.includes('Function not found') || e?.message?.includes('404')
          ? 'La función de borrado aún no está desplegada.'
          : 'No se pudo eliminar la cuenta. Inténtalo de nuevo.',
        'error',
      );
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </TouchableOpacity>
        <Text style={styles.title}>Privacidad y seguridad</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* PRIVACIDAD */}
        <Text style={styles.sectionLabel}>Privacidad</Text>
        <View style={styles.section}>
          <ProfileRow
            icon="search-outline"
            label="Visible para otros"
            right="switch"
            switchValue={discoverable}
            onSwitchChange={savingDiscoverable ? undefined : handleToggleDiscoverable}
            last
          />
        </View>
        <Text style={styles.hint}>
          Cuando está activo, otras personas pueden encontrarte por tu @usuario para añadirte a grupos.
        </Text>

        {/* SEGURIDAD */}
        <Text style={styles.sectionLabel}>Seguridad</Text>
        <View style={styles.section}>
          <ProfileRow
            icon="phone-portrait-outline"
            label="Cerrar sesión en todos los dispositivos"
            onPress={() => setSignOutAllVisible(true)}
            last
          />
        </View>

        {/* DATOS Y POLÍTICAS */}
        <Text style={styles.sectionLabel}>Datos y políticas</Text>
        <View style={styles.section}>
          <ProfileRow
            icon="document-text-outline"
            label="Política de privacidad"
            onPress={() => Linking.openURL(PRIVACY_POLICY_URL)}
          />
          <ProfileRow
            icon="server-outline"
            label="Qué datos guardamos"
            onPress={() => Alert.alert(
              'Qué datos guardamos',
              'Guardamos tu nombre, correo (vía Google), foto de perfil opcional, @usuario y los grupos y listas a los que perteneces. No compartimos tus datos con terceros.',
            )}
            last
          />
        </View>

        {/* ZONA DE PELIGRO */}
        <Text style={[styles.sectionLabel, { color: '#d6452b' }]}>Zona de peligro</Text>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={() => setDeleteVisible(true)}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator size="small" color="#d6452b" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={17} color="#d6452b" />
              <Text style={styles.deleteText}>Eliminar mi cuenta</Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={styles.hint}>
          Borra permanentemente tu perfil y tus datos. Esta acción no se puede deshacer.
        </Text>

      </ScrollView>

      <ConfirmDialog
        visible={signOutAllVisible}
        title="Cerrar sesión en todos los dispositivos"
        message="Se cerrará tu sesión en este y en cualquier otro dispositivo donde hayas iniciado sesión."
        confirmLabel="Cerrar en todos"
        destructive
        onConfirm={() => { setSignOutAllVisible(false); signOut('global'); }}
        onCancel={() => setSignOutAllVisible(false)}
      />

      <ConfirmDialog
        visible={deleteVisible}
        title="Eliminar cuenta"
        message="Esta acción es permanente. Se borrarán tu perfil y tus datos, y no podrás recuperarlos."
        confirmLabel="Eliminar"
        destructive
        onConfirm={confirmDeleteAccount}
        onCancel={() => setDeleteVisible(false)}
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
  title: { flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  sectionLabel: {
    fontSize: 10.5, fontFamily: fonts.bold, color: colors.inkSoft,
    textTransform: 'uppercase', letterSpacing: 1.4,
    marginTop: 18, marginBottom: 4,
  },
  section: {
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14,
  },
  hint: {
    fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft,
    marginTop: 6, lineHeight: 16,
  },

  deleteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 4,
    paddingVertical: 13,
    borderWidth: 1, borderColor: 'rgba(214,69,43,0.5)',
    backgroundColor: 'rgba(214,69,43,0.06)',
  },
  deleteText: { fontSize: 14, fontFamily: fonts.bold, color: '#d6452b' },
});
