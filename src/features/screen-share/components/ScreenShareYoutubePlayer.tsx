import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import {
  youtubeEmbedHtml,
  youtubeRefererOrigin,
} from '@/features/screen-share/services/youtubeEmbed';
import type { YoutubeSearchHit } from '@/features/screen-share/services/youtubeSearch';
import { spacing } from '@/constants/theme';

type Props = {
  video: YoutubeSearchHit;
  canControl: boolean;
  onStop?: () => void;
  /** Host: arama kartına dön — oda yayını kesilmez. */
  onOpenSearch?: () => void;
};

/** Odadaki herkesin gördüğü paylaşımlı YouTube oynatıcı (sahne). */
export function ScreenShareYoutubePlayer({ video, canControl, onStop, onOpenSearch }: Props) {
  const refererOrigin = useMemo(() => youtubeRefererOrigin(), []);
  const html = useMemo(
    () => youtubeEmbedHtml(video.videoId, { autoplay: true }),
    [video.videoId, video.startedAt],
  );
  const playerKey = `${video.videoId}-${video.startedAt ?? 0}`;

  return (
    <View style={styles.wrap}>
      <WebView
        key={playerKey}
        source={{ html, baseUrl: refererOrigin }}
        style={styles.player}
        originWhitelist={['*']}
        allowsFullscreenVideo
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        setSupportMultipleWindows={false}
        onShouldStartLoadWithRequest={() => true}
      />
      <View style={styles.bar} pointerEvents="box-none">
        <View style={styles.badge}>
          <Ionicons name="logo-youtube" size={14} color="#FF4444" />
          <Text style={styles.badgeText} numberOfLines={1}>
            {video.title}
          </Text>
        </View>
        {canControl ? (
          <View style={styles.actions}>
            {onStop ? (
              <Pressable onPress={onStop} style={styles.actionBtn} accessibilityLabel="Videoyu kapat">
                <Ionicons name="close" size={18} color="#fff" />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {canControl && onOpenSearch ? (
        <Pressable
          onPress={onOpenSearch}
          style={({ pressed }) => [styles.browseCta, { opacity: pressed ? 0.88 : 1 }]}
          accessibilityLabel="İzle ve yayınla kartını aç"
        >
          <Ionicons name="film-outline" size={16} color="#04110E" />
          <Text style={styles.browseCtaText}>İzle & yayınla</Text>
          <Text style={styles.browseCtaHint}>Ara · oda izlemeye devam eder</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: '#000',
    borderRadius: 20,
    overflow: 'hidden',
  },
  player: {
    flex: 1,
    width: '100%',
    backgroundColor: '#000',
  },
  bar: {
    position: 'absolute',
    left: spacing.sm,
    right: spacing.sm,
    top: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${SCREEN_SHARE_ACCENT}55`,
  },
  badgeText: { flex: 1, color: '#F4F7FB', fontSize: 12, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 6 },
  actionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  browseCta: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: SCREEN_SHARE_ACCENT,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
  },
  browseCtaText: {
    color: '#04110E',
    fontWeight: '900',
    fontSize: 14,
  },
  browseCtaHint: {
    color: 'rgba(4,17,14,0.72)',
    fontWeight: '700',
    fontSize: 11,
    marginLeft: 'auto',
  },
});
