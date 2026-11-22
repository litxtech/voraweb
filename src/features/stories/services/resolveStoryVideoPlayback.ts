import { supabase } from '@/lib/supabase/client';

type PlaybackUrlRpc = (
  fn: 'get_story_video_playback_url',
  args: { p_video_id: string },
) => PromiseLike<{ data: string | null; error: { message: string } | null }>;

/**
 * İşlenmekte olan hikâye videosunun yayın URL'sini çözer.
 *
 * `mux-sync-upload` yalnızca videonun sahibine izin verir; başka birinin
 * hikâyesini izleyen kullanıcı bu yüzden `vora://video-processing/...`
 * adresini hiç çözemiyor ve boş ekranla kalıyordu. Bu RPC yayınlanmış
 * hikâye karelerine bağlı hazır videoların URL'sini herkese açar.
 */
export async function resolveStoryVideoPlayback(videoId: string): Promise<string | null> {
  if (!videoId) return null;

  // RPC henüz üretilmiş tiplerde yok: imzayı yerelde daraltıyoruz.
  const { data, error } = await (supabase.rpc as unknown as PlaybackUrlRpc)(
    'get_story_video_playback_url',
    { p_video_id: videoId },
  );

  if (error) return null;
  return typeof data === 'string' && data.trim().length > 0 ? data : null;
}
