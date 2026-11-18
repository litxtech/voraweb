import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { ScreenBackButton } from '@/components/ui/ScreenBackButton';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import { ScreenSharePresence } from '@/features/screen-share/components/ScreenSharePresence';
import { ScreenShareStage } from '@/features/screen-share/components/ScreenShareStage';
import { ScreenShareToolbar } from '@/features/screen-share/components/ScreenShareToolbar';
import { useScreenShareKeepAlive } from '@/features/screen-share/hooks/useScreenShareKeepAlive';
import type { ScreenShareSession } from '@/features/screen-share/types';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';

type Props = {
  session: ScreenShareSession;
  isHost: boolean;
  onCopyCode: () => void;
  onLeave: () => void;
  onEnd: () => void;
};

/** LiveKitRoom context’i içinde yaşar — keep-alive + sahne + toolbar. */
export function ScreenShareRoomBody({ session, isHost, onCopyCode, onLeave, onEnd }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  useScreenShareKeepAlive();

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingHorizontal: spacing.lg }]}>
        <ScreenBackButton onPress={onLeave} />
        <View style={styles.headerCopy}>
          <Text variant="label" style={{ color: SCREEN_SHARE_ACCENT }}>
            SESLİ ODA · {isHost ? 'HOST' : 'KATILIMCI'}
          </Text>
          <Text style={{ fontWeight: '800', color: colors.text, fontSize: 16 }}>{session.title}</Text>
        </View>
        <View style={styles.codePill}>
          <Text style={styles.codeText}>{session.joinCode}</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
        <ScreenSharePresence />
      </View>

      <View style={[styles.stageWrap, { paddingHorizontal: spacing.md }]}>
        <ScreenShareStage />
      </View>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + spacing.md, paddingHorizontal: spacing.md },
        ]}
      >
        <Text style={styles.meta}>
          {session.participantCount} kişi · dizi açıp dönünce ekran yeniden bağlanır · 720p/15fps
        </Text>
        <ScreenShareToolbar
          isHost={isHost}
          onCopyCode={onCopyCode}
          onLeave={onLeave}
          onEnd={onEnd}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  headerCopy: { flex: 1, gap: 2 },
  codePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: `${SCREEN_SHARE_ACCENT}22`,
  },
  codeText: {
    color: SCREEN_SHARE_ACCENT,
    fontWeight: '900',
    letterSpacing: 2,
    fontSize: 14,
  },
  stageWrap: { flex: 1, paddingVertical: spacing.xs },
  footer: { gap: spacing.sm },
  meta: { textAlign: 'center', fontSize: 11, color: '#7A8A9C' },
});
