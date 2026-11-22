import { Image, Pressable, StyleSheet, View } from 'react-native';
import { OptimizedImage } from '@/components/media/OptimizedImage';
import { radius } from '@/constants/theme';
import { isVideoUrl } from '@/lib/media/isVideoUrl';
import { CHAT_MEDIA_ASPECT, CHAT_MEDIA_MAX_HEIGHT, CHAT_MEDIA_WIDTH } from '../constants';
import { useChatMediaViewer } from '../context/ChatMediaViewerContext';
import { useDoubleTap } from '../hooks/useDoubleTap';

type ChatMediaAttachmentProps = {
  uri: string;
  onDoublePress?: () => void;
};

function isLocalUri(uri: string) {
  return uri.startsWith('file://') || uri.startsWith('content://');
}

/** Sohbet görsel — önizleme + uzun basınca / dokununca tam ekran */
export function ChatMediaAttachment({ uri, onDoublePress }: ChatMediaAttachmentProps) {
  const { openMedia } = useChatMediaViewer();
  const trimmed = uri?.trim() ?? '';
  const isVideo = isVideoUrl(trimmed);

  const open = () => {
    if (!trimmed) return;
    openMedia(trimmed, { isVideo });
  };

  const handlePress = useDoubleTap({
    onSingleTap: open,
    onDoubleTap: onDoublePress,
  });

  if (!trimmed) {
    return <View style={[styles.media, styles.empty]} />;
  }

  return (
    <Pressable
      onPress={handlePress}
      onLongPress={open}
      delayLongPress={260}
      style={({ pressed }) => [styles.media, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="Medyayı tam ekran aç"
    >
      {isLocalUri(trimmed) ? (
        <Image source={{ uri: trimmed }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <OptimizedImage
          uri={trimmed}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          tier="feed"
          recyclingKey={trimmed}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  media: {
    width: CHAT_MEDIA_WIDTH,
    maxWidth: '100%',
    aspectRatio: CHAT_MEDIA_ASPECT,
    maxHeight: CHAT_MEDIA_MAX_HEIGHT,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: 2,
    backgroundColor: '#0A0E14',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.92,
  },
});
