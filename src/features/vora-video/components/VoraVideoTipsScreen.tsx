import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/Text';
import { ScreenBackButton } from '@/components/ui/ScreenBackButton';
import { radius, spacing } from '@/constants/theme';
import { useOptionalAuth } from '@/providers/authContext';
import { useTheme } from '@/providers/ThemeProvider';
import {
  VV_ACCENT,
  VV_ROUTES,
  VV_TIP_STATUS_LABELS,
  loadVvSettings,
  type VvSettings,
  type VvTipDirection,
  type VvTipHistoryRow,
  type VvTipSummary,
} from '@/features/vora-video';
import { loadVvMyTips } from '../services/api';
import { vvFormatDateTime, vvFormatMoney, vvRelativeTime } from '../services/format';
import {
  createVvTipReceiptPdf,
  createVvTipReportPdf,
  downloadVvPdf,
  shareVvPdfOnWhatsApp,
  vvTipReceiptWhatsAppText,
  vvTipReportWhatsAppText,
  type VvPdfArtifact,
} from '../services/tipReport';
import { VvChip, VvEmptyState, VvLoading, VvNotice, VvSection } from './VvUi';

const PAGE_SIZE = 30;
const EMPTY_SUMMARY: VvTipSummary = {
  count: 0,
  succeeded_count: 0,
  pending_count: 0,
  gross_minor: 0,
  creator_net_minor: 0,
  commission_minor: 0,
  refunded_minor: 0,
  currency: 'try',
};

type BusyKey =
  | 'report-download'
  | 'report-whatsapp'
  | `tip-download:${string}`
  | `tip-whatsapp:${string}`
  | null;

function cleanName(value: string | null | undefined, fallback: string): string {
  const clean = String(value ?? '').replace(/\s+/g, ' ').trim();
  return clean || fallback;
}

function counterpartName(tip: VvTipHistoryRow, role: VvTipDirection): string {
  if (role === 'received') {
    if (tip.anonymous) return 'Anonim destekçi';
    return cleanName(tip.sender_full_name ?? tip.sender_username, 'İzleyici');
  }
  return cleanName(tip.creator_full_name ?? tip.creator_username, 'İçerik üreticisi');
}

function statusColorKey(status: string): 'success' | 'warning' | 'danger' | 'muted' {
  if (status === 'succeeded') return 'success';
  if (status === 'failed' || status === 'disputed') return 'danger';
  if (status === 'refunded' || status === 'partially_refunded') return 'muted';
  return 'warning';
}

