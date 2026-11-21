import { Stack } from 'expo-router';
import { getDefaultStackScreenOptions } from '@/constants/navigation';
import { useTheme } from '@/providers/ThemeProvider';

export default function VoraVideoLayout() {
  const { colors } = useTheme();
  return (
    <Stack
      screenOptions={getDefaultStackScreenOptions({
        contentStyle: { backgroundColor: colors.background },
      })}
    />
  );
}
