import { ConnectionState, Room, RoomEvent } from 'livekit-client';
import { ensureLiveKitGlobals } from '@/lib/livekit/ensureLiveKitGlobals';
import { ssLog } from '@/features/screen-share/services/screenShareDebugLog';

const ROOM_OPTIONS = {
  adaptiveStream: false,
  dynacast: false,
  // Unpublish sırasında track’i hemen stop etme — disconnect yarışında
  // “RTCRtpSender not found” / signal stream ERROR azaltır.
  stopLocalTrackOnUnpublish: false,
  // RN getSettings boş dönse bile publish tarafı bu çözünürlüğü kullanır.
  videoCaptureDefaults: {
    resolution: { width: 1280, height: 720, frameRate: 18 },
  },
} as const;

/** React unmount’tan bağımsız — PiP’te tek bağlantı. */
let room: Room | null = null;
let connectedSessionId: string | null = null;
let connectInflight: Promise<Room> | null = null;
/** dispose sonrası tamamlanan stale connect’i düşürmek için */
let generation = 0;

function roomSnap(r: Room | null) {
  if (!r) return { state: 'none' };
  return {
    state: r.state,
    name: r.name || null,
    identity: r.localParticipant?.identity || null,
    sid: r.localParticipant?.sid || null,
  };
}

export function getScreenShareLiveKitRoom(): Room | null {
  return room;
}

export function acquireScreenShareLiveKitRoom(): Room {
  ensureLiveKitGlobals();
  if (!room) {
    room = new Room({ ...ROOM_OPTIONS });
    ssLog('lk.acquire.new', { generation, ...roomSnap(room) });
  }
  return room;
}

/**
 * Aynı oda için yeniden connect / disconnect yok.
 * Token yenilense bile Connecting|Connected iken dokunma (Strict Mode çift boot).
 */
export async function ensureScreenShareLiveKitConnected(input: {
  sessionId: string;
  url: string;
  token: string;
}): Promise<Room> {
  const next = acquireScreenShareLiveKitRoom();
  const gen = generation;
  ssLog('lk.ensure', {
    sessionId: input.sessionId,
    generation: gen,
    connectedSessionId,
    hasInflight: Boolean(connectInflight),
    tokenLen: input.token.length,
    ...roomSnap(next),
  });

  if (connectInflight && connectedSessionId === input.sessionId) {
    ssLog('lk.ensure.reuseInflight', { sessionId: input.sessionId });
    return connectInflight;
  }

  if (
    connectedSessionId === input.sessionId &&
    (next.state === ConnectionState.Connected ||
      next.state === ConnectionState.Connecting ||
      next.state === ConnectionState.Reconnecting)
  ) {
    ssLog('lk.ensure.alreadyLive', { sessionId: input.sessionId, ...roomSnap(next) });
    return next;
  }

  if (
    connectedSessionId != null &&
    connectedSessionId !== input.sessionId &&
    next.state !== ConnectionState.Disconnected
  ) {
    ssLog('lk.ensure.switchSession', {
      from: connectedSessionId,
      to: input.sessionId,
      ...roomSnap(next),
    });
    await next.disconnect().catch(() => undefined);
    connectedSessionId = null;
  }

  connectedSessionId = input.sessionId;
  connectInflight = (async () => {
    if (
      next.state === ConnectionState.Connected ||
      next.state === ConnectionState.Connecting ||
      next.state === ConnectionState.Reconnecting
    ) {
      ssLog('lk.connect.skipAlready', roomSnap(next));
      return next;
    }
    ssLog('lk.connect.start', { sessionId: input.sessionId, generation: gen });
    await next.connect(input.url, input.token);
    if (gen !== generation) {
      ssLog('lk.connect.staleAbort', { gen, generation, ...roomSnap(next) });
      await next.disconnect().catch(() => undefined);
      throw new Error('stale_screen_share_connect');
    }
    ssLog('lk.connect.ok', { sessionId: input.sessionId, ...roomSnap(next) });
    return next;
  })();

  try {
    return await connectInflight;
  } catch (err) {
    ssLog('lk.connect.fail', {
      sessionId: input.sessionId,
      message: err instanceof Error ? err.message : String(err),
      ...roomSnap(next),
    });
    throw err;
  } finally {
    connectInflight = null;
  }
}

/** Yalnızca oda çıkışı / PiP X — minimize ve effect cleanup’ta çağırma. */
export async function disposeScreenShareLiveKitRoom(): Promise<void> {
  const stack = new Error().stack?.split('\n').slice(1, 6).join(' | ') ?? '';
  generation += 1;
  const current = room;
  ssLog('lk.dispose', {
    generation,
    stack,
    ...roomSnap(current),
  });
  room = null;
  connectedSessionId = null;
  connectInflight = null;
  if (!current) return;
  try {
    // Disconnect stops local tracks; avoids unpublish/disconnect race on RN WebSocket.
    await current.disconnect(true).catch(() => undefined);
  } finally {
    ssLog('lk.dispose.done', { generation });
  }
}

/** LiveKitRoom `audio` prop’u gibi — SignalConnected’ta mik aç. */
export function bindScreenShareAutoMic(target: Room): () => void {
  const onSignal = () => {
    ssLog('lk.signalConnected.autoMic', roomSnap(target));
    void target.localParticipant.setMicrophoneEnabled(true).catch(() => undefined);
  };
  const onDisconnected = (reason?: unknown) => {
    ssLog('lk.disconnected', {
      reason: reason != null ? String(reason) : null,
      ...roomSnap(target),
    });
  };
  const onReconnecting = () => {
    ssLog('lk.reconnecting', roomSnap(target));
  };
  const onReconnected = () => {
    ssLog('lk.reconnected', roomSnap(target));
  };
  target.on(RoomEvent.SignalConnected, onSignal);
  target.on(RoomEvent.Disconnected, onDisconnected);
  target.on(RoomEvent.Reconnecting, onReconnecting);
  target.on(RoomEvent.Reconnected, onReconnected);
  return () => {
    target.off(RoomEvent.SignalConnected, onSignal);
    target.off(RoomEvent.Disconnected, onDisconnected);
    target.off(RoomEvent.Reconnecting, onReconnecting);
    target.off(RoomEvent.Reconnected, onReconnected);
  };
}
