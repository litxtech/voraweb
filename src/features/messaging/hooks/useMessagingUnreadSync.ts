import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/providers/AuthProvider';
import { deferBackgroundWork } from '@/lib/ui/deferUntilUiIdle';
import {
  markRemoteMessagePushReceived,
  scheduleMessageNotificationFallback,
  syncCombinedAppBadge,
} from '@/lib/notifications/messageNotificationBridge';
import { handleIncomingNotificationSound } from '@/lib/notifications/notificationSound';
import { supabase } from '@/lib/supabase/client';
import { refreshMessagingUnreadFromServer } from '../services/messagingUnreadRefresh';
import { subscribeInboxRealtime } from '../services/inboxRealtime';
import { useMessagingStore } from '../store/messagingStore';
import { messagePreviewFromRow, type IncomingMessageRow } from '../utils/inboxUpdates';

type SenderProfileRow = { full_name: string | null; username: string | null; avatar_url: string | null };
type ConversationMetaRow = { type: string | null; title: string | null };

const META_TTL_MS = 5 * 60 * 1000;
const META_CACHE_MAX = 300;
const senderCache = new Map<string, { at: number; row: SenderProfileRow | null }>();
const conversationCache = new Map<string, { at: number; row: ConversationMetaRow | null }>();

function trimMetaCache<T>(cache: Map<string, { at: number; row: T }>): void {
  if (cache.size <= META_CACHE_MAX) return;
  const oldest = cache.keys().next();
  if (!oldest.done) cache.delete(oldest.value);
}

/**
 * Gelen her mesaj için 2 ayrı profil/konuşma sorgusu atılıyordu. Gönderen adı ve
 * grup başlığı nadiren değişir — kısa TTL'li önbellek sorguları tekilleştirir.
 */
async function loadSenderProfile(userId: string): Promise<SenderProfileRow | null> {
  const cached = senderCache.get(userId);
  if (cached && Date.now() - cached.at < META_TTL_MS) return cached.row;

  const { data } = await supabase
    .from('profiles')
    .select('full_name, username, avatar_url')
    .eq('id', userId)
    .maybeSingle();

  const row = (data as SenderProfileRow | null) ?? null;
  senderCache.set(userId, { at: Date.now(), row });
  trimMetaCache(senderCache);
  return row;
}

async function loadConversationMeta(conversationId: string): Promise<ConversationMetaRow | null> {
  const cached = conversationCache.get(conversationId);
  if (cached && Date.now() - cached.at < META_TTL_MS) return cached.row;

  const { data } = await supabase
    .from('conversations')
    .select('type, title')
    .eq('id', conversationId)
    .maybeSingle();

  const row = (data as ConversationMetaRow | null) ?? null;
  conversationCache.set(conversationId, { at: Date.now(), row });
  trimMetaCache(conversationCache);
  return row;
}

async function resolveMessageNotificationTitle(row: IncomingMessageRow): Promise<{
  title: string;
  senderName: string;
  isGroup: boolean;
  avatarUrl: string | null;
}> {
  const [profile, conversation] = await Promise.all([
    loadSenderProfile(row.sender_id),
    loadConversationMeta(row.conversation_id),
  ]);

  const isGroup = conversation?.type === 'group';
  const senderName =
    profile?.full_name?.trim() ||
    (profile?.username ? `@${profile.username}` : null) ||
    'Birisi';

  if (isGroup) {
    return {
      title: conversation?.title?.trim() || 'Grup mesajı',
      senderName,
      isGroup: true,
      avatarUrl: profile?.avatar_url ?? null,
    };
  }

  return {
    title: senderName,
    senderName,
    isGroup: false,
    avatarUrl: profile?.avatar_url ?? null,
  };
}

