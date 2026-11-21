import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';

import { Text } from '@/components/ui/Text';
import { Screen } from '@/components/ui/Screen';
import { ScreenBackButton } from '@/components/ui/ScreenBackButton';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';
import {
  VV_ACCENT,
  VV_PAYOUT_STATUS_LABELS,
  VV_STRIPE_STATUS_LABELS,
  VV_UNCONFIGURED_NOTES,
  loadVvSettings,
  type VvPayoutHistoryRow,
  type VvSettings,
  type VvWallet,
} from '@/features/vora-video';
import {
  loadVvCreatorWallet,
  startVvConnectOnboarding,
  syncVvConnectStatus,
} from '../services/api';
import {
  vvFormatMoney,
  vvFormatPeriod,
  vvRelativeTime,
  vvRemainingDays,
} from '../services/format';
import { VvEmptyState, VvLoading, VvNotice, VvSection, VvStat } from './VvUi';

export function VoraVideoWalletScreen() {
  const { colors } = useTheme();
  const [wallet, setWallet] = useState<VvWallet | null>(null);
  const [settings, setSettings] = useState<VvSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [result, config] = await Promise.all([loadVvCreatorWallet(), loadVvSettings()]);
    if (result.error || !result.data) {
      setError(result.error ?? 'Kazanç bilgileri yüklenemedi.');
      setLoading(false);
      return;
    }
    setWallet(result.data);
    if (config.data) setSettings(config.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startOnboarding = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const result = await startVvConnectOnboarding();
    setBusy(false);
    if (result.error) {
      Alert.alert('Stripe bağlanamadı', result.error);
      return;
    }
    if (result.data?.onboarding_url) {
      await WebBrowser.openBrowserAsync(result.data.onboarding_url);
      await load();
      return;
    }
    Alert.alert('Stripe', 'Onboarding bağlantısı alınamadı. Daha sonra tekrar dene.');
  }, [busy, load]);

  const refreshStatus = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const result = await syncVvConnectStatus();
    setBusy(false);
    if (result.error) {
      Alert.alert('Durum alınamadı', result.error);
      return;
    }
    await load();
  }, [busy, load]);

  const currency = wallet?.currency ?? 'TRY';

  const renderHistory = (row: VvPayoutHistoryRow) => (
    <View key={row.id} style={[styles.historyRow, { borderColor: colors.border }]}>
      <View style={styles.historyText}>
        <Text variant="caption">{vvFormatPeriod(row.period_start, row.period_end)}</Text>
        <Text variant="caption" muted>
          {vvFormatMoney(row.amount_minor, row.currency)} ·{' '}
          {VV_PAYOUT_STATUS_LABELS[row.status] ?? row.status}
          {row.processed_at ? ` · ${vvRelativeTime(row.processed_at)}` : ''}
        </Text>
        {row.failure_reason ? (
          <Text variant="caption" style={{ color: colors.danger }} numberOfLines={2}>
            {row.failure_reason}
          </Text>
        ) : null}
        {row.held_reason ? (
          <Text variant="caption" style={{ color: colors.warning }} numberOfLines={2}>
            {row.held_reason}
          </Text>
        ) : null}
      </View>
      <View
        style={[
          styles.statusDot,
          {
            backgroundColor:
              row.status === 'paid'
                ? colors.success
                : row.status === 'failed' || row.status === 'reversed'
                  ? colors.danger
                  : row.status === 'held'
                    ? colors.warning
                    : colors.primary,
          },
        ]}
      />
    </View>
  );

  return (
    <Screen padded={false}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <ScreenBackButton onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text variant="h3">İçerik Üreticisi Kazançlarım</Text>
          <Text variant="caption" muted>
            Bahşiş gelirleri · 15 günlük ödeme dönemi
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/vora-video/tips' as never)}
          hitSlop={8}
          style={styles.headerIcon}
        >
          <Ionicons name="heart-outline" size={18} color={colors.text} />
        </Pressable>
        <Pressable onPress={() => void refreshStatus()} hitSlop={8} style={styles.headerIcon}>
          <Ionicons name="refresh" size={18} color={colors.text} />
        </Pressable>
      </View>

      {loading ? <VvLoading label="Kazançlar yükleniyor…" /> : null}

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

      {!loading && wallet ? (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text variant="caption" muted>
              Ödenebilir bakiye
            </Text>
            <Text variant="h1" style={{ color: VV_ACCENT }}>
              {vvFormatMoney(wallet.available_minor, currency)}
            </Text>
            <View style={styles.heroRow}>
              <View style={styles.heroCell}>
                <Text variant="caption" muted>
                  Bekleyen
                </Text>
                <Text variant="label">{vvFormatMoney(wallet.pending_minor, currency)}</Text>
              </View>
              <View style={styles.heroCell}>
                <Text variant="caption" muted>
                  Ödenen
                </Text>
                <Text variant="label">{vvFormatMoney(wallet.paid_minor, currency)}</Text>
              </View>
              <View style={styles.heroCell}>
                <Text variant="caption" muted>
                  Bekletilen
                </Text>
                <Text variant="label">{vvFormatMoney(wallet.held_minor, currency)}</Text>
              </View>
            </View>
          </View>

          <View style={[styles.periodCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.periodHead}>
              <Ionicons name="calendar-outline" size={18} color={VV_ACCENT} />
              <Text variant="label">Sonraki ödeme dönemi</Text>
            </View>
            <Text variant="caption" muted>
              {vvFormatPeriod(wallet.next_period_start, wallet.next_period_end)}
            </Text>
            <Text variant="caption" muted>
              Transfer {vvRelativeTime(wallet.next_payout_at)} başlatılacak
              {vvRemainingDays(wallet.next_payout_at) !== null
                ? ` · ${vvRemainingDays(wallet.next_payout_at)} gün`
                : ''}
            </Text>
            <View style={[styles.countdownTrack, { backgroundColor: colors.surfaceElevated }]}>
              <View style={[styles.countdownFill, { width: `${periodProgress(wallet)}%` }]} />
            </View>
            <Text variant="caption" muted style={styles.tiny}>
              {VV_UNCONFIGURED_NOTES.payoutTiming}
            </Text>
          </View>

          <View
            style={[
              styles.stripeCard,
              {
                backgroundColor: colors.surface,
                borderColor: wallet.stripe_status === 'ready' ? `${colors.success}66` : `${colors.warning}66`,
              },
            ]}
          >
            <View style={styles.stripeHead}>
              <Ionicons
                name={wallet.stripe_status === 'ready' ? 'checkmark-circle' : 'alert-circle-outline'}
                size={19}
                color={wallet.stripe_status === 'ready' ? colors.success : colors.warning}
              />
              <View style={styles.stripeText}>
                <Text variant="label">
                  {VV_STRIPE_STATUS_LABELS[wallet.stripe_status] ?? wallet.stripe_status}
                </Text>
                <Text variant="caption" muted>
                  {wallet.stripe_payouts_enabled
                    ? 'Stripe transferleri aktif.'
                    : 'Stripe onboarding tamamlanmadan transfer başlatılmaz; kazancın kaybolmaz.'}
                </Text>
              </View>
            </View>
            {wallet.stripe_status !== 'ready' ? (
              <Pressable
                onPress={() => void startOnboarding()}
                disabled={busy}
                style={[styles.primaryButton, busy && styles.disabled]}
              >
                <Text variant="label" style={styles.primaryText}>
                  {busy ? 'Bağlanıyor…' : 'Stripe hesabını bağla'}
                </Text>
              </Pressable>
            ) : (
              <Pressable
                onPress={() => void refreshStatus()}
                disabled={busy}
                style={[styles.secondaryButton, { borderColor: colors.border }]}
              >
                <Text variant="label">{busy ? 'Kontrol ediliyor…' : 'Durumu yenile'}</Text>
              </Pressable>
            )}
          </View>

          <VvSection title="Toplam gelir dökümü">
            <View style={styles.statsGrid}>
              <VvStat
                label="Brüt bahşiş"
                value={vvFormatMoney(wallet.lifetime_gross_minor, currency)}
                hint={`${wallet.tip_count} başarılı bahşiş`}
              />
              <VvStat
                label="Platform komisyonu"
                value={vvFormatMoney(wallet.lifetime_commission_minor, currency)}
              />
              <VvStat
                label="İçerik üreticisi payı"
                value={vvFormatMoney(wallet.lifetime_creator_minor, currency)}
                accent
              />
              <VvStat
                label="Stripe işlem ücretleri"
                value={vvFormatMoney(wallet.lifetime_fee_minor, currency)}
              />
            </View>
          </VvSection>

          {!settings?.payments_enabled ? (
            <VvNotice tone="warning">{VV_UNCONFIGURED_NOTES.payments}</VvNotice>
          ) : null}

          <VvSection title="Ödeme geçmişi" hint="Stripe transfer kayıtları">
            {wallet.payout_history.length > 0 ? (
              wallet.payout_history.map(renderHistory)
            ) : (
              <VvEmptyState
                title="Henüz ödeme yok"
                message="Dönem kapandığında ve Stripe hesabın hazır olduğunda transfer kaydı burada görünür."
                icon="card-outline"
              />
            )}
          </VvSection>

          <View style={[styles.isolation, { borderColor: colors.border }]}>
            <Ionicons name="shield-checkmark-outline" size={16} color={colors.textMuted} />
            <Text variant="caption" muted style={styles.isolationText}>
              Bu cüzdan yalnızca gerçek para bahşiş kazançlarını gösterir. Vora Okey oyun coinleri,
              hediyeler ve oyun içi bakiyeler bu sisteme aktarılamaz.
            </Text>
          </View>
        </ScrollView>
      ) : null}
    </Screen>
  );
}

function periodProgress(wallet: VvWallet): number {
  const start = new Date(`${wallet.next_period_start}T00:00:00`).getTime();
  const end = new Date(`${wallet.next_period_end}T23:59:59`).getTime();
  const now = Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100)));
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
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  errorWrap: { padding: spacing.md, gap: spacing.sm },
  hero: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  heroRow: { flexDirection: 'row', marginTop: spacing.sm },
  heroCell: { flex: 1, gap: 1 },
  periodCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  periodHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  countdownTrack: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: spacing.xs },
  countdownFill: { height: 8, backgroundColor: VV_ACCENT },
  tiny: { lineHeight: 16 },
  stripeCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  stripeHead: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  stripeText: { flex: 1, gap: 1 },
  primaryButton: {
    backgroundColor: VV_ACCENT,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  primaryText: { color: '#FFFFFF', fontWeight: '700' },
  disabled: { opacity: 0.6 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.sm,
  },
  historyText: { flex: 1, gap: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  isolation: {
    flexDirection: 'row',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  isolationText: { flex: 1, lineHeight: 16 },
});
