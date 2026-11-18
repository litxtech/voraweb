import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';

const SHOW_MS = 2800;

/** Kısa karşılama — boş ekran hissini kırar. */
export function ScreenShareWelcomeOverlay() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setVisible(false), SHOW_MS);
    return () => clearTimeout(t);
  }, []);

  if (!visible) return null;

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.card}>
        <Text style={styles.title}>Vora'ya hoş geldin!</Text>
        <Text style={styles.sub}>Keyifli sohbetler, güzel dostluklar burada başlar.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 40,
    backgroundColor: 'rgba(5,8,16,0.35)',
  },
  card: {
    marginHorizontal: 28,
    paddingHorizontal: 22,
    paddingVertical: 18,
    borderRadius: 18,
    backgroundColor: 'rgba(12,18,28,0.92)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: `${SCREEN_SHARE_ACCENT}55`,
    gap: 6,
  },
  title: {
    color: '#F4F7FB',
    fontWeight: '900',
    fontSize: 18,
    textAlign: 'center',
  },
  sub: {
    color: 'rgba(180,196,214,0.9)',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
});
