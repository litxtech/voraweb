import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { VV_ACCENT } from '../constants';
import { openVvTipCheckout } from '../services/api';
import { vvFormatMoney } from '../services/format';

type Props = {
  visible: boolean;
  onClose: () => void;
  creatorId: string;
  videoId?: string | null;
  creatorName: string;
  presets: number[];
  currency: string;
  commissionBp?: number;
};

export function VoraVideoTipSheet({
  visible,
  onClose,
  creatorId,
  videoId,
  creatorName,
  presets,
  currency,
  commissionBp = 3000,
}: Props) {
  const { colors } = useTheme();
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [busy, setBusy] = useState(false);

  const effectivePresets = useMemo(
    () => (presets.length > 0 ? presets.slice(0, 4) : [5000, 10000, 25000, 50000]),
    [presets],
  );

  const amountMinor = useMemo(() => {
    if (customMode) {
      const normalized = custom.replace(/[^\d,.]/g, '').replace(',', '.');
      const parsed = Number.parseFloat(normalized);
      if (!Number.isFinite(parsed) || parsed <= 0) return 0;
      return Math.min(Math.round(parsed * 100), 5_000_000);
    }
    return selected ?? 0;
  }, [custom, customMode, selected]);

  // Yalnızca önizleme amaçlı bilgi; gerçek komisyon sunucuda hesaplanır.
  const safeCommissionBp = Math.min(Math.max(Math.round(commissionBp), 0), 10000);
  const creatorBp = 10000 - safeCommissionBp;
  const creatorShare = Math.floor((amountMinor * creatorBp) / 10000);
  const platformShare = amountMinor - creatorShare;

  const reset = useCallback(() => {
    setSelected(null);
    setCustom('');
    setCustomMode(false);
    setBusy(false);
  }, []);

  const handleClose = useCallback(() => {
    if (busy) return;
    reset();
    onClose();
  }, [busy, onClose, reset]);

  const handleContinue = useCallback(async () => {
    if (amountMinor < 100) {
      Alert.alert('Tutar geçersiz', 'En az 1 TL bahşiş gönderebilirsin.');
      return;
    }
    setBusy(true);
    try {
      const result = await openVvTipCheckout({ creatorId, videoId, amountMinor });
      if (result.error) {
        setBusy(false);
        Alert.alert('Ödeme başlatılamadı', result.error);
        return;
      }
      reset();
      onClose();
    } catch (error) {
      setBusy(false);
      Alert.alert(
        'Ödeme başlatılamadı',
        error instanceof Error ? error.message : 'Bilinmeyen bir hata oluştu.',
      );
    }
  }, [amountMinor, creatorId, onClose, reset, videoId]);

  const sheetBackground = colors.surfaceElevated;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: sheetBackground }]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <Text variant="h3">Bahşiş gönder</Text>
          <Text variant="caption" muted>
            {creatorName} · Ödemen Stripe üzerinden güvenli şekilde alınır.
          </Text>

          <View style={styles.grid}>
            {effectivePresets.map((preset) => {
              const active = !customMode && selected === preset;
              return (
                <Pressable
                  key={preset}
                  style={[
                    styles.preset,
                    {
                      borderColor: active ? VV_ACCENT : colors.border,
                      backgroundColor: active ? `${VV_ACCENT}22` : colors.surface,
                    },
                  ]}
                  onPress={() => {
                    setCustomMode(false);
                    setSelected(preset);
                  }}
                >
                  <Text variant="label" style={{ color: active ? VV_ACCENT : colors.text }}>
                    {vvFormatMoney(preset, currency)}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              style={[
                styles.preset,
                {
                  borderColor: customMode ? VV_ACCENT : colors.border,
                  backgroundColor: customMode ? `${VV_ACCENT}22` : colors.surface,
                },
              ]}
              onPress={() => {
                setCustomMode(true);
                setSelected(null);
              }}
            >
              <Text variant="label" style={{ color: customMode ? VV_ACCENT : colors.text }}>
                Özel tutar
              </Text>
            </Pressable>
          </View>

          {customMode ? (
            <View
              style={[
                styles.customBox,
                { borderColor: colors.border, backgroundColor: colors.surface },
              ]}
            >
              <TextInput
                value={custom}
                onChangeText={setCustom}
                placeholder="Örn. 75"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                style={[styles.input, { color: colors.text }]}
                autoFocus
              />
              <Text variant="caption" muted>
                {currency.toUpperCase()}
              </Text>
            </View>
          ) : null}

          <View style={[styles.breakdown, { backgroundColor: colors.surface }]}>
            <View style={styles.row}>
              <Text variant="caption" muted>
                Toplam
              </Text>
              <Text variant="label">{vvFormatMoney(amountMinor, currency)}</Text>
            </View>
            <View style={styles.row}>
              <Text variant="caption" muted>
                İçerik üreticisi payı (%{(creatorBp / 100).toFixed(creatorBp % 100 === 0 ? 0 : 1)})
              </Text>
              <Text variant="caption" style={{ color: colors.success }}>
                +{vvFormatMoney(creatorShare, currency)}
              </Text>
            </View>
            <View style={styles.row}>
              <Text variant="caption" muted>
                Platform komisyonu (%{(safeCommissionBp / 100).toFixed(safeCommissionBp % 100 === 0 ? 0 : 1)})
              </Text>
              <Text variant="caption" muted>
                {vvFormatMoney(platformShare, currency)}
              </Text>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.noteBox} style={styles.noteScroll}>
            <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
            <Text variant="caption" muted style={styles.note}>
              Kart bilgilerin Vora'ya ulaşmaz. Ödeme Stripe Checkout üzerinde tamamlanır; komisyon
              ve pay hesaplaması yalnızca sunucu tarafında yapılır.
            </Text>
          </ScrollView>

          <Pressable
            style={[styles.cta, (busy || amountMinor < 100) && styles.ctaDisabled]}
            disabled={busy || amountMinor < 100}
            onPress={handleContinue}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text variant="label" style={styles.ctaText}>
                {amountMinor > 0
                  ? `${vvFormatMoney(amountMinor, currency)} bahşiş gönder`
                  : 'Tutar seç'}
              </Text>
            )}
          </Pressable>
          <Text variant="caption" muted style={styles.finePrint}>
            Bahşişler gönüllü desteklerdir. İade ve itiraz durumları muhasebe kayıtlarına yansıtılır.
          </Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    marginBottom: spacing.xs,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  preset: {
    minWidth: '30%',
    flexGrow: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
  },
  customBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
  },
  input: { flex: 1, paddingVertical: spacing.md, fontSize: 18 },
  breakdown: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    gap: spacing.xs,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  noteScroll: { maxHeight: 64 },
  noteBox: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
  note: { flex: 1, lineHeight: 16 },
  cta: {
    marginTop: spacing.sm,
    backgroundColor: VV_ACCENT,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: '#FFFFFF', fontWeight: '700' },
  finePrint: { textAlign: 'center', lineHeight: 15 },
});
