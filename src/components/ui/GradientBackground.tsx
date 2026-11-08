import { StyleSheet, View, type ViewProps } from 'react-native';
import { useTheme } from '@/providers/ThemeProvider';

type GradientBackgroundProps = ViewProps & {
  children: React.ReactNode;
  variant?: 'default' | 'karadeniz';
};

export function GradientBackground({ children, style, ...props }: GradientBackgroundProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.background }, style]} {...props}>
      <View style={styles.content}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flex: 1,
  },
});
