import {
  fetchLibraryCaps,
  fetchMarketCaps,
  fetchMyCreatedCaps,
} from '@/features/caps/services/capsData';
import type { Cap, CapPickerTabId } from '@/features/caps/types';

/** Picker anında açılsın — sekmeler bellekte; boşta sürekli çekilmez. */
const TTL_MS = 3 * 60_000;

type Entry = { data: Cap[]; fetchedAt: number };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Cap[]>>();

function cacheKey(userId: string, tab: CapPickerTabId): string {
  return `${userId}:${tab}`;
}

export function readCapsPickerCache(userId: string, tab: CapPickerTabId): Cap[] | null {
  return cache.get(cacheKey(userId, tab))?.data ?? null;
}

export function isCapsPickerCacheFresh(userId: string, tab: CapPickerTabId): boolean {
  const entry = cache.get(cacheKey(userId, tab));
  if (!entry) return false;
  return Date.now() - entry.fetchedAt < TTL_MS;
}

async function loadTab(userId: string, tab: CapPickerTabId): Promise<Cap[]> {
  if (tab === 'library') return fetchLibraryCaps(userId);
  if (tab === 'mine') return fetchMyCreatedCaps(userId);
  const market = await fetchMarketCaps();
  const lib = await fetchLibraryCaps(userId);
  const libIds = new Set(lib.map((c) => c.id));
  return market.map((c) => ({ ...c, inLibrary: libIds.has(c.id) }));
}

export async function ensureCapsPickerTab(
  userId: string,
  tab: CapPickerTabId,
  opts?: { force?: boolean },
): Promise<Cap[]> {
  const key = cacheKey(userId, tab);
  if (!opts?.force && isCapsPickerCacheFresh(userId, tab)) {
    return cache.get(key)!.data;
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const data = await loadTab(userId, tab);
    cache.set(key, { data, fetchedAt: Date.now() });
    return data;
  })();

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
}

/** Kütüphane sekmesini ısıtır — composer Caps’e basınca liste hazır. */
export function prefetchCapsPickerLibrary(userId: string): void {
  if (isCapsPickerCacheFresh(userId, 'library')) return;
  void ensureCapsPickerTab(userId, 'library').catch(() => undefined);
}

export function invalidateCapsPickerCache(userId?: string): void {
  if (!userId) {
    cache.clear();
    return;
  }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${userId}:`)) cache.delete(key);
  }
}
