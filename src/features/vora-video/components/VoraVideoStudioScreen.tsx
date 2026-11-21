import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { OptimizedImage } from '@/components/media/OptimizedImage';
import { Text } from '@/components/ui/Text';
import { Screen } from '@/components/ui/Screen';
import { ScreenBackButton } from '@/components/ui/ScreenBackButton';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';
import {
  VV_ACCENT,
  VV_PAYOUT_STATUS_LABELS,
  VV_STATUS_LABELS,
  loadVvSettings,
  type VvCreatorDashboard,
  type VvMyVideo,
  type VvPayoutHistoryRow,
  type VvSettings,
  type VvWallet,
} from '@/features/vora-video';
import { loadVvCreatorDashboard, loadVvCreatorWallet, loadVvMyVideos, deleteVvVideo } from '../services/api';
import {
  vvFormatCount,
  vvFormatMoney,
  vvFormatPeriod,
  vvFormatWatchTime,
  vvRelativeTime,
} from '../services/format';
import { VvEmptyState, VvLoading, VvNotice, VvSection, VvStat } from './VvUi';

export function VoraVideoStudioScreen() {
  const { colors } = useTheme();
  const [dashboard, setDashboard] = useState<VvCreatorDashboard | null>(null);
  const [videos, setVideos] = useState<VvMyVideo[]>([]);
  const [wallet, setWallet] = useState<VvWallet | null>(null);
  const [settings, setSettings] = useState<VvSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [dash, list, walletResult, config] = await Promise.all([
      loadVvCreatorDashboard(),
      loadVvMyVideos(30, 0),
      loadVvCreatorWallet(),
      loadVvSettings(),
    ]);
    if (dash.error || !dash.data) {
      setError(dash.error ?? 'Stüdyo yüklenemedi.');
      setLoading(false);
      return;
    }
    setDashboard(dash.data);
    setVideos(list.data ?? []);
    setWallet(walletResult.data ?? null);
    if (config.data) setSettings(config.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const maxTopViews = Math.max(1, ...(dashboard?.top_videos ?? []).map((row) => row.view_count));

  const removeVideo = useCallback(
    (video: VvMyVideo) => {
      Alert.alert(
        'Videoyu sil',
        `"${video.title}" videosu ve yüklenen dosya kalıcı olarak silinecek. Bu işlem geri alınamaz.`,
        [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'Sil',
            style: 'destructive',
            onPress: async () => {
              setDeletingId(video.id);
              const result = await deleteVvVideo(video.id, 'İçerik üreticisi sildi');
              setDeletingId(null);
              if (result.error) {
                Alert.alert('Silinemedi', result.error);
                return;
              }
              await load();
            },
          },
        ],
      );
    },
    [load],
  );

  const renderVideoRow = (video: VvMyVideo) => (
    <View
      key={video.id}
      style={[styles.videoRow, { borderColor: colors.border, backgroundColor: colors.surface }]}
    >
      <Pressable
        onPress={() => router.push(`/vora-video/analytics/${video.id}` as never)}
        style={styles.videoMain}
      >
        <View style={styles.videoThumbWrap}>
          {video.thumbnail_url ? (
            <OptimizedImage uri={video.thumbnail_url} style={styles.videoThumb} />
          ) : (
            <View style={[styles.videoThumb, { backgroundColor: colors.surfaceElevated }]}>
              <Ionicons name="videocam-outline" size={18} color={colors.textMuted} />
            </View>
          )}
        </View>
        <View style={styles.videoInfo}>
          <Text variant="label" numberOfLines={2}>
            {video.title}
          </Text>
          <Text variant="caption" muted numberOfLines={1}>
            {vvFormatCount(video.view_count)} görüntülenme · {vvFormatCount(video.like_count)} beğeni ·{' '}
            {vvFormatCount(video.comment_count)} yorum
          </Text>
          <View style={styles.videoMetaRow}>
            <View
              style={[
                styles.statusPill,
                {
                  backgroundColor:
                    video.status === 'published' ? `${colors.success}22` : `${colors.warning}22`,
                },
              ]}
            >
              <Text
                variant="caption"
                style={{
                  color: video.status === 'published' ? colors.success : colors.warning,
                  fontSize: 10,
                }}
              >
                {VV_STATUS_LABELS[video.status] ?? video.status}
              </Text>
            </View>
            <Text variant="caption" muted>
              {vvFormatMoney(video.tip_total_minor, 'TRY')} bahşiş ·{' '}
              {vvRelativeTime(video.published_at ?? video.created_at)}
            </Text>
          </View>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
      </Pressable>
      <Pressable
        onPress={() => removeVideo(video)}
        disabled={deletingId === video.id}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`${video.title} videosunu sil`}
        style={styles.deleteButton}
      >
        {deletingId === video.id ? (
          <ActivityIndicator size="small" color={colors.danger} />
        ) : (
          <Ionicons name="trash-outline" size={17} color={colors.danger} />
        )}
      </Pressable>
    </View>
  );

  return (
    <Screen padded={false}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <ScreenBackButton onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text variant="h3">İçerik üreticisi stüdyosu</Text>
          <Text variant="caption" muted>
            Performans ve kazanç özeti
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/vora-video/upload' as never)}
          style={[styles.headerButton, { backgroundColor: VV_ACCENT }]}
        >
          <Ionicons name="add" size={15} color="#FFFFFF" />
          <Text variant="caption" style={styles.headerButtonText}>
            Yükle
          </Text>
        </Pressable>
      </View>

      {loading ? <VvLoading label="Stüdyo hazırlanıyor…" /> : null}

      {!loading && error ? (
        <View style={styles.errorWrap}>
          <VvNotice tone="danger">{error}</VvNotice>
          <Pressable onPress={() => void load()}>
            <Text variant="label" style={{ color: VV_ACCENT }}>
              Tekrar dene
            </Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && dashboard ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.statsGrid}>
            <VvStat label="Video" value={String(dashboard.video_count)} hint={`${dashboard.published_count} yayında`} />
            <VvStat label="Görüntülenme" value={vvFormatCount(dashboard.total_views)} accent />
            <VvStat label="Tekil izleyici" value={vvFormatCount(dashboard.unique_viewers)} />
            <VvStat label="İzlenme süresi" value={vvFormatWatchTime(dashboard.watch_seconds)} />
            <VvStat label="Takipçi" value={vvFormatCount(dashboard.follower_count)} />
            <VvStat
              label="Bekleyen kazanç"
              value={vvFormatMoney(dashboard.pending_minor, wallet?.currency ?? 'TRY')}
              hint={vvFormatPeriod(dashboard.next_period_start, dashboard.next_period_end)}
            />
          </View>

          <View style={[styles.payoutCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.payoutHead}>
              <Ionicons name="calendar-outline" size={18} color={VV_ACCENT} />
              <Text variant="label">Sonraki ödeme dönemi</Text>
            </View>
            <Text variant="caption" muted>
              {vvFormatPeriod(dashboard.next_period_start, dashboard.next_period_end)} ·{' '}
              {vvRelativeTime(dashboard.next_payout_at)} işlenecek
            </Text>
            <View style={styles.payoutRow}>
              <Text variant="caption" muted>
                Ödenebilir: {vvFormatMoney(dashboard.available_minor, wallet?.currency ?? 'TRY')}
              </Text>
              <Pressable
                onPress={() => router.push('/vora-video/wallet' as never)}
                style={styles.walletLink}
              >
                <Text variant="caption" style={{ color: VV_ACCENT }}>
                  Kazançlarım
                </Text>
                <Ionicons name="chevron-forward" size={13} color={VV_ACCENT} />
              </Pressable>
            </View>
          </View>

          {wallet && wallet.stripe_status !== 'ready' ? (
            <VvNotice tone="warning">
              Stripe hesabın ödeme almaya hazır değil. Kazançlar bekleyen bakiyede korunur; Stripe
              doğrulamasını tamamlamak için Kazançlarım ekranını kullan.
            </VvNotice>
          ) : null}

          <VvSection title="En başarılı videolar" hint="Görüntülenmeye göre">
            {dashboard.top_videos.length === 0 ? (
              <VvEmptyState title="Henüz veri yok" message="Video yayınlandığında burada görünür." />
            ) : (
              <View style={styles.topList}>
                {dashboard.top_videos.slice(0, 5).map((row) => {
                  const width = Math.max(4, Math.round((row.view_count / maxTopViews) * 100));
                  return (
                    <Pressable
                      key={row.id}
                      onPress={() => router.push(`/vora-video/analytics/${row.id}` as never)}
                      style={styles.topRow}
                    >
                      <Text variant="caption" numberOfLines={1} style={styles.topTitle}>
                        {row.title}
                      </Text>
                      <View style={[styles.barTrack, { backgroundColor: colors.surfaceElevated }]}>
                        <View style={[styles.barFill, { width: `${width}%` }]} />
                      </View>
                      <Text variant="caption" muted style={styles.topValue}>
                        {vvFormatCount(row.view_count)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </VvSection>

          <VvSection
            title="Videolarım"
            hint={`${videos.length} kayıt`}
            action={
              <Pressable onPress={() => router.push('/vora-video/library' as never)} hitSlop={8}>
                <Text variant="caption" style={{ color: VV_ACCENT }}>
                  Kitaplık
                </Text>
              </Pressable>
            }
          >
            {videos.length === 0 ? (
              <VvEmptyState
                title="Henüz videon yok"
                message="İlk uzun videonu yükle ve stüdyoda performansını izle."
                action={
                  <Pressable
                    onPress={() => router.push('/vora-video/upload' as never)}
                    style={[styles.emptyCta, { backgroundColor: VV_ACCENT }]}
                  >
                    <Text variant="caption" style={styles.headerButtonText}>
                      Video yükle
                    </Text>
                  </Pressable>
                }
              />
            ) : (
              videos.map(renderVideoRow)
            )}
          </VvSection>

          <VvSection
            title="Ödeme geçmişi"
            action={
              <Pressable
                onPress={() => router.push('/vora-video/tips' as never)}
                hitSlop={8}
              >
                <Text variant="caption" style={{ color: VV_ACCENT }}>
                  Bahşişler
                </Text>
              </Pressable>
            }
          >
            {wallet && wallet.payout_history.length > 0 ? (
              wallet.payout_history.slice(0, 6).map((row: VvPayoutHistoryRow) => (
                <View
                  key={row.id}
                  style={[styles.payoutHistoryRow, { borderColor: colors.border }]}
                >
                  <View style={styles.payoutHistoryText}>
                    <Text variant="caption">
                      {vvFormatPeriod(row.period_start, row.period_end)}
                    </Text>
                    <Text variant="caption" muted>
                      {vvFormatMoney(row.amount_minor, row.currency)} ·{' '}
                      {VV_PAYOUT_STATUS_LABELS[row.status] ?? row.status}
                    </Text>
                  </View>
                  {row.failure_reason ? (
                    <Text variant="caption" style={{ color: colors.danger }} numberOfLines={1}>
                      {row.failure_reason}
                    </Text>
                  ) : null}
                </View>
              ))
            ) : (
              <VvEmptyState
                title="Ödeme kaydı yok"
                message="İlk 15 günlük dönem kapandığında transfer kayıtları burada listelenir."
                icon="card-outline"
              />
            )}
          </VvSection>

          <Text variant="caption" muted style={styles.finePrint}>
            Komisyon oranı: %{Math.round((settings?.commission_bp ?? 3000) / 100)} platform · %{Math.round((settings?.creator_share_bp ?? 7000) / 100)} içerik üreticisi. Geçmiş kayıtlar
            yeniden hesaplanmaz.
          </Text>
        </ScrollView>
      ) : null}
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
  headerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  headerButtonText: { color: '#FFFFFF', fontWeight: '700' },
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl },
  errorWrap: { padding: spacing.md, gap: spacing.sm },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  payoutCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  payoutHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  payoutRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  walletLink: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  topList: { gap: spacing.sm },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  topTitle: { flex: 1 },
  barTrack: { flex: 1.1, height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: 8, backgroundColor: VV_ACCENT },
  topValue: { width: 48, textAlign: 'right' },
  videoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  videoMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 2,
  },
  deleteButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoThumbWrap: { width: 78, height: 46, borderRadius: radius.sm, overflow: 'hidden' },
  videoThumb: { width: '100%', height: '100%' },
  videoInfo: { flex: 1, gap: 2 },
  videoMetaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  statusPill: { borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 1 },
  payoutHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  payoutHistoryText: { flex: 1, gap: 1 },
  emptyCta: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full },
  finePrint: { textAlign: 'center', lineHeight: 16 },
});
