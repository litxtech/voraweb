import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
  VV_STATUS_LABELS,
  type VvVideoAnalytics,
} from '@/features/vora-video';
import {
  loadVvVideoAnalytics,
  publishVvVideo,
  deleteVvVideo,
} from '../services/api';
import { vvFormatCount, vvFormatDuration, vvFormatMoney } from '../services/format';
import { VvLoading, VvNotice, VvSection, VvStat } from './VvUi';

export function VoraVideoAnalyticsScreen() {
  const { colors } = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const videoId = typeof params.id === 'string' ? params.id : '';

  const [data, setData] = useState<VvVideoAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!videoId) return;
    setLoading(true);
    setError(null);
    const result = await loadVvVideoAnalytics(videoId);
    if (result.error || !result.data) {
      setError(result.error ?? 'Analitik yüklenemedi.');
      setLoading(false);
      return;
    }
    setData(result.data);
    setLoading(false);
  }, [videoId]);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const result = await publishVvVideo(videoId);
    setBusy(false);
    if (result.error) {
      Alert.alert('Yayınlanamadı', result.error);
      return;
    }
    await load();
  }, [busy, load, videoId]);

  const remove = useCallback(() => {
    Alert.alert(
      'Videoyu kalıcı olarak sil',
      'Video ve yüklenen dosya kalıcı olarak silinecek. Bu işlem geri alınamaz. Emin misin?',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const result = await deleteVvVideo(videoId, 'İçerik üreticisi sildi');
            setBusy(false);
            if (result.error) {
              Alert.alert('Silinemedi', result.error);
              return;
            }
            if (router.canGoBack()) router.back();
            else router.replace('/vora-video/studio' as never);
          },
        },
      ],
    );
  }, [videoId]);

  const maxDay = Math.max(1, ...(data?.daily ?? []).map((row) => row.views));
  const maxBucket = Math.max(1, ...(data?.retention ?? []).map((row) => row.viewers));

  return (
    <Screen padded={false}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <ScreenBackButton onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text variant="h3">Video analitiği</Text>
          <Text variant="caption" muted>
            İzlenme ve izleyici tutma
          </Text>
        </View>
        <Pressable onPress={() => void load()} hitSlop={8} style={styles.headerIcon}>
          <Ionicons name="refresh" size={18} color={colors.text} />
        </Pressable>
      </View>

      {loading ? <VvLoading label="Analitik hesaplanıyor…" /> : null}

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

      {!loading && data ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.videoCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.thumbWrap}>
              {data.video.thumbnail_url ? (
                <OptimizedImage uri={data.video.thumbnail_url} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, { backgroundColor: colors.surfaceElevated }]} />
              )}
            </View>
            <View style={styles.videoInfo}>
              <Text variant="label" numberOfLines={2}>
                {data.video.title}
              </Text>
              <Text variant="caption" muted>
                {VV_STATUS_LABELS[data.video.status] ?? data.video.status} ·{' '}
                {vvFormatDuration(data.video.duration_seconds)}
              </Text>
              <Text variant="caption" muted>
                {vvFormatCount(data.video.view_count)} görüntülenme ·{' '}
                {vvFormatMoney(data.video.tip_total_minor, 'TRY')} bahşiş
              </Text>
            </View>
          </View>

          <View style={styles.statsGrid}>
            <VvStat label="Geçerli görüntülenme" value={vvFormatCount(data.metrics.total_views)} accent />
            <VvStat label="Tekil izleyici" value={vvFormatCount(data.metrics.unique_viewers)} />
            <VvStat label="Ortalama izlenme" value={vvFormatDuration(data.metrics.avg_watch_seconds)} />
            <VvStat
              label="Ortalama yüzde"
              value={`%${Math.round(data.metrics.avg_watch_percent)}`}
            />
            <VvStat
              label="Tamamlama oranı"
              value={`%${Math.round(data.metrics.completion_rate)}`}
              hint={`${vvFormatCount(data.metrics.completed_views)} tam izleme`}
            />
            <VvStat label="Tekrar izleme" value={vvFormatCount(data.metrics.rewatch_count)} />
            <VvStat label="Beğeni" value={vvFormatCount(data.metrics.likes)} />
            <VvStat label="Yorum" value={vvFormatCount(data.metrics.comments)} />
            <VvStat label="Paylaşım" value={vvFormatCount(data.metrics.shares)} />
            <VvStat label="Bahşiş" value={vvFormatMoney(data.metrics.tips_minor, 'TRY')} />
          </View>

          <VvSection title="Son 14 gün" hint="Günlük görüntülenme">
            {data.daily.length === 0 ? (
              <Text variant="caption" muted>
                Henüz günlük veri oluşmadı.
              </Text>
            ) : (
              <View style={styles.chartRow}>
                {data.daily.map((row) => (
                  <View key={row.day} style={styles.chartColumn}>
                    <View style={[styles.chartTrack, { backgroundColor: colors.surfaceElevated }]}>
                      <View
                        style={[
                          styles.chartFill,
                          { height: `${Math.max(3, Math.round((row.views / maxDay) * 100))}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.chartLabel} numberOfLines={1}>
                      {row.day.slice(8)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </VvSection>

          <VvSection title="İzleyici tutma" hint="0–100% dilimlerinde izleyici">
            {data.retention.length === 0 ? (
              <Text variant="caption" muted>
                Checkpoint verisi biriktiğinde izleyicilerin hangi noktada ayrıldığı burada görünür.
              </Text>
            ) : (
              <View style={styles.retentionList}>
                {data.retention.map((bucket) => (
                  <View key={bucket.bucket} style={styles.retentionRow}>
                    <Text variant="caption" muted style={styles.retentionLabel}>
                      %{bucket.bucket}
                    </Text>
                    <View style={[styles.retentionTrack, { backgroundColor: colors.surfaceElevated }]}>
                      <View
                        style={[
                          styles.retentionFill,
                          { width: `${Math.max(2, Math.round((bucket.viewers / maxBucket) * 100))}%` },
                        ]}
                      />
                    </View>
                    <Text variant="caption" muted style={styles.retentionValue}>
                      {vvFormatCount(bucket.viewers)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </VvSection>

          <View style={styles.actions}>
            <Pressable
              onPress={() => router.push(`/vora-video/watch/${data.video.id}` as never)}
              style={[styles.actionButton, { backgroundColor: VV_ACCENT }]}
            >
              <Ionicons name="play" size={15} color="#FFFFFF" />
              <Text variant="caption" style={styles.actionText}>
                Videoyu aç
              </Text>
            </Pressable>
            {data.video.status !== 'published' && data.video.status !== 'removed' ? (
              <Pressable
                onPress={() => void publish()}
                disabled={busy}
                style={[styles.actionButton, { borderWidth: 1, borderColor: colors.border }]}
              >
                <Ionicons name="arrow-up-circle-outline" size={15} color={colors.text} />
                <Text variant="caption">Yayınla</Text>
              </Pressable>
            ) : null}
            {data.video.status !== 'removed' ? (
              <Pressable
                onPress={remove}
                disabled={busy}
                style={[
                  styles.actionButton,
                  { borderWidth: 1, borderColor: `${colors.danger}66` },
                  busy && { opacity: 0.6 },
                ]}
              >
                <Ionicons name="trash-outline" size={15} color={colors.danger} />
                <Text variant="caption" style={{ color: colors.danger }}>
                  Sil
                </Text>
              </Pressable>
            ) : null}
          </View>

          <Text variant="caption" muted style={styles.finePrint}>
            Görüntülenme; en az 10 saniye gerçek oynatma ve 6 saatlik tekil pencere ile sayılır.
            Arka planda bekleme ve bot trafiği hariç tutulur.
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
  headerIcon: { padding: spacing.xs },
  errorWrap: { padding: spacing.md, gap: spacing.sm },
  content: { padding: spacing.md, gap: spacing.lg, paddingBottom: spacing.xxl },
  videoCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  thumbWrap: { width: 108, height: 62, borderRadius: radius.sm, overflow: 'hidden' },
  thumb: { width: '100%', height: '100%' },
  videoInfo: { flex: 1, gap: 2 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chartRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 120 },
  chartColumn: { flex: 1, alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' },
  chartTrack: { width: '100%', flex: 1, borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end' },
  chartFill: { width: '100%', backgroundColor: VV_ACCENT, borderRadius: 4 },
  chartLabel: { color: '#6B7A8F', fontSize: 9 },
  retentionList: { gap: 5 },
  retentionRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  retentionLabel: { width: 34 },
  retentionTrack: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
  retentionFill: { height: 8, backgroundColor: VV_ACCENT },
  retentionValue: { width: 50, textAlign: 'right' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  actionText: { color: '#FFFFFF', fontWeight: '700' },
  finePrint: { textAlign: 'center', lineHeight: 16 },
});
