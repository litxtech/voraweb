import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import type { ScreenShareSession } from '@/features/screen-share/types';
import { spacing } from '@/constants/theme';

type Props = {
  visible: boolean;
  room: ScreenShareSession | null;
  onClose: () => void;
  onReport: () => void;
  onBlockHost: () => void;
};

export function ScreenShareRoomSafetySheet({
  visible,
  room,
  onClose,
  onReport,
  onBlockHost,
}: Props) {
  if (!room) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.title}>{room.title}</Text>
          <Text style={styles.subtitle}>
            {room.hostUsername ? `@${room.hostUsername}` : 'Oda'} · güvenlik
          </Text>

          <Pressable onPress={onReport} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
            <Ionicons name="flag-outline" size={18} color="#FF8A80" />
            <Text style={styles.rowDanger}>Odayı bildir</Text>
          </Pressable>

          {!room.isHost ? (
            <Pressable
              onPress={onBlockHost}
              style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            >
              <Ionicons name="hand-left-outline" size={18} color="#FF8A80" />
              <Text style={styles.rowDanger}>Host’u engelle</Text>
            </Pressable>
          ) : null}

          <Pressable onPress={onClose} style={styles.cancel}>
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
    justifyContent: 'flex-end',
    padding: spacing.lg,
  },
  card: {
    borderRadius: 20,
    backgroundColor: '#121820',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#2A3444',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { color: '#F4F7FB', fontWeight: '800', fontSize: 17 },
  subtitle: { color: '#9AA8BC', fontSize: 12.5, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#1F2A38',
  },
  rowDanger: { color: '#FF8A80', fontWeight: '700', fontSize: 15 },
  cancel: { alignItems: 'center', paddingVertical: 12 },
  cancelText: { color: SCREEN_SHARE_ACCENT, fontWeight: '700' },
});
