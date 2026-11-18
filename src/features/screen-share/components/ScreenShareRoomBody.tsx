import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { isTrackReference, useLocalParticipant, useTracks } from '@livekit/react-native';
import { Track } from 'livekit-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { ScreenBackButton } from '@/components/ui/ScreenBackButton';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import { ScreenShareChatPanel, type ChatPanelMode } from '@/features/screen-share/components/ScreenShareChatPanel';
import { ScreenShareLoungeBackground } from '@/features/screen-share/components/ScreenShareLoungeBackground';
import { ScreenShareLoungeStage } from '@/features/screen-share/components/ScreenShareLoungeStage';
import { ScreenShareMembersSheet } from '@/features/screen-share/components/ScreenShareMembersSheet';
import { ScreenSharePasswordSheet } from '@/features/screen-share/components/ScreenSharePasswordSheet';
import { ScreenShareProfileSheet } from '@/features/screen-share/components/ScreenShareProfileSheet';
import { ScreenShareStage } from '@/features/screen-share/components/ScreenShareStage';
import { ScreenShareToolbar } from '@/features/screen-share/components/ScreenShareToolbar';
import { ScreenShareWelcomeOverlay } from '@/features/screen-share/components/ScreenShareWelcomeOverlay';
import { ScreenShareYoutubeSheet } from '@/features/screen-share/components/ScreenShareYoutubeSheet';
import { useScreenShareChat } from '@/features/screen-share/hooks/useScreenShareChat';
import { useScreenShareKeepAlive } from '@/features/screen-share/hooks/useScreenShareKeepAlive';
import { useScreenShareSeatActions } from '@/features/screen-share/hooks/useScreenShareSeatActions';
import { useScreenShareYoutubeSync } from '@/features/screen-share/hooks/useScreenShareYoutubeSync';
import { setScreenSharePassword } from '@/features/screen-share/services/screenShareSessionService';
import type { ScreenShareParticipant, ScreenShareSession } from '@/features/screen-share/types';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';

type Props = {
  session: ScreenShareSession;
  isHost: boolean;
  onCopyCode: () => void;
  onLeave: () => void;
  onDelete: () => void;
  onSessionPatch: (next: ScreenShareSession) => void;
};

