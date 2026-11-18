import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import { spacing } from '@/constants/theme';

type Props = {
  visible: boolean;
  busy?: boolean;
  inviteBusy?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onJoin: (code: string) => void;
  onRequestInvite?: (code: string) => void;
};

const FAIL_COOLDOWN_MS = 12_000;
const MAX_FAILS_BEFORE_COOLDOWN = 3;

export function ScreenShareJoinCodeSheet({
  visible,
  busy = false,
  inviteBusy = false,
  errorMessage,
  onClose,
  onJoin,
  onRequestInvite,
}: Props) {
  const [code, setCode] = useState('');
  const [failCount, setFailCount] = useState(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const inputRef = useRef<TextInput>(null);
  const prevError = useRef<string | null | undefined>(null);

  useEffect(() => {
    if (visible) {
      setCode('');
      setFailCount(0);
      setCooldownUntil(0);
      const t = setTimeout(() => inputRef.current?.focus(), 280);
      return () => clearTimeout(t);
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    if (errorMessage && errorMessage !== prevError.current) {
      setFailCount((n) => {
        const next = n + 1;
        if (next >= MAX_FAILS_BEFORE_COOLDOWN) {
          setCooldownUntil(Date.now() + FAIL_COOLDOWN_MS);
          return 0;
        }
        return next;
      });
    }
    prevError.current = errorMessage;
  }, [errorMessage, visible]);

  useEffect(() => {
    if (cooldownUntil <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const cooling = cooldownUntil > now;
  const cooldownSec = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const normalized = code.replace(/\D/g, '').slice(0, 6);
  const canSubmit = normalized.length === 6 && !busy && !inviteBusy && !cooling;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <View style={styles.head}>
            <View style={styles.iconWrap}>
              <Ionicons name="keypad-outline" size={18} color={SCREEN_SHARE_ACCENT} />
            </View>
            <View style={styles.headCopy}>
              <Text style={styles.title}>Kod ile pencereye gir</Text>
              <Text style={styles.subtitle}>
                6 haneli oda kodunu gir. Şifreli odalarda şifre istenir veya davet isteyebilirsin.
              </Text>
            </View>
          </View>

          <TextInput
            ref={inputRef}
            value={normalized}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="number-pad"
            placeholder="000000"
            placeholderTextColor="rgba(122,138,156,0.7)"
            style={styles.codeInput}
            maxLength={6}
            editable={!busy && !inviteBusy && !cooling}
            textContentType="oneTimeCode"
            autoComplete="off"
            importantForAutofill="no"
          />

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          {cooling ? (
            <Text style={styles.cooldown}>Güvenlik için {cooldownSec} sn bekle</Text>
          ) : null}

          <Pressable
            onPress={() => onJoin(normalized)}
            disabled={!canSubmit}
            style={({ pressed }) => [
              styles.primary,
              { opacity: !canSubmit || pressed ? 0.55 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#04110E" />
            ) : (
              <Text style={styles.primaryText}>Hızlı gir</Text>
            )}
          </Pressable>

          {onRequestInvite ? (
            <Pressable
              onPress={() => onRequestInvite(normalized)}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.secondary,
                { opacity: !canSubmit || pressed ? 0.55 : 1 },
              ]}
            >
              {inviteBusy ? (
                <ActivityIndicator color={SCREEN_SHARE_ACCENT} />
              ) : (
                <Text style={styles.secondaryText}>Şifre yok · Beni davet et</Text>
              )}
            </Pressable>
          ) : null}

          <Pressable disabled={busy || inviteBusy} onPress={onClose} style={styles.ghost}>
            <Text style={styles.cancelText}>Vazgeç</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.68)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    borderRadius: 22,
    backgroundColor: '#101820',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: spacing.lg,
    gap: spacing.md,
  },
  head: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,194,168,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,194,168,0.35)',
  },
  headCopy: { flex: 1, gap: 4 },
  title: { color: '#F4F7FB', fontWeight: '800', fontSize: 17 },
  subtitle: { color: '#9AA8BC', fontSize: 12.5, lineHeight: 18 },
  codeInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 10,
    textAlign: 'center',
    color: '#F4F7FB',
    backgroundColor: 'rgba(10,14,20,0.75)',
  },
  error: { color: '#FF8A80', fontSize: 12.5, fontWeight: '600', textAlign: 'center' },
  cooldown: { color: '#FEBC2E', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  primary: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: SCREEN_SHARE_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#04110E', fontWeight: '900', fontSize: 15 },
  secondary: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1.25,
    borderColor: 'rgba(0,194,168,0.5)',
    backgroundColor: 'rgba(0,194,168,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryText: { color: SCREEN_SHARE_ACCENT, fontWeight: '800', fontSize: 13.5 },
  ghost: { alignItems: 'center', paddingVertical: 6 },
  cancelText: { color: '#7A8A9C', fontWeight: '600' },
});
