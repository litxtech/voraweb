import { useCallback, useEffect, useRef, useState } from 'react';
import { useRoomContext } from '@livekit/react-native';
import { RoomEvent } from 'livekit-client';
import {
  SCREEN_SHARE_CHAT_TOPIC,
  decodeChatPayload,
  encodeChatPayload,
  payloadToMessage,
  type ScreenShareChatMessage,
} from '@/features/screen-share/services/chatSync';
import { useAuth } from '@/providers/AuthProvider';

const MAX_MESSAGES = 200;

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Oda sohbeti — LiveKit data channel; geçmiş yok, girişte sıfır. */
export function useScreenShareChat() {
  const room = useRoomContext();
  const { user, profile } = useAuth();
  const [messages, setMessages] = useState<ScreenShareChatMessage[]>([]);
  const idsRef = useRef(new Set<string>());

  const pushLocal = useCallback((msg: ScreenShareChatMessage) => {
    if (idsRef.current.has(msg.id)) return;
    idsRef.current.add(msg.id);
    setMessages((prev) => {
      const next = [...prev, msg];
      if (next.length <= MAX_MESSAGES) return next;
      const trimmed = next.slice(next.length - MAX_MESSAGES);
      idsRef.current = new Set(trimmed.map((m) => m.id));
      return trimmed;
    });
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || !room?.localParticipant || !user?.id) return;

      const payload = {
        v: 1 as const,
        action: 'msg' as const,
        id: newId(),
        userId: user.id,
        username: profile?.username ?? 'üye',
        avatarUrl: profile?.avatar_url ?? null,
        text: trimmed,
        at: Date.now(),
      };

      pushLocal(payloadToMessage(payload));

      try {
        await room.localParticipant.publishData(encodeChatPayload(payload), {
          reliable: true,
          topic: SCREEN_SHARE_CHAT_TOPIC,
        });
      } catch {
        // bağlantı kopukken sessiz
      }
    },
    [room, user?.id, profile?.username, profile?.avatar_url, pushLocal],
  );

  const sendSystem = useCallback(
    async (text: string) => {
      if (!room?.localParticipant) return;
      const payload = {
        v: 1 as const,
        action: 'system' as const,
        id: newId(),
        text,
        at: Date.now(),
      };
      pushLocal(payloadToMessage(payload));
      try {
        await room.localParticipant.publishData(encodeChatPayload(payload), {
          reliable: true,
          topic: SCREEN_SHARE_CHAT_TOPIC,
        });
      } catch {
        // ignore
      }
    },
    [room, pushLocal],
  );

  useEffect(() => {
    if (!room) return;

    const onData = (payload: Uint8Array, _p: unknown, _k: unknown, topic?: string) => {
      if (topic != null && topic !== SCREEN_SHARE_CHAT_TOPIC) return;
      const msg = decodeChatPayload(payload);
      if (!msg) return;
      // Kendi mesajımız zaten local push edildi
      if (msg.action === 'msg' && msg.userId === user?.id) return;
      pushLocal(payloadToMessage(msg));
    };

    room.on(RoomEvent.DataReceived, onData);
    return () => {
      room.off(RoomEvent.DataReceived, onData);
    };
  }, [room, user?.id, pushLocal]);

  return { messages, send, sendSystem };
}