/** LiveKitRoom context’i içinde — lounge varsayılan; film/YouTube açılınca medya sahnesi. */
export function ScreenShareRoomBody({
  session,
  isHost,
  onCopyCode,
  onLeave,
  onDelete,
  onSessionPatch,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  useScreenShareKeepAlive();
  const { active: youtubeActive, share: shareYoutube, stop: stopYoutube } =
    useScreenShareYoutubeSync(isHost, session.hostUserId);

  /** Host çıkınca / oda silinince yayını kes — izleyicilerde video durur. */
  const leaveAfterStopMedia = useCallback(() => {
    if (!isHost) {
      onLeave();
      return;
    }
    void stopYoutube()
      .catch(() => undefined)
      .finally(() => onLeave());
  }, [isHost, onLeave, stopYoutube]);

  const deleteAfterStopMedia = useCallback(() => {
    if (!isHost) {
      onDelete();
      return;
    }
    void stopYoutube()
      .catch(() => undefined)
      .finally(() => onDelete());
  }, [isHost, onDelete, stopYoutube]);
  const { messages, send: sendChat } = useScreenShareChat();
  const { leaveSeat, takeSeat, hostMute, hostStand, hostKick, iAmSeated } =
    useScreenShareSeatActions(session.id);
  const { isScreenShareEnabled } = useLocalParticipant();
  const screenTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });

  const [membersOpen, setMembersOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [youtubeOpen, setYoutubeOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [chatMode, setChatMode] = useState<ChatPanelMode>('expanded');
  const [profileMember, setProfileMember] = useState<ScreenShareParticipant | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setInputFocused(false);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const hasScreenMedia = useMemo(() => {
    if (isScreenShareEnabled) return true;
    return screenTracks.some(isTrackReference);
  }, [isScreenShareEnabled, screenTracks]);

  const mediaMode = Boolean(youtubeActive) || hasScreenMedia;
  const keyboardOpen = keyboardHeight > 0 && inputFocused;

  const confirmDelete = () => {
    Alert.alert('Odayı sil', 'Oda kapanır. Bu işlem geri alınamaz.', [
      { text: 'Vazgeç', style: 'cancel' },
      { text: 'Sil', style: 'destructive', onPress: deleteAfterStopMedia },
    ]);
  };

  const onPasswordSubmit = async (password: string | null) => {
    setPasswordBusy(true);
    try {
      const next = await setScreenSharePassword(session.id, password);
      onSessionPatch({ ...session, ...next, hasPassword: Boolean(password) });
      setPasswordOpen(false);
      Alert.alert('Şifre', password ? 'Şifre güncellendi' : 'Şifre kaldırıldı');
    } catch (err) {
      Alert.alert('Şifre', err instanceof Error ? err.message : 'Güncellenemedi');
    } finally {
      setPasswordBusy(false);
    }
  };

  const onHostKickConfirm = (userId: string) => {
    Alert.alert('Odadan at', 'Bu kullanıcı odadan çıkarılacak.', [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'At',
        style: 'destructive',
        onPress: () => {
          void hostKick(userId).catch((err) => {
            Alert.alert('Atma', err instanceof Error ? err.message : 'Başarısız');
          });
        },
      },
    ]);
  };

  return (
    <View style={styles.root}>
      <ScreenShareLoungeBackground />

      {!fullscreen && !keyboardOpen ? (
        <View style={[styles.header, { paddingTop: 2, paddingHorizontal: spacing.md }]}>
          <ScreenBackButton onPress={leaveAfterStopMedia} />
          <View style={styles.headerCopy}>
            <View style={styles.liveRow}>
              <View style={styles.liveDot} />
              <Text variant="label" style={{ color: SCREEN_SHARE_ACCENT, fontSize: 10 }}>
                CANLI · {isHost ? 'HOST' : 'ÜYE'}
                {session.hasPassword ? ' · KİLİT' : ''}
              </Text>
            </View>
            <Text style={{ fontWeight: '800', color: colors.text, fontSize: 15 }} numberOfLines={1}>
              {session.title}
            </Text>
            <Text style={styles.headerMeta}>
              {session.participantCount} kişi · kod {session.joinCode}
            </Text>
          </View>
          <Pressable
            onPress={onCopyCode}
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Odayı paylaş"
            style={({ pressed }) => [styles.shareBtn, { opacity: pressed ? 0.75 : 1 }]}
          >
            {session.hasPassword ? (
              <Ionicons name="lock-closed" size={14} color={SCREEN_SHARE_ACCENT} />
            ) : (
              <Ionicons name="share-social" size={16} color={SCREEN_SHARE_ACCENT} />
            )}
            <Text style={styles.shareBtnText}>Paylaş</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={[styles.stageWrap, fullscreen && styles.stageFullscreen]}>
        {mediaMode ? (
          <>
            <View style={styles.mediaStage}>
              <ScreenShareStage
                sessionId={session.id}
                onAvatarPress={setProfileMember}
                fullscreen={fullscreen}
                onRequestFullscreen={() => setFullscreen(true)}
                onExitFullscreen={() => setFullscreen(false)}
                youtube={youtubeActive}
                isHost={isHost}
                onStopYoutube={() => void stopYoutube()}
                onOpenYoutubeSearch={() => setYoutubeOpen(true)}
              />
            </View>
            {!fullscreen && !keyboardOpen ? (
              <ScreenShareLoungeStage
                sessionId={session.id}
                onAvatarPress={setProfileMember}
                compact
              />
            ) : null}
          </>
        ) : !keyboardOpen ? (
          <ScreenShareLoungeStage
            sessionId={session.id}
            onAvatarPress={setProfileMember}
            iAmSeated={iAmSeated}
            onLeaveSeat={() => void leaveSeat()}
            onTakeSeat={() => void takeSeat()}
          />
        ) : (
          <View style={{ flex: 1 }} />
        )}
      </View>

      {!fullscreen ? (
        <View
          style={[
            styles.footer,
            {
              paddingBottom: keyboardOpen
                ? Math.max(keyboardHeight - (Platform.OS === 'android' ? 0 : 0), spacing.sm)
                : Math.max(insets.bottom, spacing.sm),
              paddingHorizontal: spacing.sm,
            },
          ]}
        >
          <ScreenShareChatPanel
            mode={chatMode}
            onModeChange={setChatMode}
            messages={messages}
            onSend={(text) => void sendChat(text)}
            bottomInset={Math.max(insets.bottom, spacing.sm)}
            onInputFocusChange={setInputFocused}
          />
          {!keyboardOpen ? (
            <ScreenShareToolbar
              isHost={isHost}
              memberCount={session.participantCount}
              onCopyCode={onCopyCode}
              onLeave={leaveAfterStopMedia}
              onDelete={confirmDelete}
              onMembers={() => setMembersOpen(true)}
              onPassword={isHost ? () => setPasswordOpen(true) : undefined}
              onYoutube={isHost ? () => setYoutubeOpen(true) : undefined}
              onFullscreen={mediaMode ? () => setFullscreen(true) : undefined}
              showShare
            />
          ) : null}
        </View>
      ) : null}

      {isHost ? (
        <ScreenShareYoutubeSheet
          visible={youtubeOpen}
          nowPlaying={youtubeActive}
          onClose={() => setYoutubeOpen(false)}
          onShare={(hit) => {
            void shareYoutube(hit);
            setYoutubeOpen(false);
          }}
        />
      ) : null}

      <ScreenShareMembersSheet
        visible={membersOpen}
        sessionId={session.id}
        isHost={isHost}
        onClose={() => setMembersOpen(false)}
      />

      <ScreenSharePasswordSheet
        visible={passwordOpen}
        title="Oda şifresi"
        subtitle="Yeni şifre gir (min 4). Boş bırakıp “Şifreyi kaldır” ile kilidi aç."
        confirmLabel="Kaydet"
        allowEmpty
        emptyLabel="Şifreyi kaldır"
        busy={passwordBusy}
        onClose={() => setPasswordOpen(false)}
        onSubmit={(password) => void onPasswordSubmit(password)}
      />

      <ScreenShareProfileSheet
        participant={profileMember}
        onClose={() => setProfileMember(null)}
        isHostViewer={isHost}
        onHostMute={(id) => void hostMute(id)}
        onHostStand={(id) => void hostStand(id)}
        onHostKick={onHostKickConfirm}
      />

      {!keyboardOpen ? <ScreenShareWelcomeOverlay /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0E1420' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: 6,
    zIndex: 10,
    elevation: 10,
  },
  headerCopy: { flex: 1, gap: 1 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FF5252',
  },
  headerMeta: { color: '#7A8A9C', fontSize: 11, fontWeight: '600' },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: `${SCREEN_SHARE_ACCENT}28`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${SCREEN_SHARE_ACCENT}55`,
  },
  shareBtnText: {
    color: SCREEN_SHARE_ACCENT,
    fontWeight: '900',
    fontSize: 13,
  },
  stageWrap: { flex: 1, zIndex: 1 },
  stageFullscreen: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 0,
    zIndex: 20,
    backgroundColor: '#000',
  },
  mediaStage: { flex: 1, paddingHorizontal: spacing.xs },
  footer: { gap: spacing.sm, zIndex: 2 },
});
