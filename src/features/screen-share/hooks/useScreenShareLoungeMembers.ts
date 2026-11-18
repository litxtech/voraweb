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
/** Lider + 11 üye = 12 koltuk (1 üst + 4’erli satırlar) */
export const SCREEN_SHARE_MAX_SEATS = 12;
export const SCREEN_SHARE_LEADER_SEATS = 1;
export const SCREEN_SHARE_GRID_SEATS = SCREEN_SHARE_MAX_SEATS - SCREEN_SHARE_LEADER_SEATS;
const MAX_SEATS = SCREEN_SHARE_MAX_SEATS;

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

  const seated = all.filter((m) => m.seated);
  const leader = seated.find((m) => m.isHost) ?? null;
  const gridPool = seated.filter((m) => !m.isHost);
  const gridSeated = gridPool.slice(0, SCREEN_SHARE_GRID_SEATS);
  const overflowSeated = gridPool.slice(SCREEN_SHARE_GRID_SEATS);
  /** Lider her zaman ilk; sonra ızgara — UI 12 slot doldurur */
  const seats = leader ? [leader, ...gridSeated] : gridSeated;
  const listeners = [...all.filter((m) => !m.seated), ...overflowSeated];
  const emptySlots = Math.max(0, MAX_SEATS - seats.length);
  const emptyGridSlots = Math.max(0, SCREEN_SHARE_GRID_SEATS - gridSeated.length);
  const leaderEmpty = !leader;

  return {
    seats,
    leader,
    gridSeated,
    listeners,
    emptySlots,
    emptyGridSlots,
    leaderEmpty,
    memberCount: members.length || all.length,
    refresh,
  };
}
