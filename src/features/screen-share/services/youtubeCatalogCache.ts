import {
  fetchYoutubeRail,
  type YoutubeRail,
  type YoutubeSearchHit,
} from '@/features/screen-share/services/youtubeSearch';

export type YoutubeCatalog = Record<YoutubeRail, YoutubeSearchHit[]>;

const EMPTY: YoutubeCatalog = { trend: [], film: [], dizi: [], fragman: [] };
/** YouTube API faturası — katalog 12 dk bellekte; sürekli çekilmez. */
const TTL_MS = 12 * 60_000;

let snapshot: { data: YoutubeCatalog; fetchedAt: number } | null = null;
let inflight: Promise<YoutubeCatalog> | null = null;

export function readYoutubeCatalogCache(): YoutubeCatalog | null {
  if (!snapshot) return null;
  return snapshot.data;
}

export function isYoutubeCatalogFresh(maxAgeMs = TTL_MS): boolean {
  if (!snapshot) return false;
  return Date.now() - snapshot.fetchedAt < maxAgeMs;
}

export async function ensureYoutubeCatalog(opts?: {
  force?: boolean;
}): Promise<YoutubeCatalog> {
  if (!opts?.force && isYoutubeCatalogFresh()) {
    return snapshot!.data;
  }
  if (inflight) return inflight;

  inflight = (async () => {
    const [trend, film, dizi, fragman] = await Promise.all([
      fetchYoutubeRail('trend', { maxResults: 14 }).catch(() => ({ items: [] as YoutubeSearchHit[] })),
      fetchYoutubeRail('film', { maxResults: 12 }).catch(() => ({ items: [] as YoutubeSearchHit[] })),
      fetchYoutubeRail('dizi', { maxResults: 12 }).catch(() => ({ items: [] as YoutubeSearchHit[] })),
      fetchYoutubeRail('fragman', { maxResults: 12 }).catch(() => ({ items: [] as YoutubeSearchHit[] })),
    ]);
    const data: YoutubeCatalog = {
      trend: trend.items,
      film: film.items,
      dizi: dizi.items,
      fragman: fragman.items,
    };
    snapshot = { data, fetchedAt: Date.now() };
    return data;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/** Host odaya girince bir kez ısıtır — kart açılınca anında boyanır. */
export function prefetchYoutubeCatalog(): void {
  if (isYoutubeCatalogFresh()) return;
  void ensureYoutubeCatalog().catch(() => undefined);
}

export function emptyYoutubeCatalog(): YoutubeCatalog {
  return { ...EMPTY };
}
