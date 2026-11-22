import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  UIManager,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { resolveModalAnimationType } from '@/lib/device/androidPerfProfile';
import { useTheme } from '@/providers/ThemeProvider';
import type { ChatBubbleColor } from '@/features/messaging/constants/chatBubbleColors';
import type { ChatWallpaperColor } from '@/features/messaging/constants/chatWallpapers';
import {
  hasSeenChatWallpaperTip,
  markChatWallpaperTipSeen,
} from '../services/chatWallpaperTipSeen';
import { getChatTheme } from '../theme/chatTheme';
import { mergeBubbleOverrides } from '../utils/resolveBubbleAppearance';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

type TabId = 'color' | 'photo' | 'bubble';
type BubbleSide = 'own' | 'other';

type Props = {
  visible: boolean;
  onClose: () => void;
  colors: ChatWallpaperColor[];
  bubbleColors: ChatBubbleColor[];
  selectedId: string;
  hasImage: boolean;
  imageUri?: string | null;
  ownBubbleId: string;
  otherBubbleId: string;
  onSelectColor: (id: string) => void;
  onPickGallery: () => void;
  onClearImage: () => void;
  onSelectOwnBubble: (id: string) => void;
  onSelectOtherBubble: (id: string) => void;
};

const LIGHT_SWATCH_IDS = new Set([
  'white',
  'cream',
  'silver',
  'sand',
  'pink',
  'powder_pink',
  'baby_pink',
  'blush',
  'sakura',
  'soft_rose',
  'dusty_rose',
  'flamingo',
  'lavender_pink',
  'mauve',
  'mint',
  'lime',
  'sun',
  'peach',
  'default',
  'transparent',
]);

