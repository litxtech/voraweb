import { supabase } from '@/lib/supabase/client';
import { supabaseErrorMessage } from '@/lib/errors';

export type YoutubeSearchHit = {
  videoId: string;
  title: string;
  channelTitle: string;
  publishedAt: string | null;
  thumbnailUrl: string | null;
  embedUrl: string;
  watchUrl: string;
  description?: string | null;
  duration?: string | null;
  viewCount?: number | null;
  /** Odaya yayın anı — izleyici WebView remount */
  startedAt?: number;
};

export type YoutubeRail = 'trend' | 'film' | 'dizi' | 'fragman';

export type YoutubeSearchResponse = {
  items: YoutubeSearchHit[];
  nextPageToken: string | null;
  query: string;
  mode?: string;
  rail?: string;
};

function normalize(data: YoutubeSearchResponse | { error?: string }, fallbackQuery: string): YoutubeSearchResponse {
  if ('error' in data && data.error) throw new Error(String(data.error));
  const ok = data as YoutubeSearchResponse;
  return {
    items: Array.isArray(ok.items) ? ok.items : [],
    nextPageToken: ok.nextPageToken ?? null,
    query: ok.query ?? fallbackQuery,
    mode: ok.mode,
    rail: ok.rail,
  };
}

export async function searchYoutubeVideos(input: {
  q: string;
  pageToken?: string | null;
  maxResults?: number;
}): Promise<YoutubeSearchResponse> {
  const { data, error } = await supabase.functions.invoke<YoutubeSearchResponse | { error?: string }>(
    'youtube-search',
    {
      body: {
        mode: 'search',
        q: input.q,
        pageToken: input.pageToken ?? null,
        maxResults: input.maxResults ?? 20,
        regionCode: 'TR',
      },
    },
  );

  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data || typeof data !== 'object') throw new Error('YouTube yanıtı boş');
  return normalize(data, input.q);
}

/** Trend / film / dizi rayları — mostPopular + yedek arama. */
export async function fetchYoutubeRail(
  rail: YoutubeRail,
  opts?: { pageToken?: string | null; maxResults?: number },
): Promise<YoutubeSearchResponse> {
  const { data, error } = await supabase.functions.invoke<YoutubeSearchResponse | { error?: string }>(
    'youtube-search',
    {
      body: {
        mode: rail === 'trend' ? 'trending' : 'catalog',
        rail,
        pageToken: opts?.pageToken ?? null,
        maxResults: opts?.maxResults ?? 16,
        regionCode: 'TR',
      },
    },
  );

  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data || typeof data !== 'object') throw new Error('YouTube yanıtı boş');
  return normalize(data, rail);
}

/** ISO-8601 süre → 1:23:45 */
export function formatYoutubeDuration(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2] ?? 0);
  const sec = Number(m[3] ?? 0);
  if (h > 0) {
    return `${h}:${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export function formatYoutubeViews(count: number | null | undefined): string | null {
  if (count == null || !Number.isFinite(count)) return null;
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')} Mn izlenme`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')} B izlenme`;
  return `${count} izlenme`;
}
