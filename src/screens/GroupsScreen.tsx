import { useCallback, useState } from 'react';
import { fonts } from '../constants/typography';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { fetchMyGroups, createGroup, type GroupSummary } from '../api/groups';
import MemberAvatars from '../components/MemberAvatars';
import HardShadow from '../components/HardShadow';

export default function GroupsScreen() {
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const { isActive, activateCart, deactivateCart, busy } = useCart();
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setError(false);
    fetchMyGroups()
      .then(setGroups)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleToggleActive = async (group: GroupSummary) => {
    setActivatingId(group.id);
    try {
      if (isActive(group.id)) await deactivateCart();
      else await activateCart(group.id, group.name);
    } finally {
      setActivatingId(null);
    }
  };

  const handleCreate = async () => {
    if (!newName.trim() || !userId) return;
    setCreating(true);
    try {
      await createGroup(newName, userId);
      setNewName('');
      setModalVisible(false);
      setLoading(true);
      load();
    } catch {
      setError(true);
    } finally {
      setCreating(false);
    }
  };

  const renderGroup = ({ item }: { item: GroupSummary }) => {
    const active = isActive(item.id);
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('GroupDetail', { groupId: item.id })}
        activeOpacity={0.85}
      >
        <HardShadow style={active ? { ...styles.card, ...styles.cardActive } : styles.card}>
          {/* Name + badge + chevron */}
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardName}>{item.name}</Text>
              {item.createdBy === userId && (
                <View style={styles.ownerBadge}>
                  <Text style={styles.ownerBadgeText}>Tuyo</Text>
                </View>
              )}
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.inkFaint} />
          </View>

          {/* Avatars + count */}
          {item.members.length > 0 && (
            <MemberAvatars members={item.members} maxVisible={4} size={30} />
          )}
          <Text style={styles.memberCount}>
            {item.members.length} {item.members.length === 1 ? 'miembro' : 'miembros'}
          </Text>

          {/* Activate button */}
          <TouchableOpacity
            style={[styles.activateBtn, active && styles.activateBtnActive]}
            onPress={() => handleToggleActive(item)}
            disabled={busy && activatingId === item.id}
            activeOpacity={0.85}
          >
            {busy && activatingId === item.id ? (
              <ActivityIndicator size="small" color={active ? colors.white : colors.accent} />
            ) : (
              <>
                <Ionicons
                  name={active ? 'checkmark' : 'cart-outline'}
                  size={15}
                  color={active ? colors.white : colors.accent}
                />
                <Text style={[styles.activateBtnText, active && styles.activateBtnTextActive]}>
                  {active ? 'Carrito activo' : 'Activar carrito'}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </HardShadow>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.paper} />

      <View style={styles.header}>
        <Text style={styles.title}>Grupos</Text>
        <TouchableOpacity onPress={() => setModalVisible(true)}>
          <HardShadow style={{ backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8 }}>
            <Ionicons name="add" size={18} color={colors.white} />
            <Text style={styles.newBtnText}>Nuevo</Text>
          </HardShadow>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>No se pudieron cargar los grupos.</Text>
          <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="people-outline" size={48} color={colors.inkFaint} />
          <Text style={styles.emptyTitle}>Aún no tienes grupos</Text>
          <Text style={styles.emptyText}>Crea uno para compartir listas de la compra.</Text>
          <TouchableOpacity onPress={() => setModalVisible(true)}>
            <HardShadow style={{ backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingVertical: 11, marginTop: 8 }}>
              <Ionicons name="add" size={18} color={colors.white} />
              <Text style={styles.newBtnText}>Crear grupo</Text>
            </HardShadow>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={renderGroup}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 14 }} />}
        />
      )}

      {/* Create group modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <HardShadow style={styles.modalCard}>
            <Text style={styles.modalTitle}>Nuevo grupo</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nombre del grupo"
              placeholderTextColor={colors.inkFaint}
              value={newName}
              onChangeText={setNewName}
              autoFocus
              maxLength={50}
              returnKeyType="done"
              onSubmitEditing={handleCreate}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => { setModalVisible(false); setNewName(''); }}
                disabled={creating}
              >
                <Text style={styles.modalBtnCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnConfirm, (!newName.trim() || creating) && styles.modalBtnDisabled]}
                onPress={handleCreate}
                disabled={!newName.trim() || creating}
              >
                {creating
                  ? <ActivityIndicator size="small" color={colors.white} />
                  : <Text style={styles.modalBtnConfirmText}>Crear</Text>}
              </TouchableOpacity>
            </View>
          </HardShadow>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 56, paddingBottom: 16,
  },
  title: { fontSize: 28, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },
  newBtnText: { color: colors.white, fontFamily: fonts.bold, fontSize: 13 },

  list: { paddingHorizontal: 16, paddingBottom: 24 },

  // ── Group card ────────────────────────────────────────────────
  card: { padding: 16, gap: 10 },
  cardActive: { borderColor: colors.accent },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  cardName: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink },
  ownerBadge: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  ownerBadgeText: { fontSize: 10.5, fontFamily: fonts.bold, color: colors.accent },
  memberCount: { fontSize: 12, fontFamily: fonts.medium, color: colors.inkSoft },

  activateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10,
    borderWidth: 1, borderColor: colors.accent,
  },
  activateBtnActive: { backgroundColor: colors.accent },
  activateBtnText: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.accent },
  activateBtnTextActive: { color: colors.white },

  // ── States ────────────────────────────────────────────────────
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink },
  emptyText: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center' },
  retryText: { fontSize: 14, fontFamily: fonts.bold, color: colors.accent },

  // ── Modal ─────────────────────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalCard: { width: '100%', padding: 22, gap: 14 },
  modalTitle: { fontSize: 19, fontFamily: fonts.bold, color: colors.ink },
  modalInput: {
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: fonts.medium, color: colors.ink,
  },
  modalActions: { flexDirection: 'row', gap: 10 },
  modalBtn: {
    flex: 1, paddingVertical: 13,
    alignItems: 'center', justifyContent: 'center',
  },
  modalBtnCancel: { borderWidth: 1, borderColor: colors.border },
  modalBtnCancelText: { fontSize: 14, fontFamily: fonts.semibold, color: colors.inkSoft },
  modalBtnConfirm: { backgroundColor: colors.accent },
  modalBtnConfirmText: { fontSize: 14, fontFamily: fonts.bold, color: colors.white },
  modalBtnDisabled: { opacity: 0.45 },
});
