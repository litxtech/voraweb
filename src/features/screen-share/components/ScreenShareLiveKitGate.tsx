import { type ReactNode, useCallback, useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { router, type Href } from 'expo-router';
import { RoomContext } from '@livekit/react-native';
import { ScreenShareMiniWindow } from '@/features/screen-share/components/ScreenShareMiniWindow';
import { ScreenSharePipRoomBridge } from '@/features/screen-share/components/ScreenSharePipRoomBridge';
import { screenShareSessionPath } from '@/features/screen-share/constants';
import { leaveScreenShareSession } from '@/features/screen-share/services/screenShareSessionService';
import { clearScreenShareIntent } from '@/features/screen-share/services/screenShareIntentStore';
import { invalidateHubRoomsCache } from '@/features/screen-share/services/hubRoomsCache';
import { cancelScheduledScreenShareLeave } from '@/features/screen-share/services/screenShareLeaveGate';
import { releaseScreenShareAudio } from '@/features/screen-share/services/releaseScreenShareAudio';
import { ssLog } from '@/features/screen-share/services/screenShareDebugLog';
import {
  acquireScreenShareLiveKitRoom,
  bindScreenShareAutoMic,
  ensureScreenShareLiveKitConnected,
} from '@/features/screen-share/services/screenShareLiveKitSession';
import { useScreenSharePipStore } from '@/features/screen-share/store/screenSharePipStore';
import { ensureLiveKitGlobals } from '@/lib/livekit/ensureLiveKitGlobals';

/**
 * Tek LiveKit bağlantısı — oda + PiP aynı Room.
 *
 * ÖNEMLİ: RoomContext.Provider HER ZAMAN aynı yerde.
 * active olunca Provider eklemek tüm navigator’ı remount edip
 * beforeRemove → ilk girişte “atılma” üretiyordu; 2. girişte Provider
 * zaten vardı diye sorunsuzdu.
 */
export function ScreenShareLiveKitGate({ children }: { children: ReactNode }) {
  const active = useScreenSharePipStore((s) => s.active);
  const minimized = useScreenSharePipStore((s) => s.minimized);
  const session = useScreenSharePipStore((s) => s.session);
  const tokenBundle = useScreenSharePipStore((s) => s.tokenBundle);
  const clear = useScreenSharePipStore((s) => s.clear);
  const expand = useScreenSharePipStore((s) => s.expand);

  ensureLiveKitGlobals();
  const room = acquireScreenShareLiveKitRoom();

  useEffect(() => {
    ssLog('gate.effect', {
      active,
      minimized: useScreenSharePipStore.getState().minimized,
      sessionId: session?.id ?? null,
      hasToken: Boolean(tokenBundle),
    });
    if (!active || !session || !tokenBundle) return;

    let cancelled = false;
    void ensureScreenShareLiveKitConnected({
      sessionId: session.id,
      url: tokenBundle.url,
      token: tokenBundle.token,
    }).catch((err) => {
      if (cancelled) return;
      ssLog('gate.connect.catch', {
        message: err instanceof Error ? err.message : String(err),
      });
    });

    return () => {
      cancelled = true;
      ssLog('gate.effect.cleanup', { sessionId: session.id });
    };
  }, [active, session?.id, tokenBundle?.token, tokenBundle?.url]);

  useEffect(() => {
    if (!active || !tokenBundle) return;
    ssLog('gate.bindMic', { hasRoom: true });
    return bindScreenShareAutoMic(room);
  }, [active, tokenBundle, room]);

  const onExpand = useCallback(() => {
    const id = session?.id;
    if (!id) return;
    ssLog('gate.expand', { sessionId: id });
    expand();
    router.push(screenShareSessionPath(id) as Href);
  }, [session?.id, expand]);

  const onClose = useCallback(() => {
    const snap = useScreenSharePipStore.getState();
    const id = snap.session?.id ?? session?.id ?? null;
    ssLog('gate.pipClose', { sessionId: id });
    cancelScheduledScreenShareLeave();
    clearScreenShareIntent();
    clear();
    invalidateHubRoomsCache();
    if (id) {
      void leaveScreenShareSession(id).catch(() => undefined);
    }
    void releaseScreenShareAudio(null);
  }, [session?.id, clear]);

  return (
    <View style={styles.root} collapsable={false}>
      <RoomContext.Provider value={room}>
        {active && tokenBundle ? <ScreenSharePipRoomBridge /> : null}
        {children}
      </RoomContext.Provider>
      {minimized && session ? (
        <View
          style={styles.overlay}
          pointerEvents="box-none"
          collapsable={false}
          {...(Platform.OS === 'android' ? { renderToHardwareTextureAndroid: true } : null)}
        >
          <ScreenShareMiniWindow
            title={session.title}
            coverUrl={session.coverImageUrl}
            participantCount={session.participantCount}
            onExpand={onExpand}
            onClose={onClose}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99990,
    elevation: 99990,
  },
});
