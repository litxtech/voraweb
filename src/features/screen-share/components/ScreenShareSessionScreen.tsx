import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  BackHandler,
  StyleSheet,
  View,
} from 'react-native';
import { router, useNavigation, type Href } from 'expo-router';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import {
  SCREEN_SHARE_ACCENT,
  SCREEN_SHARE_ROOM_BG,
  screenShareSessionPath,
} from '@/features/screen-share/constants';
import { ScreenSharePasswordSheet } from '@/features/screen-share/components/ScreenSharePasswordSheet';
import { ScreenShareRoomBody } from '@/features/screen-share/components/ScreenShareRoomBody';
import {
  deleteScreenShareSession,
  fetchLiveKitScreenShareToken,
  fetchScreenShareSession,
  joinScreenShareSession,
  leaveScreenShareSession,
  requestScreenShareInvite,
  ScreenSharePasswordRequiredError,
} from '@/features/screen-share/services/screenShareSessionService';
import { configureScreenShareAudioSession } from '@/features/screen-share/services/screenShareAudioSession';
import { clearScreenShareIntent } from '@/features/screen-share/services/screenShareIntentStore';
import { invalidateHubRoomsCache } from '@/features/screen-share/services/hubRoomsCache';
import { shareScreenShareInvite } from '@/features/screen-share/services/screenShareInviteShare';
import {
  cancelScheduledScreenShareLeave,
  scheduleScreenShareLeave,
} from '@/features/screen-share/services/screenShareLeaveGate';
import { ssLog } from '@/features/screen-share/services/screenShareDebugLog';
import { releaseScreenShareAudio } from '@/features/screen-share/services/releaseScreenShareAudio';
import { useScreenSharePipStore } from '@/features/screen-share/store/screenSharePipStore';
import type { ScreenShareSession } from '@/features/screen-share/types';
import { spacing } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import { ensureLiveKitGlobals } from '@/lib/livekit/ensureLiveKitGlobals';
import { ensureDomEventShim } from '@/lib/shims/domEvent';

type Props = {
  sessionId: string;
  /** Davet linkindeki ?c= join kodu — fetch RLS/yarışından bağımsız katılım */
  inviteJoinCode?: string;
};

type TokenBundle = {
  token: string;
  url: string;
  canPublish: boolean;
  isHost: boolean;
};

