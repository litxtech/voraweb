import { useMemo } from 'react';
import { useTheme } from '@/providers/ThemeProvider';
import { useChatThemeOverride } from '../providers/ChatThemeOverrideProvider';
import { getChatTheme, type ChatTheme } from '../theme/chatTheme';

export function useChatTheme(): ChatTheme {
  const { colors, isDark } = useTheme();
  const override = useChatThemeOverride();
  return useMemo(
    () => override ?? getChatTheme(colors, isDark),
    [override, colors, isDark],
  );
}
