import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { AudioSession, useLocalParticipant, useRoomContext } from '@livekit/react-native';
import { Track } from 'livekit-client';

/**
 * Dizi / başka uygulamaya geçip Vora’ya dönünce izlemeyi toparlar:
 * - ses oturumunu yeniden açar
 * - uzak ekran track’lerine aboneliği zorlar
 * - paylaşım bayrağını takip eder (toolbar yeniden publish için kullanır)
 */
export function useScreenShareKeepAlive() {
  const room = useRoomContext();
  const { isScreenShareEnabled } = useLocalParticipant();
  const wasSharingRef = useRef(false);

  useEffect(() => {
    if (isScreenShareEnabled) wasSharingRef.current = true;
  }, [isScreenShareEnabled]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const resume = async () => {
      try {
        await AudioSession.startAudioSession();
      } catch {
        // ignore
      }
      if (!room) return;

      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((pub) => {
          if (pub.source === Track.Source.ScreenShare && !pub.isSubscribed) {
            pub.setSubscribed(true);
          }
        });
      });
    };

    const onChange = (state: AppStateStatus) => {
      if (state !== 'active') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void resume();
      }, 280);
    };

    const sub = AppState.addEventListener('change', onChange);
    return () => {
      sub.remove();
      if (timer) clearTimeout(timer);
    };
  }, [room]);

  return { wasSharing: wasSharingRef.current || Boolean(isScreenShareEnabled) };
}
