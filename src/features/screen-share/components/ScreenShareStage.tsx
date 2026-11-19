import { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import {
  VideoTrack,
  isTrackReference,
  useConnectionState,
  useLocalParticipant,
  useTracks,
  type TrackReference,
} from '@livekit/react-native';
import { ConnectionState, Track } from 'livekit-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { ScreenSharePresence } from '@/features/screen-share/components/ScreenSharePresence';
import { ScreenShareYoutubePlayer } from '@/features/screen-share/components/ScreenShareYoutubePlayer';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import type { YoutubeSearchHit } from '@/features/screen-share/services/youtubeSearch';
import type { ScreenShareParticipant } from '@/features/screen-share/types';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';

/** Yerel veya uzak — odadaki herkes aynı ekran paylaşımını görür (paylaşan dahil). */
function pickScreenTrack(tracks: TrackReference[]): TrackReference | null {
  if (tracks.length === 0) return null;
  const remote = tracks.find((t) => !t.participant.isLocal);
  return remote ?? tracks[0] ?? null;
}

type Props = {
  sessionId: string;
  onAvatarPress: (participant: ScreenShareParticipant) => void;
  fullscreen?: boolean;
  onRequestFullscreen?: () => void;
  onExitFullscreen?: () => void;
  /** Odada paylaşılan YouTube — ekran paylaşımının üstünde herkese gösterilir. */
  youtube?: YoutubeSearchHit | null;
  isHost?: boolean;
  onStopYoutube?: () => void;
  onOpenYoutubeSearch?: () => void;
};

export function ScreenShareStage({
  sessionId,
  onAvatarPress,
  fullscreen = false,
  onRequestFullscreen,
  onExitFullscreen,
  youtube = null,
  isHost = false,
  onStopYoutube,
  onOpenYoutubeSearch,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const connectionState = useConnectionState();
  const { localParticipant, isScreenShareEnabled } = useLocalParticipant();
  const tracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });
  const screenTracks = useMemo(() => tracks.filter(isTrackReference), [tracks]);
  const primary = useMemo(() => pickScreenTrack(screenTracks), [screenTracks]);

  const localIdentity = localParticipant?.identity ?? '';
  const isLocal =
    Boolean(primary) && Boolean(localIdentity) && primary!.participant.identity === localIdentity;
  const sharingLocal = Boolean(isScreenShareEnabled) || isLocal;
  const reconnecting = connectionState === ConnectionState.Reconnecting;

  // trackSid değişince remount etme — titreme/donma azaltır
  const trackKey = primary ? primary.participant.identity : 'empty';

  if (youtube) {
    return (
      <View style={[styles.frame, fullscreen && styles.frameFullscreen]}>
        <ScreenShareYoutubePlayer
          video={youtube}
          canControl={isHost}
          onStop={onStopYoutube}
          onOpenSearch={onOpenYoutubeSearch}
        />
        <View style={fullscreen ? { marginBottom: insets.bottom } : undefined} pointerEvents="box-none">
          <ScreenSharePresence sessionId={sessionId} overlay onAvatarPress={onAvatarPress} />
        </View>
      </View>
    );
  }

  if (!primary) {
    return (
      <View style={[styles.empty, { backgroundColor: '#070B10', borderColor: colors.border }]}>
        {reconnecting ? (
          <>
            <Ionicons name="sync" size={28} color={SCREEN_SHARE_ACCENT} />
            <Text variant="h3" style={{ color: colors.text, fontWeight: '800' }}>
              Yeniden bağlanıyor…
            </Text>
          </>
        ) : (
          <>
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
                ? 'Filme geç — Vora arka planda paylaşır; sen filmde, odadakiler burada beraber izler.'
                : 'Alttan “Ekran”a bas · film uygulamasına geç · beraber izleyin.'}
            </Text>
          </>
        )}
        <View style={styles.emptyPresence}>
          <ScreenSharePresence sessionId={sessionId} onAvatarPress={onAvatarPress} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.frame, fullscreen && styles.frameFullscreen]}>
      <VideoTrack
        key={trackKey}
        trackRef={primary}
        style={styles.video}
        objectFit="contain"
        mirror={false}
        zOrder={fullscreen ? 2 : 1}
      />
      {reconnecting ? (
        <View style={styles.reconnectOverlay} pointerEvents="none">
          <Ionicons name="sync" size={18} color="#fff" />
          <Text style={styles.reconnectText}>Yeniden bağlanıyor…</Text>
        </View>
      ) : null}
      <View
        style={[styles.badgeRow, fullscreen && { top: insets.top + 8 }]}
        pointerEvents="box-none"
      >
        {isLocal ? (
          <View style={[styles.badge, { backgroundColor: `${SCREEN_SHARE_ACCENT}CC` }]}>
            <Ionicons name="people-outline" size={12} color="#04110E" />
            <Text style={styles.badgeTextDark}>Beraber izleme</Text>
          </View>
        ) : (
          <View style={styles.badge}>
            <Ionicons name="desktop-outline" size={12} color="#fff" />
            <Text style={styles.badgeText}>Canlı ekran</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        {fullscreen ? (
          <Pressable
            onPress={onExitFullscreen}
            style={styles.fsBtn}
            accessibilityLabel="Tam ekrandan çık"
          >
            <Ionicons name="contract-outline" size={18} color="#fff" />
          </Pressable>
        ) : onRequestFullscreen ? (
          <Pressable
            onPress={onRequestFullscreen}
            style={styles.fsBtn}
            accessibilityLabel="Tam ekran"
          >
            <Ionicons name="expand-outline" size={18} color="#fff" />
          </Pressable>
        ) : null}
      </View>
      {isLocal ? (
        <View style={styles.watchHint} pointerEvents="none">
          <Text style={styles.watchHintText}>
            Film uygulamasında kal — sen orada, odadakiler burada aynı ekranı görür. Dönünce
            paylaşım açık kalır.
          </Text>
        </View>
      ) : null}
      <View style={fullscreen ? { marginBottom: insets.bottom } : undefined} pointerEvents="box-none">
        <ScreenSharePresence sessionId={sessionId} overlay onAvatarPress={onAvatarPress} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    borderRadius: 20,
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
  emptyPresence: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: spacing.md,
  },
  frame: {
    flex: 1,
    borderRadius: 20,
    overflow: Platform.OS === 'android' ? 'visible' : 'hidden',
    backgroundColor: '#05070A',
  },
  frameFullscreen: {
    borderRadius: 0,
    overflow: 'hidden',
  },
  video: { width: '100%', height: '100%', minHeight: 0 },
  reconnectOverlay: {
    position: 'absolute',
    top: 12,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  reconnectText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  badgeRow: {
    position: 'absolute',
    top: 10,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
  watchHint: {
    position: 'absolute',
    left: 10,
    right: 10,
    bottom: 42,
    backgroundColor: 'rgba(0,0,0,0.62)',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  watchHintText: {
    color: '#D5DEE8',
    fontSize: 11,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 15,
  },
  fsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});
