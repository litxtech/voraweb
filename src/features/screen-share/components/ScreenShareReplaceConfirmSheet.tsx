import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import { spacing } from '@/constants/theme';

type Props = {
  visible: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ScreenShareReplaceConfirmSheet({
  visible,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>Mevcut oda kapanacak</Text>
          <Text style={styles.subtitle}>
            Açık bir odan var. Yeni pencere açılırsa eski oda kapanır ve listeden kalkar. Devam
            edilsin mi?
          </Text>
          <Pressable
            disabled={busy}
            onPress={onConfirm}
            style={({ pressed }) => [styles.primary, { opacity: pressed || busy ? 0.8 : 1 }]}
          >
            {busy ? (
              <ActivityIndicator color="#04110E" />
            ) : (
              <Text style={styles.primaryText}>Eski odayı kapat, yenisini aç</Text>
            )}
          </Pressable>
          <Pressable disabled={busy} onPress={onCancel} style={styles.ghost}>
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
  subtitle: { color: '#9AA8BC', fontSize: 13, lineHeight: 19 },
  primary: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: SCREEN_SHARE_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  primaryText: { color: '#04110E', fontWeight: '900', fontSize: 14, textAlign: 'center' },
  ghost: { alignItems: 'center', paddingVertical: 8 },
  cancelText: { color: '#7A8A9C', fontWeight: '600' },
});
