import { useEffect } from 'react';
import { useLocalParticipant } from '@livekit/react-native';
import { configureScreenShareAudioSession } from '@/features/screen-share/services/screenShareAudioSession';
import { useScreenSharePipStore } from '@/features/screen-share/store/screenSharePipStore';

/**
 * Gate LiveKit köprüsü:
 * - Ses oturumu ayakta
 * - PiP’teyken mik store’dan sürdürülür
 * Disconnect burada yok — unmount’ta release girişte Abort üretir.
 */
export function ScreenSharePipRoomBridge() {
  const { localParticipant } = useLocalParticipant();
  const micEnabled = useScreenSharePipStore((s) => s.micEnabled);
  const minimized = useScreenSharePipStore((s) => s.minimized);

  useEffect(() => {
    void configureScreenShareAudioSession().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!localParticipant || !minimized) return;
    void localParticipant.setMicrophoneEnabled(micEnabled).catch(() => undefined);
  }, [localParticipant, micEnabled, minimized]);

  return null;
}
