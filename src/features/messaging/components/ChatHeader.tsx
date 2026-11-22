import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { isHiddenPublicAccount } from '@/features/account-deletion/utils';
import { PremiumCallGateSheet } from '@/features/calls/components/PremiumCallGateSheet';
import { usePremiumOutgoingCall } from '@/features/calls/hooks/usePremiumOutgoingCall';
import { PlatformCharmTick } from '@/features/platform-charm/components/PlatformCharmTick';
import { PioneerBadge } from '@/features/pioneer/components/PioneerBadge';
import { PlatformSupporterTick } from '@/features/platform-support/components/PlatformSupporterTick';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/providers/ThemeProvider';
import type { ConversationDetail } from '../types';
import {
  displayParticipantName,
  formatPresence,
  groupMemberLabel,
  participantAvatarUrl,
} from '../utils';
import { useChatTheme } from '../hooks/useChatTheme';
import { usePresenceClock } from '../hooks/usePresenceClock';
import { useFeatureVisible } from '@/features/feature-flags/hooks/useFeatureVisible';
import { MESSAGING_FEATURE } from '@/features/messaging/featureFlags';
import { TIP_ACCENT, TipSheet, useTipAllowed } from '@/features/tips';
import { ChatHeaderMenuSheet, type ChatHeaderMenuItem } from './ChatHeaderMenuSheet';

const TOOLBAR_HEIGHT = 52;
const AVATAR_SIZE = 36;
const ACTION_SIZE = 40;

type ChatHeaderProps = {
  conversation: ConversationDetail;
  typingLabel?: string | null;
  onSearchPress?: () => void;
  onGalleryPress?: () => void;
  onWallpaperPress?: () => void;
  onMenuPress?: () => void;
  hideCalls?: boolean;
  /** Arka plan üstünde — şeffaf header */
  transparent?: boolean;
};

