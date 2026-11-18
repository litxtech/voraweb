import { useCallback, useRef, useState, type Component } from 'react';
import { Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { ScreenCapturePickerView } from '@livekit/react-native-webrtc';
import { useLocalParticipant, useRoomContext } from '@livekit/react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT, SCREEN_SHARE_DRM_HINT } from '@/features/screen-share/constants';
import { startScreenCapture, stopScreenCapture } from '@/features/screen-share/services/screenCapture';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';

type ScreenShareToolbarProps = {
  onCopyCode: () => void;
  onLeave: () => void;
  onEnd?: () => void;
  isHost: boolean;
};

export function ScreenShareToolbar({ onCopyCode, onLeave, onEnd, isHost }: ScreenShareToolbarProps) {
  const { colors } = useTheme();
  const room = useRoomContext();
  const { localParticipant, isMicrophoneEnabled, isScreenShareEnabled } = useLocalParticipant();
  const pickerRef = useRef<Component | null>(null);
  const [busy, setBusy] = useState(false);
  const sharing = Boolean(isScreenShareEnabled);

  const toggleMic = useCallback(async () => {
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (err) {
      Alert.alert('Mikrofon', err instanceof Error ? err.message : 'Açılamadı');
    }
  }, [isMicrophoneEnabled, localParticipant]);

  const toggleShare = useCallback(async () => {
    if (!room) return;
    setBusy(true);
    try {
      if (sharing) {
        await stopScreenCapture(room);
      } else {
        await startScreenCapture(room, pickerRef);
      }
    } catch (err) {
      Alert.alert('Ekran', err instanceof Error ? err.message : 'Paylaşım başlatılamadı');
    } finally {
      setBusy(false);
    }
  }, [room, sharing]);

  const Action = ({
    icon,
    label,
    onPress,
    danger,
    active,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    onPress: () => void;
    danger?: boolean;
    active?: boolean;
  }) => (
    <Pressable
      onPress={onPress}
      disabled={busy}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: danger
            ? `${colors.danger}20`
            : active
              ? `${SCREEN_SHARE_ACCENT}26`
              : 'rgba(255,255,255,0.06)',
          opacity: pressed || busy ? 0.7 : 1,
        },
      ]}
    >
      <View
        style={[
          styles.iconCircle,
          {
            backgroundColor: danger
              ? `${colors.danger}33`
              : active
                ? `${SCREEN_SHARE_ACCENT}40`
                : 'rgba(255,255,255,0.08)',
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={22}
          color={danger ? colors.danger : active ? SCREEN_SHARE_ACCENT : '#F4F7FB'}
        />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      {Platform.OS === 'ios' ? <ScreenCapturePickerView ref={pickerRef} style={styles.picker} /> : null}
      <View style={[styles.dock, { borderColor: 'rgba(255,255,255,0.08)' }]}>
        <Action
          icon={isMicrophoneEnabled ? 'mic' : 'mic-off'}
          label={isMicrophoneEnabled ? 'Ses açık' : 'Ses kapalı'}
          onPress={() => void toggleMic()}
          active={isMicrophoneEnabled}
        />
        <Action
          icon={sharing ? 'stop' : 'desktop-outline'}
          label={sharing ? 'Durdur' : 'Ekran'}
          onPress={() => void toggleShare()}
          active={sharing}
        />
        <Action icon="key-outline" label="Kod" onPress={onCopyCode} />
        <Action icon="exit-outline" label="Ayrıl" onPress={onLeave} danger={!isHost} />
        {isHost ? (
          <Action icon="close" label="Bitir" onPress={() => onEnd?.()} danger />
        ) : null}
      </View>
      {sharing ? (
        <Text secondary style={styles.hint}>
          {SCREEN_SHARE_DRM_HINT}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  dock: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    borderRadius: 28,
    borderWidth: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    backgroundColor: 'rgba(8,12,18,0.92)',
  },
  action: {
    alignItems: 'center',
    gap: 4,
    minWidth: 58,
    paddingVertical: 4,
    borderRadius: 16,
  },
  iconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { color: '#C5D0DC', fontSize: 11, fontWeight: '600' },
  picker: { width: 0, height: 0, opacity: 0 },
  hint: { fontSize: 11, textAlign: 'center' },
});
