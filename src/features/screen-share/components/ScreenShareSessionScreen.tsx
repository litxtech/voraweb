import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Share, StyleSheet, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { AudioSession, LiveKitRoom, registerGlobals } from '@livekit/react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import { ScreenShareRoomBody } from '@/features/screen-share/components/ScreenShareRoomBody';
import {
  endScreenShareSession,
  fetchLiveKitScreenShareToken,
  fetchScreenShareSession,
  joinScreenShareSession,
  leaveScreenShareSession,
} from '@/features/screen-share/services/screenShareSessionService';
import type { ScreenShareSession } from '@/features/screen-share/types';
import { spacing } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';
import { ensureDomEventShim } from '@/lib/shims/domEvent';

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
  const { user } = useAuth();
  const [session, setSession] = useState<ScreenShareSession | null>(null);
  const [tokenBundle, setTokenBundle] = useState<TokenBundle | null>(null);
  const [loading, setLoading] = useState(true);
  const hasRoomRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      ensureDomEventShim();
      // LiveKitRoom bir kez mount olduktan sonra loading=true yapma → connect abort olmasın.
      if (!hasRoomRef.current) setLoading(true);
      try {
        if (!globalsRegistered) {
          registerGlobals();
          globalsRegistered = true;
        }
        await AudioSession.startAudioSession();

        let next = await fetchScreenShareSession(sessionId);
        if (!next || next.status !== 'live') {
          throw new Error('Oda bulunamadı veya kapandı');
        }
        next = await joinScreenShareSession(next.joinCode);
        if (cancelled) return;
        setSession(next);
        const tk = await fetchLiveKitScreenShareToken(sessionId);
        if (cancelled) return;
        setTokenBundle({
          token: tk.token,
          url: tk.url,
          canPublish: tk.canPublish,
          isHost: tk.isHost,
        });
        hasRoomRef.current = true;
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

    return () => {
      cancelled = true;
      void leaveScreenShareSession(sessionId).catch(() => undefined);
      void AudioSession.stopAudioSession().catch(() => undefined);
    };
  }, [sessionId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      void AudioSession.startAudioSession().catch(() => undefined);
    });
    return () => sub.remove();
  }, []);

  const onCopyCode = async () => {
    if (!session) return;
    await Clipboard.setStringAsync(session.joinCode);
    await Share.share({
      message: `Vora sesli oda kodu: ${session.joinCode}\nEkranı rahatça izle.`,
    }).catch(() => undefined);
  };

  const onLeave = async () => {
    await leaveScreenShareSession(sessionId).catch(() => undefined);
    void AudioSession.stopAudioSession().catch(() => undefined);
    router.replace('/screen-share');
  };

  const onEnd = async () => {
    await endScreenShareSession(sessionId).catch(() => undefined);
    void AudioSession.stopAudioSession().catch(() => undefined);
    router.replace('/screen-share');
  };

  if (loading || !session || !tokenBundle) {
    return (
      <View style={[styles.centered, { backgroundColor: '#05070A', paddingTop: insets.top }]}>
        <ActivityIndicator color={SCREEN_SHARE_ACCENT} />
        <Text secondary style={{ marginTop: spacing.md }}>
          Odaya bağlanıyor…
        </Text>
      </View>
    );
  }

  const isHost = tokenBundle.isHost || session.hostUserId === user?.id;

  return (
    <View style={[styles.root, { backgroundColor: '#05070A', paddingTop: insets.top }]}>
      <LiveKitRoom
        serverUrl={tokenBundle.url}
        token={tokenBundle.token}
        connect
        audio
        video={false}
        options={{
          adaptiveStream: false,
          dynacast: true,
          stopLocalTrackOnUnpublish: true,
        }}
      >
        <ScreenShareRoomBody
          session={session}
          isHost={isHost}
          onCopyCode={() => void onCopyCode()}
          onLeave={() => void onLeave()}
          onEnd={() => void onEnd()}
        />
      </LiveKitRoom>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
