import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import { spacing } from '@/constants/theme';

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  confirmLabel?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
  busy?: boolean;
  inviteBusy?: boolean;
  /** Şifre yerine host’tan davet istemek için */
  onRequestInvite?: () => void;
  inviteLabel?: string;
  onClose: () => void;
  onSubmit: (password: string | null) => void;
};

export function ScreenSharePasswordSheet({
  visible,
  title,
  subtitle,
  confirmLabel = 'Devam',
  allowEmpty = false,
  emptyLabel = 'Şifreyi kaldır',
  busy = false,
  inviteBusy = false,
  onRequestInvite,
  inviteLabel = 'Beni davet et',
  onClose,
  onSubmit,
}: Props) {
  const [value, setValue] = useState('');

  useEffect(() => {
    if (visible) setValue('');
  }, [visible]);

  const locked = busy || inviteBusy;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <TextInput
            value={value}
            onChangeText={setValue}
            placeholder="Şifre"
            placeholderTextColor="#5A6A7C"
            secureTextEntry
            autoFocus
            editable={!locked}
            style={styles.input}
          />
          <Pressable
            disabled={
              locked ||
              (value.trim().length > 0 && value.trim().length < 4) ||
              (!allowEmpty && value.trim().length < 4)
            }
            onPress={() => onSubmit(value.trim() || null)}
            style={({ pressed }) => [
              styles.primary,
              { opacity: pressed || locked ? 0.8 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#04110E" />
            ) : (
              <Text style={styles.primaryText}>{confirmLabel}</Text>
            )}
          </Pressable>
          {onRequestInvite ? (
            <Pressable
              disabled={locked}
              onPress={onRequestInvite}
              style={({ pressed }) => [styles.invite, { opacity: pressed || locked ? 0.75 : 1 }]}
            >
              {inviteBusy ? (
                <ActivityIndicator color={SCREEN_SHARE_ACCENT} />
              ) : (
                <Text style={styles.inviteText}>{inviteLabel}</Text>
              )}
            </Pressable>
          ) : null}
          {allowEmpty ? (
            <Pressable disabled={locked} onPress={() => onSubmit(null)} style={styles.ghost}>
              <Text style={styles.ghostText}>{emptyLabel}</Text>
            </Pressable>
          ) : null}
          <Pressable disabled={locked} onPress={onClose} style={styles.ghost}>
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
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    borderRadius: 20,
    backgroundColor: '#121820',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2A3444',
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: { color: '#F4F7FB', fontWeight: '800', fontSize: 18 },
  subtitle: { color: '#9AA8BC', fontSize: 13, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: '#2A3444',
    borderRadius: 14,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: '#F4F7FB',
    backgroundColor: '#0A0E14',
    fontSize: 16,
  },
  primary: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: SCREEN_SHARE_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: '#04110E', fontWeight: '900', fontSize: 15 },
  invite: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1.25,
    borderColor: 'rgba(0,194,168,0.5)',
    backgroundColor: 'rgba(0,194,168,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteText: { color: SCREEN_SHARE_ACCENT, fontWeight: '800' },
  ghost: { alignItems: 'center', paddingVertical: 8 },
  ghostText: { color: SCREEN_SHARE_ACCENT, fontWeight: '700' },
  cancelText: { color: '#7A8A9C', fontWeight: '600' },
});
