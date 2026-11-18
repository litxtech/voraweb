import { ConnectionState, RoomEvent, type Room } from 'livekit-client';

/** LiveKit Connected olana kadar bekler — erken metadata/mic/ekran hatalarını önler. */
export function waitForRoomConnected(room: Room, timeoutMs = 10_000): Promise<boolean> {
  if (room.state === ConnectionState.Connected) return Promise.resolve(true);

  return new Promise((resolve) => {
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      room.off(RoomEvent.ConnectionStateChanged, onState);
      resolve(ok);
    };

    const onState = (state: ConnectionState) => {
      if (state === ConnectionState.Connected) finish(true);
    };

    const timer = setTimeout(() => {
      finish(room.state === ConnectionState.Connected);
    }, timeoutMs);

    room.on(RoomEvent.ConnectionStateChanged, onState);
    if (room.state === ConnectionState.Connected) finish(true);
  });
}
