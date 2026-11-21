import { useCallback, useEffect, useState } from 'react';
import type { ComponentProps } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
  type VvVideoCard as VvVideoCardType,
} from '@/features/vora-video';
import { useVvCategories } from '../hooks/useVvCategories';
import { listVvVideos } from '../services/api';
import { VoraVideoCard } from './VoraVideoCard';
import { VvEmptyState, VvLoading, VvNotice, VvSection } from './VvUi';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function VoraVideoExploreScreen() {
  const { colors } = useTheme();
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [videos, setVideos] = useState<VvVideoCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const categories = useVvCategories();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const result = await listVvVideos({
      scope: categoryId ? 'home' : 'popular',
      categoryId,
      limit: 24,
    });
    if (result.error) {
      setError(result.error);
      setVideos([]);
    } else {
      setVideos(result.data ?? []);
    }
    setLoading(false);
  }, [categoryId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCategory = categories.find((category) => category.id === categoryId);

  return (
    <Screen padded={false}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <ScreenBackButton onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text variant="h3">Keşfet</Text>
          <Text variant="caption" muted>
            Kategoriye göre uzun videolar
          </Text>
        </View>
        <Pressable
          onPress={() => router.push(VV_ROUTES.home as never)}
          hitSlop={8}
          style={styles.headerIcon}
        >
          <Ionicons name="home-outline" size={18} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.categoryGrid}>
          <Pressable
            onPress={() => setCategoryId(null)}
            style={[
              styles.categoryTile,
              {
                borderColor: categoryId === null ? VV_ACCENT : colors.border,
                backgroundColor: categoryId === null ? `${VV_ACCENT}1A` : colors.surface,
              },
            ]}
          >
            <Ionicons
              name="flame-outline"
              size={20}
              color={categoryId === null ? VV_ACCENT : colors.textSecondary}
            />
            <Text variant="caption" style={styles.categoryLabel}>
              Popüler
            </Text>
          </Pressable>
          {categories.map((category) => {
            const active = categoryId === category.id;
            return (
              <Pressable
                key={category.id}
                onPress={() => setCategoryId(category.id as string)}
                style={[
                  styles.categoryTile,
                  {
                    borderColor: active ? VV_ACCENT : colors.border,
                    backgroundColor: active ? `${VV_ACCENT}1A` : colors.surface,
                  },
                ]}
              >
                <Ionicons
                  name={category.icon as IconName}
                  size={20}
                  color={active ? VV_ACCENT : colors.textSecondary}
                />
                <Text variant="caption" style={styles.categoryLabel} numberOfLines={2}>
                  {category.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {loading ? <VvLoading label="Kategori yükleniyor…" /> : null}
        {!loading && error ? <VvNotice tone="danger">{error}</VvNotice> : null}

        {!loading && !error ? (
          <VvSection
            title={activeCategory ? (activeCategory.label as string) : 'Popüler videolar'}
            hint={`${videos.length} video`}
          >
            {videos.length === 0 ? (
              <VvEmptyState
                title="Bu kategoride video yok"
                message="Başka bir kategori seç veya ilk videoyu sen yükle."
              />
            ) : (
              <View style={styles.grid}>
                {videos.map((video) => (
                  <View key={video.id} style={styles.gridItem}>
                    <VoraVideoCard video={video} />
                  </View>
                ))}
              </View>
            )}
          </VvSection>
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
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  categoryTile: {
    width: '31.5%',
    minHeight: 70,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    gap: spacing.xs,
    justifyContent: 'center',
  },
  categoryLabel: { fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridItem: { width: '48.5%' },
});
