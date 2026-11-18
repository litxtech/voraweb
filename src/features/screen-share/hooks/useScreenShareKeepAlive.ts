import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useLocalParticipant, useRoomContext } from '@livekit/react-native';
import { ConnectionState, RoomEvent, Track } from 'livekit-client';
import { startScreenCapture } from '@/features/screen-share/services/screenCapture';
import { hasScreenShareIntent } from '@/features/screen-share/services/screenShareIntentStore';
import { configureScreenShareAudioSession } from '@/features/screen-share/services/screenShareAudioSession';

const SCREEN_SOURCES = new Set([Track.Source.ScreenShare, Track.Source.ScreenShareAudio]);

/**
 * Film uygulamasına geçip Vora’ya dönünce:
 * - LiveKit + ses ayakta
 * - uzak ekran / ekran sesi aboneliği
 * - host paylaşımı düştüyse niyet varsa yeniden publish
 */
export function useScreenShareKeepAlive() {
  const room = useRoomContext();
  const { isScreenShareEnabled } = useLocalParticipant();
  const republishLockRef = useRef(false);
  const lastBgAtRef = useRef(0);

  useEffect(() => {
    if (!room) return;

    let timer: ReturnType<typeof setTimeout> | null = null;

    const forceSubscribeRemote = () => {
      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((pub) => {
          if (!SCREEN_SOURCES.has(pub.source)) return;
          if (!pub.isSubscribed) pub.setSubscribed(true);
        });
      });
    };

    const republishLocalScreen = async () => {
      if (!hasScreenShareIntent()) return;
      if (room.state !== ConnectionState.Connected) return;
      if (room.localParticipant.isScreenShareEnabled) return;
      if (republishLockRef.current) return;

      republishLockRef.current = true;
      try {
        await startScreenCapture(room, { current: null });
      } catch {
        // İzin / iptal — niyet durur; kullanıcı tekrar “Ekran”a basar.
      } finally {
        republishLockRef.current = false;
      }
    };

    const resume = async () => {
      await configureScreenShareAudioSession();
      forceSubscribeRemote();
      // Arka plandan dönüşte kısa gecikme — MediaProjection FGS toparlansın.
      const awayMs = Date.now() - lastBgAtRef.current;
      const delay = awayMs > 2_000 ? 700 : 350;
      await new Promise((r) => setTimeout(r, delay));
      await republishLocalScreen();
      forceSubscribeRemote();
    };

    const onChange = (state: AppStateStatus) => {
      if (state === 'background' || state === 'inactive') {
        lastBgAtRef.current = Date.now();
        return;
      }
      if (state !== 'active') return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void resume();
      }, 300);
    };

    const onConnected = () => {
      void configureScreenShareAudioSession();
      forceSubscribeRemote();
      void republishLocalScreen();
    };

    const onLocalTrackUnpublished = () => {
      // Beklenmedik düşüş — niyet varsa biraz sonra yeniden dene.
      if (!hasScreenShareIntent()) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void republishLocalScreen();
      }, 900);
    };

    void configureScreenShareAudioSession();
    forceSubscribeRemote();

    const sub = AppState.addEventListener('change', onChange);
    room.on(RoomEvent.Connected, onConnected);
    room.on(RoomEvent.Reconnected, onConnected);
    room.on(RoomEvent.TrackPublished, forceSubscribeRemote);
    room.on(RoomEvent.TrackSubscribed, forceSubscribeRemote);
    room.on(RoomEvent.LocalTrackUnpublished, onLocalTrackUnpublished);

    return () => {
      sub.remove();
      room.off(RoomEvent.Connected, onConnected);
      room.off(RoomEvent.Reconnected, onConnected);
      room.off(RoomEvent.TrackPublished, forceSubscribeRemote);
      room.off(RoomEvent.TrackSubscribed, forceSubscribeRemote);
      room.off(RoomEvent.LocalTrackUnpublished, onLocalTrackUnpublished);
      if (timer) clearTimeout(timer);
    };
  }, [room]);

  return { sharing: Boolean(isScreenShareEnabled) || hasScreenShareIntent() };
}
