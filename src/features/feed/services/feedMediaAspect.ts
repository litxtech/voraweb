/**
 * Akış medya oranları (genişlik / yükseklik).
 *
 * Akış kartlarının yüksekliği görselin oranına göre hesaplanır. Oran ancak
 * görsel indirildikten sonra bilinebildiği için, önceden ölçülen oranlar burada
 * önbelleğe alınır. Kart mount olduktan sonra yüksekliği değiştirmek listede
 * kayma/titreme yaptığı için mount sırasında yalnızca buradaki değer kullanılır.
 */

/** Instagram aralığı. */
export const MIN_FEED_INLINE_ASPECT = 4 / 5;
export const MAX_FEED_INLINE_ASPECT = 1.91;
export const DEFAULT_FEED_INLINE_ASPECT = 1;

/** Önbellek üst sınırı — uzun oturumlarda sınırsız büyümesin. */
const ASPECT_CACHE_LIMIT = 600;

const aspectCache = new Map<string, number>();

export function clampFeedAspect(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return DEFAULT_FEED_INLINE_ASPECT;
  }
  const aspect = width / height;
  return Math.min(MAX_FEED_INLINE_ASPECT, Math.max(MIN_FEED_INLINE_ASPECT, aspect));
}

export function getCachedFeedAspect(url: string | null | undefined): number | null {
  if (!url) return null;
  return aspectCache.get(url) ?? null;
}

/** Verilen URL'ler için bilinen oranlar (ilk render'da doğru yükseklik). */
export function readCachedFeedAspects(urls: string[]): Record<string, number> {
  const seeded: Record<string, number> = {};
  for (const url of urls) {
    const cached = aspectCache.get(url);
    if (cached != null) seeded[url] = cached;
  }
  return seeded;
}

export function rememberFeedAspect(url: string | null | undefined, aspect: number): void {
  if (!url || !Number.isFinite(aspect) || aspect <= 0) return;
  const next = Math.min(MAX_FEED_INLINE_ASPECT, Math.max(MIN_FEED_INLINE_ASPECT, aspect));
  if (aspectCache.has(url)) {
    aspectCache.delete(url);
  } else if (aspectCache.size >= ASPECT_CACHE_LIMIT) {
    // En eski kaydı at (Map ekleme sırasını korur).
    const oldest = aspectCache.keys().next().value;
    if (oldest != null) aspectCache.delete(oldest);
  }
  aspectCache.set(url, next);
}

export function rememberFeedAspectFromSize(
  url: string | null | undefined,
  width: number | null | undefined,
  height: number | null | undefined,
): void {
  if (!url || !width || !height) return;
  rememberFeedAspect(url, clampFeedAspect(width, height));
}
