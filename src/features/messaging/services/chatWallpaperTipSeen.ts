import AsyncStorage from '@react-native-async-storage/async-storage';

/** Sohbet arka planı ilk açılış uyarısı — bir kez gösterilir */
const STORAGE_KEY = '@messaging/chat_wallpaper_tip_v1';

export async function hasSeenChatWallpaperTip(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw === '1';
  } catch {
    return false;
  }
}

export async function markChatWallpaperTipSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, '1');
  } catch {
    /* ignore */
  }
}
