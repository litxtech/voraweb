import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { OptimizedImage } from '@/components/media/OptimizedImage';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import type { ScreenSharePreviewMember, ScreenShareSession } from '@/features/screen-share/types';
import { spacing } from '@/constants/theme';
import { shouldSkipUiBlur } from '@/lib/device/androidPerfProfile';

type Props = {
  room: ScreenShareSession;
  busy?: boolean;
  sample?: boolean;
  pinned?: boolean;
  onOpen: () => void;
  onDelete?: () => void;
  onSafety?: () => void;
};

const HOST_AVATAR = 52;
const AVATAR_SIZE = 22;
const AVATAR_OVERLAP = 8;

function PreviewAvatar({ member, index, total }: { member: ScreenSharePreviewMember; index: number; total: number }) {
  const initial = (member.username || '?').slice(0, 1).toUpperCase();
  return (
    <View
      style={[
        styles.avatarItem,
        {
          marginLeft: index === 0 ? 0 : -AVATAR_OVERLAP,
          zIndex: total - index,
        },
      ]}
    >
      {member.avatarUrl ? (
        <OptimizedImage
          uri={member.avatarUrl}
          style={styles.avatarImage}
          recyclingKey={member.userId}
          tier="avatar"
          layoutWidth={AVATAR_SIZE}
        />
      ) : (
        <View style={styles.avatarFallback}>
          <Text style={styles.avatarInitial}>{initial}</Text>
        </View>
      )}
    </View>
  );
}

/**
 * Açık oda = cam pencere: sahip avatarı + şifre/açık durumu net görünür.
 */
