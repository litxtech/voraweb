import { Platform } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { isAndroidTablet } from '@/lib/device/isAndroidTablet';

/**
 * Uygulamanın varsayılan yön politikası.
 * Telefonlarda dikey kilit, Android tabletlerde serbest döndürme.
 * `ScreenOrientationBootstrap` ile aynı kuralı izler.
 */
export async function lockAppDefaultOrientation(): Promise<void> {
  try {
    if (Platform.OS === 'android' && isAndroidTablet()) {
      await ScreenOrientation.unlockAsync();
      return;
    }
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
  } catch {
    // Yerel modül hazır değilse app.config orientation yeterli.
  }
}

/** Video tam ekranı için yatay kilit. */
export async function lockLandscapeOrientation(): Promise<void> {
  try {
    await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
  } catch {
    // Yön kilidi desteklenmiyorsa tam ekran yine modal içinde açılır.
  }
}

/** İzleme ekranı açıkken cihazın yana çevrilebilmesi için döndürmeyi serbest bırakır. */
export async function allowOrientationRotation(): Promise<void> {
  try {
    await ScreenOrientation.unlockAsync();
  } catch {
    // Yön kilidi desteklenmiyorsa yok say.
  }
}
