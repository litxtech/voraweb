import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router, type Href, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ScreenBackButton } from '@/components/ui/ScreenBackButton';
import { Text } from '@/components/ui/Text';
import { ReportSheet } from '@/features/feed/components/ReportSheet';
import { blockUser } from '@/features/feed/services/engagement';
import { ScreenShareCreateSheet } from '@/features/screen-share/components/ScreenShareCreateSheet';
import { ScreenShareJoinCodeSheet } from '@/features/screen-share/components/ScreenShareJoinCodeSheet';
import { ScreenSharePasswordSheet } from '@/features/screen-share/components/ScreenSharePasswordSheet';
import { ScreenShareReplaceConfirmSheet } from '@/features/screen-share/components/ScreenShareReplaceConfirmSheet';
import { ScreenShareRoomSafetySheet } from '@/features/screen-share/components/ScreenShareRoomSafetySheet';
import { ScreenShareRoomWindow } from '@/features/screen-share/components/ScreenShareRoomWindow';
import { ScreenShareVisitedStrip } from '@/features/screen-share/components/ScreenShareVisitedStrip';
import {
  SCREEN_SHARE_ACCENT,
  SCREEN_SHARE_DRM_HINT,
  screenShareSessionPath,
} from '@/features/screen-share/constants';
import {
  createScreenShareSession,
  deleteScreenShareSession,
  joinScreenShareSession,
  listMyScreenShareSessions,
  listPublicScreenShareSessions,
  listVisitedScreenShareSessions,
  requestScreenShareInvite,
  ScreenShareHasOpenRoomError,
  ScreenSharePasswordRequiredError,
} from '@/features/screen-share/services/screenShareSessionService';
import {
  invalidateHubRoomsCache,
  readHubRoomsCache,
  upsertHubMyRoom,
  writeHubRoomsCache,
} from '@/features/screen-share/services/hubRoomsCache';
import { subscribeHubRoomsRealtime } from '@/features/screen-share/services/hubRoomsRealtime';
import { uploadScreenShareCover } from '@/features/screen-share/services/uploadScreenShareCover';
import { SCREEN_SHARE_SAMPLE_ROOMS } from '@/features/screen-share/samples';
import type { ScreenShareSession } from '@/features/screen-share/types';
import { spacing } from '@/constants/theme';
import { useAuth } from '@/providers/AuthProvider';

/** Hub açıkken yeni pencere kaçmasın — realtime yedek. */
const HUB_POLL_MS = 8_000;
const HUB_REALTIME_DEBOUNCE_MS = 700;

type PendingCreate = {
  password: string | null;
  coverUri: string | null;
  isHidden: boolean;
};

function hydrateFromHubCache() {
  const cached = readHubRoomsCache();
  return {
    myRooms: cached?.myRooms ?? [],
    publicRooms: cached?.publicRooms ?? [],
    visitedRooms: cached?.visitedRooms ?? [],
    hasCache: Boolean(cached),
  };
}

