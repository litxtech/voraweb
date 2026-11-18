import { useCallback, useEffect, useRef, useState } from 'react';
import { useRoomContext } from '@livekit/react-native';
import { ConnectionState, RoomEvent, type Participant, type RemoteParticipant } from 'livekit-client';
import type { YoutubeSearchHit } from '@/features/screen-share/services/youtubeSearch';
import {
  SCREEN_SHARE_YOUTUBE_ATTR,
  SCREEN_SHARE_YOUTUBE_TOPIC,
  decodeYoutubePayload,
  encodeYoutubePayload,
  hitToPlayPayload,
  parseYoutubePayloadJson,
  sharedYoutubeToHit,
  type SharedYoutubePayload,
} from '@/features/screen-share/services/youtubeSync';

/** Yalnızca paylaşım anında retry — sürekli interval yok (fatura). */
const PUBLISH_RETRIES = [0, 400];

/**
 * Host YouTube seçimini odaya anında yayar (data + attribute).
 * Host odadan çıkınca stop yayılır; izleyiciler host disconnect olunca videoyu kapatır.
 * Aktif video yokken / oda kapalıyken trafik yok.
 */
export function useScreenShareYoutubeSync(isHost: boolean, hostUserId?: string | null) {
  const room = useRoomContext();
  const [active, setActive] = useState<YoutubeSearchHit | null>(null);
  const activeRef = useRef<YoutubeSearchHit | null>(null);
  const lastStartedAtRef = useRef(0);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const applyPayload = useCallback((msg: SharedYoutubePayload) => {
    if (msg.action === 'stop') {
      if (msg.startedAt < lastStartedAtRef.current) return;
      lastStartedAtRef.current = msg.startedAt;
      setActive(null);
      activeRef.current = null;
      return;
    }
    if (msg.startedAt < lastStartedAtRef.current) return;
    lastStartedAtRef.current = msg.startedAt;
    const hit = sharedYoutubeToHit(msg);
    setActive(hit);
    activeRef.current = hit;
  }, []);

  const publishData = useCallback(
    async (payload: SharedYoutubePayload) => {
      if (!room?.localParticipant) return;
      if (room.state !== ConnectionState.Connected) return;
      try {
        await room.localParticipant.publishData(encodeYoutubePayload(payload), {
          reliable: true,
          topic: SCREEN_SHARE_YOUTUBE_TOPIC,
        });
      } catch {
        // retry üst katmanda
      }
    },
    [room],
  );

  const persistAttribute = useCallback(
    async (payload: SharedYoutubePayload | null) => {
      if (!room?.localParticipant || !isHost) return;
      try {
        await room.localParticipant.setAttributes({
          [SCREEN_SHARE_YOUTUBE_ATTR]: payload ? JSON.stringify(payload) : '',
        });
      } catch {
        // canUpdateOwnMetadata yoksa data channel yeterli
      }
    },
    [room, isHost],
  );

  const fanout = useCallback(
    async (payload: SharedYoutubePayload) => {
      await persistAttribute(payload.action === 'stop' ? null : payload);
      for (const delay of PUBLISH_RETRIES) {
        if (delay > 0) await new Promise((r) => setTimeout(r, delay));
        await publishData(payload);
      }
    },
    [persistAttribute, publishData],
  );

  const share = useCallback(
    async (hit: YoutubeSearchHit) => {
      const startedAt = Date.now();
      const payload = hitToPlayPayload(hit, startedAt);
      const next = sharedYoutubeToHit(payload);
      lastStartedAtRef.current = startedAt;
      setActive(next);
      activeRef.current = next;
      await fanout(payload);
    },
    [fanout],
  );

  const stop = useCallback(async () => {
    const startedAt = Date.now();
    lastStartedAtRef.current = startedAt;
    setActive(null);
    activeRef.current = null;
    await fanout({ v: 1, action: 'stop', startedAt });
  }, [fanout]);

  const readAttrFromParticipant = useCallback(
    (participant: Participant | RemoteParticipant) => {
      const raw = participant.attributes?.[SCREEN_SHARE_YOUTUBE_ATTR];
      if (!raw) return;
      const msg = parseYoutubePayloadJson(raw);
      if (msg) applyPayload(msg);
    },
    [applyPayload],
  );

  useEffect(() => {
    if (!room) return;

    const onData = (
      payload: Uint8Array,
      _participant?: Participant,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic != null && topic !== SCREEN_SHARE_YOUTUBE_TOPIC && topic !== '') return;
      const msg = decodeYoutubePayload(payload);
      if (!msg) return;
      applyPayload(msg);
    };

    const onAttr = (_changed: Record<string, string>, participant: Participant) => {
      if (participant.isLocal) return;
      readAttrFromParticipant(participant);
    };

    const pullFromRemotes = () => {
      room.remoteParticipants.forEach((p) => readAttrFromParticipant(p));
    };

    /** Sadece aktif video varken ve yeni biri / reconnect olunca — interval yok. */
    const rebroadcastIfHost = () => {
      if (!isHost) return;
      const current = activeRef.current;
      if (!current?.startedAt) return;
      void publishData(hitToPlayPayload(current, current.startedAt));
    };

    const onParticipantConnected = () => {
      pullFromRemotes();
      rebroadcastIfHost();
    };

    const onConnected = () => {
      pullFromRemotes();
      rebroadcastIfHost();
    };

    /** Host ayrılınca izleyicilerdeki YouTube anında bitsin (stop paketi gelmese bile). */
    const onParticipantDisconnected = (participant: RemoteParticipant) => {
      if (isHost) return;
      if (!hostUserId || participant.identity !== hostUserId) return;
      lastStartedAtRef.current = Date.now();
      setActive(null);
      activeRef.current = null;
    };

    room.on(RoomEvent.DataReceived, onData);
    room.on(RoomEvent.ParticipantAttributesChanged, onAttr);
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.ParticipantActive, onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.Reconnected, onConnected);

    pullFromRemotes();

    return () => {
      room.off(RoomEvent.DataReceived, onData);
      room.off(RoomEvent.ParticipantAttributesChanged, onAttr);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.ParticipantActive, onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.Reconnected, onConnected);
    };
  }, [room, isHost, hostUserId, applyPayload, publishData, readAttrFromParticipant]);

  return { active, share, stop };
}
