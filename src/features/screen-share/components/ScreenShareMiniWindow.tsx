import { useCallback, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OptimizedImage } from '@/components/media/OptimizedImage';
import { Text } from '@/components/ui/Text';
import { SCREEN_SHARE_ACCENT } from '@/features/screen-share/constants';
import { getFloatingTabBarReserve } from '@/constants/tabBar';
import { spacing } from '@/constants/theme';

const PIP_W = 168;
const PIP_H = 130;
const EDGE = spacing.md;
const SPRING = { damping: 22, stiffness: 220, mass: 0.7 };

/** Son konum — remount’ta aynı yerde kalsın */
let savedX: number | null = null;
let savedY: number | null = null;

type Props = {
  title: string;
  coverUrl?: string | null;
  participantCount: number;
  onExpand: () => void;
  onClose: () => void;
};

function clamp(v: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, v));
}

/** Sürüklenebilir küçük oda penceresi — gövdeye dokun = aç, çarpı = kapat. */
export function ScreenShareMiniWindow({
  title,
  coverUrl,
  participantCount,
  onExpand,
  onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const bottomReserve = getFloatingTabBarReserve(insets.bottom) + spacing.sm;

  const minX = EDGE;
  const maxX = Math.max(minX, winW - PIP_W - EDGE);
  const minY = insets.top + EDGE;
  const maxY = Math.max(minY, winH - PIP_H - bottomReserve);

  const defaultX = maxX;
  const defaultY = maxY;

  const x = useSharedValue(savedX != null ? clamp(savedX, minX, maxX) : defaultX);
  const y = useSharedValue(savedY != null ? clamp(savedY, minY, maxY) : defaultY);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const moved = useSharedValue(false);

  useEffect(() => {
    x.value = clamp(x.value, minX, maxX);
    y.value = clamp(y.value, minY, maxY);
    savedX = x.value;
    savedY = y.value;
  }, [minX, maxX, minY, maxY, x, y]);

  const persist = useCallback((nx: number, ny: number) => {
    savedX = nx;
    savedY = ny;
  }, []);

  const pan = useMemo(() => {
    return Gesture.Pan()
      .minDistance(4)
      .onStart(() => {
        startX.value = x.value;
        startY.value = y.value;
        moved.value = false;
      })
      .onUpdate((e) => {
        if (Math.abs(e.translationX) > 3 || Math.abs(e.translationY) > 3) {
          moved.value = true;
        }
        x.value = clamp(startX.value + e.translationX, minX, maxX);
        y.value = clamp(startY.value + e.translationY, minY, maxY);
      })
      .onEnd(() => {
        const nx = clamp(x.value, minX, maxX);
        const ny = clamp(y.value, minY, maxY);
        x.value = withSpring(nx, SPRING);
        y.value = withSpring(ny, SPRING);
        runOnJS(persist)(nx, ny);
      });
  }, [maxX, maxY, minX, minY, moved, persist, startX, startY, x, y]);

  const tapExpand = useMemo(() => {
    return Gesture.Tap()
      .maxDuration(250)
      .onEnd((_e, success) => {
        if (!success || moved.value) return;
        runOnJS(onExpand)();
      });
  }, [moved, onExpand]);

  const cardGesture = useMemo(
    () => Gesture.Exclusive(pan, tapExpand),
    [pan, tapExpand],
  );

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  return (
    <Animated.View
      style={[styles.wrap, animStyle]}
      pointerEvents="auto"
      collapsable={false}
    >
      <GestureDetector gesture={cardGesture}>
        <Animated.View style={styles.card}>
          {coverUrl ? (
            <OptimizedImage
              uri={coverUrl}
              style={styles.cover}
              tier="thumb"
              recyclingKey="ss-pip-cover"
            />
          ) : (
            <View style={styles.coverFallback}>
              <Ionicons name="mic" size={22} color={SCREEN_SHARE_ACCENT} />
            </View>
          )}
          <View style={styles.meta}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {participantCount} kişi · sürükle veya aç
            </Text>
          </View>
          <View style={styles.liveDot} />
        </Animated.View>
      </GestureDetector>

      {/* Pan dışında — çarpı her zaman basılabilsin */}
      <Pressable
        onPress={handleClose}
        hitSlop={14}
        accessibilityRole="button"
        accessibilityLabel="Odayı kapat"
        style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.8 : 1 }]}
      >
        <Ionicons name="close" size={14} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 50,
    elevation: 50,
    width: PIP_W,
  },
  card: {
    width: PIP_W,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#151C28',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 12,
  },
  cover: {
    width: '100%',
    height: 88,
    backgroundColor: '#0A0E14',
  },
  coverFallback: {
    width: '100%',
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,194,168,0.12)',
  },
  meta: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  title: {
    color: '#F4F7FB',
    fontSize: 12,
    fontWeight: '800',
  },
  sub: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 10,
    fontWeight: '600',
  },
  liveDot: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF5252',
    borderWidth: 1.5,
    borderColor: '#151C28',
  },
  closeBtn: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(20,24,32,0.95)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    elevation: 20,
  },
});
