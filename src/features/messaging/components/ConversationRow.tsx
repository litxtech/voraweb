import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { OptimizedImage } from '@/components/media/OptimizedImage';
import { getAndroidInstantPressableProps } from '@/lib/device/androidPerfProfile';
import { Ionicons } from '@expo/vector-icons';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';
import type { ConversationListItem } from '../types';
import {
  conversationAvatar,
  conversationTitle,
  formatConversationDraftPreview,
  formatMessageTime,
  groupMemberLabel,
} from '../utils';

type ConversationRowProps = {
  item: ConversationListItem;
  unreadCount?: number;
  draftText?: string | null;
  onPress: () => void;
  onPressIn?: () => void;
  onLongPress?: () => void;
  subtitlePrefix?: string;
};

/** Avatar ölçüsü — satır aralığı ve ayırıcı girintisi bununla hesaplanır. */
export const CONVERSATION_AVATAR_SIZE = 54;

export const ConversationRow = memo(function ConversationRow({
  item,
  unreadCount,
  draftText,
  onPress,
  onPressIn,
  onLongPress,
  subtitlePrefix,
}: ConversationRowProps) {
  const { colors } = useTheme();
  const title = conversationTitle(item);
  const avatar = conversationAvatar(item);
  const isGroup = item.type === 'group';
  const effectiveUnread = unreadCount ?? item.unreadCount;
  const hasUnread = effectiveUnread > 0;
  const hasDraft = Boolean(draftText?.trim());
  const draftPreview = hasDraft ? formatConversationDraftPreview(draftText!) : null;
  const initials = title
    .replace('@', '')
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const previewText =
    draftPreview ??
    item.lastMessagePreview ??
    (isGroup ? groupMemberLabel(item.memberCount) : 'Henüz mesaj yok');

  return (
    <Pressable
      // Kart görünümü yok: Instagram DM listesi gibi düz satır.
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
      onPress={onPress}
      onPressIn={onPressIn}
      onLongPress={onLongPress}
      {...getAndroidInstantPressableProps()}
    >
      <View style={[styles.avatar, { backgroundColor: colors.surfaceElevated }]}>
        {avatar ? (
          <OptimizedImage
            uri={avatar}
            tier="avatar"
            layoutWidth={CONVERSATION_AVATAR_SIZE}
            recyclingKey={item.id}
            style={styles.avatarImage}
            transition={0}
          />
        ) : isGroup ? (
          <Ionicons name="people" size={24} color={colors.primary} />
        ) : (
          <Text variant="label" style={{ color: colors.primary }}>
            {initials}
          </Text>
        )}
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          {item.isPinned ? <Ionicons name="pin" size={12} color={colors.textMuted} /> : null}
          <Text
            numberOfLines={1}
            style={[styles.title, hasUnread ? styles.titleUnread : null, { color: colors.text }]}
          >
            {title}
          </Text>
          {isGroup ? (
            <Ionicons name="people-outline" size={13} color={colors.textMuted} />
          ) : null}
          {item.isMuted ? (
            <Ionicons name="volume-mute" size={13} color={colors.textMuted} />
          ) : null}
        </View>
        <View style={styles.previewRow}>
          <Text
            numberOfLines={1}
            style={[
              styles.preview,
              hasDraft
                ? styles.previewDraft
                : { color: hasUnread ? colors.text : colors.textSecondary },
              hasUnread && !hasDraft ? styles.previewUnread : null,
            ]}
          >
            {subtitlePrefix}
            {previewText}
          </Text>
          {item.lastMessageAt ? (
            <Text
              style={[
                styles.time,
                { color: hasUnread ? colors.text : colors.textMuted },
                hasUnread ? styles.timeUnread : null,
              ]}
            >
              {formatMessageTime(item.lastMessageAt)}
            </Text>
          ) : null}
        </View>
      </View>

      {hasUnread ? <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} /> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    minHeight: 68,
  },
  rowPressed: {
    opacity: 0.6,
  },
  avatar: {
    width: CONVERSATION_AVATAR_SIZE,
    height: CONVERSATION_AVATAR_SIZE,
    borderRadius: CONVERSATION_AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  title: {
    flexShrink: 1,
    fontSize: 15,
    lineHeight: 20,
  },
  titleUnread: {
    fontWeight: '700',
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  preview: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
  },
  previewUnread: {
    fontWeight: '600',
  },
  previewDraft: {
    color: '#25A366',
    fontStyle: 'italic',
  },
  time: {
    fontSize: 12,
    lineHeight: 16,
  },
  timeUnread: {
    fontWeight: '700',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 2,
  },
});
