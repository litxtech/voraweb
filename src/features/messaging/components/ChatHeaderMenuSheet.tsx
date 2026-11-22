import type { ReactNode } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { resolveModalAnimationType } from '@/lib/device/androidPerfProfile';
import { useTheme } from '@/providers/ThemeProvider';

export type ChatHeaderMenuItem = {
  key: string;
  label: string;
  description?: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint?: string;
  danger?: boolean;
  onPress?: () => void;
};

type Props = {
  visible: boolean;
  title: string;
  items: ChatHeaderMenuItem[];
  footer?: ReactNode;
  onClose: () => void;
};

/**
 * Sohbet header'ının taşma menüsü.
 * Header'da yer kalmayan ikincil aksiyonlar burada tek listede toplanır.
 */
export function ChatHeaderMenuSheet({ visible, title, items, footer, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  if (items.length === 0 && !footer) return null;

  const run = (item: ChatHeaderMenuItem) => {
    if (!item.onPress) return;
    onClose();
    // iOS: kapanan modalın animasyonu bitmeden yeni modal açmak sunumu düşürebiliyor.
    if (Platform.OS === 'ios') {
      setTimeout(item.onPress, 220);
    } else {
      item.onPress();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={resolveModalAnimationType('fade')}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.border,
              paddingBottom: spacing.md + insets.bottom,
            },
          ]}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={[styles.grabber, { backgroundColor: colors.border }]} />
          <Text variant="caption" secondary numberOfLines={1} style={styles.title}>
            {title}
          </Text>

          {items.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => run(item)}
              disabled={!item.onPress}
              accessibilityRole="button"
              accessibilityLabel={item.label}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: pressed ? colors.surfaceElevated : 'transparent' },
                !item.onPress && styles.rowDisabled,
              ]}
            >
              <View
                style={[
                  styles.iconWrap,
                  { backgroundColor: colors.surfaceElevated },
                ]}
              >
                <Ionicons
                  name={item.icon}
                  size={18}
                  color={item.danger ? colors.danger : (item.tint ?? colors.primary)}
                />
              </View>
              <View style={styles.rowText}>
                <Text
                  variant="label"
                  numberOfLines={1}
                  style={item.danger ? { color: colors.danger } : undefined}
                >
                  {item.label}
                </Text>
                {item.description ? (
                  <Text variant="caption" muted numberOfLines={1}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ))}

          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: radius.full,
    marginBottom: spacing.sm,
  },
  title: {
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.xs,
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  rowDisabled: {
    opacity: 0.4,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  footer: {
    marginTop: spacing.md,
  },
});
