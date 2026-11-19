import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParticipants, useRoomContext } from '@livekit/react-native';
import { RoomEvent } from 'livekit-client';
import { listScreenShareParticipants } from '@/features/screen-share/services/screenShareSessionService';
import {
  readMicOk,
  readRoomPolicyFromParticipants,
  readSeatFlag,
  readSeatSlot,
  type RoomPolicyState,
  type SeatSlot,
} from '@/features/screen-share/services/seatModeration';
import type { ScreenShareParticipant } from '@/features/screen-share/types';

export type LoungeSeatMember = ScreenShareParticipant & {
  isSpeaking: boolean;
  micEnabled: boolean;
  seated: boolean;
  seatSlot: SeatSlot | null;
  micOk: boolean;
  isLeader: boolean;
};

const REFRESH_MS = 8_000;
/** Lider + 11 üye = 12 koltuk (1 üst + 4’erli satırlar) */
export const SCREEN_SHARE_MAX_SEATS = 12;
export const SCREEN_SHARE_LEADER_SEATS = 1;
export const SCREEN_SHARE_GRID_SEATS = SCREEN_SHARE_MAX_SEATS - SCREEN_SHARE_LEADER_SEATS;

/** Online üyeler + LiveKit konuşma/mik/koltuk/slot durumu. */
export function useScreenShareLoungeMembers(sessionId: string, hostUserId: string) {
  const room = useRoomContext();
  const liveParticipants = useParticipants();
  const [members, setMembers] = useState<ScreenShareParticipant[]>([]);
  const [membersReady, setMembersReady] = useState(false);
  const [attrTick, setAttrTick] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const rows = await listScreenShareParticipants(sessionId);
      setMembers(rows.filter((m) => m.isOnline && !m.kickedAt));
    } catch {
      // LiveKit yedek
    } finally {
      setMembersReady(true);
    }
  }, [sessionId]);

  useEffect(() => {
    setMembersReady(false);
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

  const policy: RoomPolicyState = useMemo(() => {
    void attrTick;
    return readRoomPolicyFromParticipants(
      liveParticipants.map((p) => ({ identity: p.identity, attributes: p.attributes })),
      hostUserId,
    );
  }, [liveParticipants, hostUserId, attrTick]);

  const all: LoungeSeatMember[] = useMemo(() => {
    void attrTick;
    const byId = new Map(liveParticipants.map((p) => [p.identity, p]));
    const leaderId = policy.leaderId || hostUserId;
    const merged = members.map((m) => {
      const live = byId.get(m.userId);
      const seated = live ? readSeatFlag(live.attributes) === '1' : false;
      const seatSlot = live ? readSeatSlot(live.attributes) : null;
      return {
        ...m,
        isSpeaking: Boolean(live?.isSpeaking),
        micEnabled: live ? live.isMicrophoneEnabled : true,
        seated,
        seatSlot,
        micOk: live ? readMicOk(live.attributes) : policy.micAuto,
        isLeader: m.userId === leaderId,
      };
    });

    if (membersReady) {
      for (const live of liveParticipants) {
        if (merged.some((m) => m.userId === live.identity)) continue;
        const seated = readSeatFlag(live.attributes) === '1';
        if (!seated) continue;
        const name = (live.name || '').trim();
        if (!name) continue;
        merged.push({
          userId: live.identity,
          username: name,
          fullName: live.name ?? null,
          avatarUrl: null,
          isHost: live.identity === hostUserId,
          isOnline: true,
          joinedAt: new Date().toISOString(),
          kickedAt: null,
          isSpeaking: live.isSpeaking,
          micEnabled: live.isMicrophoneEnabled,
          seated: true,
          seatSlot: readSeatSlot(live.attributes),
          micOk: readMicOk(live.attributes),
          isLeader: live.identity === leaderId,
        });
      }
    }

    merged.sort((a, b) => {
      if (a.isLeader !== b.isLeader) return a.isLeader ? -1 : 1;
      if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
      if (a.isSpeaking !== b.isSpeaking) return a.isSpeaking ? -1 : 1;
      return a.username.localeCompare(b.username, 'tr');
    });

    return merged;
  }, [members, liveParticipants, attrTick, membersReady, policy, hostUserId]);

  const seated = all.filter((m) => m.seated);

  // Lider koltuğu: ss_slot=L veya (slot yoksa) aktif lider
  const leader =
    seated.find((m) => m.seatSlot === 'L') ??
    seated.find((m) => m.isLeader) ??
    null;

  const occupiedGrid = new Map<number, LoungeSeatMember>();
  const unslotted: LoungeSeatMember[] = [];
  for (const m of seated) {
    if (leader && m.userId === leader.userId) continue;
    if (m.seatSlot != null && m.seatSlot !== 'L') {
      const idx = Number(m.seatSlot);
      if (!Number.isNaN(idx) && idx >= 0 && idx < SCREEN_SHARE_GRID_SEATS) {
        occupiedGrid.set(idx, m);
        continue;
      }
    }
    unslotted.push(m);
  }

  // Slot’suz oturanları boş grid hücrelerine yerleştir; sığmayanlar dinleyici
  const gridSeated: Array<LoungeSeatMember | null> = Array.from(
    { length: SCREEN_SHARE_GRID_SEATS },
    () => null,
  );
  for (const [idx, m] of occupiedGrid) {
    gridSeated[idx] = m;
  }
  const overflowSeated: LoungeSeatMember[] = [];
  for (const m of unslotted) {
    const emptyIdx = gridSeated.findIndex((x) => x == null);
    if (emptyIdx < 0) {
      overflowSeated.push(m);
      continue;
    }
    gridSeated[emptyIdx] = m;
  }

  const filledGrid = gridSeated.filter((m): m is LoungeSeatMember => m != null);
  const seats = leader ? [leader, ...filledGrid] : filledGrid;
  const listeners = [...all.filter((m) => !m.seated), ...overflowSeated];

  return {
    seats,
    leader,
    gridSeated,
    listeners,
    emptyGridSlots: gridSeated.filter((m) => m == null).length,
    leaderEmpty: !leader,
    memberCount: members.length || all.length,
    policy,
    all,
    refresh,
  };
}
