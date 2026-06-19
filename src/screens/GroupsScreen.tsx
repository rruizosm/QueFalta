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
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useProfile } from '../context/ProfileContext';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { FREE_LIMITS, limitsApply } from '../constants/limits';
import { fetchMyGroups, createGroup, type GroupSummary } from '../api/groups';
import MemberAvatars from '../components/MemberAvatars';
import HardShadow from '../components/HardShadow';
import NameInputSheet from '../components/NameInputSheet';
import PaywallModal from '../components/PaywallModal';

export default function GroupsScreen() {
  const styles = useThemedStyles(themedStyles);
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const { isActive, activateCart, deactivateCart, busy } = useCart();
  const { isPremium } = useProfile();
  const toast = useToast();
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [modalVisible, setModalVisible] = useState(false);
  const [creating, setCreating] = useState(false);
  const [paywallVisible, setPaywallVisible] = useState(false);

  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setError(false);
    return fetchMyGroups()
      .then(setGroups)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const handleToggleActive = async (group: GroupSummary) => {
    const wasActive = isActive(group.id);
    setActivatingId(group.id);
    try {
      if (wasActive) await deactivateCart();
      else await activateCart(group.id, group.name);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      toast.show(wasActive ? t('banner.deactivated') : t('banner.activated', { group: group.name }));
    } finally {
      setActivatingId(null);
    }
  };

  // Gate free (Fase 2 MONETIZACION.md): solo cuentan los grupos CREADOS por el
  // usuario (createdBy, igual que el trigger del servidor); ser miembro de
  // grupos ajenos no cuenta y unirse por invitación es siempre ilimitado.
  const handleNewGroup = () => {
    const createdCount = groups.filter((g) => g.createdBy === userId).length;
    if (limitsApply(isPremium) && createdCount >= FREE_LIMITS.maxCreatedGroups) {
      setPaywallVisible(true);
      return;
    }
    setModalVisible(true);
  };

  const handleCreate = async (name: string) => {
    if (!userId) return;
    setCreating(true);
    try {
      await createGroup(name, userId);
      setModalVisible(false);
      setLoading(true);
      load();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('group.created', { name }));
    } catch (e: any) {
      // Trigger groups_enforce_limit (paywall_gates.sql): el estado local iba
      // por detrás del servidor → paywall en vez de error genérico.
      if (typeof e?.message === 'string' && e.message.includes('free_group_limit')) {
        setModalVisible(false);
        setPaywallVisible(true);
      } else {
        setError(true);
        toast.show(t('group.createError'), 'error');
      }
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
              {item.ownerId === userId && (
                <View style={styles.ownerBadge}>
                  <Text style={styles.ownerBadgeText}>{t('group.ownerBadge')}</Text>
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
            {item.members.length} {item.members.length === 1 ? t('group.member') : t('group.members')}
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
                  {active ? t('group.cartActive') : t('group.activate')}
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
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      <View style={styles.header}>
        <Text style={styles.title}>{t('group.title')}</Text>
        {/* Sin grupos, el CTA es el del estado vacío: no se duplica aquí. */}
        {groups.length > 0 && (
          <TouchableOpacity onPress={handleNewGroup}>
            <HardShadow style={{ backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Ionicons name="add" size={18} color={colors.white} />
              <Text style={styles.newBtnText}>{t('group.new')}</Text>
            </HardShadow>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 48 }} />
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={styles.emptyText}>{t('group.loadError')}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : groups.length === 0 ? (
        <View style={styles.centerBox}>
          <Ionicons name="people-outline" size={48} color={colors.inkFaint} />
          <Text style={styles.emptyTitle}>{t('group.emptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('group.emptyText')}</Text>
          <TouchableOpacity onPress={handleNewGroup}>
            <HardShadow style={{ backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingVertical: 11, marginTop: 8 }}>
              <Ionicons name="add" size={18} color={colors.white} />
              <Text style={styles.newBtnText}>{t('group.createCta')}</Text>
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
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
          }
        />
      )}

      {/* Create group — bottom sheet */}
      <NameInputSheet
        visible={modalVisible}
        title={t('group.newGroupTitle')}
        subtitle={t('group.newGroupSubtitle')}
        submitLabel={t('group.createCta')}
        busy={creating}
        onSubmit={handleCreate}
        onClose={() => setModalVisible(false)}
      />

      <PaywallModal
        visible={paywallVisible}
        onClose={() => setPaywallVisible(false)}
        subtitle={FREE_LIMITS.maxCreatedGroups === 1
          ? t('group.paywallLimitOne')
          : t('group.paywallLimitMany', { n: FREE_LIMITS.maxCreatedGroups })}
      />
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
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
});
