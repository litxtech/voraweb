import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useLocalParticipant, useParticipants, useRoomContext } from '@livekit/react-native';
import { ConnectionState, RoomEvent } from 'livekit-client';
import {
  kickScreenShareParticipant,
  setScreenShareRoomPolicy,
} from '@/features/screen-share/services/screenShareSessionService';
import { waitForRoomConnected } from '@/features/screen-share/services/waitForRoomConnected';
import {
  SCREEN_SHARE_LEADER_ID_ATTR,
  SCREEN_SHARE_LEADER_LOCK_ATTR,
  SCREEN_SHARE_MIC_AUTO_ATTR,
  SCREEN_SHARE_MIC_OK_ATTR,
  SCREEN_SHARE_MOD_TOPIC,
  SCREEN_SHARE_SCREEN_OK_ATTR,
  SCREEN_SHARE_SEAT_ATTR,
  SCREEN_SHARE_SLOT_ATTR,
  canClaimLeaderSeat,
  decodeSeatMod,
  encodeSeatMod,
  readMicOk,
  readRoomPolicyFromParticipants,
  readScreenOk,
  readSeatFlag,
  readSeatSlot,
  type SeatSlot,
} from '@/features/screen-share/services/seatModeration';
import { useAuth } from '@/providers/AuthProvider';

type Options = {
  sessionId: string;
  hostUserId: string;
};

function firstFreeGridSlot(
  participants: Array<{ identity: string; attributes?: Record<string, string> }>,
  selfId: string,
): SeatSlot | null {
  const used = new Set<string>();
  for (const p of participants) {
    if (p.identity === selfId) continue;
    if (readSeatFlag(p.attributes) !== '1') continue;
    const slot = readSeatSlot(p.attributes);
    if (slot != null && slot !== 'L') used.add(slot);
  }
  for (let i = 0; i <= 10; i++) {
    const key = String(i);
    if (!used.has(key)) return key as SeatSlot;
  }
  return null;
}

function isSlotTaken(
  participants: Array<{ identity: string; attributes?: Record<string, string> }>,
  slot: SeatSlot,
  selfId: string,
): boolean {
  return participants.some((p) => {
    if (p.identity === selfId) return false;
    if (readSeatFlag(p.attributes) !== '1') return false;
    return readSeatSlot(p.attributes) === slot;
  });
}

