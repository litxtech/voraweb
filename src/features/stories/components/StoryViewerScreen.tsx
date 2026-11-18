import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { router, type Href } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StickyKeyboardFooter } from '@/components/keyboard';
import { StoryMusicBadge } from '@/features/stories/components/StoryMusicBadge';
import { StoryMusicInfoSheet } from '@/features/stories/components/StoryMusicInfoSheet';
import { StoryInsightsSheet } from '@/features/stories/components/StoryInsightsSheet';
import { StoryLinkOverlay } from '@/features/stories/components/StoryLinkOverlay';
import { StoryProgressBars } from '@/features/stories/components/StoryProgressBars';
import { StoryReplyBar } from '@/features/stories/components/StoryReplyBar';
import { StoryPeekPreview, StorySlide } from '@/features/stories/components/StorySlide';
import { StoryMediaErrorOverlay } from '@/features/stories/components/StoryMediaErrorOverlay';
import { isStoryImageItem } from '@/features/stories/services/storyMediaUrl';
import { storyCardFrameStyle } from '@/features/stories/utils/storyCardChrome';
import { shouldStackStoryMusicAboveLocation } from '@/features/stories/utils/storyLocation';
import {
  STORY_CARD_BOTTOM_GAP,
  STORY_CARD_HORIZONTAL_INSET,
  STORY_CARD_TOP_GAP,
  STORY_PHOTO_DURATION_MS,
  STORY_SPRING,
  STORY_USER_TRANSITION_MS,
} from '@/features/stories/constants';
import { useStoryAutoAdvance } from '@/features/stories/hooks/useStoryAutoAdvance';
import { useStoryKeyboardHeight } from '@/features/stories/hooks/useStoryKeyboardHeight';
import { useStoryViewerMediaZoom } from '@/features/stories/hooks/useStoryViewerMediaZoom';
import { deleteStoryItem } from '@/features/stories/services/deleteStoryItem';
import {
  dismissCloseDuration,
  dismissOpacity,
  dismissScale,
  shouldDismissOnRelease,
  STORY_DISMISS_SPRING,
} from '@/features/stories/utils/storyDismissAnimation';
import { fetchStoryBundle } from '@/features/stories/services/fetchStoryBundle';
import { prefetchStoryRings } from '@/features/stories/services/storyRingSession';
import { formatStoryTime } from '@/features/stories/utils/formatStoryTime';
import { fetchStoryInsights } from '@/features/stories/services/fetchStoryInsights';
import { recordStoryLinkAction } from '@/features/stories/services/recordStoryLinkAction';
import { recordStoryView } from '@/features/stories/services/recordStoryView';
import { markStoryUserSeen } from '@/features/stories/services/storySeenCache';
import { sendStoryReply } from '@/features/stories/services/sendStoryReply';
import { toggleStoryReaction } from '@/features/stories/services/storyReactions';
import { useStoryRingStore } from '@/features/stories/store/storyRingStore';
import { useStoryViewerStore } from '@/features/stories/store/storyViewerStore';
import type {
  StoryBundle,
  StoryInsights,
  StoryItem,
  StoryMediaStatus,
  StoryNavigation,
} from '@/features/stories/types';
import type { StoryLinkManifest } from '@/features/stories/utils/storyLinks';
import { ProfileAvatar } from '@/features/profile/components/ProfileAvatar';
import { navigateToPublicProfile } from '@/features/profile/services/profileNavigation';
import { Text } from '@/components/ui/Text';
import { useFeedVideoPlaybackStore } from '@/features/feed/store/feedVideoPlaybackStore';
import { prefetchStoryBundleMedia } from '@/features/stories/services/prefetchStoryMedia';
import { ensureReelFeedAudioMode } from '@/features/music/services/audioPreview';
import { spacing } from '@/constants/theme';
import { openUrl } from '@/lib/linking/openUrl';
import { shouldSkipUiBlur } from '@/lib/device/androidPerfProfile';
import { useAuth } from '@/providers/AuthProvider';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - STORY_CARD_HORIZONTAL_INSET * 2;
const SWIPE_THRESHOLD = CARD_WIDTH * 0.22;
const SWIPE_UP_THRESHOLD = 56;

/**
 * Sürükleme ekseni kilidi:
 * 0 = belirsiz, 1 = aşağı (kapat), 2 = yatay (kullanıcı geçişi), 3 = yukarı (link/insights).
 */
const AXIS_NONE = 0;
const AXIS_DOWN = 1;
const AXIS_HORIZONTAL = 2;
const AXIS_UP = 3;

type StoryViewerScreenProps = {
  userId: string;
};

