import type { YoutubeSearchHit } from '@/features/screen-share/services/youtubeSearch';

export const SCREEN_SHARE_YOUTUBE_TOPIC = 'ss_youtube';
/** Host participant attribute — odaya yeni girenler / kaçırılan paketler için. */
export const SCREEN_SHARE_YOUTUBE_ATTR = 'ss_yt';

export type SharedYoutubePlay = {
  v: 1;
  action: 'play';
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  /** Her seçimde değişir — WebView remount + izleyici senkron anahtarı */
  startedAt: number;
};

export type SharedYoutubeStop = {
  v: 1;
  action: 'stop';
  startedAt: number;
};

export type SharedYoutubePayload = SharedYoutubePlay | SharedYoutubeStop;

export function sharedYoutubeToHit(msg: SharedYoutubePlay): YoutubeSearchHit {
  return {
    videoId: msg.videoId,
    title: msg.title,
    channelTitle: msg.channelTitle,
    publishedAt: null,
    thumbnailUrl: msg.thumbnailUrl,
    embedUrl: `https://www.youtube.com/embed/${msg.videoId}`,
    watchUrl: `https://www.youtube.com/watch?v=${msg.videoId}`,
    startedAt: msg.startedAt,
  };
}

export function hitToPlayPayload(hit: YoutubeSearchHit, startedAt = Date.now()): SharedYoutubePlay {
  return {
    v: 1,
    action: 'play',
    videoId: hit.videoId,
    title: hit.title,
    channelTitle: hit.channelTitle,
    thumbnailUrl: hit.thumbnailUrl,
    startedAt,
  };
}

export function encodeYoutubePayload(payload: SharedYoutubePayload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function decodeYoutubePayload(raw: Uint8Array): SharedYoutubePayload | null {
  try {
    const text = new TextDecoder().decode(raw);
    return parseYoutubePayloadJson(text);
  } catch {
    return null;
  }
}

export function parseYoutubePayloadJson(text: string): SharedYoutubePayload | null {
  try {
    const data = JSON.parse(text) as SharedYoutubePayload;
    if (!data || data.v !== 1) return null;
    if (data.action === 'stop') {
      return {
        v: 1,
        action: 'stop',
        startedAt: typeof data.startedAt === 'number' ? data.startedAt : Date.now(),
      };
    }
    if (
      data.action === 'play' &&
      typeof data.videoId === 'string' &&
      data.videoId.length > 0 &&
      typeof data.title === 'string'
    ) {
      return {
        v: 1,
        action: 'play',
        videoId: data.videoId,
        title: data.title,
        channelTitle: typeof data.channelTitle === 'string' ? data.channelTitle : '',
        thumbnailUrl: typeof data.thumbnailUrl === 'string' ? data.thumbnailUrl : null,
        startedAt: typeof data.startedAt === 'number' ? data.startedAt : Date.now(),
      };
    }
    return null;
  } catch {
    return null;
  }
}