function HeaderAction({
  icon,
  color,
  onPress,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  if (!onPress) return null;
  return (
    <Pressable
      style={({ pressed }) => [styles.iconBtn, pressed && styles.iconBtnPressed]}
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Ionicons name={icon} size={22} color={color} />
    </Pressable>
  );
}

export function ChatHeader({
  conversation,
  typingLabel,
  onSearchPress,
  onGalleryPress,
  onWallpaperPress,
  onMenuPress,
  hideCalls = false,
  transparent = false,
}: ChatHeaderProps) {
  const { colors } = useTheme();
  const chat = useChatTheme();
  const presenceClock = usePresenceClock();
  const showChatSearch = useFeatureVisible(MESSAGING_FEATURE.chatSearch);
  const showChatGallery = useFeatureVisible(MESSAGING_FEATURE.chatGallery);
  const showAudioCall = useFeatureVisible(MESSAGING_FEATURE.chatAudioCall);
  const showVideoCall = useFeatureVisible(MESSAGING_FEATURE.chatVideoCall);
  const showChatMenu = useFeatureVisible(MESSAGING_FEATURE.chatMenu);
  const showGroupInfo = useFeatureVisible(MESSAGING_FEATURE.chatGroupInfo);
  const { initiateOutgoingCall, gateVisible, gateCallType, closeGate } = usePremiumOutgoingCall();
  const [menuOpen, setMenuOpen] = useState(false);
  const [tipOpen, setTipOpen] = useState(false);
  const isGroup = conversation.type === 'group';
  const otherUser = conversation.otherUser;
  const otherAvatarUrl = participantAvatarUrl(otherUser);
  const tipRecipient =
    !isGroup && otherUser && !isHiddenPublicAccount(otherUser.account_status) ? otherUser : null;
  const tipAllowed = useTipAllowed(tipRecipient?.id, 'message');

  const title = isGroup
    ? (conversation.title ?? 'Grup Sohbeti')
    : displayParticipantName(conversation.otherUser);

  const presence = conversation.otherUser
    ? formatPresence(
        conversation.otherUser.last_seen_at,
        conversation.otherUser.is_online,
        conversation.otherUser.last_active_at,
      )
    : null;
  void presenceClock;

  const subtitle = typingLabel
    ? typingLabel
    : isGroup
      ? groupMemberLabel(conversation.memberCount)
      : presence
        ? presence.label
        : conversation.type;

  const presenceColor =
    presence?.tone === 'online'
      ? colors.success
      : presence?.tone === 'recent'
        ? colors.warning
        : colors.textMuted;

  const handleHeaderPress = () => {
    if (isGroup) {
      router.push(`/chat/${conversation.id}/group`);
      return;
    }
    if (conversation.otherUser) {
      router.push(`/user/${conversation.otherUser.id}`);
    }
  };

  const handleCall = (callType: 'audio' | 'video') => {
    if (!conversation.otherUser) return;
    void initiateOutgoingCall(conversation.otherUser.id, callType);
  };

  // Header'da yer kalmayan aksiyonlar tek taşma menüsünde toplanır.
  const menuItems: ChatHeaderMenuItem[] = [];
  if (showChatSearch && onSearchPress) {
    menuItems.push({
      key: 'search',
      label: 'Mesajlarda ara',
      icon: 'search-outline',
      onPress: onSearchPress,
    });
  }
  if (showChatGallery && onGalleryPress) {
    menuItems.push({
      key: 'gallery',
      label: 'Medya ve galeri',
      icon: 'images-outline',
      onPress: onGalleryPress,
    });
  }
  if (onWallpaperPress) {
    menuItems.push({
      key: 'wallpaper',
      label: 'Duvar kağıdı',
      description: 'Arka plan ve baloncuk rengi',
      icon: 'color-palette-outline',
      onPress: onWallpaperPress,
    });
  }
  if (isGroup && showGroupInfo) {
    menuItems.push({
      key: 'group-info',
      label: 'Grup bilgisi',
      icon: 'information-circle-outline',
      onPress: handleHeaderPress,
    });
  }
  if (onMenuPress && showChatMenu) {
    menuItems.push({
      key: 'actions',
      label: 'Sohbet işlemleri',
      description: 'Geçmişi temizle, sil, engelle',
      icon: 'ellipsis-horizontal-circle-outline',
      onPress: onMenuPress,
    });
  }

  if (tipRecipient && tipAllowed) {
    menuItems.push({
      key: 'tip',
      label: 'Bahşiş gönder',
      description: 'Gönüllü destek',
      icon: 'gift-outline',
      tint: TIP_ACCENT,
      onPress: () => setTipOpen(true),
    });
  }

  const hasMenu = menuItems.length > 0;

  return (
    <>
      <View
        style={[
          styles.shell,
          {
            backgroundColor: transparent ? 'transparent' : chat.headerBg,
            borderBottomColor: transparent ? 'transparent' : chat.headerBorder,
            borderBottomWidth: transparent ? 0 : StyleSheet.hairlineWidth,
          },
        ]}
      >
        <Pressable style={styles.back} onPress={() => router.back()} hitSlop={4}>
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </Pressable>

        <Pressable style={styles.center} onPress={handleHeaderPress}>
          {isGroup ? (
            <View style={[styles.avatar, { backgroundColor: colors.surfaceElevated }]}>
              {conversation.avatarUrl ? (
                <Image source={{ uri: conversation.avatarUrl }} style={styles.avatarImage} />
              ) : (
                <Ionicons name="people" size={18} color={colors.primary} />
              )}
            </View>
          ) : otherUser ? (
            <View style={[styles.avatar, { backgroundColor: colors.surfaceElevated }]}>
              {isHiddenPublicAccount(otherUser.account_status) ? (
                <Ionicons name="person-remove-outline" size={18} color={colors.danger} />
              ) : otherAvatarUrl ? (
                <Image source={{ uri: otherAvatarUrl }} style={styles.avatarImage} />
              ) : (
                <Text variant="label" style={{ color: colors.primary }}>
                  {displayParticipantName(otherUser).slice(0, 1).toUpperCase()}
                </Text>
              )}
            </View>
          ) : null}
          <View style={styles.titleBlock}>
            <View style={styles.nameRow}>
              <Text variant="label" numberOfLines={1} style={styles.title}>
                {title}
              </Text>
              {!isGroup && conversation.otherUser?.is_verified ? (
                <Ionicons name="checkmark-circle" size={14} color={colors.primary} />
              ) : null}
              {!isGroup && conversation.otherUser?.is_platform_charm ? (
                <PlatformCharmTick gender={conversation.otherUser.gender} />
              ) : null}
              {!isGroup && conversation.otherUser?.is_pioneer ? <PioneerBadge compact /> : null}
              {!isGroup && conversation.otherUser?.is_platform_supporter ? (
                <PlatformSupporterTick />
              ) : null}
            </View>
            <View style={styles.subtitleRow}>
              {!isGroup && presence && !typingLabel ? (
                <View style={[styles.presenceDot, { backgroundColor: presenceColor }]} />
              ) : null}
              <Text
                variant="caption"
                numberOfLines={1}
                style={{ color: typingLabel ? colors.primary : colors.textSecondary }}
              >
                {subtitle}
              </Text>
            </View>
          </View>
        </Pressable>

        <View style={styles.actions}>
          {!isGroup && conversation.otherUser && !hideCalls ? (
            <>
              <HeaderAction
                icon="call-outline"
                color={colors.primary}
                accessibilityLabel="Sesli ara"
                onPress={showAudioCall ? () => handleCall('audio') : undefined}
              />
              <HeaderAction
                icon="videocam-outline"
                color={colors.accent}
                accessibilityLabel="Görüntülü ara"
                onPress={showVideoCall ? () => handleCall('video') : undefined}
              />
            </>
          ) : null}
          {hasMenu ? (
            <HeaderAction
              icon="ellipsis-vertical"
              color={colors.textSecondary}
              accessibilityLabel="Sohbet menüsü"
              onPress={() => setMenuOpen(true)}
            />
          ) : null}
        </View>
      </View>

      <ChatHeaderMenuSheet
        visible={menuOpen}
        title={title}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
      />
      {tipRecipient && tipAllowed ? (
        <TipSheet
          visible={tipOpen}
          onClose={() => setTipOpen(false)}
          recipientId={tipRecipient.id}
          recipientName={displayParticipantName(tipRecipient)}
          surface="message"
          contextId={conversation.id}
          returnPath={`chat/${conversation.id}`}
        />
      ) : null}
      <PremiumCallGateSheet visible={gateVisible} callType={gateCallType} onClose={closeGate} />
    </>
  );
}

const styles = StyleSheet.create({
  shell: {
    height: TOOLBAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  back: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + 2,
    minWidth: 0,
    paddingRight: spacing.xs,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  titleBlock: {
    flex: 1,
    gap: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  presenceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    gap: 2,
  },
  iconBtn: {
    width: ACTION_SIZE,
    height: ACTION_SIZE,
    borderRadius: ACTION_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPressed: {
    opacity: 0.6,
  },
});
