import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/Text';
import { Screen } from '@/components/ui/Screen';
import { ScreenBackButton } from '@/components/ui/ScreenBackButton';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';
import {
  VV_ACCENT,
  VV_ROUTES,
  type VvBookmarkCollection,
  type VvVideoCard as VvVideoCardType,
} from '@/features/vora-video';
import {
  clearVvHistory,
  listVvBookmarks,
  listVvHistory,
} from '../services/api';
import { VoraVideoCard } from './VoraVideoCard';
import { VvChip, VvEmptyState, VvLoading, VvNotice } from './VvUi';

type Tab = 'history' | VvBookmarkCollection;

const TABS: { id: Tab; label: string }[] = [
  { id: 'history', label: 'İzleme geçmişi' },
  { id: 'saved', label: 'Kaydedilenler' },
  { id: 'watch_later', label: 'Sonra izle' },
];

export function VoraVideoLibraryScreen() {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('history');
  const [videos, setVideos] = useState<VvVideoCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextTab: Tab) => {
    setLoading(true);
    setError(null);
    const result =
      nextTab === 'history'
        ? await listVvHistory(0)
        : await listVvBookmarks(nextTab, 0);
    if (result.error) {
      setError(result.error);
      setVideos([]);
    } else {
      const rows = result.data ?? [];
      setVideos(rows);
      setHasMore(rows.length >= 24);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(tab);
  }, [load, tab]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const result =
      tab === 'history'
        ? await listVvHistory(videos.length)
        : await listVvBookmarks(tab, videos.length);
    if (!result.error && result.data) {
      setVideos((prev) => [...prev, ...(result.data ?? [])]);
      setHasMore((result.data ?? []).length >= 24);
    }
    setLoadingMore(false);
  }, [hasMore, loadingMore, tab, videos.length]);

  const clearHistory = useCallback(() => {
    Alert.alert('İzleme geçmişini temizle', 'Tüm izleme geçmişin silinecek. Emin misin?', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Temizle',
        style: 'destructive',
        onPress: async () => {
          const result = await clearVvHistory(null);
          if (result.error) {
            Alert.alert('Temizlenemedi', result.error);
            return;
          }
          setVideos([]);
          setHasMore(false);
        },
      },
    ]);
  }, []);

  return (
    <Screen padded={false}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <ScreenBackButton onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text variant="h3">Kitaplığım</Text>
          <Text variant="caption" muted>
            Geçmiş, kaydedilenler ve sonra izle
          </Text>
        </View>
        {tab === 'history' && videos.length > 0 ? (
          <Pressable onPress={clearHistory} hitSlop={8} style={styles.headerIcon}>
            <Ionicons name="trash-outline" size={18} color={colors.text} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => router.push(VV_ROUTES.home as never)}
          hitSlop={8}
          style={styles.headerIcon}
        >
          <Ionicons name="home-outline" size={18} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabs}
      >
        {TABS.map((item) => (
          <VvChip
            key={item.id}
            label={item.label}
            active={tab === item.id}
            onPress={() => setTab(item.id)}
          />
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? <VvLoading /> : null}
        {!loading && error ? <VvNotice tone="danger">{error}</VvNotice> : null}

        {!loading && !error ? (
          videos.length === 0 ? (
            <VvEmptyState
              title={
                tab === 'history'
                  ? 'İzleme geçmişin boş'
                  : tab === 'saved'
                    ? 'Henüz kaydedilmiş video yok'
                    : 'Sonra izle listen boş'
              }
              message={
                tab === 'history'
                  ? 'Video izledikçe burada listelenir. Kaldığın yerden devam edebilirsin.'
                  : 'Beğendiğin uzun videoları kaydet veya sonra izlemek üzere listene ekle.'
              }
              icon={tab === 'history' ? 'time-outline' : 'bookmark-outline'}
              action={
                <Pressable
                  onPress={() => router.push(VV_ROUTES.home as never)}
                  style={[styles.cta, { backgroundColor: VV_ACCENT }]}
                >
                  <Text variant="caption" style={styles.ctaText}>
                    Videolara göz at
                  </Text>
                </Pressable>
              }
            />
          ) : (
            <>
              {videos.map((video) => (
                <VoraVideoCard
                  key={`${tab}-${video.id}`}
                  video={video}
                  variant="row"
                  onPress={() => router.push(VV_ROUTES.watch(video.id) as never)}
                />
              ))}
              {hasMore ? (
                <Pressable
                  onPress={() => void loadMore()}
                  disabled={loadingMore}
                  style={[styles.more, { borderColor: colors.border }]}
                >
                  <Text variant="caption" muted>
                    {loadingMore ? 'Yükleniyor…' : 'Daha fazla yükle'}
                  </Text>
                </Pressable>
              ) : null}
            </>
          )
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerText: { flex: 1 },
  headerIcon: { padding: spacing.xs },
  tabs: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, gap: spacing.sm },
  cta: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full },
  ctaText: { color: '#FFFFFF', fontWeight: '700' },
  more: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
});