export function ScreenShareHubScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const [busy, setBusy] = useState<'create' | 'join' | 'invite' | string | null>(null);
  const initialCache = hydrateFromHubCache();
  const [myRooms, setMyRooms] = useState<ScreenShareSession[]>(initialCache.myRooms);
  const [publicRooms, setPublicRooms] = useState<ScreenShareSession[]>(initialCache.publicRooms);
  const [visitedRooms, setVisitedRooms] = useState<ScreenShareSession[]>(
    initialCache.visitedRooms,
  );
  const [listLoading, setListLoading] = useState(!initialCache.hasCache);
  const [refreshing, setRefreshing] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinCodeOpen, setJoinCodeOpen] = useState(false);
  const [joinPasswordOpen, setJoinPasswordOpen] = useState(false);
  const [pendingJoinCode, setPendingJoinCode] = useState('');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState<PendingCreate | null>(null);
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);
  const [safetyRoom, setSafetyRoom] = useState<ScreenShareSession | null>(null);
  const [reportRoom, setReportRoom] = useState<ScreenShareSession | null>(null);
  const realtimeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ownRoom = useMemo(
    () => myRooms.find((r) => r.isHost) ?? null,
    [myRooms],
  );
  const memberRooms = useMemo(
    () => myRooms.filter((r) => !r.isHost),
    [myRooms],
  );

  const openSession = (sessionId: string) => {
    // replace değil push — nested/root stack thrash beforeRemove ile odadan atıyordu
    router.push(screenShareSessionPath(sessionId) as Href);
  };

  /** Açık listeden tıklama: şifreliyse önce sheet, doğruysa hemen gir. */
  const openPublicRoom = (room: ScreenShareSession) => {
    if (room.hasPassword) {
      setJoinError(null);
      setPendingJoinCode(room.joinCode);
      setJoinPasswordOpen(true);
      return;
    }
    openSession(room.id);
  };

  const loadRooms = useCallback(async (opts?: { soft?: boolean }) => {
    if (!opts?.soft && !readHubRoomsCache()) setListLoading(true);

    const cached = readHubRoomsCache();
    const settled = await Promise.allSettled([
      listPublicScreenShareSessions(24),
      listMyScreenShareSessions(),
      listVisitedScreenShareSessions(12),
    ]);

    let pub = cached?.publicRooms ?? [];
    let mine = cached?.myRooms ?? [];
    let visited = cached?.visitedRooms ?? [];
    let anyOk = false;

    if (settled[0].status === 'fulfilled') {
      pub = settled[0].value;
      setPublicRooms(pub);
      anyOk = true;
    }
    if (settled[1].status === 'fulfilled') {
      mine = settled[1].value;
      setMyRooms(mine);
      anyOk = true;
    }
    if (settled[2].status === 'fulfilled') {
      visited = settled[2].value;
      setVisitedRooms(visited);
      anyOk = true;
    }

    // Başarısız RPC boş listeyi cache’e yazmasın — yeni pencereler kaybolmasın.
    if (anyOk) {
      writeHubRoomsCache({ myRooms: mine, publicRooms: pub, visitedRooms: visited });
    }
    setListLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      // Her focus: cache’ten boya, sonra ağdan soft-refresh.
      const cached = readHubRoomsCache();
      if (cached) {
        setMyRooms(cached.myRooms);
        setPublicRooms(cached.publicRooms);
        setVisitedRooms(cached.visitedRooms);
        setListLoading(false);
      }
      void loadRooms({ soft: Boolean(cached) });

      // Hub’da kalınca yeni açılan pencereler görünsün.
      const poll = setInterval(() => void loadRooms({ soft: true }), HUB_POLL_MS);

      const scheduleRealtimeReload = () => {
        if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
        realtimeDebounceRef.current = setTimeout(() => {
          realtimeDebounceRef.current = null;
          void loadRooms({ soft: true });
        }, HUB_REALTIME_DEBOUNCE_MS);
      };

      let unsubRealtime: (() => Promise<void>) | null = null;
      let cancelled = false;
      void subscribeHubRoomsRealtime(scheduleRealtimeReload)
        .then((unsub) => {
          if (cancelled) {
            void unsub();
            return;
          }
          unsubRealtime = unsub;
        })
        .catch(() => {
          // Realtime yoksa poll yeterli
        });

      const onAppState = (state: string) => {
        if (state === 'active') void loadRooms({ soft: true });
      };
      const appSub = AppState.addEventListener('change', onAppState);

      return () => {
        cancelled = true;
        clearInterval(poll);
        if (realtimeDebounceRef.current) {
          clearTimeout(realtimeDebounceRef.current);
          realtimeDebounceRef.current = null;
        }
        appSub.remove();
        void unsubRealtime?.();
      };
    }, [loadRooms]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRooms({ soft: true });
    setRefreshing(false);
  };

  const runCreate = async (
    input: PendingCreate,
    replaceExisting: boolean,
  ) => {
    if (!user?.id) {
      Alert.alert('Giriş', 'Oda açmak için giriş gerekli');
      return;
    }
    setBusy('create');
    try {
      let coverUrl: string | null = null;
      if (input.coverUri) {
        const uploaded = await uploadScreenShareCover(user.id, input.coverUri);
        if (uploaded.error || !uploaded.url) {
          throw new Error(uploaded.error ?? 'Kapak yüklenemedi');
        }
        coverUrl = uploaded.url;
      }
      const session = await createScreenShareSession(
        'Sesli oda',
        input.password,
        coverUrl,
        replaceExisting,
        input.isHidden,
      );
      upsertHubMyRoom(session);
      setMyRooms((prev) => [session, ...prev.filter((r) => r.id !== session.id)]);
      setPublicRooms((prev) => prev.filter((r) => r.id !== session.id));
      setCreateOpen(false);
      setReplaceConfirmOpen(false);
      setPendingCreate(null);
      openSession(session.id);
    } catch (err) {
      if (err instanceof ScreenShareHasOpenRoomError) {
        setPendingCreate(input);
        setCreateOpen(false);
        setReplaceConfirmOpen(true);
        return;
      }
      Alert.alert('Sesli oda', err instanceof Error ? err.message : 'Oda açılamadı');
    } finally {
      setBusy(null);
    }
  };

  const onCreate = async (input: PendingCreate) => {
    if (ownRoom) {
      setPendingCreate(input);
      setCreateOpen(false);
      setReplaceConfirmOpen(true);
      return;
    }
    await runCreate(input, false);
  };

  const tryJoin = async (joinCode: string, password?: string | null) => {
    setBusy('join');
    setJoinError(null);
    try {
      const session = await joinScreenShareSession(joinCode, password);
      upsertHubMyRoom(session);
      setMyRooms((prev) => [session, ...prev.filter((r) => r.id !== session.id)]);
      setJoinPasswordOpen(false);
      setJoinCodeOpen(false);
      openSession(session.id);
    } catch (err) {
      if (err instanceof ScreenSharePasswordRequiredError) {
        setPendingJoinCode(joinCode);
        setJoinCodeOpen(false);
        setJoinPasswordOpen(true);
        return;
      }
      const message = err instanceof Error ? err.message : 'Odaya girilemedi';
      setJoinError(message);
      if (!joinCodeOpen) Alert.alert('Katıl', message);
    } finally {
      setBusy(null);
    }
  };

  const onRequestInvite = async (joinCode: string) => {
    const normalized = joinCode.replace(/\D/g, '');
    if (normalized.length !== 6) {
      setJoinError('6 haneli oda kodunu gir.');
      return;
    }
    setBusy('invite');
    setJoinError(null);
    try {
      await requestScreenShareInvite(normalized);
      setJoinCodeOpen(false);
      setJoinPasswordOpen(false);
      Alert.alert('Davet isteği', 'Host’a bildirildi. Kabul edilince odaya girebilirsin.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'İstek gönderilemedi';
      setJoinError(message);
      if (!joinCodeOpen) Alert.alert('Davet', message);
    } finally {
      setBusy(null);
    }
  };

  const onDeleteRoom = (room: ScreenShareSession) => {
    if (!room.isHost) return;
    Alert.alert('Odayı sil', `"${room.title}" kalıcı olarak kapatılsın mı? Listeden de kalkacak.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusy(room.id);
            try {
              await deleteScreenShareSession(room.id);
              invalidateHubRoomsCache();
              setMyRooms((prev) => prev.filter((r) => r.id !== room.id));
              setPublicRooms((prev) => prev.filter((r) => r.id !== room.id));
              setVisitedRooms((prev) => prev.filter((r) => r.id !== room.id));
              await loadRooms();
            } catch (err) {
              Alert.alert('Sil', err instanceof Error ? err.message : 'Silinemedi');
            } finally {
              setBusy(null);
            }
          })();
        },
      },
    ]);
  };

  const onBlockHost = (room: ScreenShareSession) => {
    if (!user?.id || room.isHost) return;
    Alert.alert('Engelle', `@${room.hostUsername ?? 'host'} engellensin mi? Odaları listeden kalkar.`, [
      { text: 'Vazgeç', style: 'cancel' },
      {
        text: 'Engelle',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const { error } = await blockUser(user.id, room.hostUserId);
            setSafetyRoom(null);
            if (error) {
              Alert.alert('Engelle', error);
              return;
            }
            setPublicRooms((prev) => prev.filter((r) => r.hostUserId !== room.hostUserId));
            setVisitedRooms((prev) => prev.filter((r) => r.hostUserId !== room.hostUserId));
            Alert.alert('Tamam', 'Kullanıcı engellendi.');
          })();
        },
      },
    ]);
  };

  const showPublic = publicRooms.length > 0;
  const showSamples =
    !listLoading && !showPublic && memberRooms.length === 0 && !ownRoom;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#07101C', '#05070A', '#0A1220', '#05070A']}
        locations={[0, 0.35, 0.7, 1]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + spacing.sm,
              paddingBottom: insets.bottom + spacing.xl,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void onRefresh()}
              tintColor={SCREEN_SHARE_ACCENT}
            />
          }
        >
          <View style={styles.topBar}>
            <ScreenBackButton />
            <View style={styles.topActions}>
              <Pressable
                onPress={() => {
                  setJoinError(null);
                  setJoinCodeOpen(true);
                }}
                style={({ pressed }) => [styles.topIconBtn, pressed && { opacity: 0.85 }]}
                accessibilityLabel="Kod ile pencereye gir"
              >
                <Ionicons name="keypad-outline" size={18} color={SCREEN_SHARE_ACCENT} />
              </Pressable>
              <Pressable
                onPress={() => setCreateOpen(true)}
                disabled={busy != null}
                style={({ pressed }) => [
                  styles.topCreateBtn,
                  { opacity: pressed || busy === 'create' ? 0.88 : 1 },
                ]}
                accessibilityLabel={
                  ownRoom ? 'Yeni pencere aç (mevcut kapanır)' : 'Yeni pencere aç'
                }
              >
                {busy === 'create' ? (
                  <ActivityIndicator color="#04110E" size="small" />
                ) : (
                  <Ionicons name="add" size={22} color="#04110E" />
                )}
              </Pressable>
            </View>
          </View>

          <View style={styles.hero}>
            <View style={styles.badge}>
              <Ionicons name="radio-outline" size={14} color={SCREEN_SHARE_ACCENT} />
              <Text style={styles.badgeText}>SESLİ ODA</Text>
            </View>
            <Text style={styles.title}>Açık pencereler</Text>
            <Text style={styles.subtitle}>
              Canlı odalar burada. Şifreli olanlarda kilit görünür; tıklayınca şifre istenir.
            </Text>
          </View>

          {listLoading && !ownRoom && publicRooms.length === 0 ? (
            <View style={styles.loadingBlock}>
              <ActivityIndicator color={SCREEN_SHARE_ACCENT} />
              <Text style={styles.loadingText}>Odalar yükleniyor…</Text>
            </View>
          ) : null}

          {ownRoom ? (
            <View style={styles.pinnedBlock}>
              <Text style={styles.sectionLabel}>SENİN ODAN</Text>
              <ScreenShareRoomWindow
                room={ownRoom}
                pinned
                busy={busy === ownRoom.id}
                onOpen={() => openSession(ownRoom.id)}
                onDelete={() => onDeleteRoom(ownRoom)}
                onSafety={() => setSafetyRoom(ownRoom)}
              />
            </View>
          ) : null}

          <ScreenShareVisitedStrip
            rooms={visitedRooms}
            onOpen={(room) => openSession(room.id)}
          />

          {memberRooms.length > 0 ? (
            <View style={styles.roomsBlock}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionLabel}>KATILDIĞIN ODALAR</Text>
                <Text style={styles.sectionCount}>{memberRooms.length}</Text>
              </View>
              <View style={styles.windowsGrid}>
                {memberRooms.map((room) => (
                  <ScreenShareRoomWindow
                    key={room.id}
                    room={room}
                    busy={busy === room.id}
                    onOpen={() => openSession(room.id)}
                    onSafety={() => setSafetyRoom(room)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {showPublic ? (
            <View style={styles.roomsBlock}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionLabel}>AÇIK ODALAR</Text>
                <Text style={styles.sectionCount}>{publicRooms.length}</Text>
              </View>
              <View style={styles.windowsGrid}>
                {publicRooms.map((room) => (
                  <ScreenShareRoomWindow
                    key={room.id}
                    room={room}
                    busy={busy === room.id || (busy === 'join' && pendingJoinCode === room.joinCode)}
                    onOpen={() => openPublicRoom(room)}
                    onSafety={() => setSafetyRoom(room)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {showSamples ? (
            <View style={styles.roomsBlock}>
              <View style={styles.sectionHead}>
                <Text style={styles.sectionLabel}>ÖRNEK PENCERELER</Text>
                <Text style={styles.sectionCount}>{SCREEN_SHARE_SAMPLE_ROOMS.length}</Text>
              </View>
              <View style={styles.windowsGrid}>
                {SCREEN_SHARE_SAMPLE_ROOMS.map((room) => (
                  <ScreenShareRoomWindow
                    key={room.id}
                    room={room}
                    sample
                    onOpen={() =>
                      Alert.alert(
                        'Örnek oda',
                        'Gerçek kullanıcı odaları açılınca burada görünür. Sen de “Yeni pencere aç” ile başla.',
                      )
                    }
                  />
                ))}
              </View>
            </View>
          ) : null}

          <Text style={styles.footnote}>{SCREEN_SHARE_DRM_HINT}</Text>
        </ScrollView>
      </KeyboardAvoidingView>

      <ScreenShareCreateSheet
        visible={createOpen}
        busy={busy === 'create'}
        onClose={() => setCreateOpen(false)}
        onSubmit={(input) => void onCreate(input)}
      />

      <ScreenShareJoinCodeSheet
        visible={joinCodeOpen}
        busy={busy === 'join'}
        inviteBusy={busy === 'invite'}
        errorMessage={joinError}
        onClose={() => {
          setJoinCodeOpen(false);
          setJoinError(null);
        }}
        onJoin={(code) => void tryJoin(code)}
        onRequestInvite={(code) => void onRequestInvite(code)}
      />

      <ScreenSharePasswordSheet
        visible={joinPasswordOpen}
        title="Oda şifresi gerekli"
        subtitle="Şifreyi yaz; doğruysa hemen odaya girersin. Bilmiyorsan host’tan davet iste."
        confirmLabel="Giriş yap"
        busy={busy === 'join'}
        inviteBusy={busy === 'invite'}
        onRequestInvite={() => void onRequestInvite(pendingJoinCode)}
        onClose={() => {
          setJoinPasswordOpen(false);
          setJoinError(null);
        }}
        onSubmit={(password) => void tryJoin(pendingJoinCode, password)}
      />

      <ScreenShareReplaceConfirmSheet
        visible={replaceConfirmOpen}
        busy={busy === 'create'}
        onCancel={() => {
          setReplaceConfirmOpen(false);
          setPendingCreate(null);
        }}
        onConfirm={() => {
          if (pendingCreate) void runCreate(pendingCreate, true);
        }}
      />

      <ScreenShareRoomSafetySheet
        visible={safetyRoom != null}
        room={safetyRoom}
        onClose={() => setSafetyRoom(null)}
        onReport={() => {
          if (!safetyRoom) return;
          setReportRoom(safetyRoom);
          setSafetyRoom(null);
        }}
        onBlockHost={() => {
          if (safetyRoom) onBlockHost(safetyRoom);
        }}
      />

      <ReportSheet
        visible={reportRoom != null}
        targetType="screen_share_session"
        targetId={reportRoom?.id ?? ''}
        onClose={() => setReportRoom(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#05070A' },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,194,168,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,194,168,0.4)',
  },
  topCreateBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SCREEN_SHARE_ACCENT,
  },
  joinTopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: 'rgba(0,194,168,0.12)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,194,168,0.4)',
  },
  joinTopBtnText: {
    color: SCREEN_SHARE_ACCENT,
    fontWeight: '800',
    fontSize: 12.5,
  },
  hero: { gap: spacing.sm },
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(0,194,168,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,194,168,0.35)',
  },
  badgeText: {
    color: SCREEN_SHARE_ACCENT,
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 0.8,
  },
  title: {
    color: '#F4F7FB',
    fontWeight: '800',
    fontSize: 30,
    lineHeight: 34,
    letterSpacing: -0.6,
  },
  subtitle: { color: 'rgba(154,168,188,0.95)', fontSize: 14, lineHeight: 21, maxWidth: 340 },
  pinnedBlock: {
    gap: spacing.sm,
    backgroundColor: 'rgba(5,7,10,0.92)',
    paddingBottom: spacing.sm,
  },
  primaryCta: {
    borderRadius: 18,
    overflow: 'hidden',
  },
  primaryGradient: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  primaryCtaText: { color: '#04110E', fontWeight: '900', fontSize: 15, textAlign: 'center' },
  roomsBlock: { gap: spacing.md },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    color: 'rgba(107,122,143,0.95)',
    fontWeight: '800',
    fontSize: 11,
    letterSpacing: 1,
  },
  sectionCount: {
    color: SCREEN_SHARE_ACCENT,
    fontWeight: '800',
    fontSize: 12,
  },
  windowsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -5,
  },
  footnote: {
    fontSize: 11,
    textAlign: 'center',
    color: 'rgba(107,122,143,0.85)',
    marginTop: spacing.sm,
  },
  loadingBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  loadingText: {
    color: 'rgba(180,196,214,0.9)',
    fontSize: 13,
    fontWeight: '600',
  },
});
