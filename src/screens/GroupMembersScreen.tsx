import { useCallback, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, StatusBar, ActivityIndicator, Modal, Pressable, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute, useFocusEffect, RouteProp } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';
import { fonts } from '../constants/typography';
import { GroupsStackParamList, type GroupMember } from '../types';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useToast } from '../context/ToastContext';
import { useThemedStyles } from '../context/ThemeContext';
import { useTranslation } from '../context/LanguageContext';
import { deleteGroup, fetchGroupDetail, removeGroupMember, renameGroup, transferGroupAdmin, type GroupSummary } from '../api/groups';
import { useHeaderTopPadding } from '../hooks/useHeaderTopPadding';
import { useTabBarBottomPadding } from '../hooks/useTabBarBottomPadding';
import { useReducedMotion } from '../hooks/useReducedMotion';
import ConfirmDialog from '../components/ConfirmDialog';
import UserAvatar from '../components/UserAvatar';
import VerifiedBadge from '../components/VerifiedBadge';
import NameInputSheet from '../components/NameInputSheet';
import GlassSurface, { glassAvailable } from '../components/GlassSurface';

type MembersRouteProp = RouteProp<GroupsStackParamList, 'GroupMembers'>;

export default function GroupMembersScreen() {
  const styles = useThemedStyles(themedStyles);
  const reducedMotion = useReducedMotion();
  const headerTop = useHeaderTopPadding(52);
  const bottomPad = useTabBarBottomPadding(40);
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigation = useNavigation<any>();
  const { groupId } = useRoute<MembersRouteProp>().params;
  const { session } = useAuth();
  const { activeCart, activateCart, deactivateCart } = useCart();
  const toast = useToast();
  const userId = session?.user.id ?? '';

  const [group, setGroup] = useState<GroupSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMember, setActionMember] = useState<GroupMember | null>(null);
  const [leaveVisible, setLeaveVisible] = useState(false);
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);

  const load = useCallback(() => {
    fetchGroupDetail(groupId)
      .then(setGroup)
      .catch(() => setGroup(null))
      .finally(() => setLoading(false));
  }, [groupId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const adminId = group?.ownerId ?? null;
  const isAdmin = !!adminId && adminId === userId;

  const doTransfer = async (member: GroupMember) => {
    setActionMember(null);
    setBusyId(member.id);
    try {
      await transferGroupAdmin(groupId, member.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('group.transferred', { name: member.name }));
      load();
    } catch {
      toast.show(t('group.transferError'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const doRemove = async (member: GroupMember) => {
    setActionMember(null);
    setBusyId(member.id);
    try {
      await removeGroupMember(groupId, member.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('group.removed', { name: member.name }));
      load();
    } catch {
      toast.show(t('group.removeError'), 'error');
    } finally {
      setBusyId(null);
    }
  };

  const confirmRename = async (name: string) => {
    if (!group) return;
    if (name === group.name) { setRenameVisible(false); return; }
    setRenaming(true);
    try {
      await renameGroup(groupId, name);
      setGroup({ ...group, name });
      // Refrescar el nombre cacheado en el carrito activo.
      if (activeCart?.groupId === groupId) await activateCart(groupId, name);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('group.renamed'));
      setRenameVisible(false);
    } catch {
      toast.show(t('group.renameError'), 'error');
    } finally {
      setRenaming(false);
    }
  };

  const confirmDelete = async () => {
    setDeleteVisible(false);
    setDeleting(true);
    try {
      await deleteGroup(groupId);
      // Limpiar referencias locales al grupo borrado.
      if (activeCart?.groupId === groupId) await deactivateCart();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('group.deleted'));
      navigation.navigate('GroupsHome');
    } catch {
      toast.show(t('group.deleteError'), 'error');
      setDeleting(false);
    }
  };

  const confirmLeave = async () => {
    setLeaveVisible(false);
    setBusyId(userId);
    try {
      await removeGroupMember(groupId, userId);
      if (activeCart?.groupId === groupId) await deactivateCart();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show(t('group.left'));
      navigation.navigate('GroupsHome');
    } catch {
      toast.show(t('group.leaveError'), 'error');
      setBusyId(null);
    }
  };

  const header = (
    <View style={[styles.header, { paddingTop: headerTop }]}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        style={glassAvailable ? styles.backBtnGlass : styles.backBtn}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back" size={22} color={colors.ink} />
      </TouchableOpacity>
      <Text style={styles.title}>{t('group.membersHeader')}</Text>
      <View style={{ width: 38 }} />
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
          style={{ marginTop: (glassAvailable ? headerHeight : 0) + 60 }}
        />
      ) : !group ? (
        <View style={[styles.centerBox, glassAvailable && { paddingTop: headerHeight }]}>
          <Text style={styles.emptyText}>{t('group.detailLoadError')}</Text>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: glassAvailable ? headerHeight + 8 : 0,
              paddingBottom: bottomPad,
            },
          ]}
        >
          <View style={styles.groupHero}>
            <View style={styles.groupNameRow}>
              <View style={styles.groupNameCopy}>
                <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
                <View style={styles.countPill}>
                  <Ionicons name="people-outline" size={13} color={colors.accent} />
                  <Text style={styles.countLabel}>
                    {group.members.length} {group.members.length === 1 ? t('group.member') : t('group.members')}
                  </Text>
                </View>
              </View>
              {isAdmin && (
                <TouchableOpacity onPress={() => setRenameVisible(true)} hitSlop={8} style={styles.renameBtn}>
                  <Ionicons name="create-outline" size={17} color={colors.accent} />
                </TouchableOpacity>
              )}
            </View>

            {isAdmin && (
              <TouchableOpacity
                style={styles.addBtn}
                activeOpacity={0.8}
                onPress={() => navigation.navigate('AddMember', { groupId })}
              >
                <Ionicons name="person-add-outline" size={17} color={colors.white} />
                <Text style={styles.addBtnText}>{t('group.addMember')}</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={styles.section}>
            {group.members.map((m, i) => {
              const isMemberAdmin = m.id === adminId;
              const isMe = m.id === userId;
              const canRemove = isAdmin && !isMemberAdmin;
              return (
                <View key={m.id} style={[styles.row, i < group.members.length - 1 && styles.rowBorder]}>
                  <UserAvatar avatarUrl={m.avatarUrl} initials={m.initials} color={m.color} size={38} />
                  <View style={styles.memberInfo}>
                    <View style={styles.memberNameRow}>
                      <Text style={styles.memberName} numberOfLines={1}>
                        {m.name}{isMe ? t('group.meSuffix') : ''}
                      </Text>
                      {m.verified ? <VerifiedBadge size={14} /> : null}
                    </View>
                    {isMemberAdmin && (
                      <View style={styles.adminBadge}>
                        <Ionicons name="star" size={10} color={colors.accent} />
                        <Text style={styles.adminBadgeText}>{t('group.adminBadge')}</Text>
                      </View>
                    )}
                  </View>
                  {canRemove && (
                    busyId === m.id ? (
                      <ActivityIndicator size="small" color={colors.inkSoft} />
                    ) : (
                      <TouchableOpacity onPress={() => setActionMember(m)} hitSlop={8} style={styles.removeBtn}>
                        <Ionicons name="ellipsis-horizontal" size={20} color={colors.inkSoft} />
                      </TouchableOpacity>
                    )
                  )}
                </View>
              );
            })}
          </View>

          {/* Leave / admin note */}
          {isAdmin ? (
            <>
              <Text style={styles.adminNote}>{t('group.adminNote')}</Text>
              <TouchableOpacity
                style={styles.leaveBtn}
                onPress={() => setDeleteVisible(true)}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#d6452b" />
                ) : (
                  <>
                    <Ionicons name="trash-outline" size={18} color="#d6452b" />
                    <Text style={styles.leaveText}>{t('group.deleteGroup')}</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.leaveBtn}
              onPress={() => setLeaveVisible(true)}
              disabled={busyId === userId}
            >
              {busyId === userId ? (
                <ActivityIndicator size="small" color="#d6452b" />
              ) : (
                <>
                  <Ionicons name="exit-outline" size={18} color="#d6452b" />
                  <Text style={styles.leaveText}>{t('group.leaveGroup')}</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* Member action sheet (app-styled, replaces native Alert menu) */}
      <Modal
        visible={!!actionMember}
        transparent
        animationType={reducedMotion ? 'none' : 'slide'}
        onRequestClose={() => setActionMember(null)}
      >
        <View style={styles.sheetRoot}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setActionMember(null)} />
          {actionMember && (
            <GlassSurface
              style={[styles.sheet, { paddingBottom: Platform.OS === 'ios' ? 30 : Math.max(insets.bottom, 20) }]}
              tintColor={colors.accentLight}
              fallbackColor={colors.paper}
            >
              <View style={styles.sheetHeader}>
                <UserAvatar avatarUrl={actionMember.avatarUrl} initials={actionMember.initials} color={actionMember.color} size={40} />
                <Text style={styles.sheetTitle} numberOfLines={1}>{actionMember.name}</Text>
                {actionMember.verified ? <VerifiedBadge size={16} /> : null}
              </View>

              <TouchableOpacity
                style={styles.sheetAction}
                activeOpacity={0.7}
                onPress={() => doTransfer(actionMember)}
              >
                <Ionicons name="star-outline" size={20} color={colors.accent} />
                <Text style={styles.sheetActionText}>{t('group.makeAdmin')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetAction}
                activeOpacity={0.7}
                onPress={() => doRemove(actionMember)}
              >
                <Ionicons name="person-remove-outline" size={20} color="#d6452b" />
                <Text style={[styles.sheetActionText, { color: '#d6452b' }]}>{t('group.removeFromGroup')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sheetCancel}
                activeOpacity={0.7}
                onPress={() => setActionMember(null)}
              >
                <Text style={styles.sheetCancelText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </GlassSurface>
          )}
        </View>
      </Modal>

      <ConfirmDialog
        visible={leaveVisible}
        title={t('group.leaveTitle')}
        message={t('group.leaveMessage', { name: group?.name ?? '' })}
        confirmLabel={t('group.leaveConfirm')}
        destructive
        onConfirm={confirmLeave}
        onCancel={() => setLeaveVisible(false)}
      />

      {/* Rename — bottom sheet (mismo patrón que "Nuevo grupo" en GroupsScreen) */}
      <NameInputSheet
        visible={renameVisible}
        title={t('group.renameTitle')}
        subtitle={t('group.renameSubtitle')}
        icon="pencil"
        initialValue={group?.name ?? ''}
        submitLabel={t('common.save')}
        submitIcon="checkmark"
        busy={renaming}
        onSubmit={confirmRename}
        onClose={() => setRenameVisible(false)}
      />

      <ConfirmDialog
        visible={deleteVisible}
        title={t('group.deleteTitle')}
        message={t('group.deleteMessage', { name: group?.name ?? '' })}
        confirmLabel={t('group.deleteConfirm')}
        destructive
        onConfirm={confirmDelete}
        onCancel={() => setDeleteVisible(false)}
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
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 10, gap: 10,
    // paddingTop inline (useHeaderTopPadding)
  },
  backBtn: {
    width: 38, height: 38,
    backgroundColor: colors.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.border, borderRadius: 19,
  },
  backBtnGlass: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.3 },

  scroll: { paddingHorizontal: 16, paddingBottom: 40 },

  groupHero: {
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border, borderRadius: 20,
    padding: 13, gap: 11, marginBottom: 10,
  },
  groupNameRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  groupNameCopy: { flex: 1, minWidth: 0, gap: 7 },
  groupName: { flexShrink: 1, fontSize: 20, fontFamily: fonts.bold, color: colors.ink, letterSpacing: -0.4 },
  renameBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.accentLight,
    alignItems: 'center', justifyContent: 'center',
  },
  countPill: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10,
    backgroundColor: colors.accentLight,
  },
  countLabel: { fontSize: 11.5, fontFamily: fonts.semibold, color: colors.accent },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 36, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 18, backgroundColor: colors.accent,
  },
  addBtnText: { fontSize: 13, fontFamily: fonts.bold, color: colors.white },

  section: {
    backgroundColor: colors.white,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: 12, borderRadius: 18, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 11 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  avatar: {
    width: 42, height: 42, borderRadius: 21,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: 15, fontFamily: fonts.bold, color: colors.white },
  memberInfo: { flex: 1, minWidth: 0, gap: 3 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center' },
  memberName: { flexShrink: 1, fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
  adminBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  adminBadgeText: { fontSize: 11, fontFamily: fonts.bold, color: colors.accent },
  removeBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surfaceAlt,
  },

  adminNote: {
    fontSize: 12.5, fontFamily: fonts.medium, color: colors.inkSoft,
    marginTop: 12, lineHeight: 18,
    paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: colors.surfaceAlt, borderRadius: 14,
  },
  leaveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, marginTop: 12,
    paddingVertical: 11, borderRadius: 17,
    borderWidth: 1, borderColor: 'rgba(214,69,43,0.5)',
    backgroundColor: 'rgba(214,69,43,0.06)',
  },
  leaveText: { fontSize: 14, fontFamily: fonts.bold, color: '#d6452b' },

  centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14, fontFamily: fonts.medium, color: colors.inkSoft },

  // ── Action sheet ──────────────────────────────────────────────
  sheetRoot: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    borderTopWidth: 1, borderTopColor: colors.border,
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    overflow: 'hidden',
    // paddingBottom inline: iOS 30 (como antes); Android, el inset del sistema.
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetAvatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  sheetAvatarText: { fontSize: 15, fontFamily: fonts.bold, color: colors.white },
  sheetTitle: { flex: 1, fontSize: 16, fontFamily: fonts.bold, color: colors.ink },
  sheetAction: {
    flexDirection: 'row', alignItems: 'center', gap: 13,
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetActionText: { fontSize: 15, fontFamily: fonts.semibold, color: colors.ink },
  sheetCancel: { alignItems: 'center', paddingVertical: 16, marginTop: 4 },
  sheetCancelText: { fontSize: 15, fontFamily: fonts.bold, color: colors.inkSoft },

  chrome: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20 },
  chromeGlass: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
});
