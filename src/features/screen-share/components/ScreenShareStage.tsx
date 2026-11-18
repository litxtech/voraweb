import { useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import {
  VideoTrack,
  isTrackReference,
  useConnectionState,
  useLocalParticipant,
  useTracks,
  type TrackReference,
} from '@livekit/react-native';
import { ConnectionState, Track } from 'livekit-client';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT, SCREEN_SHARE_DRM_HINT } from '@/features/screen-share/constants';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';

function pickScreenTrack(tracks: TrackReference[], localIdentity: string): TrackReference | null {
  if (tracks.length === 0) return null;
  // Önce başkasının ekranı (izleme), yoksa kendi yayını (önizleme).
  const remote = tracks.find((t) => t.participant.identity !== localIdentity);
  return remote ?? tracks[0] ?? null;
}

export function ScreenShareStage() {
  const { colors } = useTheme();
  const connectionState = useConnectionState();
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();
  const tracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });
  const screenTracks = useMemo(() => tracks.filter(isTrackReference), [tracks]);
  const primary = useMemo(
    () => pickScreenTrack(screenTracks, localParticipant.identity),
    [screenTracks, localParticipant.identity],
  );

  const isLocal =
    Boolean(primary) && primary!.participant.identity === localParticipant.identity;
  const sharingLocal = Boolean(isScreenShareEnabled) || isLocal;

  /**
   * Arka plandan dönüşte VideoTrack bazen siyah kalır; AppState + connection
   * değişiminde remount ile yeniden bağlanır.
   */
  const [viewEpoch, setViewEpoch] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setViewEpoch((n) => n + 1);
      }
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (connectionState === ConnectionState.Connected) {
      setViewEpoch((n) => n + 1);
    }
  }, [connectionState]);

  const trackKey = primary
    ? `${primary.participant.identity}-${primary.publication.trackSid ?? 'ss'}-${viewEpoch}`
    : `empty-${viewEpoch}`;

  if (connectionState === ConnectionState.Reconnecting) {
    return (
      <View style={[styles.empty, { backgroundColor: '#070B10', borderColor: colors.border }]}>
        <Ionicons name="sync" size={28} color={SCREEN_SHARE_ACCENT} />
        <Text variant="h3" style={{ color: colors.text, fontWeight: '800' }}>
          Yeniden bağlanıyor…
        </Text>
        <Text secondary style={styles.emptyHint}>
          Dizi / başka uygulamadan dönünce yayın biraz sürebilir.
        </Text>
      </View>
    );
  }

  if (!primary) {
    return (
      <View style={[styles.empty, { backgroundColor: '#070B10', borderColor: colors.border }]}>
        <View style={[styles.iconRing, { borderColor: `${SCREEN_SHARE_ACCENT}55` }]}>
          <Ionicons
            name={sharingLocal ? 'radio-outline' : 'desktop-outline'}
            size={36}
            color={SCREEN_SHARE_ACCENT}
          />
        </View>
        <Text variant="h3" style={{ color: colors.text, fontWeight: '800' }}>
          {sharingLocal ? 'Yayın hazırlanıyor…' : 'Ekran henüz yok'}
        </Text>
        <Text secondary style={styles.emptyHint}>
          {sharingLocal
            ? 'Başka uygulamaya geç; buraya dönünce önizleme açılır. İzleyenler yayını görür.'
            : 'Alttan “Ekran”a bas; herkes burada donmadan izler.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.frame}>
      <VideoTrack
        key={trackKey}
        trackRef={primary}
        style={styles.video}
        objectFit="contain"
        mirror={false}
      />
      <View style={styles.badgeRow} pointerEvents="none">
        {isLocal ? (
          <View style={[styles.badge, { backgroundColor: `${SCREEN_SHARE_ACCENT}CC` }]}>
            <Ionicons name="eye-outline" size={12} color="#04110E" />
            <Text style={styles.badgeTextDark}>Sen paylaşıyorsun · önizleme</Text>
          </View>
        ) : (
          <View style={styles.badge}>
            <Ionicons name="desktop-outline" size={12} color="#fff" />
            <Text style={styles.badgeText}>Canlı ekran</Text>
          </View>
        )}
      </View>
      {isLocal ? (
        <View style={styles.hintBar} pointerEvents="none">
          <Text style={styles.hintText}>{SCREEN_SHARE_DRM_HINT}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  iconRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  emptyHint: { textAlign: 'center', maxWidth: 300 },
  frame: {
    flex: 1,
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: '#05070A',
  },
  video: { width: '100%', height: '100%' },
  badgeRow: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    flexDirection: 'row',
    justifyContent: 'flex-start',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  badgeTextDark: { color: '#04110E', fontSize: 11, fontWeight: '800' },
  hintBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  hintText: { color: '#C5D0DC', fontSize: 11, textAlign: 'center' },
});
