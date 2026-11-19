import { useEffect } from 'react';
import { AudioSession, useLocalParticipant } from '@livekit/react-native';
import { useScreenSharePipStore } from '@/features/screen-share/store/screenSharePipStore';

/**
 * Tam oda kapanınca mik’i bırak (LiveKitRoom zaten disconnect eder).
 * PiP handoff’ta hiçbir şey yapma — çift bağlantı / WS kick olmasın.
 */
export function ScreenShareSessionAudioBridge() {
  const { localParticipant } = useLocalParticipant();

  useEffect(() => {
    return () => {
      if (useScreenSharePipStore.getState().minimized) return;
      void localParticipant?.setMicrophoneEnabled(false).catch(() => undefined);
      void AudioSession.stopAudioSession().catch(() => undefined);
    };
  }, [localParticipant]);

  return null;
}