function SwatchFace({
  color,
  selected,
  primary,
  border,
  screenBg,
}: {
  color: ChatBubbleColor | ChatWallpaperColor;
  selected: boolean;
  primary: string;
  border: string;
  screenBg: string;
}) {
  const isTransparent = color.id === 'transparent' || color.hex === 'transparent';
  const isDefault = color.id === 'default' || !color.hex;
  const fill = isTransparent ? 'transparent' : isDefault ? screenBg : color.hex;
  const isLight = isTransparent || isDefault || LIGHT_SWATCH_IDS.has(color.id);

  return (
    <View style={[styles.swatchRing, { borderColor: selected ? primary : 'transparent' }]}>
      <View
        style={[
          styles.swatch,
          { backgroundColor: fill },
          (isDefault || isTransparent) && {
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: border,
          },
        ]}
      >
        {isTransparent ? (
          <View style={styles.checker}>
            <View style={[styles.checkerCell, styles.checkerDark]} />
            <View style={[styles.checkerCell, styles.checkerLight]} />
            <View style={[styles.checkerCell, styles.checkerLight]} />
            <View style={[styles.checkerCell, styles.checkerDark]} />
          </View>
        ) : null}
        {selected ? (
          <View
            style={[
              styles.check,
              {
                backgroundColor: isLight ? 'rgba(15,23,42,0.72)' : 'rgba(255,255,255,0.92)',
              },
            ]}
          >
            <Ionicons name="checkmark" size={13} color={isLight ? '#fff' : '#0B0F16'} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** Ana sohbet görünüm seçici — arka plan + baloncuk renkleri */
export function ChatWallpaperPicker({
  visible,
  onClose,
  colors,
  bubbleColors,
  selectedId,
  hasImage,
  imageUri,
  ownBubbleId,
  otherBubbleId,
  onSelectColor,
  onPickGallery,
  onClearImage,
  onSelectOwnBubble,
  onSelectOtherBubble,
}: Props) {
  const insets = useSafeAreaInsets();
  const { colors: theme, isDark } = useTheme();
  const baseChat = getChatTheme(theme, isDark);
  const chat = useMemo(
    () =>
      mergeBubbleOverrides(
        baseChat,
        ownBubbleId,
        otherBubbleId,
        theme.text,
        theme.textMuted,
      ),
    [baseChat, ownBubbleId, otherBubbleId, theme.text, theme.textMuted],
  );
  const [tab, setTab] = useState<TabId>('color');
  const [bubbleSide, setBubbleSide] = useState<BubbleSide>('own');
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    void hasSeenChatWallpaperTip().then((seen) => {
      if (!alive) return;
      setShowTip(!seen);
    });
    return () => {
      alive = false;
    };
  }, [visible]);

  const dismissTip = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowTip(false);
    void markChatWallpaperTipSeen();
  }, []);

  const selected = useMemo(
    () => colors.find((c) => c.id === selectedId) ?? colors[0],
    [colors, selectedId],
  );

  const activeBubbleId = bubbleSide === 'own' ? ownBubbleId : otherBubbleId;
  const onSelectBubble = bubbleSide === 'own' ? onSelectOwnBubble : onSelectOtherBubble;

  const previewSolid = hasImage
    ? chat.screenBg
    : selected?.hex?.trim()
      ? selected.hex
      : chat.screenBg;

  const surfaceElevated = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(15,23,42,0.045)';
  const hairline = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)';

  const tabs = [
    { id: 'color' as const, label: 'Zemin', icon: 'color-fill-outline' as const },
    { id: 'bubble' as const, label: 'Baloncuk', icon: 'chatbubble-ellipses-outline' as const },
    { id: 'photo' as const, label: 'Foto', icon: 'images-outline' as const },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType={resolveModalAnimationType('slide')}
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Kapat" />
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: theme.surface,
              borderTopColor: hairline,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.border }]} />

          <View style={styles.head}>
            <View style={styles.headText}>
              <Text style={[styles.kicker, { color: theme.primary }]}>SOHBET</Text>
              <Text style={[styles.title, { color: theme.text }]}>Görünüm</Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="Kapat"
              style={({ pressed }) => [
                styles.closeBtn,
                { backgroundColor: surfaceElevated, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <Ionicons name="close" size={18} color={theme.text} />
            </Pressable>
          </View>

          <View style={styles.previewOuter}>
            <View
              style={[
                styles.previewFrame,
                {
                  backgroundColor: previewSolid,
                  borderColor: hairline,
                  shadowColor: '#000',
                },
              ]}
            >
              {hasImage && imageUri ? (
                <Image
                  source={{ uri: imageUri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              ) : null}
              {hasImage ? <View style={styles.previewScrim} /> : null}

              <LinearGradient
                colors={['rgba(0,0,0,0.28)', 'transparent', 'rgba(0,0,0,0.22)']}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              <View style={styles.previewChromeTop}>
                <View style={styles.previewNotch} />
              </View>

              <View style={styles.previewBubbles}>
                <View
                  style={[
                    styles.bubbleIncoming,
                    {
                      backgroundColor: chat.incomingBubble,
                      borderWidth: chat.incomingBubble === 'transparent' ? StyleSheet.hairlineWidth : 0,
                      borderColor: 'rgba(255,255,255,0.35)',
                    },
                  ]}
                >
                  <Text style={[styles.previewBubbleText, { color: chat.incomingText }]}>
                    Merhaba!
                  </Text>
                </View>
                <View
                  style={[
                    styles.bubbleOutgoing,
                    {
                      backgroundColor: chat.outgoingBubble,
                      borderWidth: chat.outgoingBubble === 'transparent' ? StyleSheet.hairlineWidth : 0,
                      borderColor: 'rgba(255,255,255,0.35)',
                    },
                  ]}
                >
                  <Text style={[styles.previewBubbleText, { color: chat.outgoingText }]}>
                    Nasılsın?
                  </Text>
                </View>
              </View>

              <View style={[styles.previewComposer, { backgroundColor: 'rgba(0,0,0,0.28)' }]}>
                <View style={styles.previewInputStub} />
                <View style={[styles.previewSendStub, { backgroundColor: theme.primary }]} />
              </View>
            </View>
          </View>

          {showTip ? (
            <View
              style={[
                styles.tip,
                {
                  backgroundColor: isDark ? 'rgba(56,189,248,0.12)' : 'rgba(14,165,233,0.1)',
                  borderColor: isDark ? 'rgba(56,189,248,0.28)' : 'rgba(14,165,233,0.28)',
                },
              ]}
            >
              <View
                style={[
                  styles.tipIcon,
                  { backgroundColor: isDark ? 'rgba(56,189,248,0.22)' : 'rgba(14,165,233,0.18)' },
                ]}
              >
                <Ionicons name="eye-off-outline" size={16} color={theme.primary} />
              </View>
              <View style={styles.tipCopy}>
                <Text style={[styles.tipTitle, { color: theme.text }]}>Yalnızca sende görünür</Text>
                <Text style={[styles.tipBody, { color: theme.textMuted }]}>
                  Zemin, fotoğraf ve baloncuk renkleri bu sohbete özel; sadece bu cihazda kalır.
                </Text>
              </View>
              <Pressable
                onPress={dismissTip}
                hitSlop={10}
                accessibilityLabel="Uyarıyı kapat"
                style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1, padding: 4 }]}
              >
                <Ionicons name="close" size={16} color={theme.textMuted} />
              </Pressable>
            </View>
          ) : null}

          <View style={[styles.segmentTrack, { backgroundColor: surfaceElevated }]}>
            {tabs.map((item) => {
              const on = tab === item.id;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setTab(item.id)}
                  style={({ pressed }) => [
                    styles.segmentItem,
                    on && {
                      backgroundColor: theme.surface,
                      shadowColor: '#000',
                      shadowOpacity: isDark ? 0.25 : 0.08,
                      shadowRadius: 6,
                      shadowOffset: { width: 0, height: 2 },
                      elevation: on ? 2 : 0,
                    },
                    { opacity: pressed ? 0.88 : 1 },
                  ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                >
                  <Ionicons
                    name={item.icon}
                    size={14}
                    color={on ? theme.primary : theme.textMuted}
                  />
                  <Text
                    style={[
                      styles.segmentLabel,
                      { color: on ? theme.text : theme.textMuted },
                      on && styles.segmentLabelOn,
                    ]}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollBody}
          >
            {tab === 'photo' ? (
              <View style={styles.photoBlock}>
                <Pressable
                  onPress={onPickGallery}
                  style={({ pressed }) => [
                    styles.photoHero,
                    {
                      borderColor: hasImage ? theme.primary : hairline,
                      backgroundColor: surfaceElevated,
                      opacity: pressed ? 0.9 : 1,
                    },
                  ]}
                  accessibilityLabel="Galeriden resim seç"
                >
                  {hasImage && imageUri ? (
                    <Image
                      source={{ uri: imageUri }}
                      style={StyleSheet.absoluteFill}
                      contentFit="cover"
                    />
                  ) : (
                    <LinearGradient
                      colors={
                        isDark
                          ? ['rgba(30,136,229,0.25)', 'rgba(15,23,42,0.4)']
                          : ['rgba(30,136,229,0.14)', 'rgba(232,238,245,0.9)']
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={StyleSheet.absoluteFill}
                    />
                  )}
                  <View style={styles.photoHeroOverlay}>
                    <View
                      style={[
                        styles.photoHeroIcon,
                        { backgroundColor: hasImage ? theme.primary : 'rgba(0,0,0,0.35)' },
                      ]}
                    >
                      <Ionicons
                        name={hasImage ? 'camera-reverse-outline' : 'add'}
                        size={22}
                        color="#fff"
                      />
                    </View>
                    <Text style={styles.photoHeroTitle}>
                      {hasImage ? 'Fotoğrafı değiştir' : 'Galeriden seç'}
                    </Text>
                    <Text style={styles.photoHeroSub}>
                      Tam ekran kaplar · baloncuklar okunaklı kalır
                    </Text>
                  </View>
                </Pressable>

                {hasImage ? (
                  <Pressable
                    onPress={onClearImage}
                    style={({ pressed }) => [
                      styles.clearRow,
                      {
                        backgroundColor: 'rgba(220,38,38,0.1)',
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                    accessibilityLabel="Resmi kaldır"
                  >
                    <Ionicons name="trash-outline" size={16} color={theme.danger} />
                    <Text style={[styles.clearText, { color: theme.danger }]}>Fotoğrafı kaldır</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {tab === 'bubble' ? (
              <View style={styles.bubbleBlock}>
                <View style={[styles.sideTrack, { backgroundColor: surfaceElevated }]}>
                  {(
                    [
                      { id: 'own' as const, label: 'Senin' },
                      { id: 'other' as const, label: 'Karşı taraf' },
                    ] as const
                  ).map((item) => {
                    const on = bubbleSide === item.id;
                    return (
                      <Pressable
                        key={item.id}
                        onPress={() => setBubbleSide(item.id)}
                        style={[
                          styles.sideItem,
                          on && { backgroundColor: theme.surface },
                        ]}
                      >
                        <Text
                          style={[
                            styles.sideLabel,
                            { color: on ? theme.text : theme.textMuted },
                            on && styles.segmentLabelOn,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={[styles.sectionHint, { color: theme.textMuted }]}>
                  {bubbleSide === 'own'
                    ? 'Giden mesaj baloncukların rengi'
                    : 'Gelen mesaj baloncukların rengi'}
                </Text>
                <View style={styles.grid}>
                  {bubbleColors.map((c) => {
                    const on = c.id === activeBubbleId;
                    return (
                      <Pressable
                        key={c.id}
                        onPress={() => onSelectBubble(c.id)}
                        style={({ pressed }) => [
                          styles.swatchWrap,
                          { opacity: pressed ? 0.82 : 1 },
                        ]}
                        accessibilityLabel={c.label}
                        accessibilityState={{ selected: on }}
                      >
                        <SwatchFace
                          color={c}
                          selected={on}
                          primary={theme.primary}
                          border={theme.border}
                          screenBg={baseChat.outgoingBubble}
                        />
                        <Text
                          style={[
                            styles.swatchLabel,
                            { color: on ? theme.text : theme.textMuted },
                            on && styles.swatchLabelOn,
                          ]}
                          numberOfLines={1}
                        >
                          {c.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {tab === 'color' ? (
              <View style={styles.grid}>
                {colors.map((c) => {
                  const on = !hasImage && c.id === selectedId;
                  return (
                    <Pressable
                      key={c.id}
                      onPress={() => onSelectColor(c.id)}
                      style={({ pressed }) => [
                        styles.swatchWrap,
                        { opacity: pressed ? 0.82 : 1 },
                      ]}
                      accessibilityLabel={c.label}
                      accessibilityState={{ selected: on }}
                    >
                      <SwatchFace
                        color={c}
                        selected={on}
                        primary={theme.primary}
                        border={theme.border}
                        screenBg={baseChat.screenBg}
                      />
                      <Text
                        style={[
                          styles.swatchLabel,
                          { color: on ? theme.text : theme.textMuted },
                          on && styles.swatchLabelOn,
                        ]}
                        numberOfLines={1}
                      >
                        {c.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.52)',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
    paddingHorizontal: spacing.md,
    gap: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  head: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headText: {
    flex: 1,
    gap: 1,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewOuter: {
    alignItems: 'center',
    paddingVertical: 2,
  },
  previewFrame: {
    width: '100%',
    height: 168,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 12,
    ...Platform.select({
      ios: {
        shadowOpacity: 0.14,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
      },
      android: { elevation: 4 },
      default: {},
    }),
  },
  previewScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8,12,18,0.16)',
  },
  previewChromeTop: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
  },
  previewNotch: {
    width: 72,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  previewBubbles: {
    gap: 8,
    zIndex: 1,
    marginBottom: 10,
  },
  bubbleIncoming: {
    alignSelf: 'flex-start',
    maxWidth: '70%',
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bubbleOutgoing: {
    alignSelf: 'flex-end',
    maxWidth: '70%',
    borderRadius: 14,
    borderBottomRightRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  previewBubbleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  previewComposer: {
    height: 28,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    gap: 8,
    zIndex: 1,
  },
  previewInputStub: {
    flex: 1,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  previewSendStub: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  tipIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipCopy: {
    flex: 1,
    gap: 2,
  },
  tipTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  tipBody: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  segmentTrack: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 14,
    gap: 4,
  },
  segmentItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 10,
    borderRadius: 11,
  },
  segmentLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  segmentLabelOn: {
    fontWeight: '800',
  },
  scrollBody: {
    gap: 12,
    paddingBottom: 10,
  },
  photoBlock: {
    gap: 10,
  },
  photoHero: {
    height: 132,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    justifyContent: 'flex-end',
  },
  photoHeroOverlay: {
    padding: 16,
    gap: 4,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  photoHeroIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  photoHeroTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  photoHeroSub: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    fontWeight: '500',
  },
  clearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 14,
  },
  clearText: {
    fontSize: 13,
    fontWeight: '700',
  },
  bubbleBlock: {
    gap: 10,
  },
  sideTrack: {
    flexDirection: 'row',
    padding: 3,
    borderRadius: 12,
    gap: 3,
  },
  sideItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 10,
  },
  sideLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHint: {
    fontSize: 12,
    fontWeight: '500',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  swatchWrap: {
    width: '18%',
    minWidth: 58,
    maxWidth: 72,
    alignItems: 'center',
    gap: 5,
  },
  swatchRing: {
    padding: 3,
    borderRadius: 999,
    borderWidth: 2.5,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  checker: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  checkerCell: {
    width: '50%',
    height: '50%',
  },
  checkerDark: {
    backgroundColor: 'rgba(15,23,42,0.22)',
  },
  checkerLight: {
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  swatchLabel: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  swatchLabelOn: {
    fontWeight: '800',
  },
});
