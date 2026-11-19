import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { OptimizedImage } from '@/components/media/OptimizedImage';
import { Text } from '@/components/ui/Text';
import { FollowButton } from '@/features/feed/components/FollowButton';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import { screenShareParticipantToFeedAuthor } from '@/features/screen-share/utils/participantToFeedAuthor';
import type { ScreenShareParticipant } from '@/features/screen-share/types';
import { navigateToPublicProfile } from '@/features/profile/services/profileNavigation';
import { fetchProfileById } from '@/features/profile/services/profileData';
import type { PublicProfile } from '@/features/profile/types';
import { useCloseModalOnRouteChange } from '@/hooks/useCloseModalOnRouteChange';
import { radius, spacing } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';

type Props = {
  participant: ScreenShareParticipant | null;
  onClose: () => void;
  isHostViewer?: boolean;
  /** Lider veya sahip — moderasyon */
  canModerate?: boolean;
  isOwnerViewer?: boolean;
  onHostMute?: (userId: string) => void;
  onHostStand?: (userId: string) => void;
  onHostKick?: (userId: string) => void;
  onGrantMic?: (userId: string) => void;
  onRevokeMic?: (userId: string) => void;
  onGrantScreen?: (userId: string) => void;
  onRevokeScreen?: (userId: string) => void;
  onAssignLeader?: (userId: string) => void;
  onClearLeader?: (userId: string) => void;
  targetIsLeader?: boolean;
};

