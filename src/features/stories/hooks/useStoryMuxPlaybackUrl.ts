import { useEffect, useState } from 'react';
import { syncMuxVideo } from '@/lib/mux/client';
import { isProcessingVideoUrl, parseProcessingVideoId } from '@/lib/media/videoProcessingUrl';
import {
  getCachedMuxPlaybackUrl,
  rememberMuxPlaybackUrl,
  setCachedMuxPlaybackUrl,
} from '@/features/stories/services/storyMuxPlaybackCache';
import { resolveStoryVideoPlayback } from '@/features/stories/services/resolveStoryVideoPlayback';
import { kickstartMuxSync } from '@/services/video/muxPoll';

function pollDelayMs(elapsedMs: number): number {
  if (elapsedMs < 20_000) return 500;
  if (elapsedMs < 60_000) return 1200;
  return 2500;
}

/** Mux `error` durumunu birkaç kez teyit et (geçici edge function hatası ile karışmasın). */
const MUX_ERROR_CONFIRMATIONS = 3;

/** Mux işlenirken hikâye videosunu oynatılabilir HLS URL'sine çevirir. */
export function useStoryMuxPlaybackUrl(mediaUrl: string | null | undefined): {
  playbackUrl: string | null;
  isProcessing: boolean;
  /** Mux varlığı kalıcı hata verdi ya da işleme kimliği bozuk. */
  failed: boolean;
} {
  const [failed, setFailed] = useState(false);
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(() => {
    if (!mediaUrl) return null;
    if (!isProcessingVideoUrl(mediaUrl)) return mediaUrl;
    const videoId = parseProcessingVideoId(mediaUrl);
    return videoId ? getCachedMuxPlaybackUrl(videoId) : null;
  });

  useEffect(() => {
    setFailed(false);
    if (!mediaUrl) {
      setPlaybackUrl(null);
      return;
    }

    if (!isProcessingVideoUrl(mediaUrl)) {
      setPlaybackUrl(mediaUrl);
      return;
    }

    const videoId = parseProcessingVideoId(mediaUrl);
    if (!videoId) {
      setPlaybackUrl(null);
      setFailed(true);
      return;
    }

    const cached = getCachedMuxPlaybackUrl(videoId);
    if (cached) {
      setPlaybackUrl(cached);
      return;
    }

    let cancelled = false;
    let errorCount = 0;
    setPlaybackUrl(null);
    kickstartMuxSync(videoId);

    const started = Date.now();

    const poll = async () => {
      while (!cancelled) {
        /**
         * Önce herkese açık çözümleme: izleyici videonun sahibi değilse
         * `mux-sync-upload` 403 veriyor ve URL hiç gelmiyordu (boş ekran).
         */
        const resolved = await resolveStoryVideoPlayback(videoId).catch(() => null);
        if (cancelled) return;
        if (resolved) {
          rememberMuxPlaybackUrl(videoId, resolved);
          setPlaybackUrl(resolved);
          return;
        }

        try {
          const result = await syncMuxVideo(videoId);
          if (cancelled) return;
          if (result.status === 'ready' && result.playbackId) {
            setPlaybackUrl(setCachedMuxPlaybackUrl(videoId, result.playbackId));
            return;
          }
          if (result.status === 'error') {
            errorCount += 1;
            if (errorCount >= MUX_ERROR_CONFIRMATIONS) {
              if (__DEV__) {
                console.warn('[STORY_ERROR]', { stage: 'viewer-mux', reason: 'asset-error' });
              }
              setFailed(true);
              return;
            }
          } else {
            errorCount = 0;
          }
        } catch {
          /* izleyici sahibi değil ya da geçici hata: RPC ile tekrar dene */
        }
        await new Promise((resolve) => setTimeout(resolve, pollDelayMs(Date.now() - started)));
      }
    };

    void poll();

    return () => {
      cancelled = true;
    };
  }, [mediaUrl]);

  const isProcessing = Boolean(
    mediaUrl && isProcessingVideoUrl(mediaUrl) && !playbackUrl && !failed,
  );
  return {
    playbackUrl: playbackUrl ?? (mediaUrl && isProcessingVideoUrl(mediaUrl) ? null : mediaUrl ?? null),
    isProcessing,
    failed,
  };
}
