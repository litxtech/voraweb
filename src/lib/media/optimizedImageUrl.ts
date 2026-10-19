import type { ImageSizeTier } from '@/lib/device/androidPerfProfile';

const SUPABASE_RENDER_PUBLIC = /\/storage\/v1\/render\/image\/public\//i;

/**
 * Supabase Image Transformation (render/image) bu projede kapalı:
 * FeatureNotEnabled → 403. Android'de URL rewrite yüzünden görseller boş kalıyordu.
 * Orijinal object/public URL kullan; varsa bozuk render URL'lerini geri çevir.
 */
export function stripSupabaseRenderUrl(url: string): string {
  if (!SUPABASE_RENDER_PUBLIC.test(url)) return url;
  const objectUrl = url.replace(
    /\/storage\/v1\/render\/image\/public\//i,
    '/storage/v1/object/public/',
  );
  return objectUrl.split('?')[0] ?? objectUrl;
}

export function optimizedImageUrl(
  url: string | null | undefined,
  _tier: ImageSizeTier = 'feed',
  _layoutWidth?: number,
): string | null {
  if (!url?.trim()) return null;

  const trimmed = stripSupabaseRenderUrl(url.trim());
  if (trimmed.startsWith('data:') || trimmed.startsWith('file:')) return trimmed;
  if (trimmed.includes('image.mux.com') || trimmed.includes('stream.mux.com')) {
    return trimmed;
  }
  return trimmed;
}
