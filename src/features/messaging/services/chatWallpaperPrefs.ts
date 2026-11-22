import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import {
  CHAT_BUBBLE_DEFAULT,
  chatBubbleById,
} from '@/features/messaging/constants/chatBubbleColors';
import {
  CHAT_WALLPAPER_DEFAULT,
  chatWallpaperById,
} from '@/features/messaging/constants/chatWallpapers';

const KEY_PREFIX = '@messaging/chat_wallpaper_v1/';

export type ChatWallpaperPrefs = {
  colorId: string;
  imageUri: string | null;
  /** Giden baloncuk rengi */
  ownBubbleId: string;
  /** Gelen baloncuk rengi */
  otherBubbleId: string;
};

function storageKey(conversationId: string) {
  return `${KEY_PREFIX}${conversationId}`;
}

function imagePath(conversationId: string) {
  const root = FileSystem.documentDirectory ?? '';
  return `${root}messaging-chat-wallpaper/${conversationId}.jpg`;
}

async function ensureDir(conversationId: string) {
  if (!FileSystem.documentDirectory) return;
  const dir = `${FileSystem.documentDirectory}messaging-chat-wallpaper/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  void conversationId;
}

function normalizePrefs(parsed: Partial<ChatWallpaperPrefs>): ChatWallpaperPrefs {
  let imageUri =
    typeof parsed.imageUri === 'string' && parsed.imageUri.length > 0
      ? parsed.imageUri
      : null;
  return {
    colorId: chatWallpaperById(parsed.colorId).id,
    imageUri,
    ownBubbleId: chatBubbleById(parsed.ownBubbleId).id,
    otherBubbleId: chatBubbleById(parsed.otherBubbleId).id,
  };
}

const EMPTY_PREFS: ChatWallpaperPrefs = {
  colorId: CHAT_WALLPAPER_DEFAULT,
  imageUri: null,
  ownBubbleId: CHAT_BUBBLE_DEFAULT,
  otherBubbleId: CHAT_BUBBLE_DEFAULT,
};

export async function loadChatWallpaperPrefs(
  conversationId: string,
): Promise<ChatWallpaperPrefs> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(conversationId));
    if (!raw) return { ...EMPTY_PREFS };
    const parsed = JSON.parse(raw) as Partial<ChatWallpaperPrefs>;
    const next = normalizePrefs(parsed);
    if (next.imageUri) {
      const info = await FileSystem.getInfoAsync(next.imageUri);
      if (!info.exists) next.imageUri = null;
    }
    return next;
  } catch {
    return { ...EMPTY_PREFS };
  }
}

async function writePrefs(
  conversationId: string,
  prefs: ChatWallpaperPrefs,
): Promise<ChatWallpaperPrefs> {
  const next = normalizePrefs(prefs);
  try {
    await AsyncStorage.setItem(storageKey(conversationId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

async function loadOrEmpty(conversationId: string): Promise<ChatWallpaperPrefs> {
  return loadChatWallpaperPrefs(conversationId);
}

export async function saveChatWallpaperColor(
  conversationId: string,
  colorId: string,
): Promise<ChatWallpaperPrefs> {
  const prev = await loadOrEmpty(conversationId);
  const path = imagePath(conversationId);
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    /* ignore */
  }
  return writePrefs(conversationId, {
    ...prev,
    colorId: chatWallpaperById(colorId).id,
    imageUri: null,
  });
}

export async function saveChatWallpaperImage(
  conversationId: string,
  sourceUri: string,
  colorId: string,
): Promise<ChatWallpaperPrefs> {
  const prev = await loadOrEmpty(conversationId);
  let imageUri: string | null = sourceUri;
  try {
    if (FileSystem.documentDirectory) {
      await ensureDir(conversationId);
      const dest = imagePath(conversationId);
      const existing = await FileSystem.getInfoAsync(dest);
      if (existing.exists) await FileSystem.deleteAsync(dest, { idempotent: true });
      await FileSystem.copyAsync({ from: sourceUri, to: dest });
      imageUri = dest;
    }
  } catch {
    imageUri = sourceUri;
  }
  return writePrefs(conversationId, {
    ...prev,
    colorId: chatWallpaperById(colorId).id,
    imageUri,
  });
}

export async function clearChatWallpaperImage(
  conversationId: string,
  colorId: string,
): Promise<ChatWallpaperPrefs> {
  const prev = await loadOrEmpty(conversationId);
  const path = imagePath(conversationId);
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    /* ignore */
  }
  return writePrefs(conversationId, {
    ...prev,
    colorId: chatWallpaperById(colorId).id,
    imageUri: null,
  });
}

export async function saveChatBubbleColors(
  conversationId: string,
  patch: { ownBubbleId?: string; otherBubbleId?: string },
): Promise<ChatWallpaperPrefs> {
  const prev = await loadOrEmpty(conversationId);
  return writePrefs(conversationId, {
    ...prev,
    ownBubbleId: patch.ownBubbleId
      ? chatBubbleById(patch.ownBubbleId).id
      : prev.ownBubbleId,
    otherBubbleId: patch.otherBubbleId
      ? chatBubbleById(patch.otherBubbleId).id
      : prev.otherBubbleId,
  });
}