/** Keeps tab-bar unread badge in sync while any tab is visible. */
export function useMessagingUnreadSync() {
  const { user } = useAuth();
  const setUnreadFromConversations = useMessagingStore((s) => s.setUnreadFromConversations);
  const incrementConversationUnread = useMessagingStore((s) => s.incrementConversationUnread);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevActiveConversationRef = useRef<string | null>(null);
  const activeConversationId = useMessagingStore((s) => s.activeConversationId);

  const syncFromServer = useCallback(async () => {
    if (!user?.id) {
      setUnreadFromConversations([]);
      return;
    }
    try {
      await refreshMessagingUnreadFromServer(user.id);
    } catch {
      // ignore transient fetch errors
    }
  }, [setUnreadFromConversations, user?.id]);

  const syncFromServerRef = useRef(syncFromServer);
  syncFromServerRef.current = syncFromServer;

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => {
      // Arka planda tam konuşma listesi çekmenin faydası yok.
      if (AppState.currentState !== 'active') return;
      void syncFromServerRef.current();
    }, 900);
  }, []);

  const handleIncomingMessage = useCallback(
    (row: IncomingMessageRow) => {
      if (!user?.id || row.sender_id === user.id) return;
      const activeId = useMessagingStore.getState().activeConversationId;
      if (activeId === row.conversation_id) return;

      incrementConversationUnread(row.conversation_id);
      scheduleRefresh();

      const preview = messagePreviewFromRow(row);
      const userId = user.id;

      void syncCombinedAppBadge(userId);

      void (async () => {
        const { title, senderName, isGroup, avatarUrl } = await resolveMessageNotificationTitle(row);
        const body = isGroup ? `${senderName}: ${preview}` : preview;
        const eventType = isGroup ? 'group_message' : 'message';

        if (AppState.currentState === 'active') {
          void handleIncomingNotificationSound({
            notificationId: row.id ?? `${row.conversation_id}:${row.created_at}`,
            eventType,
          });
        }

        scheduleMessageNotificationFallback({
          conversationId: row.conversation_id,
          messageId: row.id,
          title,
          body,
          isGroup,
          avatarUrl,
          senderName,
          userId,
        });
      })();
    },
    [incrementConversationUnread, scheduleRefresh, user?.id],
  );

  useEffect(() => {
    const task = deferBackgroundWork(() => {
      void syncFromServerRef.current();
    });
    return () => task.cancel();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const userId = user.id;
    let inboxCleanup: (() => void) | null = null;
    let cancelled = false;
    let connectTask: { cancel: () => void } | null = null;

    const disconnect = async () => {
      inboxCleanup?.();
      inboxCleanup = null;
    };

    const connect = () => {
      if (cancelled || AppState.currentState !== 'active') return;

      connectTask?.cancel();
      connectTask = deferBackgroundWork(() => {
        if (cancelled || AppState.currentState !== 'active') return;

        inboxCleanup = subscribeInboxRealtime(userId, {
          onMessage: handleIncomingMessage,
          onConversationUpdate: scheduleRefresh,
          onMemberUpdate: scheduleRefresh,
        });
      });
    };

    connect();

    const appSub = AppState.addEventListener('change', (state) => {
      if (!userId) return;
      if (state === 'active') {
        void syncFromServerRef.current();
        connect();
        return;
      }
      if (state === 'background' || state === 'inactive') {
        void syncCombinedAppBadge(userId);
        connectTask?.cancel();
        void disconnect();
      }
    });

    return () => {
      cancelled = true;
      connectTask?.cancel();
      appSub.remove();
      void disconnect();
    };
  }, [handleIncomingMessage, scheduleRefresh, user?.id]);

  useEffect(() => {
    const prev = prevActiveConversationRef.current;
    prevActiveConversationRef.current = activeConversationId;

    if (activeConversationId) {
      return;
    }

    if (prev) {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
      leaveTimer.current = setTimeout(() => {
        void syncFromServerRef.current();
      }, 500);
    }

    return () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    };
  }, [activeConversationId]);

  useEffect(() => {
    if (!user?.id) return;

    const userId = user.id;
    let prevUnread = useMessagingStore.getState().totalUnread;

    return useMessagingStore.subscribe((state) => {
      if (state.totalUnread === prevUnread) return;
      prevUnread = state.totalUnread;
      void syncCombinedAppBadge(userId);
    });
  }, [user?.id]);

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    [],
  );
}
