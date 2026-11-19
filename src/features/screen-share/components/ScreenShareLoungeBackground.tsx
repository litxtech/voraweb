import { StyleSheet, View } from 'react-native';
import { SCREEN_SHARE_ROOM_BG } from '@/features/screen-share/constants';

/** Düz oda zemin — simge / ışık / desen yok. */
export function ScreenShareLoungeBackground() {
  return <View style={[StyleSheet.absoluteFill, styles.plain]} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  plain: { backgroundColor: SCREEN_SHARE_ROOM_BG },
});