/** Alttan yukarı kayan profil kartı — video avatar tıklanınca. */
export function ScreenShareProfileSheet({
  participant,
  onClose,
  isHostViewer = false,
  canModerate = false,
  isOwnerViewer = false,
  onHostMute,
  onHostStand,
  onHostKick,
  onGrantMic,
  onRevokeMic,
  onGrantScreen,
  onRevokeScreen,
  onAssignLeader,
  onClearLeader,
  targetIsLeader = false,
}: Props) {
  const visible = participant != null;
  const { colors } = useTheme();
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState(false);

  useCloseModalOnRouteChange(visible, onClose);

  useEffect(() => {
    if (!participant) {
      setProfile(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setProfile(null);
    void fetchProfileById(participant.userId).then((loaded) => {
      if (!alive) return;
      setProfile(loaded);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [participant?.userId]);

  const author = participant
    ? screenShareParticipantToFeedAuthor(participant, profile)
    : null;

  const openFullProfile = () => {
    if (!participant) return;
    onClose();
    navigateToPublicProfile({
      userId: participant.userId,
      businessId: profile?.businessId ?? null,
      viewerId: user?.id ?? null,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Kapat">
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, spacing.md),
              maxHeight: height * 0.72,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>Profil</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Kapat">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {loading && !author ? (
            <ActivityIndicator color={SCREEN_SHARE_ACCENT} style={{ marginVertical: 28 }} />
          ) : author ? (
            <ScrollView
              style={styles.bodyScroll}
              contentContainerStyle={styles.body}
              showsVerticalScrollIndicator
              bounces
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
            >
              <Pressable onPress={openFullProfile} style={styles.identity}>
                {author.avatarUrl ? (
                  <OptimizedImage
                    uri={author.avatarUrl}
                    style={styles.avatar}
                    tier="avatar"
                    recyclingKey={`ss-sheet-${author.id}`}
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.initial}>
                      {(author.username || '?').slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {author.fullName ?? author.username}
                </Text>
                <Text style={{ color: colors.textSecondary }}>@{author.username}</Text>
                {participant?.isHost ? (
                  <View style={styles.hostPill}>
                    <Text style={styles.hostText}>SAHİP</Text>
                  </View>
                ) : null}
                {targetIsLeader ? (
                  <View style={[styles.hostPill, { backgroundColor: 'rgba(232,200,114,0.22)' }]}>
                    <Text style={[styles.hostText, { color: '#E8C872' }]}>LİDER</Text>
                  </View>
                ) : null}
              </Pressable>

              {user?.id !== author.id ? (
                <FollowButton
                  authorId={author.id}
                  businessId={author.businessId}
                  username={author.username}
                  isFollowing={following}
                  onToggle={setFollowing}
                />
              ) : null}

              {(canModerate || isHostViewer || isOwnerViewer) &&
              user?.id !== author.id &&
              !participant?.isHost ? (
                <View style={styles.hostActions}>
                  {onAssignLeader && !targetIsLeader ? (
                    <Pressable
                      style={styles.hostActionBtn}
                      onPress={() => {
                        onAssignLeader(author.id);
                        onClose();
                      }}
                    >
                      <Ionicons name="diamond-outline" size={16} color="#E8C872" />
                      <Text style={[styles.hostActionText, { color: '#E8C872' }]}>
                        Lider yetkisi ver
                      </Text>
                    </Pressable>
                  ) : null}
                  {onClearLeader && targetIsLeader ? (
                    <Pressable
                      style={styles.hostActionBtn}
                      onPress={() => {
                        onClearLeader(author.id);
                        onClose();
                      }}
                    >
                      <Ionicons name="diamond" size={16} color="#E8C872" />
                      <Text style={[styles.hostActionText, { color: '#E8C872' }]}>
                        Lider yetkisini al
                      </Text>
                    </Pressable>
                  ) : null}
                  {onGrantMic ? (
                    <Pressable
                      style={styles.hostActionBtn}
                      onPress={() => {
                        onGrantMic(author.id);
                        onClose();
                      }}
                    >
                      <Ionicons name="mic" size={16} color="#F4F7FB" />
                      <Text style={styles.hostActionText}>Mik izni ver</Text>
                    </Pressable>
                  ) : null}
                  {onRevokeMic ? (
                    <Pressable
                      style={styles.hostActionBtn}
                      onPress={() => {
                        onRevokeMic(author.id);
                        onClose();
                      }}
                    >
                      <Ionicons name="mic-off" size={16} color="#F4F7FB" />
                      <Text style={styles.hostActionText}>Mik iznini al</Text>
                    </Pressable>
                  ) : null}
                  {onGrantScreen ? (
                    <Pressable
                      style={styles.hostActionBtn}
                      onPress={() => {
                        onGrantScreen(author.id);
                        onClose();
                      }}
                    >
                      <Ionicons name="desktop-outline" size={16} color="#F4F7FB" />
                      <Text style={styles.hostActionText}>Ekran izni ver</Text>
                    </Pressable>
                  ) : null}
                  {onRevokeScreen ? (
                    <Pressable
                      style={styles.hostActionBtn}
                      onPress={() => {
                        onRevokeScreen(author.id);
                        onClose();
                      }}
                    >
                      <Ionicons name="desktop" size={16} color="#F4F7FB" />
                      <Text style={styles.hostActionText}>Ekran iznini al</Text>
                    </Pressable>
                  ) : null}
                  {onHostMute ? (
                    <Pressable
                      style={styles.hostActionBtn}
                      onPress={() => {
                        onHostMute(author.id);
                        onClose();
                      }}
                    >
                      <Ionicons name="volume-mute" size={16} color="#F4F7FB" />
                      <Text style={styles.hostActionText}>Sessize al</Text>
                    </Pressable>
                  ) : null}
                  {onHostStand ? (
                    <Pressable
                      style={styles.hostActionBtn}
                      onPress={() => {
                        onHostStand(author.id);
                        onClose();
                      }}
                    >
                      <Ionicons name="arrow-down-circle-outline" size={16} color="#F4F7FB" />
                      <Text style={styles.hostActionText}>Koltuktan indir</Text>
                    </Pressable>
                  ) : null}
                  {isOwnerViewer && onHostKick ? (
                    <Pressable
                      style={[styles.hostActionBtn, styles.hostActionDanger]}
                      onPress={() => {
                        onHostKick(author.id);
                        onClose();
                      }}
                    >
                      <Ionicons name="ban-outline" size={16} color="#FF8A80" />
                      <Text style={[styles.hostActionText, { color: '#FF8A80' }]}>Odadan at</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}

              <Pressable onPress={openFullProfile} style={styles.viewProfile}>
                <Text style={{ color: SCREEN_SHARE_ACCENT, fontWeight: '700' }}>
                  Profili görüntüle
                </Text>
                <Ionicons name="chevron-forward" size={16} color={SCREEN_SHARE_ACCENT} />
              </Pressable>
            </ScrollView>
          ) : (
            <Text style={{ color: colors.danger, textAlign: 'center', marginVertical: 24 }}>
              Profil bulunamadı
            </Text>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.md,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 999,
    marginBottom: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 16, fontWeight: '800' },
  bodyScroll: { flexGrow: 0, flexShrink: 1 },
  body: { alignItems: 'center', gap: spacing.md, paddingBottom: spacing.sm },
  identity: { alignItems: 'center', gap: spacing.xs, width: '100%' },
  avatar: {
    width: 76,
    height: 76,
    borderRadius: 38,
    marginBottom: spacing.xs,
  },
  avatarFallback: {
    backgroundColor: `${SCREEN_SHARE_ACCENT}33`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { color: SCREEN_SHARE_ACCENT, fontWeight: '800', fontSize: 28 },
  name: { fontSize: 20, fontWeight: '800' },
  hostPill: {
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: `${SCREEN_SHARE_ACCENT}28`,
  },
  hostText: { color: SCREEN_SHARE_ACCENT, fontWeight: '800', fontSize: 11, letterSpacing: 1 },
  viewProfile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: spacing.sm,
  },
  hostActions: {
    width: '100%',
    gap: 8,
  },
  hostActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  hostActionDanger: {
    backgroundColor: 'rgba(198,40,40,0.18)',
  },
  hostActionText: {
    color: '#F4F7FB',
    fontWeight: '700',
    fontSize: 14,
  },
});
