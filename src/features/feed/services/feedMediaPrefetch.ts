/**
 * Akış medyasını görünür alana girmeden önce ısıtır.
 *
 * Sorun: FlashList hücreleri geri dönüştürdüğünde expo-image kaynağı sıfırlar;
 * görsel ancak hücre ekrana geldiğinde indirilmeye başlar. Bu da kaydırma
 * sırasında siyah/gri kartlar ve görsel yüklenince satır yüksekliğinin
 * değişmesinden kaynaklanan titreme demek.
 *
 * Çözüm: görünür pencerenin birkaç satır önünde/arkasında medya URL'lerini
 * `Image.prefetch` ile (aynı memory-disk önbelleği) ısıt ve oranlarını ölç.
 * Kart mount olduğunda görsel önbellekten gelir ve yükseklik ilk karede doğrudur.
 */
import { Image } from 'expo-image';
import { isVideoUrl } from '@/lib/media/isVideoUrl';
import { optimizedImageUrl } from '@/lib/media/optimizedImageUrl';
import { resolveVideoThumbnailUrl } from '@/lib/media/videoThumbnailUrl';
import {
  clampFeedAspect,
  getCachedFeedAspect,
  rememberFeedAspect,
} from '@/features/feed/services/feedMediaAspect';
import type { FeedItem } from '@/features/feed/types';
import type { ImageSizeTier } from '@/lib/device/androidPerfProfile';

/** Bir gönderide önceden ısıtılacak en fazla medya sayısı (carousel ilk kareleri). */
const MAX_SLIDES = 3;
/** Oran ölçümü için küçük decode — büyük bitmap belleğe alınmasın. */
const ASPECT_PROBE_MAX_WIDTH = 480;
/** Aynı anda yürüyen ısıtma isteği — anlık burst JS/thread yükü yapmasın. */
const MAX_CONCURRENT = 2;

type WarmTask = { url: string; source: string; needsAspect: boolean };

const FINISHED_LIMIT = 1200;

const finished = new Set<string>();
const inFlight = new Set<string>();
const queue: WarmTask[] = [];
let running = 0;

function isRemoteUri(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

function runNext() {
  while (running < MAX_CONCURRENT && queue.length > 0) {
    const task = queue.shift();
    if (!task) return;
    running += 1;
    void warmTask(task).finally(() => {
      running -= 1;
      runNext();
    });
  }
}

async function warmTask(task: WarmTask) {
  try {
    try {
      await Image.prefetch([task.source], { cachePolicy: 'memory-disk' });
    } catch {
      // Isıtma başarısız olsa da kart normal yükleme yoluna düşer.
    }

    if (task.needsAspect) {
      try {
        const ref = await Image.loadAsync(task.source, { maxWidth: ASPECT_PROBE_MAX_WIDTH });
        const width = ref.width;
        const height = ref.height;
        if (width > 0 && height > 0) {
          rememberFeedAspect(task.url, clampFeedAspect(width, height));
        }
        ref.release();
      } catch {
        // Oran ölçülemedi — kart varsayılan oranla çizilir, titreme olmaz.
      }
    }
  } finally {
    if (finished.size >= FINISHED_LIMIT) {
      const oldest = finished.values().next().value;
      if (oldest != null) finished.delete(oldest);
    }
    finished.add(task.source);
    inFlight.delete(task.source);
  }
}

function enqueue(url: string, tier: ImageSizeTier) {
  if (!url || isVideoUrl(url)) return;
  const source = optimizedImageUrl(url, tier);
  if (!source || !isRemoteUri(source)) return;
  if (finished.has(source) || inFlight.has(source)) return;

  inFlight.add(source);
  queue.push({
    url,
    source,
    needsAspect: getCachedFeedAspect(url) == null,
  });
  runNext();
}

/** Video kartları için kapak (Mux/Stream thumbnail) — siyah kart yerine poster. */
function enqueueVideoPoster(url: string) {
  const poster = resolveVideoThumbnailUrl(url);
  if (!poster) return;
  enqueue(poster, 'thumb');
}

function warmItemMedia(item: FeedItem | null | undefined) {
  if (!item) return;

  const urls = item.mediaUrls ?? [];
  const limit = Math.min(urls.length, MAX_SLIDES);
  for (let i = 0; i < limit; i += 1) {
    const url = urls[i];
    if (!url) continue;
    if (isVideoUrl(url)) {
      enqueueVideoPoster(url);
    } else {
      enqueue(url, 'feed');
    }
  }

  if (item.videoPromo?.thumbnailUrl) {
    enqueue(item.videoPromo.thumbnailUrl, 'thumb');
  }
}

export type FeedMediaPrefetchOptions = {
  /** Görünür pencerenin üstünde ısıtılacak satır sayısı. */
  behind?: number;
  /** Görünür pencerenin altında ısıtılacak satır sayısı. */
  ahead?: number;
};

/** Görünür indeks aralığının çevresindeki satırların medyasını ısıtır. */
export function prefetchFeedMediaWindow(
  items: FeedItem[],
  startIndex: number,
  endIndex: number,
  options: FeedMediaPrefetchOptions = {},
): void {
  if (items.length === 0) return;

  const behind = Math.max(0, options.behind ?? 1);
  const ahead = Math.max(0, options.ahead ?? 3);
  const min = Math.min(startIndex, endIndex);
  const max = Math.max(startIndex, endIndex);
  const from = Math.max(0, min - behind);
  const to = Math.min(items.length - 1, max + ahead);

  for (let i = from; i <= to; i += 1) {
    warmItemMedia(items[i]);
  }
}

/** Liste ilk dolduğunda/başa döndüğünde ilk satırları ısıt. */
export function prefetchFeedMediaHead(items: FeedItem[], count = 5): void {
  if (items.length === 0) return;
  const limit = Math.min(items.length, Math.max(1, count));
  for (let i = 0; i < limit; i += 1) {
    warmItemMedia(items[i]);
  }
}
