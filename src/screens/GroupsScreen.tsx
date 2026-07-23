import { useCallback, useState, type ReactNode } from 'react';
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
import GlassSurface, { glassAvailable } from '../components/GlassSurface';
import { useTourAnchor } from '../context/GuidedTourContext';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';

// CTA "crear grupo" del estado vacío, con el ancla del tour (paso 1). Es un
// componente propio para que el ancla se monte/desmonte CON el botón: al crear
// el primer grupo el estado vacío desaparece y `clearOnUnmount` limpia el foco.
function EmptyCreateGroupButton({ label, onPress }: { label: string; onPress: () => void }) {
  const anchor = useTourAnchor('createGroup', { clearOnUnmount: true });
  // El ancla va en un View envolvente (patrón del resto de anclas del tour:
  // measureInWindow fiable sobre View, no sobre TouchableOpacity).
  return (
    <View ref={anchor.ref} collapsable={false} onLayout={anchor.onLayout} style={{ marginTop: 8 }}>
      <TouchableOpacity onPress={onPress}>
        <HardShadow style={{ backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16, paddingVertical: 11 }}>
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={{ color: colors.white, fontFamily: fonts.bold, fontSize: 13 }}>{label}</Text>
        </HardShadow>
      </TouchableOpacity>
    </View>
  );
}

// Botón "Activar carrito" del 1er grupo CON el ancla del tour (paso 1). MISMO
// motivo que arriba: el hook debe vivir DENTRO de un componente que se monte/
// desmonte con el botón, para que `clearOnUnmount` limpie el foco al borrar el
// grupo. Si el ancla se declara a nivel de pantalla, GroupsScreen no se desmonta
// (sigue en el tab) → el rect queda fantasma y el tour resalta un hueco vacío.
function ActivateCartAnchor({ children }: { children: ReactNode }) {
  const anchor = useTourAnchor('activateCart', { clearOnUnmount: true });
  return (
    <View ref={anchor.ref} collapsable={false} onLayout={anchor.onLayout}>
      {children}
    </View>
  );
}

