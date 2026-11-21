import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { OptimizedImage } from '@/components/media/OptimizedImage';
import { Text } from '@/components/ui/Text';
import { VV_ROUTES } from '@/features/vora-video/constants';
import { vvFormatCount, vvFormatDuration, vvProgressPercent, vvRelativeTime } from '@/features/vora-video/services/format';
import type { VvVideoCard } from '@/features/vora-video/types';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';

export function openVoraVideo(videoId: string) {
  router.push(VV_ROUTES.watch(videoId) as never);
}

export function openVoraCreator(creatorId: string) {
  router.push(VV_ROUTES.creator(creatorId) as never);
}

export const VoraVideoCard = memo(function VoraVideoCard({
  video,
  variant = 'grid',
  onPress,
}: {
  video: VvVideoCard;
  variant?: 'grid' | 'row';
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const progress = vvProgressPercent(
    video.progress_seconds ?? video.my_progress_seconds,
    video.duration_seconds,
  );

  const thumbnail = (
    <View style={styles.thumbWrap}>
      {video.thumbnail_url ? (
        <OptimizedImage uri={video.thumbnail_url} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: colors.surfaceElevated }]}>
          <Ionicons name="videocam-outline" size={28} color={colors.textMuted} />
        </View>
      )}
      <View style={styles.durationBadge}>
        <Text style={styles.durationText}>{vvFormatDuration(video.duration_seconds)}</Text>
      </View>
      {progress > 0 ? (
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
      ) : null}
    </View>
  );

  const meta = (
    <View style={styles.meta}>
      <Text variant="label" numberOfLines={2} style={styles.title}>
        {video.title}
      </Text>
      <Pressable
        onPress={() => openVoraCreator(video.creator_id)}
        style={styles.creatorRow}
        hitSlop={4}
      >
        {video.creator_avatar_url ? (
          <OptimizedImage uri={video.creator_avatar_url} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: colors.surfaceElevated }]} />
        )}
        <Text variant="caption" secondary numberOfLines={1} style={styles.creatorName}>
          {video.creator_full_name || video.creator_username}
        </Text>
        {video.creator_is_verified ? (
          <Ionicons name="checkmark-circle" size={13} color={colors.primary} />
        ) : null}
      </Pressable>
      <Text variant="caption" muted numberOfLines={1}>
        {vvFormatCount(video.view_count)} görüntülenme · {vvRelativeTime(video.published_at)}
      </Text>
    </View>
  );

  if (variant === 'row') {
    return (
      <Pressable
        onPress={onPress ?? (() => openVoraVideo(video.id))}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.75 }]}
        accessibilityRole="button"
        accessibilityLabel={video.title}
      >
        <View style={styles.rowThumb}>{thumbnail}</View>
        <View style={styles.rowMeta}>{meta}</View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress ?? (() => openVoraVideo(video.id))}
      style={({ pressed }) => [styles.grid, pressed && { opacity: 0.8 }]}
      accessibilityRole="button"
      accessibilityLabel={video.title}
    >
      {thumbnail}
      {meta}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  grid: { flex: 1, gap: spacing.sm, minWidth: 0 },
  row: { flexDirection: 'row', gap: spacing.sm, minWidth: 0 },
  rowThumb: { width: 148 },
  rowMeta: { flex: 1, minWidth: 0 },
  thumbWrap: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#000000',
  },
  thumb: { width: '100%', height: '100%' },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  durationBadge: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    backgroundColor: 'rgba(0,0,0,0.78)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  durationText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  progressFill: { height: 3, backgroundColor: '#E53935' },
  meta: { gap: 3 },
  title: { lineHeight: 19 },
  creatorRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  avatar: { width: 18, height: 18, borderRadius: 9 },
  creatorName: { flexShrink: 1 },
});
