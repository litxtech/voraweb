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
};

/** Aşağı sürükleme ile kapatma eşikleri. */
const DISMISS_DRAG_PX = 90;
const DISMISS_VELOCITY = 700;
const SHEET_SPRING = { damping: 22, stiffness: 260, mass: 0.6 };

export function VoraVideoTipSheet({
  visible,
  onClose,
  creatorId,
  videoId,
  creatorName,
  presets,
  currency,
}: Props) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  /** Sayfa aşağı sürüklenirken kullanılan dikey kaydırma değeri. */
  const translateY = useSharedValue(0);

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

  // Komisyon/pay kırılımı kullanıcıya gösterilmez; yalnızca sunucu içinde hesaplanır.

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

  // Kart her açılışta sürüklenmemiş konuma dönsün.
  useEffect(() => {
    if (visible) translateY.value = withTiming(0, { duration: 160 });
  }, [visible, translateY]);

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
        // Oturum gerçekten yoksa kullanıcıyı giriş ekranına yönlendir;
        // aksi halde çıkmaz sokak hata mesajı gösterme.
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
  }, [amountMinor, creatorId, onClose, reset, router, videoId]);

  const sheetBackground = colors.surfaceElevated;

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
                {creatorName} · Ödemen Stripe üzerinden güvenli şekilde alınır.
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
                  Göndereceğin tutar
                </Text>
                <Text variant="label">{vvFormatMoney(amountMinor, currency)}</Text>
              </View>
              <Text variant="caption" muted style={styles.breakdownNote}>
                Bahşiş tutarının tamamı tek ödeme olarak tahsil edilir.
              </Text>
            </View>

            <View style={styles.noteBox}>
              <Ionicons name="lock-closed-outline" size={14} color={colors.textMuted} />
              <Text variant="caption" muted style={styles.note}>
                Kart bilgilerin Vora'ya ulaşmaz. Ödeme Stripe Checkout üzerinde tamamlanır ve
                desteklediğin içerik üreticisine iletilir.
              </Text>
            </View>

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
    backgroundColor: VV_ACCENT,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: '#FFFFFF', fontWeight: '700' },
  finePrint: { textAlign: 'center', lineHeight: 15 },
});
