import { useCallback, useEffect, useState } from 'react';
import { useLocalParticipant, useRoomContext } from '@livekit/react-native';
import { ConnectionState, RoomEvent } from 'livekit-client';
import { kickScreenShareParticipant } from '@/features/screen-share/services/screenShareSessionService';
import { waitForRoomConnected } from '@/features/screen-share/services/waitForRoomConnected';
import {
  SCREEN_SHARE_MOD_TOPIC,
  SCREEN_SHARE_SEAT_ATTR,
  decodeSeatMod,
  encodeSeatMod,
  readSeatFlag,
} from '@/features/screen-share/services/seatModeration';
import { useAuth } from '@/providers/AuthProvider';

/** Koltuk in/çık + host mute/stand komutları (LiveKit attribute + data). */
export function useScreenShareSeatActions(sessionId: string) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const { user } = useAuth();
  const [iAmSeated, setIAmSeated] = useState(true);

  useEffect(() => {
    if (!room || !localParticipant) return;
    let cancelled = false;

    const ensureDefaultSeat = async () => {
      const ready = await waitForRoomConnected(room);
      if (cancelled || !ready) return;
      const current = localParticipant.attributes?.[SCREEN_SHARE_SEAT_ATTR];
      if (current == null) {
        try {
          await localParticipant.setAttributes({ [SCREEN_SHARE_SEAT_ATTR]: '1' });
          if (!cancelled) setIAmSeated(true);
        } catch {
          // bağlanırken yarış — Connected sonrası tekrar deneriz
        }
        return;
      }
      if (!cancelled) setIAmSeated(readSeatFlag(localParticipant.attributes) === '1');
    };

    void ensureDefaultSeat();
    const onConnected = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) void ensureDefaultSeat();
    };
    room.on(RoomEvent.ConnectionStateChanged, onConnected);
    return () => {
      cancelled = true;
      room.off(RoomEvent.ConnectionStateChanged, onConnected);
    };
  }, [room, localParticipant]);

  useEffect(() => {
    if (!room || !localParticipant || !user?.id) return;

    const syncSeat = () => {
      setIAmSeated(readSeatFlag(localParticipant.attributes) === '1');
    };

    const onData = (payload: Uint8Array, _p: unknown, _k: unknown, topic?: string) => {
      if (topic != null && topic !== SCREEN_SHARE_MOD_TOPIC) return;
      const msg = decodeSeatMod(payload);
      if (!msg || msg.targetUserId !== user.id) return;

      if (msg.action === 'force_mute') {
        void localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
      }
      if (msg.action === 'force_stand') {
        void localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
        void localParticipant
          .setAttributes({ [SCREEN_SHARE_SEAT_ATTR]: '0' })
          .then(() => setIAmSeated(false))
          .catch(() => undefined);
      }
    };

    room.on(RoomEvent.DataReceived, onData);
    room.on(RoomEvent.ParticipantAttributesChanged, syncSeat);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
      room.off(RoomEvent.ParticipantAttributesChanged, syncSeat);
    };
  }, [room, localParticipant, user?.id]);

  const leaveSeat = useCallback(async () => {
    if (!localParticipant || !room) return;
    const ready = await waitForRoomConnected(room);
    if (!ready) return;
    await localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    await localParticipant.setAttributes({ [SCREEN_SHARE_SEAT_ATTR]: '0' });
    setIAmSeated(false);
  }, [localParticipant, room]);

  const takeSeat = useCallback(async () => {
    if (!localParticipant || !room) return;
    const ready = await waitForRoomConnected(room);
    if (!ready) return;
    await localParticipant.setAttributes({ [SCREEN_SHARE_SEAT_ATTR]: '1' });
    setIAmSeated(true);
  }, [localParticipant, room]);

  const publishMod = useCallback(
    async (payload: Parameters<typeof encodeSeatMod>[0]) => {
      if (!room?.localParticipant) return;
      const ready = await waitForRoomConnected(room);
      if (!ready) return;
      await room.localParticipant.publishData(encodeSeatMod(payload), {
        reliable: true,
        topic: SCREEN_SHARE_MOD_TOPIC,
      });
    },
    [room],
  );

  const hostMute = useCallback(
    async (targetUserId: string) => {
      await publishMod({ v: 1, action: 'force_mute', targetUserId });
    },
    [publishMod],
  );

  const hostStand = useCallback(
    async (targetUserId: string) => {
      await publishMod({ v: 1, action: 'force_stand', targetUserId });
    },
    [publishMod],
  );

  const hostKick = useCallback(
    async (targetUserId: string) => {
      await kickScreenShareParticipant(sessionId, targetUserId);
    },
    [sessionId],
  );

  return { leaveSeat, takeSeat, hostMute, hostStand, hostKick, iAmSeated };
}
