import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { isTrackReference, useLocalParticipant, useTracks } from '@livekit/react-native';
import { Track } from 'livekit-client';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { ScreenBackButton } from '@/components/ui/ScreenBackButton';
import { SCREEN_SHARE_ACCENT, SCREEN_SHARE_ROOM_BG } from '@/features/screen-share/constants';
import { ScreenShareChatPanel, type ChatPanelMode } from '@/features/screen-share/components/ScreenShareChatPanel';
import { ScreenShareLoungeBackground } from '@/features/screen-share/components/ScreenShareLoungeBackground';
import { ScreenShareListenersSheet } from '@/features/screen-share/components/ScreenShareListenersSheet';
import { ScreenShareLoungeStage } from '@/features/screen-share/components/ScreenShareLoungeStage';
import { ScreenShareMembersSheet } from '@/features/screen-share/components/ScreenShareMembersSheet';
import { ScreenSharePasswordSheet } from '@/features/screen-share/components/ScreenSharePasswordSheet';
import { useScreenShareLoungeMembers } from '@/features/screen-share/hooks/useScreenShareLoungeMembers';
import { ScreenShareProfileSheet } from '@/features/screen-share/components/ScreenShareProfileSheet';
import { ScreenShareStage } from '@/features/screen-share/components/ScreenShareStage';
import { ScreenShareToolbar } from '@/features/screen-share/components/ScreenShareToolbar';
import { ScreenShareYoutubeSheet } from '@/features/screen-share/components/ScreenShareYoutubeSheet';
import { useScreenShareChat } from '@/features/screen-share/hooks/useScreenShareChat';
import { useScreenShareKeepAlive } from '@/features/screen-share/hooks/useScreenShareKeepAlive';
import { useScreenShareSeatActions } from '@/features/screen-share/hooks/useScreenShareSeatActions';
import { useScreenShareYoutubeSync } from '@/features/screen-share/hooks/useScreenShareYoutubeSync';
import {
  setScreenShareHidden,
  setScreenSharePassword,
} from '@/features/screen-share/services/screenShareSessionService';
import { useScreenSharePipStore } from '@/features/screen-share/store/screenSharePipStore';
import type { ScreenShareParticipant, ScreenShareSession } from '@/features/screen-share/types';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';

const PIP_SPRING = { damping: 22, stiffness: 260 };

type Props = {
  session: ScreenShareSession;
  isHost: boolean;
  onCopyCode: () => void;
  onLeave: () => void;
  onDelete: () => void;
  onSessionPatch: (next: ScreenShareSession) => void;
  /** Sola kaydır / geri — küçük pencereye küçült */
  onMinimize: (micEnabled?: boolean) => void;
};

