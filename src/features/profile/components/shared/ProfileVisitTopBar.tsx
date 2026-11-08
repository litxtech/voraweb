import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackButton } from '@/components/ui/ScreenBackButton';
import { router, type Href } from 'expo-router';
import { useFeatureVisible } from '@/features/feature-flags/hooks/useFeatureVisible';
import { PROFILE_FEATURE } from '@/features/profile/featureFlags';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';

type ProfileVisitTopBarProps = {
  onMenuPress: () => void;
};

export function ProfileVisitTopBar({ onMenuPress }: ProfileVisitTopBarProps) {
  const { colors } = useTheme();
  const showVisitorMenu = useFeatureVisible(PROFILE_FEATURE.visitorMenu);
  const handleBack = () => {
    // Profil ziyareti zincirinde aynı route üst üste birikebilir; kök sekmeye güvenli dön.
    router.dismissTo('/(tabs)' as Href);
  };

  return (
    <View style={styles.row}>
      <View style={styles.iconBtn}>
        <ScreenBackButton onPress={handleBack} />
      </View>
      {showVisitorMenu ? (
        <Pressable
          onPress={onMenuPress}
          style={[styles.iconBtn, { backgroundColor: `${colors.surfaceElevated}CC` }]}
          hitSlop={8}
          accessibilityLabel="Profil seçenekleri"
        >
          <Ionicons name="ellipsis-vertical" size={20} color={colors.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  iconBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
});