export default function GroupsScreen() {
  const styles = useThemedStyles(themedStyles);
  const headerTop = useHeaderTopPadding(56);
  const bottomPad = useTabBarBottomPadding(24);
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
  const [headerHeight, setHeaderHeight] = useState(0);

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

  const renderGroup = ({ item, index }: { item: GroupSummary; index: number }) => {
    const active = isActive(item.id);
    // Activate button — el del PRIMER grupo lleva el ancla del tour (paso 1).
    const activateBtn = (
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
    );
    return (
      <TouchableOpacity
        onPress={() => navigation.navigate('GroupDetail', { groupId: item.id })}
        activeOpacity={0.85}
      >
        <View style={[styles.card, active && styles.cardActive]}>
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

          <View style={styles.cardFooter}>
            <View style={styles.memberMeta}>
              {item.members.length > 0 && (
                <MemberAvatars members={item.members} maxVisible={3} size={26} />
              )}
              <Text style={styles.memberCount}>
                {item.members.length} {item.members.length === 1 ? t('group.member') : t('group.members')}
              </Text>
            </View>

            {/* Activate button: el del 1er grupo va envuelto en el ancla del tour
                (componente propio → clearOnUnmount al borrar el grupo). */}
            {index === 0 ? <ActivateCartAnchor>{activateBtn}</ActivateCartAnchor> : activateBtn}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const header = (
    <View style={[styles.header, { paddingTop: headerTop }]}>
      <View style={styles.titleWrap}>
        <View style={styles.titleIcon}>
          <Ionicons name="people" size={18} color={colors.accent} />
        </View>
        <Text style={styles.title}>{t('group.title')}</Text>
      </View>
      {groups.length > 0 && (
        <TouchableOpacity onPress={handleNewGroup} style={styles.newBtn} activeOpacity={0.8}>
          <Ionicons name="add" size={18} color={colors.white} />
          <Text style={styles.newBtnText}>{t('group.new')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle={colors.statusBar} backgroundColor={colors.paper} />

      {!glassAvailable && header}

      {loading ? (
        <ActivityIndicator
          size="large"
          color={colors.accent}
          style={{ marginTop: (glassAvailable ? headerHeight : 0) + 48 }}
        />
      ) : error ? (
        <View style={[styles.centerBox, glassAvailable && { paddingTop: headerHeight }]}>
          <Text style={styles.emptyText}>{t('group.loadError')}</Text>
          <TouchableOpacity onPress={() => { setLoading(true); load(); }}>
            <Text style={styles.retryText}>{t('common.retry')}</Text>
          </TouchableOpacity>
        </View>
      ) : groups.length === 0 ? (
        // paddingBottom desplaza el bloque (icono + textos + "Crear grupo") un
        // poco hacia arriba respecto al centro vertical.
        <View style={[styles.centerBox, { paddingBottom: 160 }, glassAvailable && { paddingTop: headerHeight }]}>
          <Ionicons name="people-outline" size={48} color={colors.inkFaint} />
          <Text style={styles.emptyTitle}>{t('group.emptyTitle')}</Text>
          <Text style={styles.emptyText}>{t('group.emptyText')}</Text>
          {/* Componente propio para que el ancla del tour (spotlight sobre este
              CTA) se monte/desmonte CON el estado vacío: al crear el grupo
              desaparece y el ancla se limpia sola (clearOnUnmount). */}
          <EmptyCreateGroupButton label={t('group.createCta')} onPress={handleNewGroup} />
        </View>
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(item) => item.id}
          renderItem={renderGroup}
          contentContainerStyle={[
            styles.list,
            { paddingTop: glassAvailable ? headerHeight + 8 : 0, paddingBottom: bottomPad },
          ]}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
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

      {glassAvailable && (
        <View style={styles.chrome} onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
          <GlassSurface style={styles.chromeGlass} fallbackColor={colors.paper}>
            {header}
          </GlassSurface>
        </View>
      )}
    </View>
  );
}

const themedStyles = () => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    // paddingTop inline (useHeaderTopPadding)
  },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleIcon: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.accentLight,
  },
  title: { fontSize: 25, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.4 },
  newBtn: {
    minHeight: 34, paddingHorizontal: 11, borderRadius: 17,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    backgroundColor: colors.accent,
  },
  newBtnText: { color: colors.white, fontFamily: fonts.bold, fontSize: 13 },

  list: { paddingHorizontal: 16, paddingBottom: 24 },

  // ── Group card ────────────────────────────────────────────────
  card: {
    paddingHorizontal: 13, paddingVertical: 12, gap: 9,
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border, borderRadius: 18,
  },
  cardActive: { borderColor: colors.accent, backgroundColor: colors.accentLight },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  cardName: { fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  ownerBadge: {
    backgroundColor: colors.accentLight,
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8,
  },
  ownerBadgeText: { fontSize: 10.5, fontFamily: fonts.bold, color: colors.accent },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  memberMeta: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 8, minWidth: 0 },
  memberCount: { fontSize: 11.5, fontFamily: fonts.medium, color: colors.inkSoft },

  activateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, minHeight: 30, paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: colors.accent, borderRadius: 15,
  },
  activateBtnActive: { backgroundColor: colors.accent },
  activateBtnText: { fontSize: 12.5, fontFamily: fonts.bold, color: colors.accent },
  activateBtnTextActive: { color: colors.white },

  // ── States ────────────────────────────────────────────────────
  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 40 },
  emptyTitle: { fontSize: 17, fontFamily: fonts.bold, color: colors.ink },
  emptyText: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft, textAlign: 'center' },
  retryText: { fontSize: 14, fontFamily: fonts.bold, color: colors.accent },

  chrome: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  chromeGlass: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
