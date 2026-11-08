import { StyleSheet, View } from 'react-native';
import { GradientBackground } from '@/components/ui/GradientBackground';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';

type FeatureDisabledScreenProps = {
  title: string;
  description: string;
};

export function FeatureDisabledScreen({ title, description }: FeatureDisabledScreenProps) {
  return (
    <GradientBackground>
      <View style={styles.wrap}>
        <Text variant="h2">{title}</Text>
        <Text variant="caption" secondary>{description}</Text>
      </View>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
});
