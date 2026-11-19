import { AudioSession } from '@livekit/react-native';
import type { Room } from 'livekit-client';
import { ssLog } from '@/features/screen-share/services/screenShareDebugLog';
import { disposeScreenShareLiveKitRoom } from '@/features/screen-share/services/screenShareLiveKitSession';

/**
 * Oda kapanınca mikrofon + ekran + LiveKit + OS ses oturumunu bırak.
 * (PiP açıkken çağırma — yalnızca çıkış / PiP X.)
 *
 * `room` argümanı geriye dönük uyumluluk için; singleton dispose edilir.
 */
export async function releaseScreenShareAudio(_room?: Room | null): Promise<void> {
  const stack = new Error().stack?.split('\n').slice(1, 5).join(' | ') ?? '';
  ssLog('audio.release', { stack });
  try {
    await disposeScreenShareLiveKitRoom();
  } finally {
    await AudioSession.stopAudioSession().catch(() => undefined);
  }
}
