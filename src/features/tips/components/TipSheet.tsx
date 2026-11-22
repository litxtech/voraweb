import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { FormKeyboardScrollView } from '@/components/keyboard/FormKeyboardScrollView';
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

/** Aşağı sürükleme ile kapatma eşikleri. */
const DISMISS_DRAG_PX = 90;
const DISMISS_VELOCITY = 700;
const SHEET_SPRING = { damping: 22, stiffness: 260, mass: 0.6 };

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

  /** Sayfa aşağı sürüklenirken kullanılan dikey kaydırma değeri. */
  const translateY = useSharedValue(0);

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

  // Kart her açılışta sürüklenmemiş konuma dönsün.
  useEffect(() => {
    if (visible) translateY.value = withTiming(0, { duration: 160 });
  }, [visible, translateY]);

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

  /** Aşağı kaydırma sonrası kartı ekranın dışına taşıyıp kapatır. */
  const animateClose = useCallback(() => {
    if (busy) {
      translateY.value = withSpring(0, SHEET_SPRING);
      return;
    }
    translateY.value = withTiming(1200, { duration: 180 }, (finished) => {
      if (finished) runOnJS(handleClose)();
    });
  }, [busy, handleClose, translateY]);

  const dragGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(6)
        .failOffsetX([-32, 32])
        .onUpdate((event) => {
          'worklet';
          if (busy) return;
          translateY.value = Math.max(0, event.translationY);
        })
        .onEnd((event) => {
          'worklet';
          if (busy) {
            translateY.value = withSpring(0, SHEET_SPRING);
            return;
          }
          if (event.translationY > DISMISS_DRAG_PX || event.velocityY > DISMISS_VELOCITY) {
            runOnJS(animateClose)();
            return;
          }
          translateY.value = withSpring(0, SHEET_SPRING);
        }),
    [animateClose, busy, translateY],
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

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
        <Pressable
          style={styles.backdrop}
          onPress={animateClose}
          accessibilityRole="button"
          accessibilityLabel="Bahşiş kartını kapat"
        />
        <Animated.View
          style={[
            styles.sheet,
            {
              backgroundColor: sheetBackground,
              paddingBottom: insets.bottom + spacing.md,
            },
            sheetAnimatedStyle,
          ]}
        >
          <GestureDetector gesture={dragGesture}>
            <View style={styles.sheetHeader} accessibilityLabel="Aşağı kaydırarak kapat">
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
              <View style={styles.headerRow}>
                <Text variant="h3" style={styles.headerTitle}>
                  Bahşiş gönder
                </Text>
                <Pressable
                  onPress={animateClose}
                  disabled={busy}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Kapat"
                  style={({ pressed }) => [
                    styles.closeBtn,
                    { backgroundColor: colors.surface, borderColor: colors.border },
                    pressed && styles.closeBtnPressed,
                  ]}
                >
                  <Ionicons name="close" size={16} color={colors.text} />
                </Pressable>
              </View>
              <Text variant="caption" muted numberOfLines={2}>
                {recipientName} · Ödemen Stripe üzerinden güvenli şekilde alınır.
              </Text>
            </View>
          </GestureDetector>
          <FormKeyboardScrollView
            style={styles.sheetScroll}
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
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
          </FormKeyboardScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    // Arka plan her zaman dokunulabilir kalsın (kart tam ekranı kaplamasın).
    maxHeight: '92%',
    overflow: 'hidden',
  },
  sheetScroll: { flexShrink: 1 },
  sheetContent: { gap: spacing.sm, paddingBottom: spacing.sm },
  sheetHeader: { paddingBottom: spacing.xs, gap: spacing.xs },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  headerTitle: { flex: 1 },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnPressed: { opacity: 0.65 },
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