export function StoryViewerScreen({ userId }: StoryViewerScreenProps) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const session = useStoryViewerStore((s) => s.session);
  const bundles = useStoryViewerStore((s) => s.bundles);
  const currentUserIndex = useStoryViewerStore((s) => s.currentUserIndex);
  const currentItemIndex = useStoryViewerStore((s) => s.currentItemIndex);
  const setBundle = useStoryViewerStore((s) => s.setBundle);
  const setCurrentUserIndex = useStoryViewerStore((s) => s.setCurrentUserIndex);
  const setCurrentItemIndex = useStoryViewerStore((s) => s.setCurrentItemIndex);
  const rememberLastSeenItemIndex = useStoryViewerStore((s) => s.rememberLastSeenItemIndex);
  const clearViewer = useStoryViewerStore((s) => s.clear);
  const markRingSeen = useStoryRingStore((s) => s.markUserSeen);

  const [loading, setLoading] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  /** Sürükleme sırasında süre işlemez — IG gibi parmak kalkınca devam eder. */
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [insightsVisible, setInsightsVisible] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insights, setInsights] = useState<StoryInsights | null>(null);
  const [sendingReply, setSendingReply] = useState(false);
  const [reacted, setReacted] = useState(false);
  const [replyBarHeight, setReplyBarHeight] = useState(56);
  const [inputFocused, setInputFocused] = useState(false);
  const [musicInfoOpen, setMusicInfoOpen] = useState(false);
  const [deletingStory, setDeletingStory] = useState(false);
  const [deleteConfirmVisible, setDeleteConfirmVisible] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [closingByGesture, setClosingByGesture] = useState(false);
  const [mediaStatusEntry, setMediaStatusEntry] = useState<{
    key: string | null;
    status: StoryMediaStatus;
  }>({ key: null, status: 'loading' });
  const [mediaRetryToken, setMediaRetryToken] = useState(0);
  const videoProgressRef = useRef({ sec: 0, dur: null as number | null });

  const replyInputRef = useRef<TextInput>(null);
  const inputFocusedRef = useRef(false);

  const closeToFeed = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/(tabs)' as Href);
  }, []);

  useEffect(() => {
    inputFocusedRef.current = inputFocused;
  }, [inputFocused]);

  const dismissReplyKeyboard = useCallback(() => {
    replyInputRef.current?.blur();
    Keyboard.dismiss();
  }, []);

  const keyboardHeight = useStoryKeyboardHeight();
  const keyboardLift = useSharedValue(0);

  useEffect(() => {
    const lift = inputFocused ? keyboardHeight + replyBarHeight : 0;
    keyboardLift.value = withTiming(lift, { duration: 220 });
  }, [inputFocused, keyboardHeight, keyboardLift, replyBarHeight]);

  const slideEnteredAtRef = useRef<number>(Date.now());
  const transitionX = useSharedValue(0);
  const panX = useSharedValue(0);
  const dismissY = useSharedValue(0);
  /** Sürüklemenin başladığı y: animasyon yarım kaldıysa oradan devam edilir. */
  const dragStartY = useSharedValue(0);
  /** 1 = kapatma animasyonu oynuyor; yeni dokunuş animasyonu bozmasın. */
  const dismissingSv = useSharedValue(0);
  /** Sürükleme ekseni — bir kez kilitlenir, titreşimle yön değişmez. */
  const dragAxis = useSharedValue(AXIS_NONE);
  const insightsOpen = useSharedValue(0);
  const isOwnStorySv = useSharedValue(0);
  const hasSingleLinkSv = useSharedValue(0);
  const canGoPrevUserSv = useSharedValue(0);
  const canGoNextUserSv = useSharedValue(0);

  const ringUserIds = session?.ringUserIds ?? [userId];
  const activeUserId = ringUserIds[currentUserIndex] ?? userId;
  const bundle = bundles[activeUserId];
  const items = bundle?.items ?? [];
  const activeItem: StoryItem | null = items[currentItemIndex] ?? null;
  const isOwnStory = !!user?.id && bundle?.authorId === user.id;
  const slideInteractive =
    Boolean(activeItem) && !isPaused && !insightsVisible && !deleteConfirmVisible;
  const activeItemKey = activeItem ? `${activeUserId}-${activeItem.id}` : null;
  const activeIsPhoto = activeItem
    ? isStoryImageItem(activeItem.mediaType, activeItem.mediaUrl)
    : false;

  // Durum aktif öğe anahtarına bağlı: öğe değişince önceki öğenin "ready/error" değeri taşınmaz.
  const mediaStatus: StoryMediaStatus =
    mediaStatusEntry.key === activeItemKey ? mediaStatusEntry.status : 'loading';

  const handleMediaStatusChange = useCallback(
    (status: StoryMediaStatus) => {
      setMediaStatusEntry({ key: activeItemKey, status });
    },
    [activeItemKey],
  );

  useEffect(() => {
    setMediaRetryToken(0);
  }, [activeItemKey]);

  const {
    isZoomed: isMediaZoomed,
    mediaZoomStyle,
    pinchGesture,
    zoomPanGesture,
    doubleTapGesture,
    resetZoom,
  } = useStoryViewerMediaZoom({
    resetKey: activeItem?.id ?? 'none',
    // `isPaused`e bağlanmaz: duraklatma jest ağacını yeniden kurup
    // sürükleme sırasında takılmaya yol açıyordu.
    enabled: Boolean(activeItem),
  });
  const storyMusicAuthor = useMemo(
    () =>
      bundle
        ? {
            userId: bundle.authorId,
            username: bundle.username,
            fullName: bundle.fullName,
            avatarUrl: bundle.avatarUrl,
            isVerified: bundle.isVerified,
          }
        : null,
    [bundle],
  );

  useEffect(() => {
    setMusicInfoOpen(false);
  }, [activeItem?.id]);

  useEffect(() => {
    useFeedVideoPlaybackStore.getState().clear();
    return () => {
      clearViewer();
    };
  }, [clearViewer]);

  useEffect(() => {
    if (!session) {
      useStoryViewerStore.getState().openSession({ ringUserIds: [userId], startUserId: userId });
    }
  }, [ringUserIds, session, userId]);

  const loadBundle = useCallback(
    async (authorId: string) => {
      const data = await fetchStoryBundle(user?.id ?? null, authorId);
      if (data) {
        setBundle(authorId, data);
      }
      return data;
    },
    [setBundle, user?.id],
  );

  useEffect(() => {
    let cancelled = false;
    const hasCachedBundle = Boolean(useStoryViewerStore.getState().bundles[activeUserId]);
    if (!hasCachedBundle) {
      setLoading(true);
    }

    void (async () => {
      const data = await loadBundle(activeUserId);
      if (cancelled) return;
      setLoading(false);
      if (!data || data.items.length === 0) {
        const userIndex = useStoryViewerStore.getState().currentUserIndex;
        if (userIndex < ringUserIds.length - 1) {
          setCurrentUserIndex(userIndex + 1);
        } else {
          closeToFeed();
        }
        return;
      }
      const currentIndex = useStoryViewerStore.getState().currentItemIndex;
      if (currentIndex >= data.items.length) {
        setCurrentItemIndex(Math.max(0, data.items.length - 1));
      }
      const userIndex = useStoryViewerStore.getState().currentUserIndex;
      const prefetchIds = [ringUserIds[userIndex - 1], ringUserIds[userIndex + 1]].filter(
        Boolean,
      ) as string[];
      for (const id of prefetchIds) {
        if (!useStoryViewerStore.getState().bundles[id]) void loadBundle(id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeUserId, closeToFeed, loadBundle, ringUserIds, setCurrentUserIndex]);

  useEffect(() => {
    void ensureReelFeedAudioMode();
  }, []);

  useEffect(() => {
    if (!items.length) return;
    prefetchStoryBundleMedia(items, currentItemIndex);
  }, [currentItemIndex, items]);

  useEffect(() => {
    insightsOpen.value = insightsVisible ? 1 : 0;
  }, [insightsOpen, insightsVisible]);

  useEffect(() => {
    isOwnStorySv.value = isOwnStory ? 1 : 0;
  }, [isOwnStory, isOwnStorySv]);

  useEffect(() => {
    const hasSingle = !isOwnStory && activeItem?.links?.length === 1;
    hasSingleLinkSv.value = hasSingle ? 1 : 0;
  }, [activeItem?.links?.length, hasSingleLinkSv, isOwnStory]);

  useEffect(() => {
    canGoPrevUserSv.value = currentUserIndex > 0 ? 1 : 0;
    canGoNextUserSv.value = currentUserIndex < ringUserIds.length - 1 ? 1 : 0;
  }, [canGoNextUserSv, canGoPrevUserSv, currentUserIndex, ringUserIds.length]);

  useLayoutEffect(() => {
    dismissY.value = 0;
    dragStartY.value = 0;
    dragAxis.value = AXIS_NONE;
    dismissingSv.value = 0;
    panX.value = 0;
    transitionX.value = 0;
  }, [activeUserId, dismissingSv, dismissY, dragStartY, dragAxis, panX, transitionX]);

  useEffect(() => {
    setProgress(0);
    videoProgressRef.current = { sec: 0, dur: null };
    slideEnteredAtRef.current = Date.now();
    setReacted(activeItem?.hasReacted ?? false);
  }, [activeItem?.hasReacted, activeItem?.id]);

  useEffect(() => {
    if (!activeUserId || currentItemIndex < 0) return;
    rememberLastSeenItemIndex(activeUserId, currentItemIndex);
  }, [activeUserId, currentItemIndex, rememberLastSeenItemIndex]);

  const expectedDurationSec = useMemo(() => {
    if (!activeItem) return STORY_PHOTO_DURATION_MS / 1000;
    if (activeItem.mediaType === 'video') return activeItem.durationSec ?? 15;
    return STORY_PHOTO_DURATION_MS / 1000;
  }, [activeItem]);

  const flushView = useCallback(
    async (navigation: StoryNavigation, exitedEarly = false) => {
      if (!user?.id || !activeItem || isOwnStory) return;
      const watchedSeconds = (Date.now() - slideEnteredAtRef.current) / 1000;
      const watchCompletion = Math.min(1, watchedSeconds / Math.max(0.1, expectedDurationSec));
      await recordStoryView({
        viewerId: user.id,
        storyItemId: activeItem.id,
        watchedSeconds,
        watchCompletion,
        navigation,
        exitedEarly,
      });
    },
    [activeItem, expectedDurationSec, isOwnStory, user?.id],
  );

  const closeViewer = useCallback(() => {
    if (closingByGesture) return;
    setClosingByGesture(true);
    void flushView('manual_close', true);
    closeToFeed();
  }, [closeToFeed, closingByGesture, flushView]);

  const animateUserTransition = useCallback(
    (direction: 1 | -1, after: () => void) => {
      dismissY.value = 0;
      panX.value = 0;
      transitionX.value = withTiming(
        direction * -CARD_WIDTH,
        {
          duration: STORY_USER_TRANSITION_MS,
          easing: Easing.out(Easing.cubic),
        },
        (finished) => {
          if (!finished) return;
          runOnJS(after)();
        },
      );
    },
    [dismissY, panX, transitionX],
  );

  const goNextItem = useCallback(
    (navigation: StoryNavigation) => {
      void flushView(navigation);
      if (!items.length) return;
      if (currentItemIndex < items.length - 1) {
        setCurrentItemIndex(currentItemIndex + 1);
        return;
      }
      void markStoryUserSeen(activeUserId);
      markRingSeen(activeUserId);
      if (currentUserIndex < ringUserIds.length - 1) {
        animateUserTransition(1, () => {
          setCurrentUserIndex(currentUserIndex + 1);
          setCurrentItemIndex(0);
        });
        return;
      }
      void flushView('manual_close', true);
      closeToFeed();
    },
    [
      activeUserId,
      animateUserTransition,
      currentItemIndex,
      currentUserIndex,
      closeToFeed,
      flushView,
      items.length,
      markRingSeen,
      ringUserIds.length,
      setCurrentItemIndex,
      setCurrentUserIndex,
    ],
  );

  const handleVideoPosition = useCallback((sec: number, dur?: number | null) => {
    videoProgressRef.current.sec = sec;
    if (dur != null && dur > 0) {
      videoProgressRef.current.dur = dur;
    }

    const duration = Math.max(
      0.1,
      dur ?? videoProgressRef.current.dur ?? activeItem?.durationSec ?? 15,
    );
    const nextProgress = Math.min(1, sec / duration);
    setProgress((prev) => (Math.abs(prev - nextProgress) < 0.008 ? prev : nextProgress));
  }, [activeItem?.durationSec]);

  const handleVideoEnd = useCallback(() => {
    goNextItem('auto_forward');
  }, [goNextItem]);

  const goPrevItem = useCallback(
    (navigation: StoryNavigation) => {
      void flushView(navigation, true);
      if (currentItemIndex > 0) {
        setCurrentItemIndex(currentItemIndex - 1);
        return;
      }
      if (currentUserIndex > 0) {
        animateUserTransition(-1, () => {
          const prevUserId = ringUserIds[currentUserIndex - 1];
          const prevBundle = useStoryViewerStore.getState().bundles[prevUserId];
          const lastIndex = Math.max(0, (prevBundle?.items.length ?? 1) - 1);
          setCurrentUserIndex(currentUserIndex - 1);
          setCurrentItemIndex(lastIndex);
        });
      }
    },
    [
      animateUserTransition,
      currentItemIndex,
      currentUserIndex,
      flushView,
      ringUserIds,
      setCurrentItemIndex,
      setCurrentUserIndex,
    ],
  );

  const finishPanNextUser = useCallback(() => {
    void flushView('swipe_forward', true);
    void markStoryUserSeen(activeUserId);
    markRingSeen(activeUserId);
    setCurrentUserIndex(currentUserIndex + 1);
    setCurrentItemIndex(0);
  }, [
    activeUserId,
    currentUserIndex,
    flushView,
    markRingSeen,
    setCurrentItemIndex,
    setCurrentUserIndex,
  ]);

  const finishPanPrevUser = useCallback(() => {
    void flushView('swipe_back', true);
    const prevUserId = ringUserIds[currentUserIndex - 1];
    const prevBundle = useStoryViewerStore.getState().bundles[prevUserId];
    const lastIndex = Math.max(0, (prevBundle?.items.length ?? 1) - 1);
    setCurrentUserIndex(currentUserIndex - 1);
    setCurrentItemIndex(lastIndex);
  }, [
    currentUserIndex,
    flushView,
    ringUserIds,
    setCurrentItemIndex,
    setCurrentUserIndex,
  ]);

  const resumePlaybackIfAllowed = useCallback(() => {
    if (!inputFocusedRef.current && !insightsVisible && !deleteConfirmVisible) {
      setIsPaused(false);
    }
  }, [deleteConfirmVisible, insightsVisible]);

  useStoryAutoAdvance({
    item: activeItem,
    isActive: Boolean(activeItem) && !insightsVisible && !deleteConfirmVisible,
    // Fotoğraf yüklenmeden / hata durumundayken süre işlemez (boş kart geçip gitmez).
    // Sürükleme/basılı tutma sırasında da durur → jest boyunca yeniden render yok.
    isPaused:
      isPaused || dragging || deleteConfirmVisible || (activeIsPhoto && mediaStatus !== 'ready'),
    onComplete: () => goNextItem('auto_forward'),
    onProgress: setProgress,
  });

  const openInsights = useCallback(async () => {
    if (!bundle || !user?.id) return;
    setIsPaused(true);
    setInsightsVisible(true);
    setInsightsLoading(true);
    try {
      const data = await fetchStoryInsights(bundle.authorId, bundle.storyId);
      setInsights(data);
    } finally {
      setInsightsLoading(false);
    }
  }, [bundle, user?.id]);

  const openStoryLink = useCallback(
    async (link: StoryLinkManifest, action: 'tap' | 'swipe_up') => {
      if (!user?.id || !activeItem) return;
      if (!isOwnStory) {
        void recordStoryLinkAction({
          viewerId: user.id,
          storyItemId: activeItem.id,
          linkId: link.id,
          action,
        });
      }
      setIsPaused(true);
      try {
        await openUrl(link.url);
      } finally {
        if (!insightsVisible) setIsPaused(false);
      }
    },
    [activeItem, insightsVisible, isOwnStory, user?.id],
  );

  const openSingleStoryLink = useCallback(() => {
    const link = activeItem?.links?.[0];
    if (!link) return;
    void openStoryLink(link, 'swipe_up');
  }, [activeItem?.links, openStoryLink]);

  const handleLinkPress = useCallback(
    (link: StoryLinkManifest) => {
      void openStoryLink(link, 'tap');
    },
    [openStoryLink],
  );

  const nextUserId = ringUserIds[currentUserIndex + 1];
  const prevUserId = ringUserIds[currentUserIndex - 1];
  const nextPeekItem = nextUserId ? (bundles[nextUserId]?.items[0] ?? null) : null;
  const prevPeekItem = prevUserId
    ? (bundles[prevUserId]?.items[Math.max(0, (bundles[prevUserId]?.items.length ?? 1) - 1)] ?? null)
    : null;

  /**
   * Aşağı çekme animasyonu — tamamı UI thread'de:
   * kart parmağı birebir takip eder, hafifçe küçülür ve yumuşakça kaybolur.
   */
  const deckStyle = useAnimatedStyle(() => {
    const y = dismissY.value;
    if (y <= 0.5) return {};
    return {
      transform: [
        { translateY: y },
        { scale: dismissScale(y, SCREEN_HEIGHT) },
      ],
      opacity: dismissOpacity(y, SCREEN_HEIGHT),
    };
  });

  const mediaDeckStyle = useAnimatedStyle(() => {
    const offset = transitionX.value + panX.value;
    const progress = Math.min(1, Math.abs(offset) / CARD_WIDTH);
    if (progress <= 0.001) return {};
    return {
      transform: [
        { translateX: offset },
        { scale: 1 - progress * 0.035 },
      ],
    };
  });

  const nextPeekStyle = useAnimatedStyle(() => {
    const offset = transitionX.value + panX.value;
    return {
      transform: [{ translateX: CARD_WIDTH + offset }],
      opacity: interpolate(
        -offset,
        [0, 12, CARD_WIDTH * 0.28, CARD_WIDTH],
        [0, 0.5, 0.92, 1],
        Extrapolation.CLAMP,
      ),
    };
  });

  const prevPeekStyle = useAnimatedStyle(() => {
    const offset = transitionX.value + panX.value;
    return {
      transform: [{ translateX: -CARD_WIDTH + offset }],
      opacity: interpolate(
        offset,
        [0, 12, CARD_WIDTH * 0.28, CARD_WIDTH],
        [0, 0.5, 0.92, 1],
        Extrapolation.CLAMP,
      ),
    };
  });

  const scrimStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.abs(transitionX.value + panX.value) / CARD_WIDTH);
    return {
      opacity: progress * 0.22,
    };
  });

  const dismissBackdropStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.max(0, dismissY.value) / (SCREEN_HEIGHT * 0.7));
    return {
      opacity: interpolate(progress, [0, 1], [0, 0.34], Extrapolation.CLAMP),
    };
  });

  const blurBackdropStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.max(0, dismissY.value) / (SCREEN_HEIGHT * 0.7));
    return {
      opacity: interpolate(progress, [0, 1], [0, 0.2], Extrapolation.CLAMP),
    };
  });

  const contentLiftStyle = useAnimatedStyle(() => {
    if (Math.abs(keyboardLift.value) < 0.5) return {};
    return { transform: [{ translateY: -keyboardLift.value }] };
  });

  const handleInputFocus = useCallback(() => {
    setInputFocused(true);
    setIsPaused(true);
  }, []);

  const handleInputBlur = useCallback(() => {
    setInputFocused(false);
    if (!insightsVisible) {
      setIsPaused(false);
    }
  }, [insightsVisible]);

  const handleTapBack = useCallback(() => {
    if (inputFocused) {
      dismissReplyKeyboard();
      return;
    }
    goPrevItem('tap_back');
  }, [dismissReplyKeyboard, goPrevItem, inputFocused]);

  const handleTapForward = useCallback(() => {
    if (inputFocused) {
      dismissReplyKeyboard();
      return;
    }
    goNextItem('tap_forward');
  }, [dismissReplyKeyboard, goNextItem, inputFocused]);

  /**
   * Jest işleyicileri UI thread'de çalışır; bu yüzden JS tarafındaki güncel
   * geri çağrıları bir ref üzerinden okurlar. Böylece `panGesture` her render'da
   * yeniden kurulmaz — hikâye süresi ilerlerken (fotoğrafta saniyede 20 kez)
   * jest yeniden bağlanmadığı için sürüklemede takılma/titreme olmaz.
   */
  const gestureCallbacksRef = useRef({
    dismiss: () => {},
    nextUser: () => {},
    prevUser: () => {},
    insights: () => {},
    singleLink: () => {},
    tapBack: () => {},
    tapForward: () => {},
    resume: () => {},
    pressStart: () => {},
    pressEnd: () => {},
    dragStart: () => {},
    dragEnd: () => {},
  });

  gestureCallbacksRef.current = {
    dismiss: closeViewer,
    nextUser: finishPanNextUser,
    prevUser: finishPanPrevUser,
    insights: () => void openInsights(),
    singleLink: () => openSingleStoryLink(),
    tapBack: handleTapBack,
    tapForward: handleTapForward,
    resume: resumePlaybackIfAllowed,
    pressStart: () => setIsPaused(true),
    pressEnd: resumePlaybackIfAllowed,
    dragStart: () => setDragging(true),
    dragEnd: () => setDragging(false),
  };

  // Kimliği hiç değişmeyen dağıtıcılar: jest worklet'leri bunları yakalar.
  const dispatch = useMemo(
    () => ({
      dismiss: () => gestureCallbacksRef.current.dismiss(),
      nextUser: () => gestureCallbacksRef.current.nextUser(),
      prevUser: () => gestureCallbacksRef.current.prevUser(),
      insights: () => gestureCallbacksRef.current.insights(),
      singleLink: () => gestureCallbacksRef.current.singleLink(),
      tapBack: () => gestureCallbacksRef.current.tapBack(),
      tapForward: () => gestureCallbacksRef.current.tapForward(),
      resume: () => gestureCallbacksRef.current.resume(),
      pressStart: () => gestureCallbacksRef.current.pressStart(),
      pressEnd: () => gestureCallbacksRef.current.pressEnd(),
      dragStart: () => gestureCallbacksRef.current.dragStart(),
      dragEnd: () => gestureCallbacksRef.current.dragEnd(),
    }),
    [],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        // Aktivasyon eşiği küçük: parmak kalkar kalkmaz takip başlar (IG hissi).
        .activeOffsetX([-14, 14])
        .activeOffsetY([-12, 12])
        .onBegin(() => {
          dragAxis.value = AXIS_NONE;
          // Kapatma animasyonu sürerken yeni dokunuş onu kesmesin.
          if (dismissingSv.value === 1) return;
          // Önceki animasyon yarım kaldıysa kaldığı yerden devam et (sıçrama yok).
          dragStartY.value = Math.max(0, dismissY.value);
          cancelAnimation(dismissY);
        })
        .onUpdate((e) => {
          if (dismissingSv.value === 1) return;
          if (insightsOpen.value || isMediaZoomed.value === 1) return;

          const absX = Math.abs(e.translationX);
          const absY = Math.abs(e.translationY);

          // Eksen bir kez kilitlenir: parmak titremesi yön değiştirip
          // kartın 0'a sıçramasına (geri sarma) yol açmaz.
          if (dragAxis.value === AXIS_NONE) {
            if (absY > absX * 1.15) {
              dragAxis.value = e.translationY > 0 ? AXIS_DOWN : AXIS_UP;
            } else if (absX > absY * 1.15) {
              dragAxis.value = AXIS_HORIZONTAL;
            } else {
              return;
            }
          }

          if (dragAxis.value === AXIS_DOWN) {
            dismissY.value = Math.max(0, dragStartY.value + e.translationY);
            panX.value = 0;
            return;
          }

          if (dragAxis.value === AXIS_UP) {
            // Yarım kalmış aşağı çekme varsa yukarı savururken yumuşakça geri dön.
            if (dismissY.value > 0.5) dismissY.value = withSpring(0, STORY_DISMISS_SPRING);
            return;
          }

          if (dragAxis.value === AXIS_HORIZONTAL) {
            dismissY.value = 0;
            let tx = e.translationX;
            if (canGoNextUserSv.value === 0 && tx < 0) tx *= 0.22;
            if (canGoPrevUserSv.value === 0 && tx > 0) tx *= 0.22;
            panX.value = tx;
          }
        })
        .onStart(() => {
          // Gerçek sürükleme başladı: süre dursun (IG davranışı).
          runOnJS(dispatch.dragStart)();
        })
        .onEnd((e) => {
          if (dismissingSv.value === 1) return;
          const axis = dragAxis.value;
          dragAxis.value = AXIS_NONE;

          if (insightsOpen.value || isMediaZoomed.value === 1) {
            runOnJS(dispatch.dragEnd)();
            if (isMediaZoomed.value === 1) {
              panX.value = withSpring(0, STORY_SPRING);
              dismissY.value = withSpring(0, STORY_SPRING);
            }
            return;
          }

          const absX = Math.abs(e.translationX);
          const absY = Math.abs(e.translationY);

          // Aşağı çekip bırakma → hız kadar hızlı kapanış.
          if (axis === AXIS_DOWN && shouldDismissOnRelease(dismissY.value, e.velocityY)) {
            dismissingSv.value = 1;
            const duration = dismissCloseDuration(dismissY.value, SCREEN_HEIGHT, e.velocityY);
            dismissY.value = withTiming(
              SCREEN_HEIGHT + 40,
              { duration, easing: Easing.out(Easing.cubic) },
              (finished) => {
                if (finished) runOnJS(dispatch.dismiss)();
              },
            );
            return;
          }

          if (dismissY.value > 0) {
            // Yay parmak hızını korur: kopukluk yok, anında geri hissi yok.
            dismissY.value = withSpring(0, {
              ...STORY_DISMISS_SPRING,
              velocity: e.velocityY,
            });
          }
          runOnJS(dispatch.dragEnd)();

          if (axis === AXIS_UP) {
            const isUpFlick = e.translationY <= -SWIPE_UP_THRESHOLD;
            if (isOwnStorySv.value === 1 && isUpFlick) {
              runOnJS(dispatch.insights)();
              return;
            }
            if (hasSingleLinkSv.value === 1 && isUpFlick) {
              runOnJS(dispatch.singleLink)();
              return;
            }
            return;
          }

          if (absX > absY * 0.82) {
            if (e.translationX <= -SWIPE_THRESHOLD && canGoNextUserSv.value === 1) {
              panX.value = withTiming(
                -CARD_WIDTH,
                { duration: STORY_USER_TRANSITION_MS, easing: Easing.out(Easing.cubic) },
                (finished) => {
                  if (finished) runOnJS(dispatch.nextUser)();
                },
              );
              return;
            }
            if (e.translationX >= SWIPE_THRESHOLD && canGoPrevUserSv.value === 1) {
              panX.value = withTiming(
                CARD_WIDTH,
                { duration: STORY_USER_TRANSITION_MS, easing: Easing.out(Easing.cubic) },
                (finished) => {
                  if (finished) runOnJS(dispatch.prevUser)();
                },
              );
              return;
            }
          }

          panX.value = withSpring(0, STORY_SPRING);
        })
        .onFinalize((_event, success) => {
          dragAxis.value = AXIS_NONE;
          if (!success) {
            // İptal: yarım kalan kart ekranda kalmasın.
            if (dismissY.value > 0) dismissY.value = withSpring(0, STORY_DISMISS_SPRING);
            if (Math.abs(panX.value) > 0) panX.value = withSpring(0, STORY_SPRING);
            runOnJS(dispatch.dragEnd)();
          }
        }),
    [
      canGoNextUserSv,
      canGoPrevUserSv,
      dismissY,
      dismissingSv,
      dispatch,
      dragAxis,
      dragStartY,
      hasSingleLinkSv,
      insightsOpen,
      isMediaZoomed,
      isOwnStorySv,
      panX,
    ],
  );

  const longPressGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(180)
        .onStart(() => {
          if (isMediaZoomed.value === 1) return;
          // Basılı tutunca hikâye durur (IG). Jest ağacı yeniden kurulmaz.
          runOnJS(dispatch.pressStart)();
        })
        .onFinalize(() => runOnJS(dispatch.pressEnd)()),
    [dispatch, isMediaZoomed],
  );

  const handleMediaRetry = useCallback(() => {
    if (__DEV__) console.log('[STORY_VIEWER] Media retry', { itemKey: activeItemKey });
    setMediaStatusEntry({ key: activeItemKey, status: 'loading' });
    setMediaRetryToken((token) => token + 1);
  }, [activeItemKey]);

  const handleMediaErrorNext = useCallback(() => {
    goNextItem('tap_forward');
  }, [goNextItem]);

  const mediaRetryGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(14)
        .onEnd(() => {
          runOnJS(handleMediaRetry)();
        }),
    [handleMediaRetry],
  );

  const mediaNextGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(14)
        .onEnd(() => {
          runOnJS(handleMediaErrorNext)();
        }),
    [handleMediaErrorNext],
  );

  const tapNavGesture = useMemo(
    () =>
      Gesture.Tap()
        .maxDistance(14)
        // Hata butonlarına dokunuş sayfa geçişi olarak da algılanmasın.
        .requireExternalGestureToFail(mediaRetryGesture, mediaNextGesture)
        .onEnd((e) => {
          if (insightsOpen.value) return;
          if (isMediaZoomed.value === 1) {
            runOnJS(resetZoom)();
            return;
          }
          if (e.x < CARD_WIDTH * 0.38) {
            runOnJS(dispatch.tapBack)();
          } else {
            runOnJS(dispatch.tapForward)();
          }
        }),
    [dispatch, insightsOpen, isMediaZoomed, mediaNextGesture, mediaRetryGesture, resetZoom],
  );

  const composedGesture = useMemo(
    () =>
      Gesture.Simultaneous(
        panGesture,
        longPressGesture,
        pinchGesture,
        zoomPanGesture,
        Gesture.Exclusive(doubleTapGesture, tapNavGesture),
      ),
    [doubleTapGesture, longPressGesture, panGesture, pinchGesture, tapNavGesture, zoomPanGesture],
  );

  const handleReply = async (text: string) => {
    if (!user?.id || !bundle || !activeItem) return;
    setSendingReply(true);
    try {
      await sendStoryReply({
        senderId: user.id,
        recipientId: bundle.authorId,
        storyItemId: activeItem.id,
        storyThumbUrl: activeItem.thumbUrl,
        storyMediaUrl: activeItem.mediaUrl,
        storyMediaType: activeItem.mediaType,
        storyAuthorUsername: bundle.username,
        storyAuthorId: bundle.authorId,
        text,
      });
    } finally {
      setSendingReply(false);
    }
  };

  const handleReaction = async () => {
    if (!user?.id || !activeItem) return;
    const result = await toggleStoryReaction(activeItem.id, user.id, reacted);
    if (!result.error) setReacted(result.hasReacted);
  };

  const openAuthorProfile = useCallback(() => {
    if (!bundle?.authorId) return;
    setIsPaused(true);
    navigateToPublicProfile({ userId: bundle.authorId });
  }, [bundle?.authorId]);

  const openDeleteConfirm = useCallback(() => {
    if (!user?.id || !activeItem || !bundle || deletingStory) return;
    setDeleteError(null);
    setIsPaused(true);
    setDeleteConfirmVisible(true);
  }, [activeItem, bundle, deletingStory, user?.id]);

  const cancelDeleteConfirm = useCallback(() => {
    if (deletingStory) return;
    setDeleteConfirmVisible(false);
    setDeleteError(null);
    setIsPaused(false);
  }, [deletingStory]);

  const confirmDeleteStory = useCallback(() => {
    if (!user?.id || !activeItem || !bundle || deletingStory) return;

    void (async () => {
      setDeletingStory(true);
      setDeleteError(null);
      const result = await deleteStoryItem(activeItem.id);

      if (result.error) {
        setDeleteError(result.error);
        setDeletingStory(false);
        return;
      }

      setDeleteConfirmVisible(false);
      const remaining = items.filter((item) => item.id !== activeItem.id);
      if (remaining.length === 0) {
        const hasNextUser = currentUserIndex < ringUserIds.length - 1;
        const hasPrevUser = currentUserIndex > 0;

        if (hasNextUser) {
          setCurrentUserIndex(currentUserIndex + 1);
          setCurrentItemIndex(0);
          setDeletingStory(false);
          setIsPaused(false);
          void prefetchStoryRings(user.id, { background: true });
          return;
        }

        if (hasPrevUser) {
          const prevUserId = ringUserIds[currentUserIndex - 1];
          const prevBundle = useStoryViewerStore.getState().bundles[prevUserId];
          const lastIndex = Math.max(0, (prevBundle?.items.length ?? 1) - 1);
          setCurrentUserIndex(currentUserIndex - 1);
          setCurrentItemIndex(lastIndex);
          setDeletingStory(false);
          setIsPaused(false);
          void prefetchStoryRings(user.id, { background: true });
          return;
        }

        setDeletingStory(false);
        void prefetchStoryRings(user.id, { background: true });
        closeToFeed();
        return;
      }

      setBundle(activeUserId, { ...bundle, items: remaining });
      setCurrentItemIndex(Math.min(currentItemIndex, remaining.length - 1));
      setDeletingStory(false);
      setIsPaused(false);

      void prefetchStoryRings(user.id, { background: true });
    })();
  }, [
    activeItem,
    activeUserId,
    bundle,
    currentItemIndex,
    currentUserIndex,
    deletingStory,
    items,
    ringUserIds,
    setBundle,
    setCurrentItemIndex,
    setCurrentUserIndex,
    closeToFeed,
    user?.id,
  ]);

  if (loading && !bundle) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#fff" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {!shouldSkipUiBlur() && Platform.OS === 'ios' ? (
        <Animated.View pointerEvents="none" style={[styles.backdropBlur, blurBackdropStyle]}>
          <BlurView intensity={22} tint="dark" style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
      <Animated.View pointerEvents="none" style={[styles.backdropDim, dismissBackdropStyle]} />
      <Animated.View
        style={[
          styles.cardStage,
          {
            paddingTop: insets.top + STORY_CARD_TOP_GAP,
            paddingBottom: inputFocused
              ? STORY_CARD_BOTTOM_GAP
              : replyBarHeight + STORY_CARD_BOTTOM_GAP,
            paddingHorizontal: STORY_CARD_HORIZONTAL_INSET,
          },
          contentLiftStyle,
        ]}
      >
        {inputFocused ? (
          <Pressable
            style={styles.keyboardDismissBackdrop}
            onPress={dismissReplyKeyboard}
            accessibilityLabel="Klavyeyi kapat"
          />
        ) : null}
        <GestureDetector gesture={composedGesture}>
          <Animated.View
            style={[
              styles.card,
              activeIsPhoto ? storyCardFrameStyle.frame : storyCardFrameStyle.frameVideo,
              deckStyle,
            ]}
          >
            <View style={styles.mediaStage} collapsable={false}>
              {prevPeekItem ? (
                <Animated.View style={[styles.peekLayer, prevPeekStyle]} pointerEvents="none">
                  <StoryPeekPreview item={prevPeekItem} />
                </Animated.View>
              ) : null}
              {nextPeekItem ? (
                <Animated.View style={[styles.peekLayer, nextPeekStyle]} pointerEvents="none">
                  <StoryPeekPreview item={nextPeekItem} />
                </Animated.View>
              ) : null}

              <Animated.View style={[styles.mediaDeck, mediaDeckStyle]} collapsable={false}>
                {activeItem ? (
                  <View
                    key={`${activeUserId}-${activeItem.id}`}
                    style={styles.mediaFill}
                    onLayout={
                      __DEV__
                        ? (event) => {
                            const { width, height } = event.nativeEvent.layout;
                            console.log('[STORY_VIEWER] Card media layout', {
                              itemId: activeItem.id,
                              size: [Math.round(width), Math.round(height)],
                            });
                          }
                        : undefined
                    }
                  >
                    <Animated.View style={[styles.mediaZoomLayer, mediaZoomStyle]} collapsable={false}>
                      <StorySlide
                        item={activeItem}
                        isActive={slideInteractive}
                        isPaused={isPaused || insightsVisible}
                        onVideoPosition={handleVideoPosition}
                        onVideoEnd={handleVideoEnd}
                        retryToken={mediaRetryToken}
                        onMediaStatusChange={handleMediaStatusChange}
                      />
                    </Animated.View>
                    {mediaStatus === 'error' ? (
                      <StoryMediaErrorOverlay
                        retryGesture={mediaRetryGesture}
                        nextGesture={mediaNextGesture}
                        hasNext
                      />
                    ) : null}
                  </View>
                ) : null}
              </Animated.View>

              <Animated.View pointerEvents="none" style={[styles.transitionScrim, scrimStyle]} />
            </View>

            {activeItem && (activeItem.links?.length ?? 0) > 0 ? (
              <View style={styles.linkOverlayHost} pointerEvents="box-none">
                <StoryLinkOverlay
                  links={activeItem.links ?? []}
                  onLinkPress={handleLinkPress}
                  singleLinkMode={isOwnStory ? 'button' : 'swipe_up'}
                />
              </View>
            ) : null}

            {activeItem?.music && storyMusicAuthor ? (
              <View style={styles.musicOverlayHost} pointerEvents="box-none">
                <StoryMusicBadge
                  title={activeItem.music.displayTitle}
                  artist={activeItem.music.artist}
                  durationSec={Math.max(0, activeItem.music.musicEndSec - activeItem.music.musicStartSec)}
                  stacked={shouldStackStoryMusicAboveLocation(activeItem.location)}
                  onPress={() => {
                    setIsPaused(true);
                    setMusicInfoOpen(true);
                  }}
                />
              </View>
            ) : null}

            <View style={styles.cardChrome} pointerEvents="box-none">
              <StoryProgressBars total={items.length} activeIndex={currentItemIndex} progress={progress} />
              <View style={styles.topRow}>
                {bundle ? (
                  <Pressable style={styles.authorRow} onPress={openAuthorProfile} hitSlop={8}>
                    <ProfileAvatar
                      username={bundle.username}
                      avatarUrl={bundle.avatarUrl}
                      size={34}
                      isVerified={bundle.isVerified}
                    />
                    <View style={styles.authorMeta}>
                      <Text variant="label" style={styles.authorName}>
                        {bundle.fullName?.trim() || bundle.username}
                      </Text>
                      {activeItem?.createdAt ? (
                        <Text variant="caption" style={styles.storyTime}>
                          {formatStoryTime(activeItem.createdAt)}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                ) : (
                  <View />
                )}
                <View style={styles.topActions}>
                  {isOwnStory ? (
                    <Pressable
                      onPress={openDeleteConfirm}
                      hitSlop={6}
                      disabled={deletingStory || deleteConfirmVisible}
                      accessibilityRole="button"
                      accessibilityLabel="Hikayeyi sil"
                    >
                      <Ionicons name="trash-outline" size={24} color="#fff" />
                    </Pressable>
                  ) : null}
                  <Pressable
                    onPress={closeViewer}
                    hitSlop={6}
                    disabled={deleteConfirmVisible}
                    accessibilityRole="button"
                    accessibilityLabel="Kapat"
                  >
                    <Ionicons name="close" size={28} color="#fff" />
                  </Pressable>
                </View>
              </View>
            </View>

            {inputFocused ? (
              <Pressable
                style={styles.keyboardDismissOverlay}
                onPress={dismissReplyKeyboard}
                accessibilityLabel="Klavyeyi kapat"
              />
            ) : null}
          </Animated.View>
        </GestureDetector>
      </Animated.View>

      <View style={styles.footerHost} pointerEvents="box-none">
        <StickyKeyboardFooter backgroundColor="transparent" onLayoutHeight={setReplyBarHeight}>
          <StoryReplyBar
            hasReacted={reacted}
            isOwnStory={isOwnStory}
            sending={sendingReply}
            onSend={handleReply}
            onToggleReaction={handleReaction}
            onOpenInsights={openInsights}
            onInputFocus={handleInputFocus}
            onInputBlur={handleInputBlur}
            inputRef={replyInputRef}
          />
        </StickyKeyboardFooter>
      </View>

      <StoryInsightsSheet
        visible={insightsVisible}
        insights={insights}
        loading={insightsLoading}
        authorId={bundle?.authorId ?? null}
        storyItems={items}
        initialItemIndex={currentItemIndex}
        onClose={() => {
          setInsightsVisible(false);
          setIsPaused(false);
        }}
      />

      {activeItem?.music && storyMusicAuthor ? (
        <StoryMusicInfoSheet
          visible={musicInfoOpen}
          music={activeItem.music}
          addedBy={storyMusicAuthor}
          onClose={() => {
            setMusicInfoOpen(false);
            setIsPaused(false);
          }}
        />
      ) : null}

      <Modal
        visible={deleteConfirmVisible}
        transparent
        animationType="fade"
        onRequestClose={cancelDeleteConfirm}
      >
        <View style={styles.deleteModalRoot}>
          <Pressable
            style={styles.deleteModalBackdrop}
            onPress={cancelDeleteConfirm}
            disabled={deletingStory}
            accessibilityLabel="İptal"
          />
          <View style={styles.deleteCard}>
            <Text variant="h3" style={styles.deleteTitle}>
              {items.length <= 1 ? 'Hikayeyi Kaldır' : 'Kareyi Sil'}
            </Text>
            <Text variant="body" style={styles.deleteBody}>
              {items.length <= 1
                ? 'Hikayeniz tamamen kaldırılacak. Devam edilsin mi?'
                : 'Bu hikaye karesi kaldırılacak. Devam edilsin mi?'}
            </Text>
            {deleteError ? (
              <Text variant="caption" style={styles.deleteError}>
                {deleteError}
              </Text>
            ) : null}
            <View style={styles.deleteActions}>
              <Pressable
                style={styles.deleteCancelBtn}
                onPress={cancelDeleteConfirm}
                disabled={deletingStory}
              >
                <Text variant="label" style={styles.deleteCancelText}>
                  Vazgeç
                </Text>
              </Pressable>
              <Pressable
                style={styles.deleteConfirmBtn}
                onPress={confirmDeleteStory}
                disabled={deletingStory}
              >
                {deletingStory ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text variant="label" style={styles.deleteConfirmText}>
                    Sil
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  backdropBlur: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
  },
  backdropDim: {
    ...StyleSheet.absoluteFill,
    zIndex: 0,
    backgroundColor: '#000',
  },
  cardStage: {
    flex: 1,
    zIndex: 1,
  },
  keyboardDismissBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 3,
  },
  keyboardDismissOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 7,
  },
  card: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#111',
  },
  mediaStage: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
  mediaDeck: {
    flex: 1,
    width: '100%',
    zIndex: 2,
  },
  mediaFill: {
    flex: 1,
    width: '100%',
    overflow: 'hidden',
  },
  mediaZoomLayer: {
    ...StyleSheet.absoluteFill,
  },
  peekLayer: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    zIndex: 1,
  },
  transitionScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#000',
    zIndex: 3,
  },
  footerHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  cardChrome: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 6,
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  linkOverlayHost: {
    ...StyleSheet.absoluteFill,
    zIndex: 8,
  },
  musicOverlayHost: {
    ...StyleSheet.absoluteFill,
    zIndex: 9,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  authorMeta: {
    flexShrink: 1,
    gap: 1,
  },
  authorName: {
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  storyTime: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  loading: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteModalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  deleteModalBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  deleteCard: {
    backgroundColor: '#1c1c1e',
    borderRadius: 16,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.sm,
    zIndex: 1,
  },
  deleteTitle: {
    color: '#fff',
    textAlign: 'center',
  },
  deleteBody: {
    color: 'rgba(255,255,255,0.72)',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  deleteError: {
    color: '#ff6b6b',
    textAlign: 'center',
  },
  deleteActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  deleteCancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  deleteCancelText: {
    color: '#fff',
  },
  deleteConfirmBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    borderRadius: 12,
    backgroundColor: '#ff3b30',
    minHeight: 48,
  },
  deleteConfirmText: {
    color: '#fff',
  },
});
