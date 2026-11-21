import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { VV_ACCENT } from '../constants';
import {
  addVvComment,
  deleteVvComment,
  listVvComments,
  toggleVvCommentLike,
} from '../services/api';
import { vvRelativeTime } from '../services/format';
import type { VvComment } from '../types';

type Props = {
  visible: boolean;
  onClose: () => void;
  videoId: string;
  commentCount: number;
  onCommentAdded?: () => void;
};

const PAGE_SIZE = 20;

function Avatar({ uri, name }: { uri: string | null; name: string }) {
  const { colors } = useTheme();
  if (uri) return <Image source={{ uri }} style={styles.avatar} />;
  return (
    <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: colors.border }]}>
      <Text variant="caption" style={{ color: colors.text }}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

export function VoraVideoCommentSheet({
  visible,
  onClose,
  videoId,
  commentCount,
  onCommentAdded,
}: Props) {
  const { colors } = useTheme();
  const [comments, setComments] = useState<VvComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [replyTo, setReplyTo] = useState<VvComment | null>(null);
  const [total, setTotal] = useState(commentCount);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [replies, setReplies] = useState<Record<string, VvComment[]>>({});
  const [replyBusy, setReplyBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const result = await listVvComments(videoId, { limit: PAGE_SIZE });
    if (result.error) {
      setLoading(false);
      Alert.alert('Yorumlar yüklenemedi', result.error);
      return;
    }
    const rows = result.data ?? [];
    setComments(rows);
    setHasMore(rows.length === PAGE_SIZE);
    setCursor(rows.length > 0 ? rows[rows.length - 1].created_at : null);
    setLoading(false);
  }, [videoId]);

  useEffect(() => {
    if (!visible) return;
    setTotal(commentCount);
    void reload();
  }, [commentCount, reload, visible]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !cursor) return;
    setLoadingMore(true);
    const result = await listVvComments(videoId, { limit: PAGE_SIZE, before: cursor });
    if (!result.error && result.data) {
      const rows = result.data;
      setComments((prev) => [...prev, ...rows]);
      setHasMore(rows.length === PAGE_SIZE);
      if (rows.length > 0) setCursor(rows[rows.length - 1].created_at);
    }
    setLoadingMore(false);
  }, [cursor, hasMore, loadingMore, videoId]);

  const loadReplies = useCallback(async (parentId: string) => {
    setReplyBusy(parentId);
    const result = await listVvComments(videoId, { limit: 50, parentId });
    if (!result.error && result.data) {
      setReplies((prev) => ({ ...prev, [parentId]: result.data ?? [] }));
    }
    setReplyBusy(null);
  }, [videoId]);

  const toggleReplies = useCallback(
    (comment: VvComment) => {
      const willOpen = !expanded[comment.id];
      setExpanded((prev) => ({ ...prev, [comment.id]: willOpen }));
      if (willOpen && !replies[comment.id]) void loadReplies(comment.id);
    },
    [expanded, loadReplies, replies],
  );

  const handleLike = useCallback(async (comment: VvComment) => {
    const optimistic: VvComment = {
      ...comment,
      is_liked: !comment.is_liked,
      like_count: comment.like_count + (comment.is_liked ? -1 : 1),
    };
    const apply = (row: VvComment) =>
      setComments((prev) => prev.map((item) => (item.id === comment.id ? row : item)));
    apply(optimistic);
    setReplies((prev) => {
      const next: Record<string, VvComment[]> = {};
      for (const key of Object.keys(prev)) {
        next[key] = prev[key].map((item) => (item.id === comment.id ? optimistic : item));
      }
      return next;
    });
    const result = await toggleVvCommentLike(comment.id);
    if (result.error || !result.data) {
      apply(comment);
      return;
    }
    const confirmed = { ...optimistic, is_liked: result.data.liked, like_count: result.data.like_count };
    apply(confirmed);
    setReplies((prev) => {
      const next: Record<string, VvComment[]> = {};
      for (const key of Object.keys(prev)) {
        next[key] = prev[key].map((item) => (item.id === comment.id ? confirmed : item));
      }
      return next;
    });
  }, []);

  const handleSend = useCallback(async () => {
    const body = draft.trim();
    if (body.length < 1) return;
    setPosting(true);
    const result = await addVvComment(videoId, body, replyTo?.id ?? null);
    if (result.error) {
      setPosting(false);
      Alert.alert('Yorum gönderilemedi', result.error);
      return;
    }
    setDraft('');
    if (replyTo) {
      const parentId = replyTo.id;
      setReplyTo(null);
      setExpanded((prev) => ({ ...prev, [parentId]: true }));
      await loadReplies(parentId);
      setTotal((prev) => prev + 1);
    } else {
      await reload();
      setTotal((prev) => prev + 1);
    }
    setPosting(false);
    onCommentAdded?.();
  }, [draft, loadReplies, onCommentAdded, reload, replyTo, videoId]);

  const handleDelete = useCallback(
    (comment: VvComment) => {
      Alert.alert('Yorumu sil', 'Bu yorumu kalıcı olarak silmek istiyor musun?', [
        { text: 'Vazgeç', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteVvComment(comment.id);
            if (result.error) {
              Alert.alert('Silinemedi', result.error);
              return;
            }
            setComments((prev) => prev.filter((item) => item.id !== comment.id));
            setTotal((prev) => Math.max(0, prev - 1));
            if (result.data) onCommentAdded?.();
          },
        },
      ]);
    },
    [onCommentAdded],
  );

  const headerTitle = useMemo(
    () => `${total.toLocaleString('tr-TR')} yorum`,
    [total],
  );

  const renderComment = useCallback(
    (comment: VvComment, isReply = false) => {
      const isOpen = expanded[comment.id] === true;
      const replyRows = replies[comment.id] ?? [];
      return (
        <View key={comment.id} style={[styles.comment, isReply && styles.replyIndent]}>
          <Avatar uri={comment.author_avatar_url} name={comment.author_username} />
          <View style={styles.commentBody}>
            <View style={styles.commentHead}>
              <Text variant="caption" style={styles.author}>
                {comment.author_full_name || comment.author_username}
                {comment.author_is_verified ? '  ✓' : ''}
              </Text>
              <Text variant="caption" muted>
                {vvRelativeTime(comment.created_at)}
              </Text>
            </View>
            <Text variant="body" style={styles.commentText}>
              {comment.body}
            </Text>
            <View style={styles.commentActions}>
              <Pressable onPress={() => void handleLike(comment)} hitSlop={8} style={styles.action}>
                <Ionicons
                  name={comment.is_liked ? 'heart' : 'heart-outline'}
                  size={15}
                  color={comment.is_liked ? VV_ACCENT : colors.textMuted}
                />
                <Text variant="caption" muted>
                  {comment.like_count > 0 ? comment.like_count : ''}
                </Text>
              </Pressable>
              {!isReply ? (
                <Pressable onPress={() => setReplyTo(comment)} hitSlop={8} style={styles.action}>
                  <Ionicons name="chatbubble-outline" size={14} color={colors.textMuted} />
                  <Text variant="caption" muted>
                    Yanıtla
                  </Text>
                </Pressable>
              ) : null}
              {!isReply && comment.reply_count > 0 ? (
                <Pressable onPress={() => toggleReplies(comment)} hitSlop={8} style={styles.action}>
                  <Ionicons
                    name={isOpen ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color={colors.textMuted}
                  />
                  <Text variant="caption" muted>
                    {comment.reply_count} yanıt
                  </Text>
                </Pressable>
              ) : null}
              {comment.is_mine ? (
                <Pressable onPress={() => handleDelete(comment)} hitSlop={8} style={styles.action}>
                  <Ionicons name="trash-outline" size={14} color={colors.textMuted} />
                </Pressable>
              ) : null}
            </View>
            {isOpen && !isReply ? (
              <View style={styles.replies}>
                {replyBusy === comment.id && replyRows.length === 0 ? (
                  <ActivityIndicator size="small" color={VV_ACCENT} />
                ) : (
                  replyRows.map((reply) => renderComment(reply, true))
                )}
              </View>
            ) : null}
          </View>
        </View>
      );
    },
    [
      colors.textMuted,
      expanded,
      handleDelete,
      handleLike,
      replyBusy,
      replies,
      toggleReplies,
    ],
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}
        >
          <View style={[styles.sheet, { backgroundColor: colors.surfaceElevated }]}>
            <View style={styles.head}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
              <View style={styles.headRow}>
                <Text variant="h3">{headerTitle}</Text>
                <Pressable onPress={onClose} hitSlop={10}>
                  <Ionicons name="close" size={22} color={colors.text} />
                </Pressable>
              </View>
            </View>

            {loading ? (
              <View style={styles.center}>
                <ActivityIndicator color={VV_ACCENT} />
              </View>
            ) : (
              <FlatList
                data={comments}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => renderComment(item)}
                contentContainerStyle={styles.listContent}
                onEndReachedThreshold={0.4}
                onEndReached={() => void loadMore()}
                ListEmptyComponent={
                  <View style={styles.center}>
                    <Ionicons name="chatbubbles-outline" size={34} color={colors.textMuted} />
                    <Text variant="caption" muted>
                      Henüz yorum yok. İlk yorumu sen yaz.
                    </Text>
                  </View>
                }
                ListFooterComponent={
                  loadingMore ? (
                    <ActivityIndicator style={styles.footerLoader} color={VV_ACCENT} />
                  ) : null
                }
                keyboardShouldPersistTaps="handled"
              />
            )}

            {replyTo ? (
              <View style={[styles.replyBanner, { borderColor: colors.border }]}>
                <Text variant="caption" muted numberOfLines={1} style={styles.flex}>
                  {replyTo.author_username} kullanıcısına yanıt veriyorsun
                </Text>
                <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              </View>
            ) : null}

            <View style={[styles.composer, { borderColor: colors.border }]}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={replyTo ? 'Yanıt yaz…' : 'Yorum ekle…'}
                placeholderTextColor={colors.textMuted}
                style={[styles.input, { color: colors.text }]}
                multiline
                maxLength={2000}
              />
              <Pressable
                disabled={posting || draft.trim().length === 0}
                onPress={() => void handleSend()}
                style={[
                  styles.sendButton,
                  (posting || draft.trim().length === 0) && styles.ctaDisabled,
                ]}
              >
                {posting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Ionicons name="send" size={16} color="#FFFFFF" />
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheetWrap: { maxHeight: '88%' },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    maxHeight: '100%',
  },
  head: { paddingHorizontal: spacing.lg },
  handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, marginBottom: spacing.sm },
  headRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listContent: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.md },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  footerLoader: { paddingVertical: spacing.md },
  comment: { flexDirection: 'row', gap: spacing.sm },
  replyIndent: { marginLeft: spacing.xl, marginTop: spacing.md },
  avatar: { width: 34, height: 34, borderRadius: 17 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  commentBody: { flex: 1, gap: 2 },
  commentHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  author: { fontWeight: '600' },
  commentText: { lineHeight: 20 },
  commentActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 4 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  replies: { marginTop: spacing.xs },
  replyBanner: {
    marginHorizontal: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  flex: { flex: 1 },
  composer: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.xs,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  input: { flex: 1, maxHeight: 96, minHeight: 34, paddingVertical: spacing.xs, fontSize: 15 },
  sendButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: VV_ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: { opacity: 0.45 },
});
