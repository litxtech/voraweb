import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';
import {
  TIP_ACCENT,
  TIP_CURRENCY,
  TIP_PRESETS_MINOR,
  type TipSurface,
} from '@/features/tips/constants';
import { loadTipPublicSettings, startTipCheckout } from '@/features/tips/services/api';
import type { TipPublicSettings } from '@/features/tips/types';

type TipSheetProps = {
  visible: boolean;
  onClose: () => void;
  recipientId: string;
  recipientName: string;
  surface: TipSurface;
  contextId?: string | null;
  contextLabel?: string | null;
  returnPath?: string;
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  TRY: '₺',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

function formatMoney(amountMinor: number, currency: string): string {
  const amount = Math.max(0, amountMinor) / 100;
  const formatted = amount.toLocaleString('tr-TR', {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  });
  const code = currency.toUpperCase();
  return `${formatted} ${CURRENCY_SYMBOLS[code] ?? code}`;
}

const FALLBACK_SETTINGS: TipPublicSettings = {
  presetsMinor: [...TIP_PRESETS_MINOR],
  currency: TIP_CURRENCY,
  minMinor: 100,
  maxMinor: 5_000_000,
  paymentsEnabled: true,
};

/**
 * Tüm bölümlerde kullanılan ortak bahşiş tutarı seçme sayfası. Tutar ve
 * komisyon istemcide hesaplanmaz; Stripe Checkout sunucuda oluşturulur.
 */
export function TipSheet({
  visible,
  onClose,
  recipientId,
  recipientName,
  surface,
  contextId,
  contextLabel,
  returnPath,
}: TipSheetProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [settings, setSettings] = useState<TipPublicSettings>(FALLBACK_SETTINGS);
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    void loadTipPublicSettings().then((next) => {
      if (!cancelled) setSettings(next);
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  const presets = useMemo(
    () => (settings.presetsMinor.length > 0 ? settings.presetsMinor.slice(0, 4) : [...TIP_PRESETS_MINOR]),
    [settings.presetsMinor],
  );

  const amountMinor = useMemo(() => {
    if (customMode) {
      let normalized = custom.replace(/[^\d,.]/g, '');
      if (normalized.includes(',')) {
        // Türkçe ondalık ayırıcı: binlik noktaları at, virgülü noktaya çevir.
        normalized = normalized.replace(/\./g, '').replace(',', '.');
      }
      const parsed = Number.parseFloat(normalized);
      if (!Number.isFinite(parsed) || parsed <= 0) return 0;
      return Math.round(parsed * 100);
    }
    return selected ?? 0;
  }, [custom, customMode, selected]);

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
    if (!settings.paymentsEnabled) {
      Alert.alert('Bahşiş kapalı', 'Bahşiş ödemeleri şu anda geçici olarak kapalı.');
      return;
    }
    if (amountMinor < settings.minMinor) {
      Alert.alert(
        'Tutar geçersiz',
        `En az ${formatMoney(settings.minMinor, settings.currency)} bahşiş gönderebilirsin.`,
      );
      return;
    }
    if (amountMinor > settings.maxMinor) {
      Alert.alert(
        'Tutar geçersiz',
        `En fazla ${formatMoney(settings.maxMinor, settings.currency)} bahşiş gönderebilirsin.`,
      );
      return;
    }

    setBusy(true);
    let result: Awaited<ReturnType<typeof startTipCheckout>>;
    try {
      result = await startTipCheckout({
        recipientId,
        amountMinor,
        surface,
        contextId,
        contextLabel,
        returnPath,
      });
    } catch {
      setBusy(false);
      Alert.alert('Bahşiş gönderilemedi', 'Bağlantı kurulamadı. Lütfen tekrar dene.');
      return;
    }

    if (result.error) {
      setBusy(false);
      if (/oturum aç/i.test(result.error)) {
        Alert.alert('Oturum gerekli', result.error, [
          { text: 'Vazgeç', style: 'cancel' },
          {
            text: 'Giriş yap',
            onPress: () => {
              reset();
              onClose();
              router.push('/(auth)/login');
            },
          },
        ]);
        return;
      }
      Alert.alert('Bahşiş gönderilemedi', result.error);
      return;
    }

    reset();
    onClose();
  }, [
    amountMinor,
    contextId,
    contextLabel,
    onClose,
    recipientId,
    reset,
    returnPath,
    router,
    settings.currency,
    settings.maxMinor,
    settings.minMinor,
    settings.paymentsEnabled,
    surface,
  ]);

  const sheetBackground = colors.surfaceElevated;
  const canSubmit = !busy && settings.paymentsEnabled && amountMinor >= settings.minMinor;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <KeyboardAvoidingView style={styles.overlay} behavior="padding">
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: sheetBackground,
              paddingBottom: insets.bottom + spacing.md,
            },
          ]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <ScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            >
            <Text variant="h3">Bahşiş gönder</Text>
            <Text variant="caption" muted>
              {recipientName} · Ödemen Stripe üzerinden güvenli şekilde alınır.
            </Text>

            <View style={styles.grid}>
              {presets.map((preset) => {
                const active = !customMode && selected === preset;
                return (
                  <Pressable
                    key={preset}
                    style={[
                      styles.preset,
                      {
                        borderColor: active ? TIP_ACCENT : colors.border,
                        backgroundColor: active ? `${TIP_ACCENT}22` : colors.surface,
                      },
                    ]}
                    onPress={() => {
                      setCustomMode(false);
                      setSelected(preset);
                    }}
                  >
                    <Text variant="label" style={{ color: active ? TIP_ACCENT : colors.text }}>
                      {formatMoney(preset, settings.currency)}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                style={[
                  styles.preset,
                  {
                    borderColor: customMode ? TIP_ACCENT : colors.border,
                    backgroundColor: customMode ? `${TIP_ACCENT}22` : colors.surface,
                  },
                ]}
                onPress={() => {
                  setCustomMode(true);
                  setSelected(null);
                }}
              >
                <Text variant="label" style={{ color: customMode ? TIP_ACCENT : colors.text }}>
                  Özel tutar
                </Text>
              </Pressable>
            </View>

            {customMode ? (
              <View
                style={[styles.customBox, { borderColor: colors.border, backgroundColor: colors.surface }]}
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
                  {settings.currency.toUpperCase()}
                </Text>
              </View>
            ) : null}

            <View style={[styles.breakdown, { backgroundColor: colors.surface }]}>
              <View style={styles.row}>
                <Text variant="caption" muted>
                  Göndereceğin tutar
                </Text>
                <Text variant="label">{formatMoney(amountMinor, settings.currency)}</Text>
              </View>
              <Text variant="caption" muted style={styles.breakdownNote}>
                Bahşiş tutarının tamamı tek ödeme olarak tahsil edilir.
              </Text>
            </View>

            <View style={styles.noteBox}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
              <Text variant="caption" muted style={styles.note}>
                Kart bilgilerin uygulamaya ulaşmaz. Ödeme Stripe Checkout üzerinde tamamlanır ve
                desteklediğin kullanıcıya iletilir.
              </Text>
            </View>

            {!settings.paymentsEnabled ? (
              <Text variant="caption" style={{ color: colors.warning }}>
                Bahşiş ödemeleri şu anda geçici olarak kapalı.
              </Text>
            ) : null}

            <Pressable
              style={[styles.cta, !canSubmit && styles.ctaDisabled]}
              disabled={!canSubmit}
              onPress={() => void handleContinue()}
            >
              {busy ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text variant="label" style={styles.ctaText}>
                  {amountMinor > 0
                    ? `${formatMoney(amountMinor, settings.currency)} bahşiş gönder`
                    : 'Tutar seç'}
                </Text>
              )}
            </Pressable>
            <Text variant="caption" muted style={styles.finePrint}>
              Bahşişler gönüllü desteklerdir. İade ve itiraz durumları muhasebe kayıtlarına yansıtılır.
            </Text>
          </ScrollView>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    maxHeight: '100%',
  },
  sheetScroll: { flexShrink: 1 },
  sheetContent: { gap: spacing.sm, paddingBottom: spacing.sm },
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
  breakdownNote: { lineHeight: 15 },
  noteBox: { flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' },
  note: { flex: 1, lineHeight: 16 },
  cta: {
    marginTop: spacing.sm,
    backgroundColor: TIP_ACCENT,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: '#FFFFFF', fontWeight: '700' },
  finePrint: { textAlign: 'center', lineHeight: 15 },
});
