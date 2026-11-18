import { ScrollView, StyleSheet, View } from 'react-native';
import { useParticipants } from '@livekit/react-native';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';

/** Canlı odadaki katılımcı chip listesi (konuşan vurgulu). */
export function ScreenSharePresence() {
  const { colors } = useTheme();
  const participants = useParticipants();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
    >
      {participants.map((p) => {
        const speaking = p.isSpeaking;
        const name = p.name || p.identity.slice(0, 8);
        return (
          <View
            key={p.sid}
            style={[
              styles.chip,
              {
                backgroundColor: speaking ? `${SCREEN_SHARE_ACCENT}28` : colors.surfaceElevated,
                borderColor: speaking ? SCREEN_SHARE_ACCENT : colors.border,
              },
            ]}
          >
            <View
              style={[
                styles.dot,
                { backgroundColor: speaking ? SCREEN_SHARE_ACCENT : colors.textMuted },
              ]}
            />
            <Text
              numberOfLines={1}
              style={{ color: colors.text, fontSize: 12, fontWeight: '600', maxWidth: 88 }}
            >
              {name}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, paddingVertical: 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
