import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { AuthHeader } from '@/components/auth/AuthHeader';
import { GlassCard } from '@/components/ui/GlassCard';
import { GradientBackground } from '@/components/ui/GradientBackground';
import { Text } from '@/components/ui/Text';
import {
  FEATURE_REQUEST_STATUS_FILTERS,
  FEATURE_REQUEST_STATUS_LABELS,
} from '@/features/feature-requests/constants';
import { fetchMyFeatureRequests } from '@/features/feature-requests/services/featureRequests';
import type { FeatureRequestRow, FeatureRequestStatus } from '@/features/feature-requests/types';
import { AdminFilterChip } from '@/features/admin/components/shared/AdminFilterChip';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';

function statusColor(status: FeatureRequestStatus, colors: ReturnType<typeof useTheme>['colors']) {
  switch (status) {
    case 'received':
      return colors.accent;
    case 'in_review':
      return colors.primary;
    case 'need_info':
      return colors.warning;
    case 'planned':
      return colors.primary;
    case 'in_development':
      return colors.warning;
    case 'in_test':
      return colors.accent;
    case 'live':
      return colors.success;
    case 'rejected':
      return colors.danger;
    case 'duplicate':
      return colors.textMuted;
    case 'withdrawn':
      return colors.textMuted;
    default:
      return colors.textMuted;
  }
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function FeatureRequestsScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<FeatureRequestRow[]>([]);
  const [statusFilter, setStatusFilter] = useState<FeatureRequestStatus | 'all'>('all');

  const load = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      const rows = await fetchMyFeatureRequests();
      setItems(rows);
      setLoading(false);
      setRefreshing(false);
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = statusFilter === 'all' ? items : items.filter((item) => item.status === statusFilter);
  const openCount = items.filter((item) =>
    ['received', 'in_review', 'need_info', 'planned', 'in_development', 'in_test'].includes(item.status),
  ).length;
  const liveCount = items.filter((item) => item.status === 'live').length;

  return (
    <GradientBackground>
      <View style={[styles.page, { paddingTop: insets.top + spacing.md }]}>
        <AuthHeader title="İstek ve Öneriler" subtitle="Talep gönder, durumunu adım adım takip et" showBack />
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshing={refreshing}
          onRefresh={() => load(true)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={styles.listHeader}>
              <GlassCard style={styles.heroCard}>
                <View style={styles.heroTopRow}>
                  <View style={styles.heroCopy}>
                    <Text variant="label">İstek merkezi</Text>
                    <Text variant="caption" secondary>
                      Önerilerini paylaş, ekibin dönüşlerini tek yerden takip et.
                    </Text>
                  </View>
                  <View style={[styles.heroIcon, { backgroundColor: `${colors.primary}16` }]}>
                    <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
                  </View>
                </View>
                <View style={styles.heroStatsRow}>
                  <View style={styles.heroStat}>
                    <Text variant="caption" secondary>
                      Toplam
                    </Text>
                    <Text variant="title3">{items.length}</Text>
                  </View>
                  <View style={[styles.heroDivider, { backgroundColor: `${colors.border}88` }]} />
                  <View style={styles.heroStat}>
                    <Text variant="caption" secondary>
                      Açık
                    </Text>
                    <Text variant="title3">{openCount}</Text>
                  </View>
                  <View style={[styles.heroDivider, { backgroundColor: `${colors.border}88` }]} />
                  <View style={styles.heroStat}>
                    <Text variant="caption" secondary>
                      Yayında
                    </Text>
                    <Text variant="title3">{liveCount}</Text>
                  </View>
                </View>
              </GlassCard>

              <Pressable
                onPress={() => router.push('/feature-requests/new' as never)}
                style={({ pressed }) => [styles.submitCardPressable, pressed && { opacity: 0.9 }]}
              >
                <GlassCard style={styles.submitCard}>
                  <View style={styles.submitCopy}>
                    <Text variant="label">Yeni başvuru oluştur</Text>
                    <Text variant="caption" secondary>
                      Fikrini ekibe ilet, takip numaranla süreçleri izle.
                    </Text>
                  </View>
                  <View style={[styles.submitIcon, { backgroundColor: `${colors.primary}18` }]}>
                    <Ionicons name="add" size={20} color={colors.primary} />
                  </View>
                </GlassCard>
              </Pressable>

              <View style={styles.sectionRow}>
                <Text variant="label">Başvuruların</Text>
                <Text variant="caption" secondary>
                  {filtered.length} kayıt
                </Text>
              </View>

              <AdminFilterChip
                options={FEATURE_REQUEST_STATUS_FILTERS}
                value={statusFilter}
                onChange={setStatusFilter}
                compact
              />
            </View>
          }
          ListEmptyComponent={
            <GlassCard style={styles.empty}>
              <Ionicons name="chatbox-ellipses-outline" size={36} color={colors.textMuted} />
              <Text variant="label">{loading ? 'Yükleniyor…' : 'Henüz kayıt yok'}</Text>
              <Text variant="caption" secondary style={styles.emptyText}>
                İlk isteğini göndererek geliştirme ekibine doğrudan geri bildirim bırakabilirsin.
              </Text>
            </GlassCard>
          }
          renderItem={({ item }) => {
            const accent = statusColor(item.status, colors);
            return (
              <Pressable
                onPress={() => router.push(`/feature-requests/${item.id}` as never)}
                style={({ pressed }) => [styles.pressable, pressed && { opacity: 0.85, transform: [{ scale: 0.995 }] }]}
              >
                <GlassCard style={styles.card}>
                  <View style={styles.row}>
                    <View style={styles.copy}>
                      <Text variant="label" numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text variant="caption" secondary numberOfLines={1}>
                        {item.tracking_no} · {formatDate(item.created_at)}
                      </Text>
                    </View>
                    <View style={[styles.badge, { borderColor: `${accent}55`, backgroundColor: `${accent}20` }]}>
                      <Text variant="caption" style={{ color: accent, fontWeight: '700', fontSize: 11 }}>
                        {FEATURE_REQUEST_STATUS_LABELS[item.status]}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.footerRow}>
                    <Text variant="caption" muted>
                      Detayı görüntüle
                    </Text>
                    <Ionicons name="arrow-forward-circle-outline" size={17} color={colors.textMuted} />
                  </View>
                </GlassCard>
              </Pressable>
            );
          }}
        />
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  list: {
    flexGrow: 1,
    gap: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  listHeader: {
    gap: spacing.sm,
  },
  heroCard: {
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heroCopy: {
    flex: 1,
    gap: 2,
  },
  heroIcon: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  heroStat: {
    flex: 1,
    gap: 2,
  },
  heroDivider: {
    width: StyleSheet.hairlineWidth,
  },
  submitCardPressable: {
    borderRadius: 16,
  },
  submitCard: {
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  submitCopy: {
    flex: 1,
    gap: 2,
  },
  submitIcon: {
    width: 38,
    height: 38,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  card: {
    gap: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
  },
  pressable: {
    borderRadius: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  footerRow: {
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionRow: {
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  empty: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    textAlign: 'center',
    lineHeight: 18,
  },
});

