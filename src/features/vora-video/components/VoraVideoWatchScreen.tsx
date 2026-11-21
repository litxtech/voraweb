import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  View,
} from 'react-native';
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
  VV_UNCONFIGURED_NOTES,
  loadVvSettings,
  type VvSettings,
  type VvVideoCard as VvVideoCardType,
  type VvWatchDetail,
} from '@/features/vora-video';
import {
  listVvVideos,
  loadVvWatchDetail,
  deleteVvVideo,
  registerVvShare,
  toggleVvBookmark,
  toggleVvFollow,
  toggleVvLike,
} from '../services/api';
import { vvFormatCount, vvFormatDuration, vvFormatMoney, vvRelativeTime } from '../services/format';
import { VoraVideoPlayer, type VvPlayerMode } from './VoraVideoPlayer';
import { VoraVideoCard } from './VoraVideoCard';
import { VoraVideoTipSheet } from './VoraVideoTipSheet';
import { VoraVideoCommentSheet } from './VoraVideoCommentSheet';
import { VvLoading, VvNotice } from './VvUi';

export function VoraVideoWatchScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const videoId = typeof params.id === 'string' ? params.id : '';

  const [detail, setDetail] = useState<VvWatchDetail | null>(null);
  const [settings, setSettings] = useState<VvSettings | null>(null);
  const [recommended, setRecommended] = useState<VvVideoCardType[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playerMode, setPlayerMode] = useState<VvPlayerMode>('standard');
  const [tipOpen, setTipOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [followBusy, setFollowBusy] = useState(false);
  const [descOpen, setDescOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const load = useCallback(async () => {
    if (!videoId) return;
    setLoading(true);
    setError(null);
    setRecommended([]);
    const [watch, config] = await Promise.all([loadVvWatchDetail(videoId), loadVvSettings()]);
    if (watch.error || !watch.data) {
      setError(watch.error ?? 'Video bulunamadı.');
      setLoading(false);
      return;
    }
    const current = watch.data;
    setDetail(current);
    if (config.data) setSettings(config.data);
    setLoading(false);

    // YouTube benzeri: önce aynı kategoriden öner, yetmezse popülerlerle tamamla.
    const seen = new Set<string>([current.id]);
    const merged: VvVideoCardType[] = [];
    if (current.category_id) {
      const scoped = await listVvVideos({
        scope: 'home',
        categoryId: current.category_id,
        limit: 12,
      });
      for (const row of scoped.data ?? []) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        merged.push(row);
      }
    }
    if (merged.length < 8) {
      const fallback = await listVvVideos({ scope: 'popular', limit: 12 });
      for (const row of fallback.data ?? []) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        merged.push(row);
        if (merged.length >= 10) break;
      }
    }
    setRecommended(merged.slice(0, 10));
  }, [videoId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleLike = useCallback(async () => {
    if (!detail) return;
    const optimistic = {
      ...detail,
      is_liked: !detail.is_liked,
      like_count: detail.like_count + (detail.is_liked ? -1 : 1),
    };
    setDetail(optimistic);
    const result = await toggleVvLike(detail.id);
    if (result.error || !result.data) {
      setDetail(detail);
      return;
    }
    setDetail((prev) =>
      prev ? { ...prev, is_liked: result.data!.liked, like_count: result.data!.like_count } : prev,
    );
  }, [detail]);

  const handleBookmark = useCallback(async () => {
    if (!detail) return;
    const nextSaved = !detail.is_bookmarked;
    setDetail({ ...detail, is_bookmarked: nextSaved });
    const result = await toggleVvBookmark(detail.id, 'saved');
    if (result.error) {
      setDetail(detail);
      Alert.alert('Kaydedilemedi', result.error);
    }
  }, [detail]);

  const handleWatchLater = useCallback(async () => {
    if (!detail) return;
    const next = !detail.is_watch_later;
    setDetail({ ...detail, is_watch_later: next });
    const result = await toggleVvBookmark(detail.id, 'watch_later');
    if (result.error) {
      setDetail(detail);
      Alert.alert('Eklenemedi', result.error);
      return;
    }
    Alert.alert(next ? 'Sonra izle' : 'Kaldırıldı', next ? 'Video listene eklendi.' : 'Video listeden çıkarıldı.');
  }, [detail]);

  const handleFollow = useCallback(async () => {
    if (!detail || followBusy) return;
    setFollowBusy(true);
    const before = detail.is_following ?? false;
    setDetail({ ...detail, is_following: !before });
    const result = await toggleVvFollow(detail.creator_id);
    setFollowBusy(false);
    if (result.error || !result.data) {
      setDetail({ ...detail, is_following: before });
      return;
    }
    setDetail((prev) => (prev ? { ...prev, is_following: result.data!.following } : prev));
  }, [detail, followBusy]);

  const handleShare = useCallback(async () => {
    if (!detail) return;
    try {
      await Share.share({
        message: `${detail.title} — ${VV_BADGE_LABEL}\nhttps://vora.app/vora-video/watch/${detail.id}`,
      });
      void registerVvShare(detail.id);
    } catch {
      // kullanıcı paylaşımı iptal etti
    }
  }, [detail]);

  const handleDelete = useCallback(() => {
    if (!detail || deleteBusy) return;
    Alert.alert(
      'Videoyu kalıcı olarak sil',
      `"${detail.title}" videosu ve yüklenen dosya kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setDeleteBusy(true);
            const result = await deleteVvVideo(detail.id, 'İçerik üreticisi sildi');
            setDeleteBusy(false);
            if (result.error) {
              Alert.alert('Silinemedi', result.error);
              return;
            }
            if (router.canGoBack()) router.back();
            else router.replace('/vora-video' as never);
          },
        },
      ],
    );
  }, [deleteBusy, detail]);

  const creatorLine = useMemo(() => {
    if (!detail) return '';
    const parts = [vvFormatCount(detail.view_count) + ' görüntülenme'];
    if (detail.published_at) parts.push(vvRelativeTime(detail.published_at));
    return parts.join(' · ');
  }, [detail]);

  if (loading) {
    return (
      <Screen padded={false}>
        <View style={styles.loadingHeader}>
          <ScreenBackButton onPress={() => router.back()} />
          <Text variant="label">Yükleniyor…</Text>
        </View>
        <VvLoading label="Video hazırlanıyor…" />
      </Screen>
    );
  }

  if (error || !detail) {
    return (
      <Screen padded={false}>
        <View style={styles.loadingHeader}>
          <ScreenBackButton onPress={() => router.back()} />
          <Text variant="label">Video</Text>
        </View>
        <View style={styles.errorWrap}>
          <VvNotice tone="danger">{error ?? 'Video bulunamadı.'}</VvNotice>
          <Pressable onPress={() => void load()} style={styles.retry}>
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
      <View style={styles.playerSlot}>
        <View style={styles.playerHeader}>
          <ScreenBackButton onPress={() => router.back()} />
          <Text variant="caption" muted numberOfLines={1} style={styles.playerHeaderText}>
            {VV_BADGE_LABEL}
          </Text>
        </View>
        <VoraVideoPlayer
          videoId={detail.id}
          playbackId={detail.playback_id}
          provider={detail.provider}
          posterUri={detail.thumbnail_url}
          title={detail.title}
          mode={playerMode}
          onModeChange={setPlayerMode}
          resumeSeconds={detail.resume_seconds}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text variant="h3" style={styles.title}>
          {detail.title}
        </Text>
        <Text variant="caption" muted>
          {creatorLine}
        </Text>

        <View style={styles.actionRow}>
          <Pressable onPress={() => void handleLike()} style={styles.action}>
            <Ionicons
              name={detail.is_liked ? 'thumbs-up' : 'thumbs-up-outline'}
              size={20}
              color={detail.is_liked ? VV_ACCENT : colors.textSecondary}
            />
            <Text variant="caption" muted>
              {vvFormatCount(detail.like_count)}
            </Text>
          </Pressable>
          <Pressable onPress={() => setCommentsOpen(true)} style={styles.action}>
            <Ionicons name="chatbubble-outline" size={19} color={colors.textSecondary} />
            <Text variant="caption" muted>
              {vvFormatCount(detail.comment_count)}
            </Text>
          </Pressable>
          <Pressable onPress={() => void handleShare()} style={styles.action}>
            <Ionicons name="share-social-outline" size={19} color={colors.textSecondary} />
            <Text variant="caption" muted>
              Paylaş
            </Text>
          </Pressable>
          <Pressable onPress={() => void handleBookmark()} style={styles.action}>
            <Ionicons
              name={detail.is_bookmarked ? 'bookmark' : 'bookmark-outline'}
              size={19}
              color={detail.is_bookmarked ? VV_ACCENT : colors.textSecondary}
            />
            <Text variant="caption" muted>
              Kaydet
            </Text>
          </Pressable>
          <Pressable onPress={() => void handleWatchLater()} style={styles.action}>
            <Ionicons
              name={detail.is_watch_later ? 'time' : 'time-outline'}
              size={19}
              color={detail.is_watch_later ? VV_ACCENT : colors.textSecondary}
            />
            <Text variant="caption" muted>
              Sonra izle
            </Text>
          </Pressable>
        </View>

        <View style={[styles.creatorCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            onPress={() => router.push(`/vora-video/creator/${detail.creator_id}` as never)}
            style={styles.creatorLeft}
          >
            {detail.creator_avatar_url ? (
              <OptimizedImage uri={detail.creator_avatar_url} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: colors.surfaceElevated }]} />
            )}
            <View style={styles.creatorText}>
              <View style={styles.creatorNameRow}>
                <Text variant="label" numberOfLines={1}>
                  {detail.creator_full_name || detail.creator_username}
                </Text>
                {detail.creator_is_verified ? (
                  <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
                ) : null}
              </View>
              <Text variant="caption" muted numberOfLines={1}>
                {vvFormatCount(detail.creator_follower_count ?? 0)} takipçi ·{' '}
                {detail.creator_video_count} video
              </Text>
            </View>
          </Pressable>
          <Pressable
            onPress={() => void handleFollow()}
            disabled={followBusy}
            style={[
              styles.followButton,
              detail.is_following ? styles.followingButton : { backgroundColor: VV_ACCENT },
            ]}
          >
            <Text
              variant="caption"
              style={[
                styles.followText,
                detail.is_following && { color: colors.text },
              ]}
            >
              {detail.is_following ? 'Takiptesin' : 'Takip et'}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={() => setDescOpen((open) => !open)}
          style={[styles.descCard, { backgroundColor: colors.surface, borderColor: colors.border }]}
        >
          <View style={styles.descHead}>
            <Text variant="caption" style={styles.descMeta}>
              {vvFormatCount(detail.view_count)} görüntülenme · {vvFormatDuration(detail.duration_seconds)}{' '}
              · {vvFormatMoney(detail.tip_total_minor, 'TRY')} bahşiş
            </Text>
            <Ionicons
              name={descOpen ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.textMuted}
            />
          </View>
          <Text
            variant="caption"
            muted
            numberOfLines={descOpen ? undefined : 3}
            style={styles.descText}
          >
            {detail.description || 'Açıklama eklenmemiş.'}
          </Text>
          {descOpen && detail.tags.length > 0 ? (
            <View style={styles.tags}>
              {detail.tags.map((tag) => (
                <View key={tag} style={[styles.tag, { backgroundColor: colors.surfaceElevated }]}>
                  <Text variant="caption" muted>
                    #{tag}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
          {descOpen && detail.category_label ? (
            <Text variant="caption" muted>
              Kategori: {detail.category_label}
            </Text>
          ) : null}
        </Pressable>

        <Pressable
          onPress={() => setTipOpen(true)}
          style={[styles.tipCard, { borderColor: `${VV_ACCENT}66` }]}
        >
          <View style={styles.tipIcon}>
            <Ionicons name="heart" size={18} color="#FFFFFF" />
          </View>
          <View style={styles.tipBody}>
            <Text variant="label">İçerik üreticisine bahşiş gönder</Text>
            <Text variant="caption" muted>
              %70 içerik üreticisine, %30 platforma. Ödeme sunucuda hesaplanır.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
        </Pressable>

        {detail.is_owner ? (
          <View style={styles.ownerRow}>
            <Pressable
              onPress={() => router.push(`/vora-video/analytics/${detail.id}` as never)}
              style={[styles.ownerBar, { borderColor: colors.border }]}
            >
              <Ionicons name="analytics-outline" size={16} color={VV_ACCENT} />
              <Text variant="caption" style={{ color: VV_ACCENT }}>
                Videonun analitiğini gör
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDelete}
              disabled={deleteBusy}
              style={[
                styles.ownerBar,
                { borderColor: `${colors.danger}66` },
                deleteBusy && { opacity: 0.6 },
              ]}
            >
              {deleteBusy ? (
                <ActivityIndicator size="small" color={colors.danger} />
              ) : (
                <Ionicons name="trash-outline" size={16} color={colors.danger} />
              )}
              <Text variant="caption" style={{ color: colors.danger }}>
                Videoyu sil
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!settings?.payments_enabled ? (
          <VvNotice tone="info">{VV_UNCONFIGURED_NOTES.payments}</VvNotice>
        ) : null}

        {recommended.length > 0 ? (
          <View style={[styles.recSection, { borderTopColor: colors.border }]}>
            <View style={styles.recHeader}>
              <View style={styles.recHeaderText}>
                <Text variant="h3">İlgili videolar</Text>
                <Text variant="caption" muted numberOfLines={1}>
                  {detail.category_label ? 'Aynı kategoriden öneriler' : 'Sana özel öneriler'} ·{' '}
                  {recommended.length} video
                </Text>
              </View>
              {detail.category_label ? (
                <View
                  style={[
                    styles.recPill,
                    { borderColor: `${VV_ACCENT}44`, backgroundColor: `${VV_ACCENT}14` },
                  ]}
                >
                  <Ionicons name="pricetag-outline" size={11} color={VV_ACCENT} />
                  <Text style={[styles.recPillText, { color: VV_ACCENT }]} numberOfLines={1}>
                    {detail.category_label}
                  </Text>
                </View>
              ) : null}
            </View>
            <View style={styles.recList}>
              {recommended.map((video) => (
                <VoraVideoCard
                  key={video.id}
                  video={video}
                  variant="row"
                  onPress={() => router.replace(`/vora-video/watch/${video.id}` as never)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>

      <VoraVideoTipSheet
        visible={tipOpen}
        onClose={() => setTipOpen(false)}
        creatorId={detail.creator_id}
        videoId={detail.id}
        creatorName={detail.creator_full_name || detail.creator_username}
        presets={settings?.tip_presets_minor ?? []}
        currency={settings?.currency ?? 'TRY'}
        commissionBp={settings?.commission_bp ?? 3000}
      />

      <VoraVideoCommentSheet
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        videoId={detail.id}
        commentCount={detail.comment_count}
        onCommentAdded={() => {
          setDetail((prev) =>
            prev ? { ...prev, comment_count: prev.comment_count + 1 } : prev,
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  loadingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  errorWrap: { padding: spacing.md, gap: spacing.sm },
  retry: { alignSelf: 'flex-start' },
  playerSlot: { backgroundColor: '#000000' },
  playerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  playerHeaderText: { flex: 1 },
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xxl },
  title: { fontWeight: '800' },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  action: { alignItems: 'center', gap: 2, minWidth: 56 },
  creatorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  creatorLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  creatorText: { flex: 1 },
  creatorNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  followButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.full,
  },
  followingButton: { backgroundColor: 'transparent' },
  followText: { color: '#FFFFFF', fontWeight: '700' },
  descCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.sm, gap: spacing.xs },
  descHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  descMeta: { flex: 1 },
  descText: { lineHeight: 19 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.full },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  tipIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: VV_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipBody: { flex: 1, gap: 1 },
  ownerRow: { flexDirection: 'row', gap: spacing.xs },
  ownerBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  recSection: {
    gap: spacing.md,
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  recHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  recHeaderText: { flex: 1, gap: 1, minWidth: 0 },
  recPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    maxWidth: '45%',
  },
  recPillText: { fontSize: 11, fontWeight: '700', lineHeight: 14 },
  recList: { gap: spacing.md },
});
