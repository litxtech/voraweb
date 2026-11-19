import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OptimizedImage } from '@/components/media/OptimizedImage';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import type { LoungeSeatMember } from '@/features/screen-share/hooks/useScreenShareLoungeMembers';
import { useCloseModalOnRouteChange } from '@/hooks/useCloseModalOnRouteChange';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';

type Props = {
  visible: boolean;
  listeners: LoungeSeatMember[];
  iAmSeated: boolean;
  onClose: () => void;
  onPressMember: (member: LoungeSeatMember) => void;
  onBecomeListener?: () => void;
};

/** Odadaki dinleyiciler — üst butondan açılır. */
export function ScreenShareListenersSheet({
  visible,
  listeners,
  iAmSeated,
  onClose,
  onPressMember,
  onBecomeListener,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  useCloseModalOnRouteChange(visible, onClose);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Kapat">
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, spacing.md),
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              Dinleyiciler ({listeners.length})
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Kapat">
              <Ionicons name="close" size={22} color={colors.textSecondary} />
            </Pressable>
          </View>

          {iAmSeated && onBecomeListener ? (
            <Pressable
              onPress={() => {
                onBecomeListener();
                onClose();
              }}
              style={({ pressed }) => [styles.standBtn, { opacity: pressed ? 0.85 : 1 }]}
            >
              <Ionicons name="ear-outline" size={16} color={SCREEN_SHARE_ACCENT} />
              <Text style={styles.standBtnText}>Dinleyici ol · koltuktan in</Text>
            </Pressable>
          ) : null}

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {listeners.length === 0 ? (
              <Text style={[styles.empty, { color: colors.textSecondary }]}>
                Henüz dinleyici yok
              </Text>
            ) : (
              listeners.map((m) => {
                const initial = (m.username || '?').slice(0, 1).toUpperCase();
                return (
                  <Pressable
                    key={m.userId}
                    onPress={() => {
                      onPressMember(m);
                      onClose();
                    }}
                    style={({ pressed }) => [styles.row, { opacity: pressed ? 0.85 : 1 }]}
                  >
                    {m.avatarUrl ? (
                      <OptimizedImage
                        uri={m.avatarUrl}
                        style={styles.avatar}
                        tier="avatar"
                        recyclingKey={`ss-listen-sheet-${m.userId}`}
                      />
                    ) : (
                      <View style={[styles.avatar, styles.avatarFallback]}>
                        <Text style={styles.initial}>{initial}</Text>
                      </View>
                    )}
                    <View style={styles.meta}>
                      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                        {m.fullName ?? m.username}
                      </Text>
                      <Text style={{ color: colors.textSecondary }} numberOfLines={1}>
                        @{m.username}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
                  </Pressable>
                );
              })
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '70%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 999,
    marginBottom: spacing.xs,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { fontSize: 16, fontWeight: '800' },
  standBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: `${SCREEN_SHARE_ACCENT}22`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${SCREEN_SHARE_ACCENT}55`,
  },
  standBtnText: {
    color: SCREEN_SHARE_ACCENT,
    fontWeight: '800',
    fontSize: 13,
  },
  list: { flexGrow: 0 },
  listContent: { gap: 4, paddingBottom: spacing.sm },
  empty: {
    textAlign: 'center',
    paddingVertical: spacing.xl,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    backgroundColor: `${SCREEN_SHARE_ACCENT}33`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: { color: SCREEN_SHARE_ACCENT, fontWeight: '800', fontSize: 16 },
  meta: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: '700' },
});
