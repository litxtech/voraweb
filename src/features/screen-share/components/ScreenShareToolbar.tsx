import { useCallback, useRef, useState, type Component } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { ScreenCapturePickerView } from '@livekit/react-native-webrtc';
import { useConnectionState, useLocalParticipant, useRoomContext } from '@livekit/react-native';
import { ConnectionState } from 'livekit-client';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import { startScreenCapture, stopScreenCapture } from '@/features/screen-share/services/screenCapture';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';

type ScreenShareToolbarProps = {
  onCopyCode: () => void;
  onLeave: () => void;
  onDelete?: () => void;
  onMembers: () => void;
  onPassword?: () => void;
  onYoutube?: () => void;
  onFullscreen?: () => void;
  isHost: boolean;
  memberCount: number;
  compact?: boolean;
  /** Paylaş butonunu dock'ta göster (dokunma alanı net) */
  showShare?: boolean;
};

type DockBtnProps = {
  icon: keyof typeof Ionicons.glyphMap;
  label?: string;
  onPress: () => void;
  danger?: boolean;
  active?: boolean;
  primary?: boolean;
};

function DockBtn({ icon, label, onPress, danger, active, primary }: DockBtnProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.btn,
        primary && styles.btnPrimary,
        active && styles.btnActive,
        danger && styles.btnDanger,
        { opacity: pressed ? 0.75 : 1 },
      ]}
    >
      <Ionicons
        name={icon}
        size={primary ? 18 : 16}
        color={
          danger
            ? colors.danger
            : active || primary
              ? SCREEN_SHARE_ACCENT
              : '#E8EEF5'
        }
      />
      {label ? (
        <Text
          style={[
            styles.btnLabel,
            (active || primary) && { color: SCREEN_SHARE_ACCENT },
            danger && { color: colors.danger },
          ]}
          numberOfLines={1}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Kompakt premium dock — ana kontroller + “Daha” menüsü. */
export function ScreenShareToolbar({
  onCopyCode,
  onLeave,
  onDelete,
  onMembers,
  onPassword,
  onYoutube,
  onFullscreen,
  isHost,
  memberCount,
  showShare = false,
}: ScreenShareToolbarProps) {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const { localParticipant, isMicrophoneEnabled, isScreenShareEnabled } = useLocalParticipant();
  const pickerRef = useRef<Component | null>(null);
  const [busy, setBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const sharing = Boolean(isScreenShareEnabled);
  const roomReady = connectionState === ConnectionState.Connected;

  const toggleMic = useCallback(async () => {
    if (!roomReady) {
      Alert.alert('Mikrofon', 'Bağlantı hazır değil — biraz bekle');
      return;
    }
    try {
      await localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled);
    } catch (err) {
      Alert.alert('Mikrofon', err instanceof Error ? err.message : 'Açılamadı');
    }
  }, [isMicrophoneEnabled, localParticipant, roomReady]);

  const toggleShare = useCallback(async () => {
    if (!isHost) {
      Alert.alert('Ekran', 'Yalnızca oda sahibi ekran paylaşabilir');
      return;
    }
    if (!room) return;
    if (!roomReady && !sharing) {
      Alert.alert('Ekran', 'Oda bağlantısı hazır değil — yeşil bağlanınca tekrar dene');
      return;
    }
    setBusy(true);
    try {
      if (sharing) {
        await stopScreenCapture(room);
      } else {
        await startScreenCapture(room, pickerRef);
        Alert.alert(
          'Beraber izleme',
          '1) Şimdi tarayıcı veya film uygulamasını aç\n' +
            '2) Vora arka planda ekranı paylaşmaya devam eder\n' +
            '3) Sen filmde izlersin · odadakiler Vora’da aynı ekranı görür\n' +
            '4) Konuşmak için Vora’ya dön — paylaşım açık kalır',
          [{ text: 'Filme geç' }],
        );
      }
    } catch (err) {
      Alert.alert('Ekran', err instanceof Error ? err.message : 'Paylaşım başlatılamadı');
    } finally {
      setBusy(false);
    }
  }, [isHost, room, roomReady, sharing]);

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {Platform.OS === 'ios' && isHost ? (
        <ScreenCapturePickerView ref={pickerRef} style={styles.picker} />
      ) : null}

      <View style={styles.dock}>
        <DockBtn
          icon={isMicrophoneEnabled ? 'mic' : 'mic-off'}
          label={isMicrophoneEnabled ? 'Ses' : 'Kapalı'}
          onPress={() => void toggleMic()}
          active={isMicrophoneEnabled}
          primary
        />
        {showShare ? (
          <DockBtn icon="share-social" label="Paylaş" onPress={onCopyCode} />
        ) : null}
        {isHost ? (
          <DockBtn
            icon={sharing ? 'stop-circle' : 'desktop-outline'}
            label={sharing ? 'Durdur' : 'Ekran'}
            onPress={() => {
              if (busy) return;
              void toggleShare();
            }}
            active={sharing}
          />
        ) : null}
        <DockBtn
          icon="people-outline"
          label={`${memberCount}`}
          onPress={onMembers}
        />
        {onFullscreen ? (
          <DockBtn icon="expand-outline" label="Tam" onPress={onFullscreen} />
        ) : null}
        <DockBtn icon="ellipsis-horizontal" label="Daha" onPress={() => setMoreOpen(true)} />
      </View>

      <Modal visible={moreOpen} transparent animationType="fade" onRequestClose={() => setMoreOpen(false)}>
        <Pressable style={styles.moreBackdrop} onPress={() => setMoreOpen(false)}>
          <Pressable style={styles.moreSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.moreHandle} />
            <Text style={styles.moreTitle}>Oda</Text>
            {isHost ? (
              <MoreRow
                icon="logo-youtube"
                label="YouTube"
                onPress={() => {
                  setMoreOpen(false);
                  onYoutube?.();
                }}
              />
            ) : null}
            <MoreRow icon="key-outline" label="Oda kodu" onPress={() => { setMoreOpen(false); onCopyCode(); }} />
            {isHost ? (
              <MoreRow icon="lock-closed-outline" label="Şifre" onPress={() => { setMoreOpen(false); onPassword?.(); }} />
            ) : null}
            <MoreRow icon="exit-outline" label="Ayrıl" onPress={() => { setMoreOpen(false); onLeave(); }} />
            {isHost ? (
              <MoreRow
                icon="trash-outline"
                label="Odayı sil"
                danger
                onPress={() => {
                  setMoreOpen(false);
                  onDelete?.();
                }}
              />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function MoreRow({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.moreRow, { opacity: pressed ? 0.75 : 1 }]}
    >
      <Ionicons name={icon} size={18} color={danger ? colors.danger : '#E8EEF5'} />
      <Text style={[styles.moreLabel, danger && { color: colors.danger }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  dock: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: 'rgba(8,12,18,0.88)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  btn: {
    minWidth: 52,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 14,
  },
  btnPrimary: {
    backgroundColor: `${SCREEN_SHARE_ACCENT}22`,
  },
  btnActive: {
    backgroundColor: `${SCREEN_SHARE_ACCENT}28`,
  },
  btnDanger: {
    backgroundColor: 'rgba(255,80,80,0.12)',
  },
  btnLabel: {
    color: '#A8B4C4',
    fontSize: 10,
    fontWeight: '700',
  },
  picker: { width: 0, height: 0, opacity: 0 },
  moreBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  moreSheet: {
    backgroundColor: '#0E141C',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  moreHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: spacing.sm,
  },
  moreTitle: {
    color: '#F4F7FB',
    fontWeight: '800',
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  moreLabel: { color: '#E8EEF5', fontSize: 15, fontWeight: '600' },
});
