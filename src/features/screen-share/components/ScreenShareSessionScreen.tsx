import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, View } from 'react-native';
import { AudioSession, LiveKitRoom, registerGlobals } from '@livekit/react-native';
import { router, useNavigation } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
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
import { shareScreenShareInvite } from '@/features/screen-share/services/screenShareInviteShare';
import type { ScreenShareSession } from '@/features/screen-share/types';
import { spacing } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import { ensureDomEventShim } from '@/lib/shims/domEvent';

/**
 * stopLocalTrackOnUnpublish: false — reconnect/unpublish sırasında Android
 * MediaProjection track'ini öldürme; keep-alive yeniden publish eder.
 */
const LIVEKIT_ROOM_OPTIONS = {
  adaptiveStream: false,
  dynacast: false,
  stopLocalTrackOnUnpublish: false,
} as const;

let globalsRegistered = false;

type Props = { sessionId: string };

type TokenBundle = {
  token: string;
  url: string;
  canPublish: boolean;
  isHost: boolean;
};

export function ScreenShareSessionScreen({ sessionId }: Props) {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
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
  const roomOptions = useMemo(() => LIVEKIT_ROOM_OPTIONS, []);

  const leavePresence = useCallback(async () => {
    if (leftRef.current || !joinedRef.current) return;
    leftRef.current = true;
    joinedRef.current = false;
    await leaveScreenShareSession(sessionId).catch(() => undefined);
  }, [sessionId]);

  const finishBoot = async (next: ScreenShareSession) => {
    setSession(next);
    const tk = await fetchLiveKitScreenShareToken(sessionId);
    setTokenBundle({
      token: tk.token,
      url: tk.url,
      canPublish: tk.canPublish,
      isHost: tk.isHost,
    });
    joinedRef.current = true;
    leftRef.current = false;
  };

  useEffect(() => {
    let cancelled = false;
    leftRef.current = false;
    joinedRef.current = false;

    const boot = async () => {
      ensureDomEventShim();
      setLoading(true);
      try {
        if (!globalsRegistered) {
          registerGlobals();
          globalsRegistered = true;
        }
        await configureScreenShareAudioSession();

        const fetched = await fetchScreenShareSession(sessionId);
        if (!fetched || fetched.status !== 'live') {
          throw new Error('Oda bulunamadı veya sona erdi');
        }
        try {
          const next = await joinScreenShareSession(fetched.joinCode);
          if (cancelled) return;
          await finishBoot(next);
        } catch (err) {
          if (err instanceof ScreenSharePasswordRequiredError) {
            if (cancelled) return;
            setSession(fetched);
            setPendingJoinCode(fetched.joinCode);
            setJoinPasswordOpen(true);
            return;
          }
          throw err;
        }
      } catch (err) {
        if (cancelled) return;
        Alert.alert('Sesli oda', err instanceof Error ? err.message : 'Bağlanılamadı', [
          { text: 'Tamam', onPress: () => router.back() },
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    const sub = navigation.addListener('beforeRemove', () => {
      clearScreenShareIntent();
      void leavePresence();
      void AudioSession.stopAudioSession().catch(() => undefined);
    });
    return sub;
  }, [navigation, leavePresence]);

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
      // LiveKitRoom'u sökme — token yokken zaten spinner; token gelince mount olur.
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
    }).catch(() => undefined);
  };

  const onLeave = async () => {
    clearScreenShareIntent();
    await leavePresence();
    void AudioSession.stopAudioSession().catch(() => undefined);
    router.replace('/screen-share');
  };

  const onDelete = async () => {
    clearScreenShareIntent();
    leftRef.current = true;
    joinedRef.current = false;
    await deleteScreenShareSession(sessionId).catch(() => undefined);
    void AudioSession.stopAudioSession().catch(() => undefined);
    router.replace('/screen-share');
  };

  if ((loading || !session || !tokenBundle) && !joinPasswordOpen) {
    return (
      <View style={[styles.centered, { backgroundColor: '#05070A', paddingTop: insets.top }]}>
        <ActivityIndicator color={SCREEN_SHARE_ACCENT} />
        <Text secondary style={{ marginTop: spacing.md }}>
          Odaya bağlanıyor…
        </Text>
      </View>
    );
  }

  if (joinPasswordOpen) {
    return (
      <View style={[styles.centered, { backgroundColor: '#05070A', paddingTop: insets.top }]}>
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

  if (!session || !tokenBundle) {
    return null;
  }

  const isHost = tokenBundle.isHost || session.hostUserId === user?.id;

  return (
    <View style={[styles.root, { backgroundColor: '#05070A', paddingTop: insets.top }]}>
      <LiveKitRoom
        key={tokenBundle.token}
        serverUrl={tokenBundle.url}
        token={tokenBundle.token}
        connect
        audio
        video={false}
        options={roomOptions}
      >
        <ScreenShareRoomBody
          session={session}
          isHost={isHost}
          onCopyCode={() => void onCopyCode()}
          onLeave={() => void onLeave()}
          onDelete={() => void onDelete()}
          onSessionPatch={setSession}
        />
      </LiveKitRoom>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
