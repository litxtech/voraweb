import { useCallback, useEffect, useMemo, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import {
  CHAT_BUBBLE_COLORS,
  CHAT_BUBBLE_DEFAULT,
  chatBubbleById,
} from '@/features/messaging/constants/chatBubbleColors';
import {
  CHAT_WALLPAPER_COLORS,
  CHAT_WALLPAPER_DEFAULT,
  chatWallpaperById,
} from '@/features/messaging/constants/chatWallpapers';
import {
  clearChatWallpaperImage,
  loadChatWallpaperPrefs,
  saveChatBubbleColors,
  saveChatWallpaperColor,
  saveChatWallpaperImage,
} from '@/features/messaging/services/chatWallpaperPrefs';

export function useChatWallpaper(conversationId: string | null | undefined) {
  const [colorId, setColorId] = useState(CHAT_WALLPAPER_DEFAULT);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [ownBubbleId, setOwnBubbleId] = useState(CHAT_BUBBLE_DEFAULT);
  const [otherBubbleId, setOtherBubbleId] = useState(CHAT_BUBBLE_DEFAULT);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!conversationId) {
      setColorId(CHAT_WALLPAPER_DEFAULT);
      setImageUri(null);
      setOwnBubbleId(CHAT_BUBBLE_DEFAULT);
      setOtherBubbleId(CHAT_BUBBLE_DEFAULT);
      setReady(false);
      return;
    }
    let alive = true;
    setReady(false);
    void loadChatWallpaperPrefs(conversationId).then((prefs) => {
      if (!alive) return;
      setColorId(prefs.colorId);
      setImageUri(prefs.imageUri);
      setOwnBubbleId(prefs.ownBubbleId);
      setOtherBubbleId(prefs.otherBubbleId);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [conversationId]);

  const color = useMemo(() => chatWallpaperById(colorId), [colorId]);
  const ownBubble = useMemo(() => chatBubbleById(ownBubbleId), [ownBubbleId]);
  const otherBubble = useMemo(() => chatBubbleById(otherBubbleId), [otherBubbleId]);
  const hasImage = Boolean(imageUri);
  const hasCustomColor = color.id !== 'default' && Boolean(color.hex);

  const applyPrefs = useCallback(
    (prefs: {
      colorId: string;
      imageUri: string | null;
      ownBubbleId: string;
      otherBubbleId: string;
    }) => {
      setColorId(prefs.colorId);
      setImageUri(prefs.imageUri);
      setOwnBubbleId(prefs.ownBubbleId);
      setOtherBubbleId(prefs.otherBubbleId);
    },
    [],
  );

  const setColor = useCallback(
    async (nextId: string) => {
      if (!conversationId) return;
      const next = await saveChatWallpaperColor(conversationId, nextId);
      applyPrefs(next);
    },
    [conversationId, applyPrefs],
  );

  const pickGalleryImage = useCallback(async () => {
    if (!conversationId) return;
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: false,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    const next = await saveChatWallpaperImage(
      conversationId,
      result.assets[0].uri,
      colorId,
    );
    applyPrefs(next);
  }, [conversationId, colorId, applyPrefs]);

  const clearImage = useCallback(async () => {
    if (!conversationId) return;
    const next = await clearChatWallpaperImage(conversationId, colorId);
    applyPrefs(next);
  }, [conversationId, colorId, applyPrefs]);

  const setOwnBubble = useCallback(
    async (nextId: string) => {
      if (!conversationId) return;
      const next = await saveChatBubbleColors(conversationId, { ownBubbleId: nextId });
      applyPrefs(next);
    },
    [conversationId, applyPrefs],
  );

  const setOtherBubble = useCallback(
    async (nextId: string) => {
      if (!conversationId) return;
      const next = await saveChatBubbleColors(conversationId, { otherBubbleId: nextId });
      applyPrefs(next);
    },
    [conversationId, applyPrefs],
  );

  return {
    ready,
    color,
    imageUri,
    hasImage,
    hasCustomColor,
    colors: CHAT_WALLPAPER_COLORS,
    bubbleColors: CHAT_BUBBLE_COLORS,
    ownBubble,
    otherBubble,
    setColor,
    pickGalleryImage,
    clearImage,
    setOwnBubble,
    setOtherBubble,
  };
}
