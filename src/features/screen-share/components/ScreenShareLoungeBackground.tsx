import { StyleSheet, View } from 'react-native';

/** Düz oda zemin — simge / ışık / desen yok. */
export function ScreenShareLoungeBackground() {
  return <View style={[StyleSheet.absoluteFill, styles.plain]} pointerEvents="none" />;
}

const styles = StyleSheet.create({
  plain: { backgroundColor: '#0E1420' },
});