export function VoraVideoTipsScreen() {
  const { colors } = useTheme();
  const auth = useOptionalAuth();
  const [role, setRole] = useState<VvTipDirection>('received');
  const [settings, setSettings] = useState<VvSettings | null>(null);
  const [rows, setRows] = useState<VvTipHistoryRow[]>([]);
  const [summary, setSummary] = useState<VvTipSummary>(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyKey>(null);

  const ownerName = useMemo(() => {
    const profile = auth?.profile;
    return (
      cleanName(profile?.full_name ?? profile?.username, 'Sahne hesabım')
    );
  }, [auth?.profile]);

  useEffect(() => {
    void loadVvSettings().then((result) => {
      if (result.data) setSettings(result.data);
    });
  }, []);

  const load = useCallback(async (nextRole: VvTipDirection) => {
    setLoading(true);
    setError(null);
    const result = await loadVvMyTips(nextRole, 0, PAGE_SIZE);
    if (result.error || !result.data) {
      setError(result.error ?? 'Bahşiş kayıtları yüklenemedi.');
      setRows([]);
      setSummary(EMPTY_SUMMARY);
      setHasMore(false);
      setLoading(false);
      return;
    }
    setRows(result.data.rows);
    setSummary(result.data.summary ?? EMPTY_SUMMARY);
    setHasMore(result.data.rows.length >= PAGE_SIZE);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(role);
  }, [load, role]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const result = await loadVvMyTips(role, rows.length, PAGE_SIZE);
    if (!result.error && result.data) {
      const incoming = result.data.rows;
      setRows((prev) => {
        const seen = new Set(prev.map((row) => row.id));
        return [...prev, ...incoming.filter((row) => !seen.has(row.id))];
      });
      setSummary(result.data.summary ?? summary);
      setHasMore(incoming.length >= PAGE_SIZE);
    }
    setLoadingMore(false);
  }, [hasMore, loadingMore, role, rows.length, summary]);

  const collectAllRows = useCallback(async (): Promise<VvTipHistoryRow[]> => {
    const collected = [...rows];
    if (!hasMore) return collected;
    let offset = rows.length;
    const seen = new Set(collected.map((row) => row.id));
    for (let page = 0; page < 5; page += 1) {
      const result = await loadVvMyTips(role, offset, 100);
      if (result.error || !result.data) break;
      for (const row of result.data.rows) {
        if (!seen.has(row.id)) {
          seen.add(row.id);
          collected.push(row);
        }
      }
      if (result.data.rows.length < 100) break;
      offset += result.data.rows.length;
    }
    return collected;
  }, [hasMore, role, rows]);

  const downloadReport = useCallback(async () => {
    if (busy) return;
    setBusy('report-download');
    try {
      const allRows = await collectAllRows();
      const artifact = await createVvTipReportPdf({
        role,
        rows: allRows,
        summary,
        ownerName,
      });
      if (artifact.error) {
        Alert.alert('PDF oluşturulamadı', artifact.error);
        return;
      }
      const result = await downloadVvPdf(artifact);
      if (result.error) {
        Alert.alert('PDF indirilemedi', result.error);
        return;
      }
      if (result.savedTo === 'web') {
        Alert.alert(
          'PDF hazır',
          'Açılan yazdırma penceresinde "PDF olarak kaydet" seçeneğini kullanabilirsin.',
        );
      } else if (result.savedTo === 'folder') {
        Alert.alert('PDF indirildi', 'Seçtiğin klasöre kaydedildi.');
      }
    } finally {
      setBusy(null);
    }
  }, [busy, collectAllRows, ownerName, role, summary]);

  const shareReport = useCallback(async () => {
    if (busy) return;
    setBusy('report-whatsapp');
    try {
      const allRows = await collectAllRows();
      const input = { role, rows: allRows, summary, ownerName };
      const artifact = await createVvTipReportPdf(input);
      if (artifact.error) {
        Alert.alert('PDF oluşturulamadı', artifact.error);
        return;
      }
      const result = await shareVvPdfOnWhatsApp(artifact, vvTipReportWhatsAppText(input));
      if (result.error) Alert.alert('Paylaşılamadı', result.error);
    } finally {
      setBusy(null);
    }
  }, [busy, collectAllRows, ownerName, role, summary]);

  const downloadReceipt = useCallback(
    async (tip: VvTipHistoryRow) => {
      if (busy) return;
      setBusy(`tip-download:${tip.id}`);
      try {
        const artifact = await createVvTipReceiptPdf(tip, role);
        if (artifact.error) {
          Alert.alert('PDF oluşturulamadı', artifact.error);
          return;
        }
        const result = await downloadVvPdf(artifact);
        if (result.error) {
          Alert.alert('PDF indirilemedi', result.error);
          return;
        }
        if (result.savedTo === 'web') {
          Alert.alert(
            'Makbuz hazır',
            'Açılan yazdırma penceresinde "PDF olarak kaydet" seçeneğini kullanabilirsin.',
          );
        } else if (result.savedTo === 'folder') {
          Alert.alert('Makbuz indirildi', 'Seçtiğin klasöre kaydedildi.');
        }
      } finally {
        setBusy(null);
      }
    },
    [busy, role],
  );

  const shareReceipt = useCallback(
    async (tip: VvTipHistoryRow) => {
      if (busy) return;
      setBusy(`tip-whatsapp:${tip.id}`);
      try {
        const artifact: VvPdfArtifact = await createVvTipReceiptPdf(tip, role);
        if (artifact.error) {
          Alert.alert('PDF oluşturulamadı', artifact.error);
          return;
        }
        const result = await shareVvPdfOnWhatsApp(artifact, vvTipReceiptWhatsAppText(tip, role));
        if (result.error) Alert.alert('Paylaşılamadı', result.error);
      } finally {
        setBusy(null);
      }
    },
    [busy, role],
  );

  const openTipActions = useCallback(
    (tip: VvTipHistoryRow) => {
      const amount = vvFormatMoney(
        role === 'received' ? tip.creator_net_minor : tip.gross_minor,
        tip.currency,
      );
      const details = [
        counterpartName(tip, role),
        tip.video_title ? `Video: ${tip.video_title}` : 'Profil üzerinden destek',
        vvFormatDateTime(tip.created_at),
        tip.message ? `“${tip.message}”` : null,
      ]
        .filter(Boolean)
        .join('\n');

      Alert.alert(`${amount} · ${VV_TIP_STATUS_LABELS[tip.status] ?? tip.status}`, details, [
        { text: 'Makbuzu indir', onPress: () => void downloadReceipt(tip) },
        { text: 'WhatsApp ile paylaş', onPress: () => void shareReceipt(tip) },
        { text: 'Kapat', style: 'cancel' },
      ]);
    },
    [downloadReceipt, role, shareReceipt],
  );

  const totalMinor = role === 'received' ? summary.creator_net_minor : summary.gross_minor;
  const totalLabel = role === 'received' ? 'Net kazanç' : 'Toplam ödenen';
  const listBusy = busy === 'report-download' || busy === 'report-whatsapp';

  const renderRow = (tip: VvTipHistoryRow) => {
    const statusKey = statusColorKey(tip.status);
    const statusColor =
      statusKey === 'success'
        ? colors.success
        : statusKey === 'danger'
          ? colors.danger
          : statusKey === 'warning'
            ? colors.warning
            : colors.textMuted;
    const amount = vvFormatMoney(
      role === 'received' ? tip.creator_net_minor : tip.gross_minor,
      tip.currency,
    );
    const rowBusy = busy === `tip-download:${tip.id}` || busy === `tip-whatsapp:${tip.id}`;

    return (
      <Pressable
        key={tip.id}
        onPress={() => openTipActions(tip)}
        style={[styles.row, { borderColor: colors.border, backgroundColor: colors.surface }]}
      >
        <View
          style={[
            styles.rowIcon,
            {
              backgroundColor: role === 'received' ? `${VV_ACCENT}1A` : `${colors.primary}1A`,
            },
          ]}
        >
          <Ionicons
            name={role === 'received' ? 'heart' : 'paper-plane'}
            size={16}
            color={role === 'received' ? VV_ACCENT : colors.primary}
          />
        </View>
        <View style={styles.rowBody}>
          <Text variant="label" numberOfLines={1}>
            {counterpartName(tip, role)}
          </Text>
          <Text variant="caption" muted numberOfLines={1}>
            {tip.video_title ?? 'Profil üzerinden destek'}
          </Text>
          <View style={styles.rowMeta}>
            <Text variant="caption" muted>
              {vvRelativeTime(tip.created_at)}
            </Text>
            <View style={[styles.statusPill, { backgroundColor: `${statusColor}1F` }]}>
              <Text style={[styles.statusText, { color: statusColor }]}>
                {VV_TIP_STATUS_LABELS[tip.status] ?? tip.status}
              </Text>
            </View>
          </View>
        </View>
        <View style={styles.rowRight}>
          {rowBusy ? (
            <ActivityIndicator color={VV_ACCENT} />
          ) : (
            <Text variant="label" style={styles.rowAmount}>
              {role === 'received' ? '+' : ''}
              {amount}
            </Text>
          )}
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.flex}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        <ScreenBackButton onPress={() => router.back()} />
        <View style={styles.headerText}>
          <Text variant="h3">Bahşişler</Text>
          <Text variant="caption" muted>
            Gönderilen ve alınan destekler
          </Text>
        </View>
        <Pressable onPress={() => void load(role)} hitSlop={8} style={styles.headerIcon}>
          <Ionicons name="refresh" size={18} color={colors.text} />
        </Pressable>
        <Pressable
          onPress={() => router.push(VV_ROUTES.wallet as never)}
          hitSlop={8}
          style={styles.headerIcon}
        >
          <Ionicons name="wallet-outline" size={18} color={colors.text} />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <VvChip
          label="Aldığım bahşişler"
          icon="heart-outline"
          active={role === 'received'}
          onPress={() => setRole('received')}
        />
        <VvChip
          label="Gönderdiğim bahşişler"
          icon="paper-plane-outline"
          active={role === 'sent'}
          onPress={() => setRole('sent')}
        />
      </View>

      {loading ? <VvLoading label="Bahşiş kayıtları yükleniyor…" /> : null}

      {!loading && error ? (
        <View style={styles.errorWrap}>
          <VvNotice tone="danger">{error}</VvNotice>
          <Pressable onPress={() => void load(role)} hitSlop={8}>
            <Text variant="label" style={{ color: VV_ACCENT }}>
              Tekrar dene
            </Text>
          </Pressable>
        </View>
      ) : null}

      {!loading && !error ? (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
            {settings && !settings.payments_enabled ? (
              <VvNotice tone="warning">
                Bahşiş ödemeleri yönetici tarafından geçici olarak kapatıldı. Yeni bahşiş
                başlatılamaz; mevcut kayıtlar görüntülenebilir.
              </VvNotice>
            ) : null}

            <View style={[styles.hero, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text variant="caption" muted>
                {totalLabel}
              </Text>
              <Text variant="h1" style={{ color: VV_ACCENT }}>
                {vvFormatMoney(totalMinor, summary.currency)}
              </Text>
              <View style={styles.heroRow}>
                <View style={styles.heroCell}>
                  <Text variant="caption" muted>
                    Tamamlanan
                  </Text>
                  <Text variant="label">{summary.succeeded_count}</Text>
                </View>
                <View style={styles.heroCell}>
                  <Text variant="caption" muted>
                    Bekleyen
                  </Text>
                  <Text variant="label">{summary.pending_count}</Text>
                </View>
                <View style={styles.heroCell}>
                  <Text variant="caption" muted>
                    Toplam kayıt
                  </Text>
                  <Text variant="label">{summary.count}</Text>
                </View>
              </View>
            </View>

            <View style={[styles.reportCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.reportHead}>
                <View style={[styles.reportIcon, { backgroundColor: `${VV_ACCENT}1A` }]}>
                  <Ionicons name="document-text-outline" size={18} color={VV_ACCENT} />
                </View>
                <View style={styles.reportText}>
                  <Text variant="label">PDF bahşiş dökümü</Text>
                  <Text variant="caption" muted>
                    Tüm kayıtları PDF olarak indir veya WhatsApp'tan paylaş.
                  </Text>
                </View>
              </View>
              <View style={styles.reportActions}>
                <Pressable
                  onPress={() => void downloadReport()}
                  disabled={listBusy}
                  style={[styles.reportButton, { backgroundColor: VV_ACCENT }, listBusy && styles.disabled]}
                >
                  {busy === 'report-download' ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <Ionicons name="download-outline" size={15} color="#FFFFFF" />
                      <Text style={styles.reportButtonText}>PDF indir</Text>
                    </>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => void shareReport()}
                  disabled={listBusy}
                  style={[
                    styles.reportButton,
                    styles.whatsappButton,
                    listBusy && styles.disabled,
                  ]}
                >
                  {busy === 'report-whatsapp' ? (
                    <ActivityIndicator color="#128C7E" size="small" />
                  ) : (
                    <>
                      <Ionicons name="logo-whatsapp" size={16} color="#128C7E" />
                      <Text style={[styles.reportButtonText, { color: '#128C7E' }]}>
                        WhatsApp'tan paylaş
                      </Text>
                    </>
                  )}
                </Pressable>
              </View>
            </View>

            <VvSection
              title={role === 'received' ? 'Gelen bahşişler' : 'Gönderilen bahşişler'}
              hint={`${summary.count} kayıt`}
            >
              {rows.length === 0 ? (
                <VvEmptyState
                  title={
                    role === 'received'
                      ? 'Henüz bahşiş almadın'
                      : 'Henüz bahşiş göndermedin'
                  }
                  message={
                    role === 'received'
                      ? 'Video yayınladığında izleyiciler bahşiş gönderebilir; tüm kayıtlar burada listelenir.'
                      : 'Sahne videolarındaki bahşiş butonuyla içerik üreticilerini destekleyebilirsin.'
                  }
                  icon={role === 'received' ? 'heart-outline' : 'paper-plane-outline'}
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
                rows.map(renderRow)
              )}

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
            </VvSection>

            <Text variant="caption" muted style={styles.finePrint}>
              Bahşişler gönüllü desteklerdir. Ödeme ve iade hareketleri Stripe üzerinden işlenir;
              makbuzlar bilgilendirme amaçlıdır.
            </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  tabs: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  errorWrap: { padding: spacing.md, gap: spacing.sm },
  hero: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  heroRow: { flexDirection: 'row', marginTop: spacing.sm },
  heroCell: { flex: 1, gap: 1 },
  reportCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm },
  reportHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  reportIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportText: { flex: 1, gap: 1 },
  reportActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  reportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: 40,
    flexGrow: 1,
  },
  whatsappButton: {
    backgroundColor: '#E7F8F2',
    borderWidth: 1,
    borderColor: '#BFEADF',
  },
  reportButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 1, minWidth: 0 },
  rowMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 2 },
  statusPill: { borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 1 },
  statusText: { fontSize: 9.5, fontWeight: '700' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  rowAmount: { fontSize: 12.5 },
  more: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  cta: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full },
  ctaText: { color: '#FFFFFF', fontWeight: '700' },
  finePrint: { textAlign: 'center', lineHeight: 16 },
  disabled: { opacity: 0.6 },
});
