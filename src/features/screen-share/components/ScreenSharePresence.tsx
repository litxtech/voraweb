import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useParticipants, useRoomContext } from '@livekit/react-native';
import { RoomEvent } from 'livekit-client';
import { OptimizedImage } from '@/components/media/OptimizedImage';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import { listScreenShareParticipants } from '@/features/screen-share/services/screenShareSessionService';
import type { ScreenShareParticipant } from '@/features/screen-share/types';
import { spacing } from '@/constants/theme';

type Props = {
  sessionId: string;
  /** true: video üzerine yarı saydam şerit */
  overlay?: boolean;
  onAvatarPress: (participant: ScreenShareParticipant) => void;
};

/** İzleyen / konuşan avatar şeridi — tıklanınca profil kartı açılır. */
export function ScreenSharePresence({ sessionId, overlay = false, onAvatarPress }: Props) {
  const room = useRoomContext();
  const liveParticipants = useParticipants();
  const [members, setMembers] = useState<ScreenShareParticipant[]>([]);

  const speakingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of liveParticipants) {
      if (p.isSpeaking) ids.add(p.identity);
    }
    return ids;
  }, [liveParticipants]);

  const refresh = useCallback(async () => {
    try {
      const rows = await listScreenShareParticipants(sessionId);
      setMembers(rows.filter((m) => m.isOnline && !m.kickedAt));
    } catch {
      // sessiz — LiveKit listesi yedek
    }
  }, [sessionId]);

  // Sürekli poll yok — yalnızca giriş + LiveKit join/leave (fatura).
  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!room) return;
    const bump = () => void refresh();
    room.on(RoomEvent.ParticipantConnected, bump);
    room.on(RoomEvent.ParticipantDisconnected, bump);
    return () => {
      room.off(RoomEvent.ParticipantConnected, bump);
      room.off(RoomEvent.ParticipantDisconnected, bump);
    };
  }, [room, refresh]);

  const ordered = useMemo(() => {
    const copy = [...members];
    copy.sort((a, b) => {
      const aSpeak = speakingIds.has(a.userId) ? 1 : 0;
      const bSpeak = speakingIds.has(b.userId) ? 1 : 0;
      if (aSpeak !== bSpeak) return bSpeak - aSpeak;
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
      return a.username.localeCompare(b.username, 'tr');
    });
    return copy;
  }, [members, speakingIds]);

  if (ordered.length === 0) {
    return null;
  }

  return (
    <View style={[styles.wrap, overlay ? styles.overlayWrap : null]} pointerEvents="box-none">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        keyboardShouldPersistTaps="handled"
      >
        {ordered.map((member) => {
          const speaking = speakingIds.has(member.userId);
          const initial = (member.username || '?').slice(0, 1).toUpperCase();
          return (
            <Pressable
              key={member.userId}
              onPress={() => onAvatarPress(member)}
              accessibilityRole="button"
              accessibilityLabel={`@${member.username} profili`}
              style={({ pressed }) => [styles.item, { opacity: pressed ? 0.85 : 1 }]}
            >
              <View
                style={[
                  styles.ring,
                  {
                    borderColor: speaking ? SCREEN_SHARE_ACCENT : 'rgba(255,255,255,0.35)',
                    borderWidth: speaking ? 2.5 : 1.5,
                  },
                ]}
              >
                {member.avatarUrl ? (
                  <OptimizedImage
                    uri={member.avatarUrl}
                    style={styles.avatar}
                    tier="avatar"
                    recyclingKey={`ss-av-${member.userId}`}
                  />
                ) : (
                  <View style={styles.fallback}>
                    <Text style={styles.initial}>{initial}</Text>
                  </View>
                )}
                {speaking ? <View style={styles.micDot} /> : null}
              </View>
              <Text style={styles.name} numberOfLines={1}>
                {member.isHost ? 'Host' : `@${member.username}`}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const AVATAR = 28;

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 2,
  },
  overlayWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 6,
    paddingHorizontal: spacing.xs,
    zIndex: 4,
  },
  row: {
    gap: 8,
    paddingHorizontal: spacing.xs,
    alignItems: 'center',
  },
  item: {
    alignItems: 'center',
    gap: 2,
    width: 44,
  },
  ring: {
    width: AVATAR + 4,
    height: AVATAR + 4,
    borderRadius: (AVATAR + 4) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
  },
  fallback: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: `${SCREEN_SHARE_ACCENT}40`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { color: '#fff', fontWeight: '800', fontSize: 11 },
  micDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: SCREEN_SHARE_ACCENT,
    borderWidth: 1.5,
    borderColor: '#05070A',
  },
  name: {
    color: '#E8EEF5',
    fontSize: 8,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
    maxWidth: 44,
    textAlign: 'center',
  },
});
