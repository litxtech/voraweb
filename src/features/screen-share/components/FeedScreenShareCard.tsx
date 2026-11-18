import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { OptimizedImage } from '@/components/media/OptimizedImage';
import { Text } from '@/components/ui/Text';
import type { FeedItem } from '@/features/feed/types';
import {
  SCREEN_SHARE_ACCENT,
  SCREEN_SHARE_HUB_ROUTE,
  screenShareSessionPath,
} from '@/features/screen-share/constants';
import { spacing } from '@/constants/theme';
import { getAndroidInstantPressableProps } from '@/lib/device/androidPerfProfile';

type Props = { item: FeedItem };

export const FeedScreenShareCard = memo(function FeedScreenShareCard({ item }: Props) {
  const cover = item.mediaUrls[0] ?? item.author.avatarUrl;
  const count = item.screenShareParticipantCount ?? item.viewCount ?? 1;

  const open = () => {
    router.push(screenShareSessionPath(item.sourceId) as Href);
  };

  return (
    <Pressable
      onPress={open}
      {...getAndroidInstantPressableProps()}
      style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.94 }]}
    >
      <View style={styles.hero}>
        {cover ? (
          <OptimizedImage
            uri={cover}
            style={StyleSheet.absoluteFillObject}
            tier="feed"
            recyclingKey={`ss-feed-${item.id}`}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.heroFallback]} />
        )}
        <LinearGradient
          colors={['rgba(5,7,10,0.15)', 'rgba(5,7,10,0.88)']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.badge}>
          <Ionicons name="radio" size={12} color="#04110E" />
          <Text style={styles.badgeText}>CANLI ODA</Text>
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {item.title ?? 'Sesli oda'}
        </Text>
        <Text style={styles.copy} numberOfLines={2}>
          {item.content}
        </Text>
        <View style={styles.footer}>
          <Text style={styles.meta}>
            @{item.author.username} · {count} kişi
          </Text>
          <Pressable
            onPress={() => router.push(SCREEN_SHARE_HUB_ROUTE as Href)}
            hitSlop={8}
            style={styles.cta}
          >
            <Text style={styles.ctaText}>Gir</Text>
            <Ionicons name="enter-outline" size={14} color="#04110E" />
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: spacing.md,
    marginVertical: spacing.sm,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,194,168,0.35)',
  },
  hero: {
    minHeight: 168,
    padding: spacing.md,
    justifyContent: 'flex-end',
    gap: 6,
  },
  heroFallback: { backgroundColor: 'rgba(0,194,168,0.22)' },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: SCREEN_SHARE_ACCENT,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    marginBottom: 4,
  },
  badgeText: { color: '#04110E', fontWeight: '900', fontSize: 10, letterSpacing: 0.6 },
  title: { color: '#F4F7FB', fontWeight: '800', fontSize: 18 },
  copy: { color: 'rgba(220,230,242,0.92)', fontSize: 13, lineHeight: 18 },
  footer: {
    marginTop: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  meta: { color: 'rgba(180,196,214,0.9)', fontSize: 12, fontWeight: '600', flex: 1 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: SCREEN_SHARE_ACCENT,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
  },
  ctaText: { color: '#04110E', fontWeight: '900', fontSize: 12 },
});