/** LiveKitRoom context’i içinde — lounge varsayılan; film/YouTube açılınca medya sahnesi. */
export function ScreenShareRoomBody({
  session,
  isHost,
  onCopyCode,
  onLeave,
  onDelete,
  onSessionPatch,
  onMinimize,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  useScreenShareKeepAlive();
  const seat = useScreenShareSeatActions({
    sessionId: session.id,
    hostUserId: session.hostUserId,
  });
  const {
    leaveSeat,
    takeSeat,
    takeSeatSlot,
    hostMute,
    hostStand,
    hostKick,
    grantMic,
    revokeMic,
    grantScreen,
    revokeScreen,
    assignLeader,
    clearLeader,
    setLeaderLock,
    setMicAutoApprove,
    iAmSeated,
    micOk,
    canShareScreen,
    canClaimLeader,
    leaderLocked,
    micAuto,
    isLeader,
    isOwner,
    canModerate,
  } = seat;

  const { active: youtubeActive, share: shareYoutube, stop: stopYoutube } =
    useScreenShareYoutubeSync(isLeader || isHost, session.hostUserId);

  /** Lider/sahip çıkınca yayını kes — izleyicilerde video durur. */
  const leaveAfterStopMedia = useCallback(() => {
    if (!(isLeader || isHost)) {
      onLeave();
      return;
    }
    void stopYoutube()
      .catch(() => undefined)
      .finally(() => onLeave());
  }, [isLeader, isHost, onLeave, stopYoutube]);

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
  const { isScreenShareEnabled, isMicrophoneEnabled } = useLocalParticipant();
  const screenTracks = useTracks([Track.Source.ScreenShare], { onlySubscribed: false });

  useEffect(() => {
    useScreenSharePipStore.getState().setMicEnabled(Boolean(isMicrophoneEnabled));
  }, [isMicrophoneEnabled]);

  const [membersOpen, setMembersOpen] = useState(false);
  const [listenersOpen, setListenersOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [youtubeOpen, setYoutubeOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [chatMode, setChatMode] = useState<ChatPanelMode>('collapsed');
  const [profileMember, setProfileMember] = useState<ScreenShareParticipant | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const [newListenerBadge, setNewListenerBadge] = useState(0);
  const seenListenersRef = useRef<Set<string> | null>(null);
  const dragX = useSharedValue(0);

  const { listeners } = useScreenShareLoungeMembers(session.id, session.hostUserId);

  useEffect(() => {
    const ids = listeners.map((l) => l.userId);
    if (seenListenersRef.current == null) {
      seenListenersRef.current = new Set(ids);
      setNewListenerBadge(0);
      return;
    }
    if (listenersOpen) {
      seenListenersRef.current = new Set(ids);
      setNewListenerBadge(0);
      return;
    }
    let fresh = 0;
    for (const id of ids) {
      if (!seenListenersRef.current.has(id)) fresh += 1;
    }
    setNewListenerBadge(fresh);
  }, [listeners, listenersOpen]);

  const enterPip = useCallback(() => {
    if (fullscreen) setFullscreen(false);
    dragX.value = withSpring(0, PIP_SPRING);
    onMinimize(Boolean(isMicrophoneEnabled));
  }, [dragX, fullscreen, onMinimize, isMicrophoneEnabled]);

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

  const swipeToPip = useMemo(() => {
    return Gesture.Pan()
      .enabled(!fullscreen && !keyboardOpen && chatMode === 'collapsed')
      // Yalnızca sola kaydır — dikey koltuk scroll’u bozmasın
      .activeOffsetX(-28)
      .failOffsetY([-22, 22])
      .onUpdate((e) => {
        if (e.translationX < 0) {
          dragX.value = e.translationX;
        }
      })
      .onEnd((e) => {
        if (e.translationX < -72 || e.velocityX < -600) {
          runOnJS(enterPip)();
          return;
        }
        dragX.value = withSpring(0, PIP_SPRING);
      });
  }, [fullscreen, keyboardOpen, chatMode, dragX, enterPip]);

  const roomSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: dragX.value }],
    opacity: Math.max(0.35, 1 + dragX.value / 280),
  }));

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

  const onToggleHidden = () => {
    const nextHidden = !session.isHidden;
    Alert.alert(
      nextHidden ? 'Odayı gizle' : 'Herkese aç',
      nextHidden
        ? 'Oda açık listede ve feed’de görünmez. Paylaştığın link veya kod ile girilebilir.'
        : 'Oda tekrar açık odalar listesinde görünür.',
      [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: nextHidden ? 'Gizle' : 'Aç',
          onPress: () => {
            void (async () => {
              try {
                const next = await setScreenShareHidden(session.id, nextHidden);
                onSessionPatch({ ...session, ...next, isHidden: nextHidden });
              } catch (err) {
                Alert.alert(
                  'Gizlilik',
                  err instanceof Error ? err.message : 'Güncellenemedi',
                );
              }
            })();
          },
        },
      ],
    );
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
    <GestureDetector gesture={swipeToPip}>
    <Animated.View style={[styles.root, roomSlideStyle]}>
      <ScreenShareLoungeBackground />

      {!fullscreen ? (
        <View
          style={[
            styles.header,
            { paddingTop: 2, paddingHorizontal: spacing.md },
            keyboardOpen && styles.headerDimmed,
          ]}
          pointerEvents={keyboardOpen ? 'none' : 'auto'}
        >
          <ScreenBackButton onPress={enterPip} />
          <View style={styles.headerCopy}>
            <View style={styles.liveRow}>
              <View style={styles.liveDot} />
              <Text variant="label" style={{ color: SCREEN_SHARE_ACCENT, fontSize: 10 }}>
                CANLI · {isHost ? 'SAHİP' : isLeader ? 'LİDER' : 'ÜYE'}
                {session.hasPassword ? ' · KİLİT' : ''}
                {session.isHidden ? ' · GİZLİ' : ''}
              </Text>
            </View>
            <Text style={{ fontWeight: '800', color: colors.text, fontSize: 15 }} numberOfLines={1}>
              {session.title}
            </Text>
            <Text style={styles.headerMeta}>
              {session.participantCount} kişi · kod {session.joinCode}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {!mediaMode && !iAmSeated ? (
              <Pressable
                onPress={() => void takeSeat()}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Boş koltuğa geç"
                style={({ pressed }) => [
                  styles.seatIconBtn,
                  styles.seatIconBtnTake,
                  { opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <Ionicons name="person-add" size={16} color={SCREEN_SHARE_ACCENT} />
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => setListenersOpen(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Dinleyiciler"
              style={({ pressed }) => [
                styles.seatIconBtn,
                styles.listenersBtn,
                { opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <Ionicons name="headset" size={16} color="#F4F7FB" />
              {newListenerBadge > 0 ? (
                <View style={styles.listenerBadge}>
                  <Text style={styles.listenerBadgeText}>
                    {newListenerBadge > 9 ? '9+' : String(newListenerBadge)}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            <Pressable
              onPress={onCopyCode}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Odayı paylaş"
              style={({ pressed }) => [styles.shareIconBtn, { opacity: pressed ? 0.75 : 1 }]}
            >
              <Ionicons
                name={session.hasPassword ? 'lock-closed' : 'share-social'}
                size={16}
                color={SCREEN_SHARE_ACCENT}
              />
            </Pressable>
          </View>
        </View>
      ) : null}

      <View style={[styles.stageWrap, fullscreen && styles.stageFullscreen]}>
        {mediaMode ? (
          <View style={styles.mediaStage}>
            <ScreenShareStage
              sessionId={session.id}
              onAvatarPress={setProfileMember}
              fullscreen={fullscreen}
              onRequestFullscreen={() => setFullscreen(true)}
              onExitFullscreen={() => setFullscreen(false)}
              youtube={youtubeActive}
              isHost={isLeader || isHost}
              onStopYoutube={() => void stopYoutube()}
              onOpenYoutubeSearch={() => setYoutubeOpen(true)}
            />
          </View>
        ) : (
          <ScreenShareLoungeStage
            sessionId={session.id}
            hostUserId={session.hostUserId}
            onAvatarPress={setProfileMember}
            onTakeSeatSlot={(slot) => {
              if (slot === 'L' && !canClaimLeader && leaderLocked) {
                Alert.alert(
                  'Lider koltuğu',
                  'Lider koltuğu kilitli. Oturmak için lider yetkisi gerekir.',
                );
                return;
              }
              const target = slot;
              Alert.alert(
                'Koltuk değiştir',
                target === 'L'
                  ? 'Lider koltuğuna geçmek istiyor musun?'
                  : 'Bu koltuğa geçmek istiyor musun?',
                [
                  { text: 'Vazgeç', style: 'cancel' },
                  {
                    text: 'Geç',
                    // Android: Alert kapanmadan async setAttributes yarışabiliyor
                    onPress: () => {
                      setTimeout(() => {
                        void takeSeatSlot(target);
                      }, 50);
                    },
                  },
                ],
              );
            }}
            canClaimLeaderSeat={canClaimLeader}
            leaderLocked={leaderLocked}
          />
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
              isLeader={isLeader}
              canModerate={canModerate}
              micOk={micOk}
              micAuto={micAuto}
              canShareScreen={canShareScreen}
              leaderLocked={leaderLocked}
              onToggleMicAuto={() => {
                Alert.alert(
                  micAuto ? 'Mikrofon onayı' : 'Otomatik mikrofon',
                  micAuto
                    ? 'Kapatırsan yeni katılanlar izinsiz konuşamaz. Profil kartından mik izni verirsin.'
                    : 'Açarsan katılanlar mik açabilir.',
                  [
                    { text: 'Vazgeç', style: 'cancel' },
                    {
                      text: micAuto ? 'Onay zorunlu yap' : 'Otomatik aç',
                      onPress: () => void setMicAutoApprove(!micAuto),
                    },
                  ],
                );
              }}
              onToggleLeaderLock={() => {
                Alert.alert(
                  leaderLocked ? 'Lider kilidini aç' : 'Lider koltuğunu kilitle',
                  leaderLocked
                    ? 'Açarsan boş lider koltuğuna herkes oturabilir.'
                    : 'Kilitliyken yalnızca lider yetkisi olanlar oturur.',
                  [
                    { text: 'Vazgeç', style: 'cancel' },
                    {
                      text: leaderLocked ? 'Kilidi aç' : 'Kilitle',
                      onPress: () => void setLeaderLock(!leaderLocked),
                    },
                  ],
                );
              }}
              memberCount={session.participantCount}
              onCopyCode={onCopyCode}
              onLeave={leaveAfterStopMedia}
              onDelete={confirmDelete}
              onMembers={() => setMembersOpen(true)}
              onPassword={isHost ? () => setPasswordOpen(true) : undefined}
              onToggleHidden={isHost ? onToggleHidden : undefined}
              isHidden={session.isHidden}
              onYoutube={
                isLeader || isHost ? () => setYoutubeOpen(true) : undefined
              }
              onFullscreen={mediaMode ? () => setFullscreen(true) : undefined}
            />
          ) : null}
        </View>
      ) : null}

      {isLeader || isHost ? (
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

      <ScreenShareListenersSheet
        visible={listenersOpen}
        listeners={listeners}
        iAmSeated={iAmSeated}
        onClose={() => setListenersOpen(false)}
        onPressMember={setProfileMember}
        onBecomeListener={() => void leaveSeat()}
      />

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
        canModerate={canModerate}
        isOwnerViewer={isOwner}
        targetIsLeader={Boolean(
          profileMember && seat.leaderId === profileMember.userId,
        )}
        onHostMute={(id) => void hostMute(id)}
        onHostStand={(id) => void hostStand(id)}
        onHostKick={onHostKickConfirm}
        onGrantMic={(id) => void grantMic(id)}
        onRevokeMic={(id) => void revokeMic(id)}
        onGrantScreen={(id) => void grantScreen(id)}
        onRevokeScreen={(id) => void revokeScreen(id)}
        onAssignLeader={(id) => void assignLeader(id)}
        onClearLeader={isOwner ? (id) => void clearLeader(id) : undefined}
      />
    </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: SCREEN_SHARE_ROOM_BG },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: 6,
    zIndex: 10,
    elevation: 10,
    backgroundColor: SCREEN_SHARE_ROOM_BG,
  },
  headerDimmed: { opacity: 0.55 },
  headerCopy: { flex: 1, gap: 1 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#FF5252',
  },
  headerMeta: { color: '#7A8A9C', fontSize: 11, fontWeight: '600' },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  seatIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    position: 'relative',
    overflow: 'visible',
  },
  seatIconBtnTake: {
    backgroundColor: `${SCREEN_SHARE_ACCENT}28`,
    borderColor: `${SCREEN_SHARE_ACCENT}55`,
  },
  listenersBtn: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderColor: 'rgba(255,255,255,0.22)',
  },
  listenerBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: SCREEN_SHARE_ROOM_BG,
  },
  listenerBadgeText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '900',
    lineHeight: 11,
  },
  shareIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${SCREEN_SHARE_ACCENT}28`,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${SCREEN_SHARE_ACCENT}55`,
  },
  stageWrap: { flex: 1, zIndex: 1 },
  stageFullscreen: {
    ...StyleSheet.absoluteFillObject,
    paddingHorizontal: 0,
    zIndex: 20,
    backgroundColor: '#000',
  },
  mediaStage: { flex: 1, minHeight: 0, paddingHorizontal: 2 },
  footer: { gap: spacing.sm, zIndex: 2 },
});
