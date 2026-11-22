import { Image, StyleSheet, View } from 'react-native';
import { useTheme } from '@/providers/ThemeProvider';
import { getChatTheme } from '../theme/chatTheme';

type Props = {
  /** Düz renk hex — boşsa tema varsayılanı */
  colorHex?: string | null;
  /** Galeri resmi — tam ekran cover */
  imageUri?: string | null;
};

/** Sohbet arka planı — düz renk veya galeri; baloncukların altında kalır */
export function ChatBackground({ colorHex, imageUri }: Props) {
  const { colors, isDark } = useTheme();
  const chat = getChatTheme(colors, isDark);
  const solid = colorHex?.trim() ? colorHex : chat.screenBg;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: solid }]} pointerEvents="none">
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      ) : null}
      {/* Hafif perde — metin / baloncuk okunaklı kalsın */}
      <View
        style={[
          StyleSheet.absoluteFill,
          imageUri ? styles.scrimImage : colorHex?.trim() ? styles.scrimColor : null,
        ]}
      />
      {!imageUri && !colorHex?.trim() ? (
        <View style={styles.pattern}>
          {Array.from({ length: 48 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  backgroundColor: chat.wallpaperDot,
                  opacity: i % 3 === 0 ? 1 : 0.55,
                },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pattern: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 28,
    opacity: 0.9,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  scrimImage: {
    backgroundColor: 'rgba(8,12,18,0.22)',
  },
  scrimColor: {
    backgroundColor: 'transparent',
  },
});
