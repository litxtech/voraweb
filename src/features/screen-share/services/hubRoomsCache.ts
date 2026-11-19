import type { ScreenShareSession } from '@/features/screen-share/types';

type HubRoomsSnapshot = {
  myRooms: ScreenShareSession[];
  publicRooms: ScreenShareSession[];
  visitedRooms: ScreenShareSession[];
  fetchedAt: number;
};

/**
 * Odaklanınca soft-refresh için kısa TTL.
 * Create/join sonrası invalidate edilir — yeni oda anında görünür.
 */
export const HUB_ROOMS_FRESH_MS = 12_000;

let snapshot: HubRoomsSnapshot | null = null;

/** Son başarılı hub listesi — odaklanınca anında boya, arka planda yenile. */
export function readHubRoomsCache(): HubRoomsSnapshot | null {
  return snapshot;
}

export function isHubRoomsCacheFresh(maxAgeMs = HUB_ROOMS_FRESH_MS): boolean {
  if (!snapshot) return false;
  return Date.now() - snapshot.fetchedAt < maxAgeMs;
}

export function writeHubRoomsCache(next: Omit<HubRoomsSnapshot, 'fetchedAt'>): void {
  snapshot = { ...next, fetchedAt: Date.now() };
}

/** Create / join / delete sonrası — sonraki focus ağdan çeker. */
export function invalidateHubRoomsCache(): void {
  snapshot = null;
}

/** Optimistic: oda açılınca kendi listene hemen yaz. */
export function upsertHubMyRoom(session: ScreenShareSession): void {
  const prev = snapshot;
  const myRooms = [
    session,
    ...(prev?.myRooms ?? []).filter((r) => r.id !== session.id),
  ];
  snapshot = {
    myRooms,
    publicRooms: (prev?.publicRooms ?? []).filter(
      (r) => r.id !== session.id && r.hostUserId !== session.hostUserId,
    ),
    visitedRooms: (prev?.visitedRooms ?? []).filter((r) => r.id !== session.id),
    fetchedAt: 0,
  };
}
