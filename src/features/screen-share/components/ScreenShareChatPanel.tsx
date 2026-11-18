import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { OptimizedImage } from '@/components/media/OptimizedImage';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import type { ScreenShareChatMessage } from '@/features/screen-share/services/chatSync';
import { spacing } from '@/constants/theme';

export type ChatPanelMode = 'expanded' | 'collapsed' | 'hidden';

type Props = {
  mode: ChatPanelMode;
  onModeChange: (mode: ChatPanelMode) => void;
  messages: ScreenShareChatMessage[];
  onSend: (text: string) => void;
  bottomInset: number;
  onInputFocusChange?: (focused: boolean) => void;
};

function formatTime(at: number) {
  const d = new Date(at);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

/** Şeffaf sohbet — tutamaktan yukarı çekerek büyüt / aşağı indir. */
export function ScreenShareChatPanel({
  mode,
  onModeChange,
  messages,
  onSend,
  bottomInset,
  onInputFocusChange,
}: Props) {
  const { height: winH } = useWindowDimensions();
  const snaps = useMemo(() => {
    const min = Math.max(200, winH * 0.28);
    const mid = winH * 0.42;
    const max = winH * 0.72;
    return { min, mid, max };
  }, [winH]);

  const [draft, setDraft] = useState('');
  const [pinnedBottom, setPinnedBottom] = useState(true);
  const [unseen, setUnseen] = useState(0);
  const listRef = useRef<FlatList<ScreenShareChatMessage>>(null);
  const lastCount = useRef(messages.length);

  const heightSV = useSharedValue(snaps.mid);
  const startH = useSharedValue(snaps.mid);

  useEffect(() => {
    if (mode === 'expanded') {
      heightSV.value = withSpring(snaps.mid, { damping: 18, stiffness: 180 });
    }
  }, [mode, snaps.mid, heightSV]);

  useEffect(() => {
    if (messages.length <= lastCount.current) {
      lastCount.current = messages.length;
      return;
    }
    lastCount.current = messages.length;
    if (mode === 'expanded' && pinnedBottom) {
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      setUnseen(0);
    } else {
      setUnseen((n) => n + 1);
    }
  }, [messages.length, mode, pinnedBottom]);

  const snapTo = (h: number) => {
    const { min, mid, max } = snaps;
    if (h < min * 0.72) {
      onModeChange('collapsed');
      return;
    }
    const targets = [min, mid, max];
    let best = mid;
    let bestDist = Infinity;
    for (const t of targets) {
      const d = Math.abs(t - h);
      if (d < bestDist) {
        bestDist = d;
        best = t;
      }
    }
    heightSV.value = withSpring(best, { damping: 18, stiffness: 180 });
  };

  const pan = Gesture.Pan()
    .activeOffsetY([-8, 8])
    .onBegin(() => {
      startH.value = heightSV.value;
    })
    .onUpdate((e) => {
      // Yukarı çekince translationY negatif → yükseklik artar
      const next = startH.value - e.translationY;
      heightSV.value = Math.min(snaps.max, Math.max(snaps.min * 0.55, next));
    })
    .onEnd(() => {
      runOnJS(snapTo)(heightSV.value);
    });

  const animStyle = useAnimatedStyle(() => ({
    height: heightSV.value,
  }));

  const submit = () => {
    const t = draft.trim();
    if (!t) return;
    onSend(t);
    setDraft('');
    setPinnedBottom(true);
  };

  if (mode === 'hidden') {
    return (
      <Pressable
        style={[styles.fab, { bottom: bottomInset + 72 }]}
        onPress={() => onModeChange('expanded')}
        hitSlop={12}
        accessibilityLabel="Sohbeti aç"
      >
        <Ionicons name="chatbubbles" size={20} color="#04110E" />
        {unseen > 0 ? (
          <View style={styles.fabBadge}>
            <Text style={styles.fabBadgeText}>{unseen > 9 ? '9+' : unseen}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  }

  if (mode === 'collapsed') {
    return (
      <Pressable
        style={[styles.collapsed, { marginBottom: 8 }]}
        onPress={() => onModeChange('expanded')}
        hitSlop={10}
        accessibilityLabel="Sohbeti genişlet"
      >
        <Ionicons name="chatbubble-ellipses" size={16} color={SCREEN_SHARE_ACCENT} />
        <Text style={styles.collapsedText}>
          Sohbet{messages.length ? ` · ${messages.length}` : ''}
          {unseen ? ` · +${unseen}` : ''}
        </Text>
        <Ionicons name="chevron-up" size={16} color="#9AA8BC" />
      </Pressable>
    );
  }

  return (
    <Animated.View style={[styles.expandedWrap, animStyle]}>
      <View style={styles.card}>
        <GestureDetector gesture={pan}>
          <View style={styles.handleHit} accessibilityLabel="Sohbeti yukarı çek">
            <View style={styles.handle} />
            <Text style={styles.handleHint}>yukarı çek · büyüt</Text>
          </View>
        </GestureDetector>

        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Sohbet</Text>
          <Text style={styles.cardMeta}>{messages.length} mesaj</Text>
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => onModeChange('collapsed')}
              hitSlop={12}
              style={styles.iconBtn}
            >
              <Ionicons name="remove" size={18} color="#E8EEF5" />
            </Pressable>
            <Pressable onPress={() => onModeChange('hidden')} hitSlop={12} style={styles.iconBtn}>
              <Ionicons name="close" size={18} color="#E8EEF5" />
            </Pressable>
          </View>
        </View>

        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => setPinnedBottom(false)}
          onContentSizeChange={() => {
            if (pinnedBottom) listRef.current?.scrollToEnd({ animated: false });
          }}
          onScroll={(e) => {
            const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
            const atBottom = contentOffset.y + layoutMeasurement.height >= contentSize.height - 40;
            if (atBottom) {
              setPinnedBottom(true);
              setUnseen(0);
            }
          }}
          scrollEventThrottle={100}
          ListEmptyComponent={<Text style={styles.empty}>İlk mesajı sen yaz</Text>}
          renderItem={({ item }) =>
            item.system ? (
              <Text style={styles.system}>{item.text}</Text>
            ) : (
              <View style={styles.row}>
                {item.avatarUrl ? (
                  <OptimizedImage
                    uri={item.avatarUrl}
                    style={styles.avatar}
                    tier="avatar"
                    recyclingKey={`ss-chat-${item.userId}`}
                  />
                ) : (
                  <View style={[styles.avatar, styles.avatarFallback]}>
                    <Text style={styles.avatarLetter}>
                      {(item.username || '?').slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={styles.bubble}>
                  <View style={styles.metaRow}>
                    <Text style={styles.user}>@{item.username}</Text>
                    <Text style={styles.time}>{formatTime(item.at)}</Text>
                  </View>
                  <Text style={styles.body}>{item.text}</Text>
                </View>
              </View>
            )
          }
        />

        {!pinnedBottom && unseen > 0 ? (
          <Pressable
            style={styles.jump}
            onPress={() => {
              setPinnedBottom(true);
              setUnseen(0);
              listRef.current?.scrollToEnd({ animated: true });
            }}
            hitSlop={8}
          >
            <Text style={styles.jumpText}>{unseen} yeni mesaj</Text>
          </Pressable>
        ) : null}

        <View style={styles.inputRow}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="Bir mesaj yaz…"
            placeholderTextColor="#5A6A7C"
            style={styles.input}
            returnKeyType="send"
            onSubmitEditing={submit}
            maxLength={500}
            onFocus={() => onInputFocusChange?.(true)}
            onBlur={() => onInputFocusChange?.(false)}
          />
          <Pressable
            onPress={submit}
            hitSlop={8}
            style={({ pressed }) => [styles.sendBtn, { opacity: pressed ? 0.8 : 1 }]}
            accessibilityLabel="Gönder"
          >
            <Ionicons name="send" size={16} color="#04110E" />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  expandedWrap: {
    width: '100%',
    minHeight: 180,
  },
  card: {
    flex: 1,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(14,20,32,0.42)',
  },
  handleHit: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    minHeight: 36,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  handleHint: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.35)',
    fontSize: 10,
    fontWeight: '600',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingBottom: 6,
    gap: 8,
  },
  cardTitle: { color: '#F4F7FB', fontWeight: '800', fontSize: 15 },
  cardMeta: { flex: 1, color: '#7A8A9C', fontSize: 11 },
  headerActions: { flexDirection: 'row', gap: 4 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  list: { flex: 1 },
  listContent: { paddingHorizontal: spacing.md, paddingBottom: 8, gap: 8 },
  empty: {
    textAlign: 'center',
    color: '#7A8A9C',
    marginTop: 24,
    fontSize: 13,
  },
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  avatar: { width: 28, height: 28, borderRadius: 14 },
  avatarFallback: {
    backgroundColor: `${SCREEN_SHARE_ACCENT}33`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: '#fff', fontSize: 11, fontWeight: '800' },
  bubble: { flex: 1, gap: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  user: { color: SCREEN_SHARE_ACCENT, fontSize: 12, fontWeight: '800' },
  time: { color: '#5A6A7C', fontSize: 10 },
  body: { color: '#E8EEF5', fontSize: 14, lineHeight: 19 },
  system: {
    textAlign: 'center',
    color: '#9AA8BC',
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 4,
  },
  jump: {
    alignSelf: 'center',
    marginBottom: 6,
    backgroundColor: SCREEN_SHARE_ACCENT,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  jumpText: { color: '#04110E', fontWeight: '800', fontSize: 12 },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    paddingTop: 4,
  },
  input: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(8,12,18,0.35)',
    color: '#F4F7FB',
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  sendBtn: {
    width: 44,
    minHeight: 42,
    borderRadius: 14,
    backgroundColor: SCREEN_SHARE_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  collapsed: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(14,20,32,0.55)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  collapsedText: { color: '#E8EEF5', fontWeight: '700', fontSize: 13 },
  fab: {
    position: 'absolute',
    right: 16,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: SCREEN_SHARE_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 30,
  },
  fabBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#C62828',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  fabBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
});
