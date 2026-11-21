import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/Text';
import { Screen } from '@/components/ui/Screen';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';
import {
  VV_ACCENT,
  VV_BADGE_LABEL,
  VV_HOME_SCOPES,
  VV_ROUTES,
  VV_UNCONFIGURED_NOTES,
  loadVvSettings,
  type VvSettings,
  type VvVideoCard as VvVideoCardType,
} from '@/features/vora-video';
import { useVvCategories } from '../hooks/useVvCategories';
import { listVvVideos } from '../services/api';
import { VoraVideoCard } from '../components/VoraVideoCard';
import { VvBrandMark, VvChip, VvEmptyState, VvIconButton, VvLoading, VvNotice } from '../components/VvUi';

type Scope = (typeof VV_HOME_SCOPES)[number]['id'];

type SectionState = {
  key: string;
  title: string;
  hint?: string;
  videos: VvVideoCardType[];
};

const SECTION_DEFS: { key: string; title: string; hint?: string; scope: 'home' | 'popular' | 'new' | 'vlogs' }[] = [
  { key: 'for-you', title: 'Sana Özel', hint: 'İzleme alışkanlığına göre', scope: 'home' },
  { key: 'popular', title: 'Popüler Videolar', hint: 'Son 7 gün', scope: 'popular' },
  { key: 'new', title: 'Yeni Yüklenenler', hint: 'Taze içerikler', scope: 'new' },
  { key: 'vlogs', title: 'Çok İzlenen Vloglar', hint: 'Uzun soluklu', scope: 'vlogs' },
];

