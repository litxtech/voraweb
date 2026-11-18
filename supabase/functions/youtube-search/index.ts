import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { corsHeaders, json, jsonSafeError, requireAuth } from '../_shared/supabaseAuth.ts';

type SearchBody = {
  q?: string;
  pageToken?: string | null;
  maxResults?: number;
  /** search | trending | catalog */
  mode?: 'search' | 'trending' | 'catalog';
  /** film | dizi | trend — catalog / trending filtre */
  rail?: 'trend' | 'film' | 'dizi' | 'fragman';
  regionCode?: string;
};

type YoutubeSnippet = {
  title?: string;
  channelTitle?: string;
  publishedAt?: string;
  description?: string;
  categoryId?: string;
  thumbnails?: {
    medium?: { url?: string };
    high?: { url?: string };
    maxres?: { url?: string };
    standard?: { url?: string };
    default?: { url?: string };
  };
};

type YoutubeSearchItem = {
  id?: { videoId?: string } | string;
  snippet?: YoutubeSnippet;
  contentDetails?: { duration?: string };
  statistics?: { viewCount?: string };
};

function pickThumb(snippet?: YoutubeSnippet): string | null {
  return (
    snippet?.thumbnails?.maxres?.url ??
    snippet?.thumbnails?.standard?.url ??
    snippet?.thumbnails?.high?.url ??
    snippet?.thumbnails?.medium?.url ??
    snippet?.thumbnails?.default?.url ??
    null
  );
}

function mapItem(item: YoutubeSearchItem) {
  const rawId = item.id;
  const videoId =
    typeof rawId === 'string'
      ? rawId.trim()
      : rawId && typeof rawId === 'object'
        ? rawId.videoId?.trim()
        : undefined;
  if (!videoId) return null;
  return {
    videoId,
    title: item.snippet?.title ?? 'Video',
    channelTitle: item.snippet?.channelTitle ?? '',
    publishedAt: item.snippet?.publishedAt ?? null,
    description: item.snippet?.description?.slice(0, 220) ?? null,
    thumbnailUrl: pickThumb(item.snippet),
    duration: item.contentDetails?.duration ?? null,
    viewCount: item.statistics?.viewCount ? Number(item.statistics.viewCount) : null,
    embedUrl: `https://www.youtube.com/embed/${videoId}?playsinline=1&rel=0`,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

const CATALOG_QUERIES: Record<string, string> = {
  film: 'film fragmanı 2024 2025 full hd',
  dizi: 'dizi fragmanı yeni sezon',
  fragman: 'en iyi film fragmanları',
  trend: 'trending trailer',
};

/** Film & Animation=1, Entertainment=24, Movies=30 (bölgeye göre) */
const RAIL_CATEGORY: Record<string, string | null> = {
  trend: null,
  film: '1',
  dizi: '24',
  fragman: '1',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const auth = await requireAuth(req);
    if (auth instanceof Response) return auth;

    const youtubeKey = Deno.env.get('YOUTUBE_API_KEY')?.trim();
    if (!youtubeKey) {
      return json({ error: 'YouTube API key missing' }, 500);
    }

    const body = (await req.json().catch(() => ({}))) as SearchBody;
    const mode = body.mode === 'trending' || body.mode === 'catalog' ? body.mode : 'search';
    const rail = body.rail ?? 'trend';
    const regionCode = (body.regionCode ?? 'TR').trim().slice(0, 2).toUpperCase() || 'TR';
    const maxResults = Math.max(1, Math.min(Number(body.maxResults ?? 20) || 20, 25));

    if (mode === 'trending' || mode === 'catalog') {
      // Önce chart=mostPopular; kategori yoksa / başarısızsa arama yedeği.
      const categoryId = RAIL_CATEGORY[rail] ?? null;
      const trendParams = new URLSearchParams({
        part: 'snippet,contentDetails,statistics',
        chart: 'mostPopular',
        regionCode,
        maxResults: String(maxResults),
        key: youtubeKey,
      });
      if (categoryId) trendParams.set('videoCategoryId', categoryId);
      if (body.pageToken?.trim()) trendParams.set('pageToken', body.pageToken.trim());

      let upstream = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?${trendParams.toString()}`,
      );
      let payload = (await upstream.json().catch(() => null)) as {
        error?: { message?: string };
        nextPageToken?: string;
        items?: YoutubeSearchItem[];
      } | null;

      // Kategori bazı bölgelerde 400 verebilir → genel trend veya arama.
      if (!upstream.ok && categoryId) {
        const fallback = new URLSearchParams({
          part: 'snippet,contentDetails,statistics',
          chart: 'mostPopular',
          regionCode,
          maxResults: String(maxResults),
          key: youtubeKey,
        });
        upstream = await fetch(
          `https://www.googleapis.com/youtube/v3/videos?${fallback.toString()}`,
        );
        payload = (await upstream.json().catch(() => null)) as typeof payload;
      }

      if (!upstream.ok || !(payload?.items?.length)) {
        const q = CATALOG_QUERIES[rail] ?? CATALOG_QUERIES.fragman;
        const searchParams = new URLSearchParams({
          part: 'snippet',
          q,
          type: 'video',
          maxResults: String(maxResults),
          videoEmbeddable: 'true',
          safeSearch: 'moderate',
          relevanceLanguage: 'tr',
          regionCode,
          key: youtubeKey,
        });
        const searchRes = await fetch(
          `https://www.googleapis.com/youtube/v3/search?${searchParams.toString()}`,
        );
        const searchPayload = (await searchRes.json().catch(() => null)) as {
          error?: { message?: string };
          nextPageToken?: string;
          items?: YoutubeSearchItem[];
        } | null;
        if (!searchRes.ok) {
          const message = searchPayload?.error?.message ?? 'Trend listesi alınamadı';
          return json({ error: message }, 502);
        }
        const items = (searchPayload?.items ?? []).map(mapItem).filter(Boolean);
        return json({
          items,
          nextPageToken: searchPayload?.nextPageToken ?? null,
          query: q,
          mode,
          rail,
        });
      }

      const items = (payload?.items ?? []).map(mapItem).filter(Boolean);
      return json({
        items,
        nextPageToken: payload?.nextPageToken ?? null,
        query: `trending:${rail}`,
        mode,
        rail,
      });
    }

    const q = (body.q ?? '').trim().slice(0, 120);
    if (q.length < 2) {
      return json({ error: 'En az 2 karakter ara' }, 400);
    }

    const params = new URLSearchParams({
      part: 'snippet',
      q,
      type: 'video',
      maxResults: String(maxResults),
      videoEmbeddable: 'true',
      safeSearch: 'moderate',
      relevanceLanguage: 'tr',
      regionCode,
      key: youtubeKey,
    });
    if (body.pageToken?.trim()) {
      params.set('pageToken', body.pageToken.trim());
    }

    const upstream = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params.toString()}`,
    );
    const payload = (await upstream.json().catch(() => null)) as {
      error?: { message?: string };
      nextPageToken?: string;
      items?: YoutubeSearchItem[];
    } | null;

    if (!upstream.ok) {
      const message = payload?.error?.message ?? 'YouTube araması başarısız';
      return json(
        { error: message },
        upstream.status >= 400 && upstream.status < 500 ? upstream.status : 502,
      );
    }

    const items = (payload?.items ?? []).map(mapItem).filter(Boolean);

    return json({
      items,
      nextPageToken: payload?.nextPageToken ?? null,
      query: q,
      mode: 'search',
    });
  } catch (error) {
    return jsonSafeError(error, 500);
  }
});
