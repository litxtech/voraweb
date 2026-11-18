import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParticipants, useRoomContext } from '@livekit/react-native';
import { RoomEvent } from 'livekit-client';
import { listScreenShareParticipants } from '@/features/screen-share/services/screenShareSessionService';
import { readSeatFlag } from '@/features/screen-share/services/seatModeration';
import type { ScreenShareParticipant } from '@/features/screen-share/types';

export type LoungeSeatMember = ScreenShareParticipant & {
  isSpeaking: boolean;
  micEnabled: boolean;
  seated: boolean;
};

const REFRESH_MS = 8_000;
const MAX_SEATS = 8;

/** Online üyeler + LiveKit konuşma/mik/koltuk durumu. */
export function useScreenShareLoungeMembers(sessionId: string) {
  const room = useRoomContext();
  const liveParticipants = useParticipants();
  const [members, setMembers] = useState<ScreenShareParticipant[]>([]);
  const [attrTick, setAttrTick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const rows = await listScreenShareParticipants(sessionId);
      setMembers(rows.filter((m) => m.isOnline && !m.kickedAt));
    } catch {
      // LiveKit yedek
    }
  }, [sessionId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!room) return;
    const bump = () => void refresh();
    const bumpAttr = () => setAttrTick((n) => n + 1);
    room.on(RoomEvent.ParticipantConnected, bump);
    room.on(RoomEvent.ParticipantDisconnected, bump);
    room.on(RoomEvent.ParticipantAttributesChanged, bumpAttr);
    return () => {
      room.off(RoomEvent.ParticipantConnected, bump);
      room.off(RoomEvent.ParticipantDisconnected, bump);
      room.off(RoomEvent.ParticipantAttributesChanged, bumpAttr);
    };
  }, [room, refresh]);

  const all: LoungeSeatMember[] = useMemo(() => {
    void attrTick;
    const byId = new Map(liveParticipants.map((p) => [p.identity, p]));
    const merged = members.map((m) => {
      const live = byId.get(m.userId);
      return {
        ...m,
        isSpeaking: Boolean(live?.isSpeaking),
        micEnabled: live ? live.isMicrophoneEnabled : true,
        seated: readSeatFlag(live?.attributes) === '1',
      };
    });

    for (const live of liveParticipants) {
      if (merged.some((m) => m.userId === live.identity)) continue;
      const name = live.name || live.identity.slice(0, 8);
      merged.push({
        userId: live.identity,
        username: name,
        fullName: live.name ?? null,
        avatarUrl: null,
        isHost: false,
        isOnline: true,
        joinedAt: new Date().toISOString(),
        kickedAt: null,
        isSpeaking: live.isSpeaking,
        micEnabled: live.isMicrophoneEnabled,
        seated: readSeatFlag(live.attributes) === '1',
      });
    }

    merged.sort((a, b) => {
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
      if (a.isSpeaking !== b.isSpeaking) return a.isSpeaking ? -1 : 1;
      return a.username.localeCompare(b.username, 'tr');
    });

    return merged;
  }, [members, liveParticipants, attrTick]);

  const seats = all.filter((m) => m.seated).slice(0, MAX_SEATS);
  const listeners = all.filter((m) => !m.seated);
  const emptySlots = Math.max(0, Math.min(6, MAX_SEATS) - seats.length);

  return {
    seats,
    listeners,
    emptySlots,
    memberCount: members.length || all.length,
    refresh,
  };
}