export function VoraVideoHomeScreen() {
  const { colors } = useTheme();
  const [settings, setSettings] = useState<VvSettings | null>(null);
  const [scope, setScope] = useState<Scope>('home');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [sections, setSections] = useState<SectionState[]>([]);
  const [flat, setFlat] = useState<VvVideoCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadVvSettings().then((result) => {
      if (result.data) setSettings(result.data);
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const trimmed = query.trim();

    if (scope === 'home' && !categoryId && !trimmed) {
      const results = await Promise.all(
        SECTION_DEFS.map((def) =>
          listVvVideos({ scope: def.scope, limit: 8 }).then((r) => ({
            key: def.key,
            title: def.title,
            hint: def.hint,
            videos: r.data ?? [],
            failed: r.error,
          })),
        ),
      );
      const failure = results.find((r) => r.failed)?.failed ?? null;
      setSections(
        results.map((r) => ({ key: r.key, title: r.title, hint: r.hint, videos: r.videos })),
      );
      setFlat([]);
      setError(failure && results.every((r) => r.videos.length === 0) ? failure : null);
      setLoading(false);
      return;
    }

    const result = await listVvVideos({
      scope: trimmed ? 'search' : (scope as 'home' | 'popular' | 'new' | 'vlogs' | 'following'),
      categoryId,
      query: trimmed || null,
      limit: 24,
    });
    if (result.error) {
      setError(result.error);
      setFlat([]);
    } else {
      setFlat(result.data ?? []);
    }
    setSections([]);
    setLoading(false);
  }, [categoryId, query, scope]);

  useEffect(() => {
    void load();
  }, [load]);

  const categories = useVvCategories();

  const renderGrid = useCallback(
    (videos: VvVideoCardType[]) => (
      <View style={styles.grid}>
        {videos.map((video) => (
          <View key={video.id} style={styles.gridItem}>
            <VoraVideoCard video={video} />
          </View>
        ))}
      </View>
    ),
    [],
  );

  return (
    <Screen padded={false}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <VvBrandMark />
        <View style={styles.headerText}>
          <Text variant="h3">{VV_BADGE_LABEL}</Text>
          <Text variant="caption" muted numberOfLines={1}>
            Uzun videolar ve vloglar
          </Text>
        </View>
        <VvIconButton
          icon="search"
          label="Ara"
          onPress={() => setSearchOpen((open) => !open)}
        />
        <VvIconButton
          icon="cloud-upload-outline"
          label="Video yükle"
          onPress={() => router.push(VV_ROUTES.upload as never)}
        />
        <VvIconButton
          icon="notifications-outline"
          label="Bildirimler"
          onPress={() => router.push('/notifications' as never)}
        />
        <VvIconButton
          icon="person-circle-outline"
          label="Profil"
          onPress={() => router.push('/(tabs)/profile' as never)}
        />
      </View>

      {searchOpen ? (
        <View style={[styles.searchWrap, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Video, vlog veya üretici ara"
            placeholderTextColor={colors.textMuted}
            style={[styles.searchInput, { color: colors.text }]}
            returnKeyType="search"
            autoFocus
            onSubmitEditing={() => void load()}
          />
          {query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {VV_HOME_SCOPES.map((item) => (
          <VvChip
            key={item.id}
            label={item.label}
            active={scope === item.id}
            onPress={() => setScope(item.id)}
          />
        ))}
        <VvChip
          label="Keşfet"
          icon="compass-outline"
          onPress={() => router.push(VV_ROUTES.explore as never)}
        />
        <VvChip
          label="Kitaplığım"
          icon="bookmark-outline"
          onPress={() => router.push(VV_ROUTES.library as never)}
        />
        <VvChip
          label="Stüdyo"
          icon="stats-chart"
          onPress={() => router.push(VV_ROUTES.studio as never)}
        />
        <VvChip
          label="Kazançlarım"
          icon="wallet-outline"
          onPress={() => router.push(VV_ROUTES.wallet as never)}
        />
        <VvChip
          label="Bahşişler"
          icon="heart-outline"
          onPress={() => router.push(VV_ROUTES.tips as never)}
        />
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        <VvChip
          label="Tümü"
          active={categoryId === null}
          onPress={() => setCategoryId(null)}
        />
        {categories.map((category) => (
          <VvChip
            key={category.id}
            label={category.label}
            active={categoryId === category.id}
            onPress={() => setCategoryId(category.id)}
          />
        ))}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {settings && !settings.payments_enabled ? (
          <VvNotice tone="warning">{VV_UNCONFIGURED_NOTES.payments}</VvNotice>
        ) : null}

        {loading ? <VvLoading label="Videolar yükleniyor…" /> : null}

        {!loading && error ? <VvNotice tone="danger">{error}</VvNotice> : null}

        {!loading && !error && sections.length > 0
          ? sections.map((section) =>
              section.videos.length > 0 ? (
                <View key={section.key} style={styles.section}>
                  <View style={styles.sectionHead}>
                    <Text variant="h3">{section.title}</Text>
                    <Pressable
                      onPress={() => {
                        setScope(section.key === 'for-you' ? 'home' : (section.key as Scope));
                        setCategoryId(null);
                      }}
                      hitSlop={8}
                      style={styles.sectionAction}
                    >
                      <Text variant="caption" style={{ color: VV_ACCENT }}>
                        Tümü
                      </Text>
                      <Ionicons name="chevron-forward" size={13} color={VV_ACCENT} />
                    </Pressable>
                  </View>
                  {section.hint ? (
                    <Text variant="caption" muted>
                      {section.hint}
                    </Text>
                  ) : null}
                  {renderGrid(section.videos)}
                </View>
              ) : null,
            )
          : null}

        {!loading && !error && sections.length === 0 ? (
          flat.length > 0 ? (
            renderGrid(flat)
          ) : (
            <VvEmptyState
              title="Henüz video yok"
              message="Bu seçimde yayınlanmış video bulunmuyor. İlk videoyu sen yükle."
              action={
                <Pressable
                  onPress={() => router.push(VV_ROUTES.upload as never)}
                  style={styles.emptyCta}
                >
                  <Ionicons name="cloud-upload-outline" size={15} color="#FFFFFF" />
                  <Text variant="label" style={styles.emptyCtaText}>
                    Video yükle
                  </Text>
                </Pressable>
              }
            />
          )
        ) : null}

        {loading && flat.length === 0 && sections.length === 0 ? (
          <ActivityIndicator color={VV_ACCENT} />
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
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  headerText: { flex: 1, minWidth: 0 },
  searchWrap: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
  },
  searchInput: { flex: 1, paddingVertical: spacing.sm, fontSize: 15 },
  chipRow: { paddingHorizontal: spacing.md, paddingTop: 6, gap: spacing.xs + 2 },
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl },
  section: { gap: spacing.sm },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionAction: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridItem: { width: '48.5%' },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: VV_ACCENT,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  emptyCtaText: { color: '#FFFFFF', fontWeight: '700' },
});
