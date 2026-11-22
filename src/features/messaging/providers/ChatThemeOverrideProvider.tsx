import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useTheme } from '@/providers/ThemeProvider';
import { getChatTheme, type ChatTheme } from '../theme/chatTheme';
import { mergeBubbleOverrides } from '../utils/resolveBubbleAppearance';

const ChatThemeOverrideContext = createContext<ChatTheme | null>(null);

type Props = {
  children: ReactNode;
  ownBubbleId?: string;
  otherBubbleId?: string;
};

/** Sohbet ekranında baloncuk rengi override'ı */
export function ChatThemeOverrideProvider({
  children,
  ownBubbleId = 'default',
  otherBubbleId = 'default',
}: Props) {
  const { colors, isDark } = useTheme();
  const value = useMemo(() => {
    const base = getChatTheme(colors, isDark);
    return mergeBubbleOverrides(
      base,
      ownBubbleId,
      otherBubbleId,
      colors.text,
      colors.textMuted,
    );
  }, [colors, isDark, ownBubbleId, otherBubbleId]);

  return (
    <ChatThemeOverrideContext.Provider value={value}>
      {children}
    </ChatThemeOverrideContext.Provider>
  );
}

export function useChatThemeOverride(): ChatTheme | null {
  return useContext(ChatThemeOverrideContext);
}
