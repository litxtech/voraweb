import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { OptimizedImage } from '@/components/media/OptimizedImage';
import { Text } from '@/components/ui/Text';
import { Screen } from '@/components/ui/Screen';
import { ScreenBackButton } from '@/components/ui/ScreenBackButton';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';
import {
  VV_ACCENT,
  VV_BADGE_LABEL,
  loadVvSettings,
  type VvCreatorPage,
  type VvSettings,
  type VvVideoCard as VvVideoCardType,
} from '@/features/vora-video';
import { listVvVideos, loadVvCreatorPage, toggleVvFollow } from '../services/api';
import { vvFormatCount, vvFormatMoney } from '../services/format';
import { VoraVideoCard } from './VoraVideoCard';
import { VoraVideoTipSheet } from './VoraVideoTipSheet';
import { VvEmptyState, VvLoading, VvStat } from './VvUi';

export function VoraVideoCreatorScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const creatorId = typeof params.id === 'string' ? params.id : '';

  const [creator, setCreator] = useState<VvCreatorPage | null>(null);
  const [videos, setVideos] = useState<VvVideoCardType[]>([]);
  const [settings, setSettings] = useState<VvSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);

  const load = useCallback(async () => {
    if (!creatorId) return;
    setLoading(true);
    setError(null);
    const [page, list, config] = await Promise.all([
      loadVvCreatorPage(creatorId),
      listVvVideos({ scope: 'new', creatorId, limit: 30 }),
      loadVvSettings(),
    ]);
    if (page.error || !page.data) {
      setError(page.error ?? 'Kanal bulunamadı.');
      setLoading(false);
      return;
    }
    setCreator(page.data);
    setVideos(list.data ?? []);
    if (config.data) setSettings(config.data);
    setLoading(false);
  }, [creatorId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleFollow = useCallback(async () => {
    if (!creator || followBusy) return;
    setFollowBusy(true);
    const before = creator.is_following;
    setCreator({ ...creator, is_following: !before });
    const result = await toggleVvFollow(creator.user_id);
    setFollowBusy(false);
    if (result.error || !result.data) {
      setCreator({ ...creator, is_following: before });
      return;
    }
    setCreator((prev) =>
      prev
        ? {
            ...prev,
            is_following: result.data!.following,
            follower_count: result.data!.follower_count,
          }
        : prev,
    );
  }, [creator, followBusy]);

  const handleShare = useCallback(async () => {
    if (!creator) return;
    try {
      await Share.share({
        message: `${creator.full_name || creator.username} — ${VV_BADGE_LABEL}\nhttps://vora.app/vora-video/creator/${creator.user_id}`,
      });
    } catch {
      // iptal
    }
  }, [creator]);

  if (loading) {
    return (
      <Screen padded={false}>
        <View style={styles.header}>
          <ScreenBackButton onPress={() => router.back()} />
          <Text variant="label">Kanal</Text>
        </View>
        <VvLoading label="Kanal yükleniyor…" />
      </Screen>
    );
  }

  if (error || !creator) {
    return (
      <Screen padded={false}>
        <View style={styles.header}>
          <ScreenBackButton onPress={() => router.back()} />
          <Text variant="label">Kanal</Text>
        </View>
        <View style={styles.errorWrap}>
          <VvEmptyState title="Kanal bulunamadı" message={error ?? undefined} icon="person-outline" />
          <Pressable onPress={() => void load()}>
            <Text variant="label" style={{ color: VV_ACCENT }}>
              Tekrar dene
            </Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <ScreenBackButton onPress={() => router.back()} />
        <Text variant="label" numberOfLines={1} style={styles.headerTitle}>
          {creator.full_name || creator.username}
        </Text>
        <Pressable onPress={() => void handleShare()} hitSlop={8} style={styles.headerIcon}>
          <Ionicons name="share-social-outline" size={19} color={colors.text} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.banner, { backgroundColor: colors.surfaceElevated }]}>
          {creator.banner_url ? (
            <OptimizedImage uri={creator.banner_url} style={StyleSheet.absoluteFill} />
          ) : null}
        </View>

        <View style={styles.identity}>
          {creator.avatar_url ? (
            <OptimizedImage uri={creator.avatar_url} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: colors.surfaceElevated }]} />
          )}
          <View style={styles.identityText}>
            <View style={styles.nameRow}>
              <Text variant="h3" numberOfLines={1}>
                {creator.full_name || creator.username}
              </Text>
              {creator.is_verified ? (
                <Ionicons name="checkmark-circle" size={16} color={colors.primary} />
              ) : null}
            </View>
            <Text variant="caption" muted>
              @{creator.username} · {vvFormatCount(creator.follower_count)} takipçi ·{' '}
              {vvFormatCount(creator.video_count)} video
            </Text>
            {creator.headline ? (
              <Text variant="caption" secondary numberOfLines={2}>
                {creator.headline}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.buttonRow}>
          {creator.is_me ? (
            <Pressable
              onPress={() => router.push('/vora-video/studio' as never)}
              style={[styles.primaryButton, { backgroundColor: VV_ACCENT }]}
            >
              <Ionicons name="stats-chart" size={15} color="#FFFFFF" />
              <Text variant="label" style={styles.primaryText}>
                Stüdyo
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={() => void handleFollow()}
              disabled={followBusy}
              style={[
                styles.primaryButton,
                creator.is_following
                  ? { backgroundColor: colors.surfaceElevated, borderWidth: 1, borderColor: colors.border }
                  : { backgroundColor: VV_ACCENT },
              ]}
            >
              <Ionicons
                name={creator.is_following ? 'checkmark' : 'add'}
                size={16}
                color={creator.is_following ? colors.text : '#FFFFFF'}
              />
              <Text
                variant="label"
                style={creator.is_following ? undefined : styles.primaryText}
              >
                {creator.is_following ? 'Takiptesin' : 'Takip et'}
              </Text>
            </Pressable>
          )}

          {!creator.is_me ? (
            <Pressable
              onPress={() => setTipOpen(true)}
              style={[styles.secondaryButton, { borderColor: `${VV_ACCENT}66` }]}
            >
              <Ionicons name="heart-outline" size={16} color={VV_ACCENT} />
              <Text variant="label" style={{ color: VV_ACCENT }}>
                Bahşiş gönder
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={styles.stats}>
          <VvStat label="Görüntülenme" value={vvFormatCount(creator.total_views)} />
          <VvStat label="Toplam bahşiş" value={vvFormatMoney(creator.total_tips_minor, 'TRY')} />
          <VvStat label="Video" value={String(creator.video_count)} />
        </View>

        {creator.about ? (
          <View style={[styles.about, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text variant="label">Hakkında</Text>
            <Text variant="caption" muted style={styles.aboutText}>
              {creator.about}
            </Text>
          </View>
        ) : null}

        <Text variant="h3" style={styles.sectionTitle}>
          Videolar
        </Text>

        {videos.length === 0 ? (
          <VvEmptyState
            title="Henüz video yok"
            message="Bu kanal henüz yayınlanmış video paylaşmadı."
          />
        ) : (
          videos.map((video) => (
            <VoraVideoCard
              key={video.id}
              video={video}
              variant="row"
              onPress={() => router.push(`/vora-video/watch/${video.id}` as never)}
            />
          ))
        )}
      </ScrollView>

      <VoraVideoTipSheet
        visible={tipOpen}
        onClose={() => setTipOpen(false)}
        creatorId={creator.user_id}
        videoId={null}
        creatorName={creator.full_name || creator.username}
        presets={settings?.tip_presets_minor ?? []}
        currency={settings?.currency ?? 'TRY'}
        commissionBp={settings?.commission_bp ?? 3000}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    minHeight: 52,
  },
  headerTitle: { flex: 1 },
  headerIcon: { padding: spacing.xs },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  banner: {
    height: 130,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: -36 },
  avatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 3, borderColor: '#0A0E14' },
  identityText: { flex: 1, paddingTop: 30, gap: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  primaryText: { color: '#FFFFFF', fontWeight: '700' },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  about: { borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, gap: 2 },
  aboutText: { lineHeight: 19 },
  sectionTitle: { marginTop: spacing.sm },
  errorWrap: { padding: spacing.md, gap: spacing.md },
});