/** Koltuk seç / lider / mik onay + host mute-stand. */
export function useScreenShareSeatActions({ sessionId, hostUserId }: Options) {
  const room = useRoomContext();
  const { localParticipant } = useLocalParticipant();
  const liveParticipants = useParticipants();
  const { user } = useAuth();
  const [iAmSeated, setIAmSeated] = useState(false);
  const [mySlot, setMySlot] = useState<SeatSlot | null>(null);
  const [micOk, setMicOk] = useState(true);
  const [screenOk, setScreenOk] = useState(false);
  const [leaderLocked, setLeaderLocked] = useState(true);
  const [micAuto, setMicAuto] = useState(true);
  const [leaderId, setLeaderId] = useState(hostUserId);

  const syncLocal = useCallback(() => {
    if (!localParticipant) return;
    setIAmSeated(readSeatFlag(localParticipant.attributes) === '1');
    setMySlot(readSeatSlot(localParticipant.attributes));
    setMicOk(readMicOk(localParticipant.attributes));
    setScreenOk(readScreenOk(localParticipant.attributes));
    const policy = readRoomPolicyFromParticipants(
      liveParticipants.map((p) => ({ identity: p.identity, attributes: p.attributes })),
      hostUserId,
    );
    setLeaderLocked(policy.leaderLocked);
    setMicAuto(policy.micAuto);
    setLeaderId(policy.leaderId || hostUserId);
  }, [localParticipant, liveParticipants, hostUserId]);

  const isOwner = user?.id === hostUserId;
  const isLeader = Boolean(user?.id && user.id === leaderId);
  const canModerate = isOwner || isLeader;

  useEffect(() => {
    if (!room || !localParticipant || !user?.id) return;
    let cancelled = false;

    const bootAttrs = async () => {
      const ready = await waitForRoomConnected(room);
      if (cancelled || !ready) return;

      const attrs = { ...(localParticipant.attributes ?? {}) };
      const patch: Record<string, string> = {};
      const remotes = room.remoteParticipants
        ? Array.from(room.remoteParticipants.values())
        : [];
      const partsForPolicy = [
        { identity: localParticipant.identity, attributes: localParticipant.attributes },
        ...remotes.map((p) => ({
          identity: p.identity,
          attributes: p.attributes,
        })),
      ];

      const policy = readRoomPolicyFromParticipants(partsForPolicy, hostUserId);

      const leaderSeatTaken = remotes.some(
        (p) => readSeatFlag(p.attributes) === '1' && readSeatSlot(p.attributes) === 'L',
      );
      // Yalnızca ilk bağlanışta (seat henüz yok) otomatik oturt — sonra kullanıcı seçimini ezme
      const seatUnset =
        attrs[SCREEN_SHARE_SEAT_ATTR] == null || attrs[SCREEN_SHARE_SEAT_ATTR] === '';

      if (user.id === hostUserId) {
        if (attrs[SCREEN_SHARE_LEADER_ID_ATTR] == null) {
          patch[SCREEN_SHARE_LEADER_ID_ATTR] = hostUserId;
        }
        if (attrs[SCREEN_SHARE_LEADER_LOCK_ATTR] == null) {
          patch[SCREEN_SHARE_LEADER_LOCK_ATTR] = '1';
        }
        if (attrs[SCREEN_SHARE_MIC_AUTO_ATTR] == null) {
          patch[SCREEN_SHARE_MIC_AUTO_ATTR] = '1';
        }
        // İlk giriş + boş L → sahip lider koltuğuna oturur; sonradan grid/ayakta kalır
        if (seatUnset && !leaderSeatTaken) {
          patch[SCREEN_SHARE_SEAT_ATTR] = '1';
          patch[SCREEN_SHARE_SLOT_ATTR] = 'L';
          patch[SCREEN_SHARE_MIC_OK_ATTR] = '1';
          patch[SCREEN_SHARE_SCREEN_OK_ATTR] = '1';
        }
      } else {
        // Atanmış lider: yalnızca ilk girişte boş L'ye otur
        if (
          seatUnset &&
          user.id === policy.leaderId &&
          !leaderSeatTaken
        ) {
          patch[SCREEN_SHARE_SEAT_ATTR] = '1';
          patch[SCREEN_SHARE_SLOT_ATTR] = 'L';
          patch[SCREEN_SHARE_MIC_OK_ATTR] = '1';
          patch[SCREEN_SHARE_SCREEN_OK_ATTR] = '1';
        } else if (seatUnset) {
          // İlk giriş: ayakta bekle — kullanıcı koltuk seçsin
          patch[SCREEN_SHARE_SEAT_ATTR] = '0';
        }

        // Mik izni: auto ise ver; değilse sahibe/lidere ver, diğerlerine bekle
        if (attrs[SCREEN_SHARE_MIC_OK_ATTR] == null || attrs[SCREEN_SHARE_MIC_OK_ATTR] === '') {
          const autoOk = policy.micAuto || user.id === hostUserId || user.id === policy.leaderId;
          patch[SCREEN_SHARE_MIC_OK_ATTR] = autoOk ? '1' : '0';
          if (!autoOk) {
            void localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
          }
        }
      }

      if (Object.keys(patch).length > 0) {
        try {
          await localParticipant.setAttributes(patch);
          if (patch[SCREEN_SHARE_SLOT_ATTR] === 'L') {
            setIAmSeated(true);
            setMySlot('L');
            setMicOk(true);
            setScreenOk(true);
            if (user.id === hostUserId) {
              setLeaderId(hostUserId);
              void setScreenShareRoomPolicy(sessionId, { leaderUserId: user.id }).catch(
                () => undefined,
              );
            }
          }
        } catch {
          // bağlanırken yarış
        }
      }
      if (!cancelled) syncLocal();
    };

    void bootAttrs();
    const onConnected = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) void bootAttrs();
    };
    room.on(RoomEvent.ConnectionStateChanged, onConnected);
    return () => {
      cancelled = true;
      room.off(RoomEvent.ConnectionStateChanged, onConnected);
    };
    // syncLocal bilerek dep değil — her participant değişiminde L'ye geri basılmasın
    // eslint-disable-next-line react-hooks/exhaustive-deps -- boot once per connect identity
  }, [room, localParticipant, user?.id, hostUserId, sessionId]);

  useEffect(() => {
    if (!room || !localParticipant || !user?.id) return;

    const onData = (payload: Uint8Array, _p: unknown, _k: unknown, topic?: string) => {
      if (topic != null && topic !== SCREEN_SHARE_MOD_TOPIC) return;
      const msg = decodeSeatMod(payload);
      if (!msg) return;

      if (msg.action === 'room_policy') {
        syncLocal();
        return;
      }

      if (msg.targetUserId !== user.id && msg.targetUserId !== '*') return;

      if (msg.action === 'force_mute') {
        void localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
      }
      if (msg.action === 'force_stand') {
        void localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
        void localParticipant
          .setAttributes({
            [SCREEN_SHARE_SEAT_ATTR]: '0',
            [SCREEN_SHARE_SLOT_ATTR]: '',
          })
          .then(() => {
            setIAmSeated(false);
            setMySlot(null);
          })
          .catch(() => undefined);
      }
      if (msg.action === 'grant_mic') {
        void localParticipant
          .setAttributes({ [SCREEN_SHARE_MIC_OK_ATTR]: '1' })
          .then(() => setMicOk(true))
          .catch(() => undefined);
      }
      if (msg.action === 'revoke_mic') {
        void localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
        void localParticipant
          .setAttributes({ [SCREEN_SHARE_MIC_OK_ATTR]: '0' })
          .then(() => setMicOk(false))
          .catch(() => undefined);
      }
      if (msg.action === 'grant_screen') {
        void localParticipant
          .setAttributes({ [SCREEN_SHARE_SCREEN_OK_ATTR]: '1' })
          .then(() => setScreenOk(true))
          .catch(() => undefined);
      }
      if (msg.action === 'revoke_screen') {
        void localParticipant
          .setAttributes({ [SCREEN_SHARE_SCREEN_OK_ATTR]: '0' })
          .then(() => setScreenOk(false))
          .catch(() => undefined);
      }
      if (msg.action === 'assign_leader') {
        void localParticipant
          .setAttributes({
            [SCREEN_SHARE_SEAT_ATTR]: '1',
            [SCREEN_SHARE_SLOT_ATTR]: 'L',
            [SCREEN_SHARE_MIC_OK_ATTR]: '1',
            [SCREEN_SHARE_SCREEN_OK_ATTR]: '1',
          })
          .then(() => {
            setIAmSeated(true);
            setMySlot('L');
            setMicOk(true);
            setScreenOk(true);
          })
          .catch(() => undefined);
      }
      if (msg.action === 'clear_leader') {
        const free = firstFreeGridSlot(
          liveParticipants.map((p) => ({ identity: p.identity, attributes: p.attributes })),
          user.id,
        );
        void localParticipant
          .setAttributes({
            [SCREEN_SHARE_SEAT_ATTR]: free ? '1' : '0',
            [SCREEN_SHARE_SLOT_ATTR]: free ?? '',
          })
          .then(() => {
            setIAmSeated(Boolean(free));
            setMySlot(free);
          })
          .catch(() => undefined);
      }
      if (msg.action === 'take_slot' && 'slot' in msg) {
        // başka biri aynı slota geçti — çakışmada dinleyiciye düş
        const my = readSeatSlot(localParticipant.attributes);
        if (my === msg.slot && msg.targetUserId !== user.id) {
          void localParticipant
            .setAttributes({ [SCREEN_SHARE_SEAT_ATTR]: '0', [SCREEN_SHARE_SLOT_ATTR]: '' })
            .then(() => {
              setIAmSeated(false);
              setMySlot(null);
            })
            .catch(() => undefined);
        }
      }
    };

    const onAttr = () => syncLocal();
    room.on(RoomEvent.DataReceived, onData);
    room.on(RoomEvent.ParticipantAttributesChanged, onAttr);
    syncLocal();
    return () => {
      room.off(RoomEvent.DataReceived, onData);
      room.off(RoomEvent.ParticipantAttributesChanged, onAttr);
    };
  }, [room, localParticipant, user?.id, liveParticipants, syncLocal]);

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

  const leaveSeat = useCallback(async () => {
    if (!localParticipant || !room) return;
    const ready = await waitForRoomConnected(room);
    if (!ready) return;
    await localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
    await localParticipant.setAttributes({
      [SCREEN_SHARE_SEAT_ATTR]: '0',
      [SCREEN_SHARE_SLOT_ATTR]: '',
    });
    setIAmSeated(false);
    setMySlot(null);
  }, [localParticipant, room]);

  const takeSeatSlot = useCallback(
    async (slot: SeatSlot) => {
      if (!localParticipant || !room || !user?.id) return;
      const ready = await waitForRoomConnected(room);
      if (!ready) return;

      const parts = liveParticipants.map((p) => ({
        identity: p.identity,
        attributes: p.attributes,
      }));
      const policy = readRoomPolicyFromParticipants(parts, hostUserId);

      const amAdmin = user.id === hostUserId;
      const amLeader = canClaimLeaderSeat(user.id, hostUserId, policy.leaderId);

      if (slot === 'L') {
        // Kilitliyken: yalnızca admin / atanmış lider. Açıkken boşsa herkes oturabilir.
        if (!amLeader && policy.leaderLocked) {
          Alert.alert(
            'Lider koltuğu',
            'Lider koltuğu kilitli. Oturmak için lider yetkisi gerekir.',
          );
          return;
        }
        if (isSlotTaken(parts, 'L', user.id)) {
          Alert.alert('Lider koltuğu', 'Koltuk dolu');
          return;
        }
      } else if (isSlotTaken(parts, slot, user.id)) {
        Alert.alert('Koltuk', 'Bu koltuk dolu');
        return;
      }

      const claimingLeaderSeat = slot === 'L';

      await localParticipant.setAttributes({
        [SCREEN_SHARE_SEAT_ATTR]: '1',
        [SCREEN_SHARE_SLOT_ATTR]: slot,
        ...(policy.micAuto || amAdmin || amLeader || claimingLeaderSeat
          ? { [SCREEN_SHARE_MIC_OK_ATTR]: '1' }
          : {}),
        ...(amAdmin || amLeader || claimingLeaderSeat
          ? { [SCREEN_SHARE_SCREEN_OK_ATTR]: '1' }
          : {}),
      });

      if (claimingLeaderSeat) {
        if (amAdmin) {
          await localParticipant.setAttributes({
            [SCREEN_SHARE_LEADER_ID_ATTR]: user.id,
          });
        }
        await setScreenShareRoomPolicy(sessionId, { leaderUserId: user.id }).catch(() => undefined);
        await publishMod({
          v: 1,
          action: 'room_policy',
          targetUserId: '*',
          leaderId: user.id,
        });
        setLeaderId(user.id);
      }

      await publishMod({ v: 1, action: 'take_slot', targetUserId: user.id, slot });
      setIAmSeated(true);
      setMySlot(slot);
      if (policy.micAuto || amAdmin || amLeader || claimingLeaderSeat) setMicOk(true);
      if (amAdmin || amLeader || claimingLeaderSeat) setScreenOk(true);
    },
    [localParticipant, room, user?.id, liveParticipants, hostUserId, sessionId, publishMod],
  );

  const takeSeat = useCallback(async () => {
    if (!user?.id) return;
    const parts = liveParticipants.map((p) => ({
      identity: p.identity,
      attributes: p.attributes,
    }));
    const free = firstFreeGridSlot(parts, user.id);
    if (!free) {
      Alert.alert('Koltuk', 'Boş koltuk kalmadı');
      return;
    }
    await takeSeatSlot(free);
  }, [liveParticipants, user?.id, takeSeatSlot]);

  const hostMute = useCallback(
    async (targetUserId: string) => {
      if (!canModerate) return;
      await publishMod({ v: 1, action: 'force_mute', targetUserId });
    },
    [publishMod, canModerate],
  );

  const hostStand = useCallback(
    async (targetUserId: string) => {
      if (!isOwner && !isLeader) return;
      await publishMod({ v: 1, action: 'force_stand', targetUserId });
    },
    [publishMod, isOwner, isLeader],
  );

  const hostKick = useCallback(
    async (targetUserId: string) => {
      if (!isOwner) return;
      await kickScreenShareParticipant(sessionId, targetUserId);
    },
    [sessionId, isOwner],
  );

  const grantMic = useCallback(
    async (targetUserId: string) => {
      if (!canModerate) return;
      await publishMod({ v: 1, action: 'grant_mic', targetUserId });
    },
    [publishMod, canModerate],
  );

  const revokeMic = useCallback(
    async (targetUserId: string) => {
      if (!canModerate) return;
      await publishMod({ v: 1, action: 'revoke_mic', targetUserId });
    },
    [publishMod, canModerate],
  );

  const grantScreen = useCallback(
    async (targetUserId: string) => {
      if (!canModerate) return;
      await publishMod({ v: 1, action: 'grant_screen', targetUserId });
    },
    [publishMod, canModerate],
  );

  const revokeScreen = useCallback(
    async (targetUserId: string) => {
      if (!canModerate) return;
      await publishMod({ v: 1, action: 'revoke_screen', targetUserId });
    },
    [publishMod, canModerate],
  );

  const assignLeader = useCallback(
    async (targetUserId: string) => {
      if (!canModerate || !localParticipant || !user?.id) return;
      const ready = await waitForRoomConnected(room!);
      if (!ready) return;

      // Mevcut lider koltuğundaysak grid’e in
      if (readSeatSlot(localParticipant.attributes) === 'L') {
        const free = firstFreeGridSlot(
          liveParticipants.map((p) => ({ identity: p.identity, attributes: p.attributes })),
          user.id,
        );
        await localParticipant.setAttributes({
          [SCREEN_SHARE_SEAT_ATTR]: free ? '1' : '0',
          [SCREEN_SHARE_SLOT_ATTR]: free ?? '',
        });
        setMySlot(free);
        setIAmSeated(Boolean(free));
      }

      if (user.id === hostUserId) {
        await localParticipant.setAttributes({
          [SCREEN_SHARE_LEADER_ID_ATTR]: targetUserId,
        });
        await setScreenShareRoomPolicy(sessionId, { leaderUserId: targetUserId }).catch(
          () => undefined,
        );
      }

      await publishMod({ v: 1, action: 'assign_leader', targetUserId });
      await publishMod({
        v: 1,
        action: 'room_policy',
        targetUserId: '*',
        leaderId: targetUserId,
      });
      setLeaderId(targetUserId);
    },
    [
      canModerate,
      localParticipant,
      user?.id,
      room,
      liveParticipants,
      hostUserId,
      sessionId,
      publishMod,
    ],
  );

  const clearLeader = useCallback(
    async (targetUserId: string) => {
      if (!isOwner || !localParticipant) return;
      await localParticipant.setAttributes({
        [SCREEN_SHARE_LEADER_ID_ATTR]: hostUserId,
      });
      await setScreenShareRoomPolicy(sessionId, { clearLeader: true }).catch(() => undefined);
      await publishMod({ v: 1, action: 'clear_leader', targetUserId });
      await publishMod({
        v: 1,
        action: 'room_policy',
        targetUserId: '*',
        leaderId: hostUserId,
      });
      setLeaderId(hostUserId);
    },
    [isOwner, localParticipant, hostUserId, sessionId, publishMod],
  );

  const setLeaderLock = useCallback(
    async (locked: boolean) => {
      // Oda admini veya lider kilitleyebilir
      if (!canModerate || !localParticipant || !user?.id) return;
      if (user.id === hostUserId) {
        await localParticipant.setAttributes({
          [SCREEN_SHARE_LEADER_LOCK_ATTR]: locked ? '1' : '0',
        });
      } else {
        // Lider: host attr’ına data ile yazdır
        await publishMod({
          v: 1,
          action: 'room_policy',
          targetUserId: hostUserId,
          leaderLocked: locked,
        });
      }
      await setScreenShareRoomPolicy(sessionId, { leaderLocked: locked }).catch(() => undefined);
      await publishMod({
        v: 1,
        action: 'room_policy',
        targetUserId: '*',
        leaderLocked: locked,
      });
      setLeaderLocked(locked);
    },
    [canModerate, localParticipant, user?.id, hostUserId, sessionId, publishMod],
  );

  const setMicAutoApprove = useCallback(
    async (auto: boolean) => {
      if (!canModerate || !localParticipant) return;
      if (user?.id === hostUserId) {
        await localParticipant.setAttributes({
          [SCREEN_SHARE_MIC_AUTO_ATTR]: auto ? '1' : '0',
        });
      }
      await setScreenShareRoomPolicy(sessionId, { micAutoApprove: auto }).catch(() => undefined);
      await publishMod({
        v: 1,
        action: 'room_policy',
        targetUserId: '*',
        micAuto: auto,
      });
      setMicAuto(auto);
      // Kapatılınca mevcutlere dokunma; açılınca yeni katılanlar otomatik alır
    },
    [canModerate, localParticipant, user?.id, hostUserId, sessionId, publishMod],
  );

  // Host: room_policy data’sında leaderId gelirse attr güncelle
  useEffect(() => {
    if (!room || !localParticipant || !user?.id || user.id !== hostUserId) return;
    const onData = (payload: Uint8Array, _p: unknown, _k: unknown, topic?: string) => {
      if (topic != null && topic !== SCREEN_SHARE_MOD_TOPIC) return;
      const msg = decodeSeatMod(payload);
      if (!msg || msg.action !== 'room_policy') return;
      if (msg.leaderId != null) {
        void localParticipant
          .setAttributes({ [SCREEN_SHARE_LEADER_ID_ATTR]: msg.leaderId || hostUserId })
          .catch(() => undefined);
      }
      if (msg.leaderLocked != null) {
        void localParticipant
          .setAttributes({
            [SCREEN_SHARE_LEADER_LOCK_ATTR]: msg.leaderLocked ? '1' : '0',
          })
          .catch(() => undefined);
      }
      if (msg.micAuto != null) {
        void localParticipant
          .setAttributes({
            [SCREEN_SHARE_MIC_AUTO_ATTR]: msg.micAuto ? '1' : '0',
          })
          .catch(() => undefined);
      }
    };
    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, localParticipant, user?.id, hostUserId]);

  const canClaimLeader = Boolean(
    user?.id && canClaimLeaderSeat(user.id, hostUserId, leaderId),
  );
  /** Admin / lider / ekran izni verilen */
  const canShareScreen = isOwner || isLeader || screenOk;

  return {
    leaveSeat,
    takeSeat,
    takeSeatSlot,
    hostMute,
    hostStand,
    hostKick,
    grantMic,
    revokeMic,
    grantScreen,
    revokeScreen,
    assignLeader,
    clearLeader,
    setLeaderLock,
    setMicAutoApprove,
    iAmSeated,
    mySlot,
    micOk,
    screenOk,
    canShareScreen,
    canClaimLeader,
    leaderLocked,
    micAuto,
    leaderId,
    isOwner,
    isLeader,
    canModerate,
  };
}