export function ScreenShareSessionScreen({ sessionId, inviteJoinCode }: Props) {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const { user } = useAuth();
  const [session, setSession] = useState<ScreenShareSession | null>(null);
  const [tokenBundle, setTokenBundle] = useState<TokenBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinPasswordOpen, setJoinPasswordOpen] = useState(false);
  const [joinBusy, setJoinBusy] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [pendingJoinCode, setPendingJoinCode] = useState('');
  const joinedRef = useRef(false);
  const leftRef = useRef(false);
  const pipExitRef = useRef(false);
  const forceLeaveRef = useRef(false);
  /** finishBoot sonrası kısa süre — sahte beforeRemove’u PiP’e çevirme, odaya geri bas */
  const bootGraceUntilRef = useRef(0);
  const sessionIdRef = useRef(sessionId);
  const tokenBundleRef = useRef(tokenBundle);
  tokenBundleRef.current = tokenBundle;

  const leavePresence = useCallback(async () => {
    if (leftRef.current || !joinedRef.current) return;
    leftRef.current = true;
    joinedRef.current = false;
    ssLog('session.leavePresence', { sessionId });
    await leaveScreenShareSession(sessionId).catch(() => undefined);
  }, [sessionId]);

  const finishBoot = async (next: ScreenShareSession) => {
    ssLog('session.finishBoot.start', { sessionId: next.id });
    setSession(next);
    const tk = await fetchLiveKitScreenShareToken(next.id || sessionId);
    const bundle = {
      token: tk.token,
      url: tk.url,
      canPublish: tk.canPublish,
      isHost: tk.isHost,
    };
    setTokenBundle(bundle);
    useScreenSharePipStore.getState().activate(next, bundle);
    joinedRef.current = true;
    leftRef.current = false;
    bootGraceUntilRef.current = Date.now() + 2500;
    ssLog('session.finishBoot.ok', {
      sessionId: next.id,
      isHost: bundle.isHost,
      canPublish: bundle.canPublish,
      tokenLen: bundle.token.length,
      bootGraceUntil: bootGraceUntilRef.current,
    });
  };

  useEffect(() => {
    let cancelled = false;
    cancelScheduledScreenShareLeave();
    pipExitRef.current = false;
    ssLog('session.boot.effect', { sessionId, inviteJoinCode: inviteJoinCode ?? null });

    const pip = useScreenSharePipStore.getState();

    // Pip store veya local state: aynı oda — Strict Mode / ?c= için yeniden join yok
    if (pip.active && pip.session?.id === sessionId && pip.tokenBundle) {
      ssLog('session.boot.restorePip', { sessionId, minimized: pip.minimized });
      sessionIdRef.current = sessionId;
      setSession(pip.session);
      setTokenBundle(pip.tokenBundle);
      joinedRef.current = true;
      leftRef.current = false;
      setLoading(false);
      pip.expand();
      bootGraceUntilRef.current = Date.now() + 2500;
      return () => {
        cancelled = true;
        ssLog('session.boot.cleanup', { sessionId, path: 'restorePip' });
      };
    }

    const sameRoom =
      sessionIdRef.current === sessionId &&
      joinedRef.current &&
      Boolean(tokenBundleRef.current);

    if (sameRoom) {
      ssLog('session.boot.sameRoom', { sessionId });
      useScreenSharePipStore.getState().expand();
      return () => {
        cancelled = true;
        ssLog('session.boot.cleanup', { sessionId, path: 'sameRoom' });
      };
    }

    sessionIdRef.current = sessionId;
    leftRef.current = false;
    joinedRef.current = false;
    setTokenBundle(null);
    setSession(null);
    ssLog('session.boot.fresh', { sessionId });

    const boot = async () => {
      ensureDomEventShim();
      setLoading(true);
      setJoinPasswordOpen(false);
      try {
        ensureLiveKitGlobals();
        await configureScreenShareAudioSession();

        const codeFromLink = inviteJoinCode?.replace(/\D/g, '');
        let joinCode = codeFromLink && codeFromLink.length === 6 ? codeFromLink : '';
        let fetched: ScreenShareSession | null = null;

        if (!joinCode) {
          fetched = await fetchScreenShareSession(sessionId);
          if (!fetched || fetched.status !== 'live') {
            throw new Error('Oda bulunamadı veya sona erdi');
          }
          joinCode = fetched.joinCode;
        }

        try {
          ssLog('session.join.rpc', { sessionId, joinCode });
          const next = await joinScreenShareSession(joinCode);
          if (cancelled) {
            ssLog('session.join.cancelledAfterRpc', { sessionId });
            return;
          }
          await finishBoot(next);
        } catch (err) {
          if (err instanceof ScreenSharePasswordRequiredError) {
            if (cancelled) return;
            if (!fetched) {
              fetched = await fetchScreenShareSession(sessionId).catch(() => null);
            }
            setSession(
              fetched ?? {
                id: sessionId,
                joinCode,
                livekitRoomName: '',
                hostUserId: '',
                title: 'Şifreli oda',
                status: 'live',
                participantCount: 0,
                createdAt: new Date().toISOString(),
                endedAt: null,
                hasPassword: true,
                isHidden: false,
              },
            );
            setPendingJoinCode(joinCode);
            setJoinPasswordOpen(true);
            ssLog('session.join.passwordRequired', { sessionId });
            return;
          }
          throw err;
        }
      } catch (err) {
        if (cancelled) return;
        ssLog('session.boot.error', {
          sessionId,
          message: err instanceof Error ? err.message : String(err),
        });
        Alert.alert('Sesli oda', err instanceof Error ? err.message : 'Bağlanılamadı', [
          { text: 'Tamam', onPress: () => router.replace('/screen-share') },
        ]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void boot();

    // ÖNEMLİ: cleanup'ta leave / AudioSession.stop YOK.
    // HMR / Strict Mode / kısa unmount reconnect fırtınası + WS 1000 üretir;
    // MediaProjection track'i de ölür. Gerçek çıkış beforeRemove / onLeave'de.
    return () => {
      cancelled = true;
      ssLog('session.boot.cleanup', { sessionId, path: 'fresh' });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, inviteJoinCode]);

  const onMinimize = useCallback(
    (micEnabled?: boolean) => {
      const pip = useScreenSharePipStore.getState();
      const sess = session ?? pip.session;
      const token = tokenBundle ?? pip.tokenBundle;
      if (!sess || !token || sess.id !== sessionId) return;
      ssLog('session.minimize', { sessionId, canGoBack: router.canGoBack() });
      pipExitRef.current = true;
      cancelScheduledScreenShareLeave();
      const mic = micEnabled ?? pip.micEnabled;
      // Önce PiP state — beforeRemove skipPip görsün; mini pencere Gate’te çizilir
      pip.activateMinimized(sess, token, mic);
      // Hub’a dön — back bazen yanlış stack’e gidip PiP’siz bırakıyordu
      router.replace('/screen-share');
    },
    [session, tokenBundle, sessionId],
  );

  // Edge swipe açık: beforeRemove → PiP. preventDefault yok (native-stack).
  useEffect(() => {
    navigation.setOptions({
      gestureEnabled: true,
      fullScreenGestureEnabled: true,
      headerBackButtonMenuEnabled: false,
    });
  }, [navigation]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (forceLeaveRef.current) return false;
      const pip = useScreenSharePipStore.getState();
      // Loading sırasında da geri = PiP (default back → leave + Abort olmasın)
      if (pip.active && pip.session?.id === sessionId && pip.tokenBundle) {
        ssLog('session.hardwareBack.pip', { sessionId });
        onMinimize();
        return true;
      }
      if (!session || !tokenBundle) return false;
      ssLog('session.hardwareBack.minimize', { sessionId });
      onMinimize();
      return true;
    });
    return () => sub.remove();
  }, [session, tokenBundle, onMinimize, sessionId]);

  useEffect(() => {
    const leavingId = sessionId;
    const sub = navigation.addListener('beforeRemove', () => {
      // preventDefault YOK — native-stack JS/native state ayrışmasın
      const pip = useScreenSharePipStore.getState();
      ssLog('session.beforeRemove', {
        sessionId: leavingId,
        pipExit: pipExitRef.current,
        forceLeave: forceLeaveRef.current,
        minimized: pip.minimized,
        active: pip.active,
        pipSessionId: pip.session?.id ?? null,
      });
      if (pipExitRef.current || pip.minimized) {
        ssLog('session.beforeRemove.skipPip', { sessionId: leavingId });
        return;
      }
      // Bilinçli çıkış (onLeave/onDelete) — store zaten clear
      if (forceLeaveRef.current) {
        ssLog('session.beforeRemove.forceLeave', { sessionId: leavingId });
        return;
      }
      // Beklenmedik pop — boot grace’te odaya geri bas (Provider remount thrash)
      if (pip.active && pip.session?.id === leavingId && pip.tokenBundle) {
        if (Date.now() < bootGraceUntilRef.current) {
          ssLog('session.beforeRemove.bootGraceRepush', { sessionId: leavingId });
          queueMicrotask(() => {
            router.replace(screenShareSessionPath(leavingId) as Href);
          });
          return;
        }
        ssLog('session.beforeRemove.unexpectedToPip', { sessionId: leavingId });
        pipExitRef.current = true;
        pip.activateMinimized(pip.session, pip.tokenBundle, pip.micEnabled);
        return;
      }
      scheduleScreenShareLeave(leavingId, (id) => {
        const now = useScreenSharePipStore.getState();
        if (now.active && now.session?.id === id) {
          ssLog('session.leave.skippedStillActive', { sessionId: id });
          return;
        }
        ssLog('session.leave.execute', {
          sessionId: id,
          active: now.active,
          pipSessionId: now.session?.id ?? null,
        });
        clearScreenShareIntent();
        now.clear();
        void leaveScreenShareSession(id).catch(() => undefined);
        void releaseScreenShareAudio(null);
      });
    });
    return sub;
  }, [navigation, sessionId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void configureScreenShareAudioSession().catch(() => undefined);
    });
    return () => sub.remove();
  }, []);

  const onPasswordJoin = async (password: string | null) => {
    if (!password) {
      Alert.alert('Şifre', 'Bu oda için şifre gerekli');
      return;
    }
    setJoinBusy(true);
    try {
      const next = await joinScreenShareSession(pendingJoinCode, password);
      setJoinPasswordOpen(false);
      setLoading(true);
      await finishBoot(next);
    } catch (err) {
      Alert.alert('Katıl', err instanceof Error ? err.message : 'Giriş başarısız');
    } finally {
      setJoinBusy(false);
      setLoading(false);
    }
  };

  const onRequestInvite = async () => {
    if (!pendingJoinCode) return;
    setInviteBusy(true);
    try {
      await requestScreenShareInvite(pendingJoinCode);
      setJoinPasswordOpen(false);
      Alert.alert('Davet isteği', 'Host’a bildirildi. Kabul edilince tekrar dene.', [
        { text: 'Tamam', onPress: () => router.replace('/screen-share') },
      ]);
    } catch (err) {
      Alert.alert('Davet', err instanceof Error ? err.message : 'İstek gönderilemedi');
    } finally {
      setInviteBusy(false);
    }
  };

  const onCopyCode = async () => {
    if (!session) return;
    await shareScreenShareInvite({
      sessionId: session.id,
      title: session.title,
      joinCode: session.joinCode,
      hasPassword: session.hasPassword,
      isHidden: session.isHidden,
    }).catch(() => undefined);
  };

  const onLeave = async () => {
    ssLog('session.onLeave', { sessionId });
    forceLeaveRef.current = true;
    pipExitRef.current = false;
    cancelScheduledScreenShareLeave();
    clearScreenShareIntent();
    useScreenSharePipStore.getState().clear();
    invalidateHubRoomsCache();
    await leavePresence();
    await releaseScreenShareAudio(null);
    router.replace('/screen-share');
  };

  const onDelete = async () => {
    ssLog('session.onDelete', { sessionId });
    forceLeaveRef.current = true;
    pipExitRef.current = false;
    cancelScheduledScreenShareLeave();
    clearScreenShareIntent();
    useScreenSharePipStore.getState().clear();
    leftRef.current = true;
    joinedRef.current = false;
    await deleteScreenShareSession(sessionId).catch(() => undefined);
    invalidateHubRoomsCache();
    await releaseScreenShareAudio(null);
    router.replace('/screen-share');
  };

  if (joinPasswordOpen) {
    return (
      <View style={[styles.centered, { backgroundColor: SCREEN_SHARE_ROOM_BG, paddingTop: insets.top }]}>
        <ScreenSharePasswordSheet
          visible
          title="Oda şifresi gerekli"
          subtitle="Şifreyi biliyorsan gir. Bilmiyorsan host’tan davet iste."
          confirmLabel="Giriş yap"
          busy={joinBusy}
          inviteBusy={inviteBusy}
          onRequestInvite={() => void onRequestInvite()}
          onClose={() => router.replace('/screen-share')}
          onSubmit={(password) => void onPasswordJoin(password)}
        />
      </View>
    );
  }

  // Token varken loading spinner LiveKitRoom'u sökmesin (connecting→leave ERROR).
  if (!session || !tokenBundle) {
    return (
      <View style={[styles.centered, { backgroundColor: SCREEN_SHARE_ROOM_BG, paddingTop: insets.top }]}>
        <ActivityIndicator color={SCREEN_SHARE_ACCENT} />
        <Text secondary style={{ marginTop: spacing.md }}>
          {loading ? 'Odaya bağlanıyor…' : 'Oda yükleniyor…'}
        </Text>
      </View>
    );
  }

  const isHost = tokenBundle.isHost || session.hostUserId === user?.id;

  // LiveKit ScreenShareLiveKitGate içinde — burada ikinci Room açılmaz
  return (
    <View style={[styles.root, { backgroundColor: SCREEN_SHARE_ROOM_BG, paddingTop: insets.top }]}>
      <ScreenShareRoomBody
        session={session}
        isHost={isHost}
        onCopyCode={() => void onCopyCode()}
        onLeave={() => void onLeave()}
        onDelete={() => void onDelete()}
        onSessionPatch={(next) => {
          setSession(next);
          useScreenSharePipStore.getState().patchSession(next);
        }}
        onMinimize={onMinimize}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
