import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '@/components/ui/Screen';
import { ScreenBackButton } from '@/components/ui/ScreenBackButton';
import { Text } from '@/components/ui/Text';
import { VV_ACCENT, VV_BADGE_LABEL } from '@/features/vora-video/constants';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

export function VvBrandMark({ size = 30 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.28,
        backgroundColor: VV_ACCENT,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="play" size={size * 0.55} color="#FFFFFF" />
    </View>
  );
}

export function VvIconButton({
  icon,
  label,
  onPress,
  badge,
  accent,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  badge?: number;
  accent?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }]}
    >
      <Ionicons name={icon} size={22} color={accent ? VV_ACCENT : colors.text} />
      {badge && badge > 0 ? (
        <View style={[styles.badge, { backgroundColor: VV_ACCENT }]}>
          <Text style={styles.badgeText}>{badge > 99 ? '99+' : String(badge)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

export function VvScaffold({
  title,
  subtitle,
  right,
  onBack,
  children,
  scroll = true,
  contentStyle,
  headerExtra,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  onBack?: () => void;
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
  headerExtra?: ReactNode;
}) {
  const { colors } = useTheme();

  return (
    <Screen padded={false}>
      <View style={[styles.header, { borderColor: colors.border }]}>
        {onBack ? <ScreenBackButton onPress={onBack} /> : <VvBrandMark />}
        <View style={styles.headerText}>
          <View style={styles.headerTitleRow}>
            <Text variant="h3" numberOfLines={1} style={styles.headerTitle}>
              {title}
            </Text>
            {title !== VV_BADGE_LABEL ? (
              <View style={[styles.brandBadge, { backgroundColor: `${VV_ACCENT}1F` }]}>
                <Text style={[styles.brandBadgeText, { color: VV_ACCENT }]}>{VV_BADGE_LABEL}</Text>
              </View>
            ) : null}
          </View>
          {subtitle ? (
            <Text variant="caption" muted numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View style={styles.headerActions}>{right}</View>
      </View>
      {headerExtra}
      {scroll ? (
        <ScrollView
          contentContainerStyle={[styles.content, contentStyle]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.contentFlex, contentStyle]}>{children}</View>
      )}
    </Screen>
  );
}

export function VvChip({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
  icon?: IconName;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active === true }}
      hitSlop={{ top: 6, bottom: 6 }}
      style={({ pressed }) => [
        styles.chip,
        active
          ? { backgroundColor: VV_ACCENT, borderColor: VV_ACCENT }
          : { backgroundColor: 'transparent', borderColor: colors.border },
        pressed && { opacity: 0.65 },
      ]}
    >
      {icon ? (
        <Ionicons name={icon} size={13} color={active ? '#FFFFFF' : colors.textMuted} />
      ) : null}
      <Text style={[styles.chipText, { color: active ? '#FFFFFF' : colors.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function VvSection({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleWrap}>
          <Text variant="h3">{title}</Text>
          {hint ? (
            <Text variant="caption" muted>
              {hint}
            </Text>
          ) : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

export function VvStat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.stat, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}
    >
      <Text variant="caption" muted numberOfLines={1}>
        {label}
      </Text>
      <Text variant="h3" style={{ color: accent ? VV_ACCENT : colors.text }} numberOfLines={1}>
        {value}
      </Text>
      {hint ? (
        <Text variant="caption" muted numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function VvEmptyState({
  title,
  message,
  icon = 'videocam-outline',
  action,
}: {
  title: string;
  message?: string;
  icon?: IconName;
  action?: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.empty, { borderColor: colors.border, backgroundColor: colors.surface }]}
    >
      <Ionicons name={icon} size={34} color={colors.textMuted} />
      <Text variant="label" style={{ textAlign: 'center' }}>
        {title}
      </Text>
      {message ? (
        <Text variant="caption" muted style={{ textAlign: 'center' }}>
          {message}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

export function VvNotice({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success';
  children: ReactNode;
}) {
  const { colors } = useTheme();
  const toneColor =
    tone === 'danger'
      ? colors.danger
      : tone === 'warning'
        ? colors.warning
        : tone === 'success'
          ? colors.success
          : colors.primary;
  return (
    <View
      style={[
        styles.notice,
        { borderColor: `${toneColor}55`, backgroundColor: `${toneColor}14` },
      ]}
    >
      <Ionicons
        name={
          tone === 'danger'
            ? 'alert-circle-outline'
            : tone === 'warning'
              ? 'warning-outline'
              : tone === 'success'
                ? 'checkmark-circle-outline'
                : 'information-circle-outline'
        }
        size={18}
        color={toneColor}
      />
      <View style={styles.noticeBody}>
        <Text variant="caption" style={{ color: toneColor }}>
          {children}
        </Text>
      </View>
    </View>
  );
}

export function VvLoading({ label = 'Yükleniyor…' }: { label?: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={VV_ACCENT} />
      <Text variant="caption" muted>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    minHeight: 56,
  },
  headerText: { flex: 1, minWidth: 0 },
  headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { flexShrink: 1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  brandBadge: { borderRadius: radius.full, paddingHorizontal: 6, paddingVertical: 1 },
  brandBadgeText: { fontSize: 10, fontWeight: '700' },
  content: { padding: spacing.md, gap: spacing.md, paddingBottom: spacing.xxl },
  contentFlex: { flex: 1 },
  iconButton: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 27,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: { fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0.1 },
  section: { gap: spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitleWrap: { flex: 1, gap: 2 },
  stat: {
    flex: 1,
    minWidth: 140,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
    gap: 2,
  },
  empty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm + 2,
  },
  noticeBody: { flex: 1, gap: 2 },
  loading: { padding: spacing.xl, alignItems: 'center', gap: spacing.sm },
});
