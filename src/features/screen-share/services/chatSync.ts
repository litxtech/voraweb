export const SCREEN_SHARE_CHAT_TOPIC = 'ss_chat';

export type ScreenShareChatMessage = {
  id: string;
  userId: string;
  username: string;
  avatarUrl: string | null;
  text: string;
  at: number;
  system?: boolean;
};

export type ScreenShareChatPayload =
  | {
      v: 1;
      action: 'msg';
      id: string;
      userId: string;
      username: string;
      avatarUrl: string | null;
      text: string;
      at: number;
    }
  | {
      v: 1;
      action: 'system';
      id: string;
      text: string;
      at: number;
    };

export function encodeChatPayload(payload: ScreenShareChatPayload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function decodeChatPayload(raw: Uint8Array): ScreenShareChatPayload | null {
  try {
    const data = JSON.parse(new TextDecoder().decode(raw)) as ScreenShareChatPayload;
    if (!data || data.v !== 1) return null;
    if (data.action === 'system' && typeof data.text === 'string' && data.text.trim()) {
      return {
        v: 1,
        action: 'system',
        id: typeof data.id === 'string' ? data.id : `sys-${data.at}`,
        text: data.text.trim().slice(0, 200),
        at: typeof data.at === 'number' ? data.at : Date.now(),
      };
    }
    if (
      data.action === 'msg' &&
      typeof data.text === 'string' &&
      data.text.trim() &&
      typeof data.userId === 'string' &&
      typeof data.username === 'string'
    ) {
      return {
        v: 1,
        action: 'msg',
        id: typeof data.id === 'string' ? data.id : `m-${data.at}-${data.userId}`,
        userId: data.userId,
        username: data.username,
        avatarUrl: typeof data.avatarUrl === 'string' ? data.avatarUrl : null,
        text: data.text.trim().slice(0, 500),
        at: typeof data.at === 'number' ? data.at : Date.now(),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function payloadToMessage(payload: ScreenShareChatPayload): ScreenShareChatMessage {
  if (payload.action === 'system') {
    return {
      id: payload.id,
      userId: 'system',
      username: 'Sistem',
      avatarUrl: null,
      text: payload.text,
      at: payload.at,
      system: true,
    };
  }
  return {
    id: payload.id,
    userId: payload.userId,
    username: payload.username,
    avatarUrl: payload.avatarUrl,
    text: payload.text,
    at: payload.at,
  };
}
