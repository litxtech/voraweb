import { supabase } from '@/lib/supabase/client';
import {
  resolveStoryMediaUrl,
  resolveStoryThumbUrl,
} from '@/features/stories/services/storyMediaUrl';
import type { StoryReplyMetadata } from './storyReplyMetadata';

export type StoryReplyMediaState = 'available' | 'removed' | 'unknown';

export type StoryReplyViewerMedia = {
  state: StoryReplyMediaState;
  mediaUrl: string | null;
  thumbUrl: string | null;
  mediaType: 'image' | 'video';
};

type StoryItemRow = {
  status: string | null;
  expires_at: string | null;
  media_type: string | null;
  media_url: string | null;
  thumb_url: string | null;
};

/**
 * Sohbetteki hikâye yanıtının hâlâ izlenebilir olup olmadığını çözer.
 *
 * `story_items` satırı yayından kalkmışsa (status = removed) ya da süresi
 * dolmuşsa RLS satırı görünmez; bu durumda "kaldırıldı" kabul edilir.
 * Ağ/RLS hatasında mesajdaki anlık görüntü adreslerine düşülür ki
 * geçici bir hatada içerik haksız yere engellenmesin.
 */
export async function fetchStoryReplyViewerMedia(
  meta: StoryReplyMetadata,
): Promise<StoryReplyViewerMedia> {
  const fallback: StoryReplyViewerMedia = {
    state: 'unknown',
    mediaUrl: resolveStoryMediaUrl(meta.storyMediaUrl),
    thumbUrl: resolveStoryThumbUrl(meta.storyThumbUrl, meta.storyMediaUrl),
    mediaType: meta.storyMediaType,
  };

  const { data, error } = await supabase
    .from('story_items')
    .select('status, expires_at, media_type, media_url, thumb_url')
    .eq('id', meta.storyItemId)
    .maybeSingle();

  if (error) return fallback;
  // RLS: yayında olmayan / süresi dolmuş kare satırı hiç dönmez.
  if (!data) return { ...fallback, state: 'removed' };

  const row = data as unknown as StoryItemRow;
  const expiresAtMs = row.expires_at ? Date.parse(row.expires_at) : Number.NaN;
  const expired = Number.isFinite(expiresAtMs) && expiresAtMs <= Date.now();

  if (row.status !== 'published' || expired) {
    return { ...fallback, state: 'removed' };
  }

  return {
    state: 'available',
    mediaUrl: resolveStoryMediaUrl(row.media_url) ?? fallback.mediaUrl,
    thumbUrl: resolveStoryThumbUrl(row.thumb_url, row.media_url) ?? fallback.thumbUrl,
    mediaType: row.media_type === 'video' ? 'video' : 'image',
  };
}