export function ScreenShareRoomWindow({
  room,
  busy,
  sample,
  pinned,
  onOpen,
  onDelete,
  onSafety,
}: Props) {
  const preview = (room.previewMembers ?? []).slice(0, 3);
  const fillUrl = room.coverImageUrl || room.hostAvatarUrl || null;
  const hostAvatar = room.hostAvatarUrl || null;
  const hostName = (room.hostUsername || 'host').replace(/^@/, '');
  const hostInitial = hostName.slice(0, 1).toUpperCase();
  const locked = Boolean(room.hasPassword);
  const hidden = Boolean(room.isHidden);

  return (
    <Pressable
      onPress={onOpen}
      onLongPress={onSafety}
      disabled={busy}
      style={({ pressed }) => [
        styles.outer,
        pinned && styles.outerPinned,
        pressed && styles.outerPressed,
        sample && styles.outerSample,
      ]}
    >
      <LinearGradient
        colors={
          sample
            ? [
                'rgba(180,160,255,0.35)',
                'rgba(91,140,255,0.3)',
                'rgba(255,255,255,0.1)',
                'rgba(0,194,168,0.22)',
              ]
            : [
                'rgba(255,255,255,0.28)',
                'rgba(0,194,168,0.35)',
                'rgba(255,255,255,0.08)',
                'rgba(120,160,255,0.22)',
              ]
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.rim}
      >
        <View style={styles.glassClip}>
          {fillUrl ? (
            <OptimizedImage
              uri={fillUrl}
              style={StyleSheet.absoluteFillObject}
              tier="grid"
              recyclingKey={`${room.id}-fill`}
            />
          ) : (
            <View style={styles.initialFill}>
              <Text style={styles.initialFillText}>{hostInitial}</Text>
            </View>
          )}

          {shouldSkipUiBlur() ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,12,18,0.55)' }]} />
          ) : (
            <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={['rgba(8,12,18,0.35)', 'rgba(8,12,18,0.55)', 'rgba(6,10,16,0.88)']}
            style={StyleSheet.absoluteFill}
          />

          <View style={styles.titleBar}>
            <View style={styles.traffic}>
              <View style={[styles.dot, { backgroundColor: '#FF5F57' }]} />
              <View style={[styles.dot, { backgroundColor: '#FEBC2E' }]} />
              <View style={[styles.dot, { backgroundColor: '#28C840' }]} />
            </View>
            <View style={styles.livePill}>
              <View style={[styles.liveDot, sample && styles.sampleDot]} />
              <Text style={styles.liveText}>{sample ? 'ÖRNEK' : 'CANLI'}</Text>
            </View>
            <View style={[styles.lockBadge, locked || hidden ? styles.lockBadgeOn : styles.lockBadgeOff]}>
              <Ionicons
                name={hidden ? 'eye-off' : locked ? 'lock-closed' : 'lock-open-outline'}
                size={11}
                color={locked || hidden ? '#FFD28A' : SCREEN_SHARE_ACCENT}
              />
              <Text style={[styles.lockBadgeText, locked || hidden ? styles.lockBadgeTextOn : styles.lockBadgeTextOff]}>
                {hidden ? 'Gizli' : locked ? 'Şifreli' : 'Açık'}
              </Text>
            </View>
            {onSafety ? (
              <Pressable onPress={onSafety} hitSlop={8} style={styles.deleteHit}>
                <Ionicons name="ellipsis-horizontal" size={14} color="rgba(255,255,255,0.55)" />
              </Pressable>
            ) : null}
            {room.isHost && onDelete ? (
              <Pressable onPress={onDelete} hitSlop={8} style={styles.deleteHit}>
                {busy ? (
                  <ActivityIndicator color="#FF8A80" size="small" />
                ) : (
                  <Ionicons name="trash-outline" size={14} color="rgba(255,255,255,0.55)" />
                )}
              </Pressable>
            ) : !onSafety ? (
              <View style={styles.deleteHit} />
            ) : null}
          </View>

          <View style={styles.body}>
            <View style={styles.hostRow}>
              <View style={styles.hostAvatarWrap}>
                {hostAvatar ? (
                  <OptimizedImage
                    uri={hostAvatar}
                    style={styles.hostAvatar}
                    tier="avatar"
                    recyclingKey={`ss-host-${room.hostUserId}`}
                    layoutWidth={HOST_AVATAR}
                  />
                ) : (
                  <View style={[styles.hostAvatar, styles.hostAvatarFallback]}>
                    <Text style={styles.hostInitial}>{hostInitial}</Text>
                  </View>
                )}
                <View style={styles.hostCrown}>
                  <Ionicons name="diamond" size={9} color="#1A1408" />
                </View>
              </View>
              <View style={styles.hostCopy}>
                <Text style={styles.hostLabel}>ODA SAHİBİ</Text>
                <Text style={styles.hostName} numberOfLines={1}>
                  @{hostName}
                </Text>
              </View>
            </View>

            <Text style={styles.title} numberOfLines={2}>
              {room.title}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {room.joinCode}
              {room.isHost ? ' · Host' : ''}
            </Text>
          </View>

          <View style={styles.footer}>
            <View style={styles.avatarStack}>
              {preview.length > 0 ? (
                preview.map((member, index) => (
                  <PreviewAvatar
                    key={member.userId}
                    member={member}
                    index={index}
                    total={preview.length}
                  />
                ))
              ) : (
                <View style={styles.avatarEmpty}>
                  <Ionicons name="people-outline" size={12} color="rgba(154,168,188,0.85)" />
                </View>
              )}
            </View>
            <Text style={styles.countText} numberOfLines={1}>
              {room.participantCount} kişi
            </Text>
          </View>
        </View>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: '50%',
    paddingHorizontal: 5,
    marginBottom: spacing.md,
    minHeight: 236,
    borderRadius: 20,
    shadowColor: '#00C2A8',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  outerPinned: {
    width: '100%',
    paddingHorizontal: 0,
    minHeight: 248,
  },
  outerSample: {
    shadowColor: '#7B8CFF',
    shadowOpacity: 0.14,
  },
  outerPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  rim: {
    flex: 1,
    borderRadius: 20,
    padding: 1.2,
  },
  glassClip: {
    flex: 1,
    borderRadius: 18.5,
    overflow: 'hidden',
    backgroundColor: 'rgba(12,16,24,0.45)',
    minHeight: 230,
  },
  initialFill: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,194,168,0.18)',
  },
  initialFillText: {
    color: 'rgba(232,255,249,0.55)',
    fontSize: 64,
    fontWeight: '900',
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.22)',
    gap: 6,
  },
  traffic: { flexDirection: 'row', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  livePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#FF3B30',
  },
  sampleDot: {
    backgroundColor: '#8B9DFF',
  },
  liveText: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  lockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  lockBadgeOn: {
    backgroundColor: 'rgba(255,210,138,0.16)',
    borderColor: 'rgba(255,210,138,0.4)',
  },
  lockBadgeOff: {
    backgroundColor: 'rgba(0,194,168,0.14)',
    borderColor: 'rgba(0,194,168,0.35)',
  },
  lockBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  lockBadgeTextOn: { color: '#FFD28A' },
  lockBadgeTextOff: { color: SCREEN_SHARE_ACCENT },
  deleteHit: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 8,
    paddingHorizontal: spacing.sm + 4,
    paddingTop: 12,
    paddingBottom: 8,
    justifyContent: 'flex-end',
  },
  hostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  hostAvatarWrap: {
    width: HOST_AVATAR,
    height: HOST_AVATAR,
  },
  hostAvatar: {
    width: HOST_AVATAR,
    height: HOST_AVATAR,
    borderRadius: HOST_AVATAR / 2,
    borderWidth: 2,
    borderColor: 'rgba(232,200,114,0.7)',
  },
  hostAvatarFallback: {
    backgroundColor: 'rgba(0,194,168,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hostInitial: {
    color: '#E8FFF9',
    fontSize: 20,
    fontWeight: '800',
  },
  hostCrown: {
    position: 'absolute',
    right: -2,
    top: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E8C872',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(8,12,18,0.9)',
  },
  hostCopy: { flex: 1, gap: 1, minWidth: 0 },
  hostLabel: {
    color: 'rgba(232,200,114,0.85)',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  hostName: {
    color: '#F4F7FB',
    fontSize: 13,
    fontWeight: '700',
  },
  title: {
    color: '#F4F7FB',
    fontWeight: '800',
    fontSize: 15,
    lineHeight: 19,
    letterSpacing: -0.2,
  },
  meta: {
    color: 'rgba(200,214,230,0.88)',
    fontSize: 11.5,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.sm + 4,
    paddingBottom: 12,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  avatarStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarItem: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(8,12,18,0.95)',
    overflow: 'hidden',
    backgroundColor: 'rgba(28,40,56,0.95)',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,194,168,0.22)',
  },
  avatarInitial: {
    color: '#E8FFF9',
    fontSize: 10,
    fontWeight: '800',
  },
  avatarEmpty: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  countText: {
    color: 'rgba(220,230,242,0.95)',
    fontSize: 12,
    fontWeight: '700',
    flexShrink: 1,
  },
});
