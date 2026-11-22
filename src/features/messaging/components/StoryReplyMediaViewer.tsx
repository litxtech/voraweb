import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { resolveModalAnimationType } from '@/lib/device/androidPerfProfile';
import { useStoryMuxPlaybackUrl } from '@/features/stories/hooks/useStoryMuxPlaybackUrl';
import {
  fetchStoryReplyViewerMedia,
  type StoryReplyViewerMedia,
} from '../services/storyReplyViewerMedia';
import type { StoryReplyMetadata } from '../services/storyReplyMetadata';
import { ChatVideoPlayer } from './ChatVideoPlayer';

type StoryReplyMediaViewerProps = {
  meta: StoryReplyMetadata;
  onClose: () => void;
};

type Phase = 'loading' | 'ready' | 'removed' | 'error';

const COPY: Record<Exclude<Phase, 'ready'>, { icon: keyof typeof Ionicons.glyphMap; title: string; hint: string }> = {
  loading: {
    icon: 'hourglass-outline',
    title: 'Hikâye yükleniyor…',
    hint: 'Biraz bekle, medya hazırlanıyor.',
  },
  removed: {
    icon: 'cloud-offline-outline',
    title: 'Hikâye kaldırılmış',
    hint: 'Bu hikâye artık mevcut değil.',
  },
  error: {
    icon: 'alert-circle-outline',
    title: 'Hikâye açılamadı',
    hint: 'Bağlantını kontrol edip tekrar deneyebilirsin.',
  },
};

/**
 * Sohbetteki hikâye yanıtının medyasını tam ekran açar.
 * Hikâye kaldırılmış / süresi dolmuşsa izlenemez durumu gösterilir.
 * Çıkış: sağ üstteki çarpı veya boş alana dokunma.
 */
export function StoryReplyMediaViewer({ meta, onClose }: StoryReplyMediaViewerProps) {
  const insets = useSafeAreaInsets();
  const [media, setMedia] = useState<StoryReplyViewerMedia | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setMedia(null);
    setFailed(false);
    void fetchStoryReplyViewerMedia(meta)
      .then((next) => {
        if (!cancelled) setMedia(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [meta]);

  // Kaldırılmış hikâyede medya çözümü/indirme başlatılmaz.
  const videoSourceUrl =
    media && media.state !== 'removed' && media.mediaType === 'video' ? media.mediaUrl : null;
  // Mux işleme adresleri doğrudan oynatılamaz; HLS'e çevrilir.
  const mux = useStoryMuxPlaybackUrl(videoSourceUrl);

  let phase: Phase;
  if (failed) phase = 'error';
  else if (!media) phase = 'loading';
  else if (media.state === 'removed') phase = 'removed';
  else if (media.mediaType === 'video') {
    if (mux.failed) phase = 'error';
    else if (mux.playbackUrl) phase = 'ready';
    else phase = 'loading';
  } else {
    phase = media.mediaUrl ? 'ready' : 'error';
  }

  const copy = phase === 'ready' ? null : COPY[phase];
  const videoUri =
    phase === 'ready' && media && media.mediaType === 'video' ? mux.playbackUrl : null;
  const imageUri =
    phase === 'ready' && media && media.mediaType === 'image' ? media.mediaUrl : null;

  return (
    <Modal
      visible
      animationType={resolveModalAnimationType('fade')}
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar style="light" />
      <View style={styles.container}>
        {/* Boş alan — tıklayınca çık */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
        />

        <View
          style={[styles.stage, { paddingTop: insets.top, paddingBottom: insets.bottom }]}
          pointerEvents="box-none"
        >
          {videoUri ? (
            <View style={styles.videoBox} pointerEvents="box-none">
              <ChatVideoPlayer key={videoUri} uri={videoUri} autoPlay />
            </View>
          ) : imageUri ? (
            <Pressable style={styles.centerBox} onPress={onClose} accessibilityLabel="Kapat">
              <Image source={{ uri: imageUri }} style={styles.media} contentFit="contain" />
            </Pressable>
          ) : (
            <Pressable
              style={styles.centerBox}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Kapat"
            >
              {phase === 'loading' ? (
                <ActivityIndicator color="#fff" size="large" />
              ) : (
                <View style={styles.iconCircle}>
                  <Ionicons name={copy!.icon} size={34} color="#fff" />
                </View>
              )}
              <Text variant="label" style={styles.stateTitle}>
                {copy?.title}
              </Text>
              <Text variant="caption" style={styles.stateHint}>
                {copy?.hint}
              </Text>
              {phase !== 'loading' ? (
                <Text variant="caption" style={styles.stateDismissHint}>
                  Çıkmak için çarpıya veya boş alana dokun
                </Text>
              ) : null}
            </Pressable>
          )}
        </View>

        <Pressable
          style={[styles.closeBtn, { top: insets.top + spacing.sm, right: spacing.md + insets.right }]}
          onPress={onClose}
          hitSlop={20}
          accessibilityRole="button"
          accessibilityLabel="Kapat"
        >
          <Ionicons name="close" size={28} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  stage: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
  videoBox: {
    flex: 1,
    justifyContent: 'center',
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  media: {
    width: '100%',
    height: '100%',
  },
  iconCircle: {
    width: 66,
    height: 66,
    borderRadius: 33,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  stateTitle: {
    color: '#fff',
    fontWeight: '700',
    textAlign: 'center',
  },
  stateHint: {
    color: 'rgba(255,255,255,0.82)',
    textAlign: 'center',
  },
  stateDismissHint: {
    marginTop: spacing.sm,
    color: 'rgba(255,255,255,0.58)',
    textAlign: 'center',
  },
  closeBtn: {
    position: 'absolute',
    zIndex: 30,
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
});
