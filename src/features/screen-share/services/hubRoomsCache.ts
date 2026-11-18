import type { ScreenShareSession } from '@/features/screen-share/types';

type HubRoomsSnapshot = {
  myRooms: ScreenShareSession[];
  publicRooms: ScreenShareSession[];
  visitedRooms: ScreenShareSession[];
  fetchedAt: number;
};

/** Odaklanınca ağ çağrısı atlama — fatura + hız. */
export const HUB_ROOMS_FRESH_MS = 45_000;

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
