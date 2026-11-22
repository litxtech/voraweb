import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { TIP_ACCENT, TIP_GRADIENT } from '@/features/tips/constants';

export type TipButtonVariant = 'icon' | 'rail' | 'pill' | 'chip' | 'block';

type TipButtonProps = {
  onPress: () => void;
  label?: string;
  variant?: TipButtonVariant;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
};

/**
 * Bahşiş butonunun ortak görünümü. Hangi bölümde gösterileceğine `TipTrigger`
 * karar verir; bu bileşen yalnızca görsel katmandır.
 */
export function TipButton({
  onPress,
  label = 'Bahşiş',
  variant = 'pill',
  style,
  disabled = false,
}: TipButtonProps) {
  const handlePress = (event: { stopPropagation?: () => void }) => {
    // Kart/Reels içindeki buton: dokunuşun üst öğeye (içeriği açma) geçmesini engelle.
    event.stopPropagation?.();
    onPress();
  };

  if (variant === 'chip') {
    return (
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.chip,
          {
            borderColor: `${TIP_ACCENT}55`,
            backgroundColor: `${TIP_ACCENT}14`,
            opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
          },
          style,
        ]}
      >
        <Ionicons name="gift" size={14} color={TIP_ACCENT} />
        <Text variant="caption" style={styles.chipText}>
          {label}
        </Text>
      </Pressable>
    );
  }

  if (variant === 'icon') {
    return (
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.iconPressable,
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
          style,
        ]}
      >
        <LinearGradient colors={TIP_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.iconCircle}>
          <Ionicons name="gift" size={18} color="#FFFFFF" />
        </LinearGradient>
      </Pressable>
    );
  }

  if (variant === 'rail') {
    return (
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.railPressable,
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
          style,
        ]}
      >
        <LinearGradient colors={TIP_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.railCircle}>
          <Ionicons name="gift" size={24} color="#FFFFFF" />
        </LinearGradient>
        <Text variant="caption" style={styles.railLabel}>
          {label}
        </Text>
      </Pressable>
    );
  }

  if (variant === 'block') {
    return (
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [
          styles.blockPressable,
          disabled && styles.disabled,
          pressed && !disabled && styles.pressed,
          style,
        ]}
      >
        <LinearGradient colors={TIP_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.block}>
          <View style={styles.blockIcon}>
            <Ionicons name="gift" size={17} color="#FFFFFF" />
          </View>
          <View style={styles.blockTextWrap}>
            <Text style={styles.blockText} numberOfLines={1}>
              {label}
            </Text>
            <Text style={styles.blockHint} numberOfLines={1}>
              Gönüllü destek gönder
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color="rgba(255,255,255,0.9)" />
        </LinearGradient>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.pillPressable,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      <LinearGradient colors={TIP_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pill}>
        <Ionicons name="gift" size={12} color="#FFFFFF" />
        <Text style={styles.pillText} numberOfLines={1}>
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.5 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipText: { color: TIP_ACCENT, fontWeight: '700' },
  iconPressable: {
    width: 34,
    height: 34,
    borderRadius: 17,
    shadowColor: TIP_ACCENT,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 4,
  },
  iconCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  railPressable: { alignItems: 'center', gap: 3 },
  railCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
  },
  railLabel: { color: '#FFFFFF', fontWeight: '700', fontSize: 11 },
  pillPressable: {
    borderRadius: radius.full,
    shadowColor: TIP_ACCENT,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 3,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 26,
    paddingHorizontal: 9,
    borderRadius: radius.full,
  },
  pillText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', letterSpacing: 0.2 },
  blockPressable: { width: '100%', borderRadius: radius.lg },
  block: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.lg,
  },
  blockIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  blockTextWrap: { flex: 1, gap: 1 },
  blockText: { color: '#FFFFFF', fontSize: 14.5, fontWeight: '800', letterSpacing: 0.2 },
  blockHint: { color: 'rgba(255,255,255,0.9)', fontSize: 11.5, fontWeight: '500' },
});
