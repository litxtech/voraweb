import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  View,
  useWindowDimensions,
  type AppStateStatus,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { runOnJS } from 'react-native-reanimated';
import { Text } from '@/components/ui/Text';
import { OptimizedImage } from '@/components/media/OptimizedImage';
import {
  VV_CHECKPOINT_INTERVAL_MS,
  VV_MIN_CHECKPOINT_DELTA_SECONDS,
  VV_PLAYER_SPEEDS,
} from '@/features/vora-video/constants';
import { vvFormatDuration, vvHlsUrl } from '@/features/vora-video/services/format';
import { saveVvProgress } from '@/features/vora-video/services/api';
import {
  allowOrientationRotation,
  lockAppDefaultOrientation,
  lockLandscapeOrientation,
} from '@/lib/device/screenOrientation';
import { radius, spacing } from '@/constants/theme';

export type VvPlayerMode = 'mini' | 'standard' | 'cinema' | 'fullscreen';

type VvPlayerProps = {
  videoId: string;
  playbackId: string | null;
  /** `vv_videos.provider` — HLS adresi sağlayıcıya göre kurulur */
  provider?: string | null;
  posterUri?: string | null;
  title?: string;
  mode: VvPlayerMode;
  onModeChange: (mode: VvPlayerMode) => void;
  resumeSeconds?: number | null;
  onTime?: (position: number, duration: number) => void;
  /** Tam ekrandan çıkış dışında kapatma (watch ekranından ayrılma) */
  onClose?: () => void;
  /** Mini oynatıcıda büyütme */
  onRestore?: () => void;
};

function makeSessionId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function VoraVideoPlayer({
  videoId,
  playbackId,
  provider,
  posterUri,
  title,
  mode,
  onModeChange,
  resumeSeconds,
  onTime,
  onClose,
  onRestore,
}: VvPlayerProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isFullscreen = mode === 'fullscreen';
  const isLandscape = width > height;
  const hlsUrl = useMemo(
    () => vvHlsUrl(playbackId, provider),
    [playbackId, provider],
  );
  const source = useMemo(
    () => (hlsUrl ? { uri: hlsUrl, contentType: 'hls' as const } : null),
    [hlsUrl],
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [speedIndex, setSpeedIndex] = useState(2);
  const [showQuality, setShowQuality] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);
  const [subtitleOn, setSubtitleOn] = useState(false);
  const [subtitleTracks, setSubtitleTracks] = useState<{ id?: string; language: string }[]>([]);
  const [videoQuality, setVideoQuality] = useState<string | null>(null);
  const [scrubTarget, setScrubTarget] = useState<number | null>(null);
  const [seekFlash, setSeekFlash] = useState<'back' | 'forward' | null>(null);
  const [started, setStarted] = useState(false);

  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
    p.timeUpdateEventInterval = 0.5;
    p.audioMixingMode = 'doNotMix';
    p.muted = false;
  });

  const sessionIdRef = useRef(makeSessionId());
  const sequenceRef = useRef(0);
  const lastTimeRef = useRef(0);
  const pendingDeltaRef = useRef(0);
  const completionSentRef = useRef(false);
  const resumeAppliedRef = useRef(false);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const previousModeRef = useRef<VvPlayerMode | null>(null);
  const previousLandscapeRef = useRef(isLandscape);
  const suppressAutoFullscreenRef = useRef(false);

  const flushCheckpoint = useCallback(
    (eventType: 'checkpoint' | 'pause' | 'complete' = 'checkpoint') => {
      const delta = Math.floor(pendingDeltaRef.current);
      if (delta < VV_MIN_CHECKPOINT_DELTA_SECONDS) return;
      pendingDeltaRef.current = 0;
      sequenceRef.current += 1;
      void saveVvProgress({
        videoId,
        sessionId: sessionIdRef.current,
        eventKey: `${sessionIdRef.current}:${sequenceRef.current}`,
        position: Math.floor(lastTimeRef.current),
        delta,
        duration: Math.floor(player.duration || duration),
        eventType,
        completed: eventType === 'complete',
      });
    },
    [duration, player, videoId],
  );

  // Kaynak yüklendiğinde kaldığı yerden devam.
  useEffect(() => {
    const sub = player.addListener('sourceLoad', ({ duration: loaded }) => {
      setDuration(loaded);
      setErrorText(null);
      if (!resumeAppliedRef.current && resumeSeconds && resumeSeconds > 5) {
        const target = Math.min(resumeSeconds, Math.max(0, loaded - 5));
        if (target > 5) {
          player.currentTime = target;
          lastTimeRef.current = target;
        }
      }
      resumeAppliedRef.current = true;
    });

    const statusSub = player.addListener('statusChange', ({ status, error }) => {
      if (status === 'readyToPlay') {
        setErrorText(null);
      } else if (status === 'error') {
        setErrorText(error?.message ?? 'Video oynatılamadı.');
      }
    });

    const playingSub = player.addListener('playingChange', ({ isPlaying: next }) => {
      setIsPlaying(next);
      if (next) {
        setStarted(true);
        setControlsVisible(true);
      } else {
        flushCheckpoint('pause');
      }
    });

    const sourceSub = player.addListener('sourceLoad', ({ availableSubtitleTracks }) => {
      setSubtitleTracks(
        (availableSubtitleTracks ?? []).map((track) => ({
          id: track.id,
          language: track.language,
        })),
      );
      if ((availableSubtitleTracks ?? []).length === 0) setSubtitleOn(false);
    });

    const videoTrackSub = player.addListener('videoTrackChange', ({ videoTrack }) => {
      const h = videoTrack?.size.height;
      setVideoQuality(h ? `${h}p` : null);
    });

    const timeSub = player.addListener('timeUpdate', ({ currentTime: next }) => {
      setCurrentTime(next);
      const previous = lastTimeRef.current;
      const delta = next - previous;
      lastTimeRef.current = next;

      // Yalnızca gerçekten oynatılan ileri süre sayılır. Atlama (seek),
      // geri sarma ve uygulama arka plana geçişi izlenme süresine eklenmez.
      if (player.playing && delta > 0 && delta < 3) {
        pendingDeltaRef.current += delta;
        if (pendingDeltaRef.current * 1000 >= VV_CHECKPOINT_INTERVAL_MS) {
          flushCheckpoint('checkpoint');
        }
      }

      const total = player.duration || duration;
      onTime?.(next, total);
      if (!completionSentRef.current && total > 0 && next / total >= 0.9) {
        completionSentRef.current = true;
        pendingDeltaRef.current = Math.max(
          pendingDeltaRef.current,
          VV_MIN_CHECKPOINT_DELTA_SECONDS,
        );
        flushCheckpoint('complete');
      }
    });

    const endSub = player.addListener('playToEnd', () => {
      setIsPlaying(false);
      setControlsVisible(true);
      flushCheckpoint('complete');
    });

    return () => {
      sub.remove();
      statusSub.remove();
      playingSub.remove();
      sourceSub.remove();
      videoTrackSub.remove();
      timeSub.remove();
      endSub.remove();
    };
  }, [duration, flushCheckpoint, onTime, player, resumeSeconds]);

  // Arka planda oynatma durdurulur; arka plan süresi izlenme olarak sayılmaz.
  useEffect(() => {
    const onChange = (state: AppStateStatus) => {
      if (state !== 'active') {
        try {
          player.pause();
        } catch {
          // player serbest bırakılmış olabilir
        }
        flushCheckpoint('pause');
      }
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, [flushCheckpoint, player]);

  useEffect(() => {
    return () => {
      flushCheckpoint('pause');
    };
  }, [flushCheckpoint]);

  // Yön kilidi + durum çubuğu.
  // - Tam ekran: yatay kilit, durum çubuğu gizli.
  // - Tam ekrandan çıkış: uygulamanın varsayılan dikey kilidine dön; yatay
  //   kalmış ekranın hemen yeniden tam ekrana girmesini engelle.
  // - Standart mod (izleme ekranı): döndürmeyi serbest bırak; cihaz yana
  //   çevrildiğinde otomatik tam ekrana geçilir.
  useEffect(() => {
    const previous = previousModeRef.current;
    previousModeRef.current = mode;

    if (mode === 'fullscreen') {
      suppressAutoFullscreenRef.current = false;
      void lockLandscapeOrientation();
      StatusBar.setHidden(true, 'fade');
      return () => {
        StatusBar.setHidden(false);
      };
    }

    StatusBar.setHidden(false);
    if (previous === 'fullscreen') {
      suppressAutoFullscreenRef.current = true;
      void lockAppDefaultOrientation();
      return;
    }
    if (mode !== 'mini') {
      void allowOrientationRotation();
    }
  }, [mode]);

  // Cihaz dikeyden yataya çevrildiğinde YouTube gibi otomatik tam ekran.
  // Ekran zaten yatay açıldıysa (tablet) kullanıcıyı zorlamayız.
  useEffect(() => {
    const wasLandscape = previousLandscapeRef.current;
    previousLandscapeRef.current = isLandscape;

    if (!isLandscape) {
      suppressAutoFullscreenRef.current = false;
      return;
    }
    if (wasLandscape) return;
    if (mode === 'mini') return;
    if (mode === 'fullscreen' || suppressAutoFullscreenRef.current) return;
    onModeChange('fullscreen');
  }, [isLandscape, mode, onModeChange]);

  // İzleme ekranından ayrılırken uygulamanın yön kilidini geri yükle.
  useEffect(() => {
    return () => {
      void lockAppDefaultOrientation();
    };
  }, []);

  useEffect(() => {
    try {
      player.muted = muted;
      player.volume = muted ? 0 : volume;
    } catch {
      // player hazır değil
    }
  }, [muted, player, volume]);

  useEffect(() => {
    if (!controlsVisible || !isPlaying) return;
    const timer = setTimeout(() => setControlsVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [controlsVisible, isPlaying]);

  const seekBy = useCallback(
    (seconds: number) => {
      const total = player.duration || duration;
      const next = Math.min(Math.max(0, (player.currentTime || 0) + seconds), Math.max(0, total));
      player.currentTime = next;
      setCurrentTime(next);
      lastTimeRef.current = next;
      setSeekFlash(seconds < 0 ? 'back' : 'forward');
      setTimeout(() => setSeekFlash(null), 600);
    },
    [duration, player],
  );

  const togglePlay = useCallback(() => {
    if (player.playing) {
      player.pause();
    } else {
      if (player.currentTime >= (player.duration || 0) - 0.5 && (player.duration || 0) > 0) {
        player.currentTime = 0;
        lastTimeRef.current = 0;
        completionSentRef.current = false;
      }
      player.play();
    }
    setControlsVisible(true);
  }, [player]);

  const toggleFullscreen = useCallback(() => {
    if (mode === 'fullscreen') {
      onModeChange('standard');
    } else {
      onModeChange('fullscreen');
    }
  }, [mode, onModeChange]);

  const cycleSpeed = useCallback(() => {
    const nextIndex = (speedIndex + 1) % VV_PLAYER_SPEEDS.length;
    const rate = VV_PLAYER_SPEEDS[nextIndex];
    setSpeedIndex(nextIndex);
    try {
      player.playbackRate = rate;
    } catch {
      // yok say
    }
  }, [player, speedIndex]);

  const toggleSubtitles = useCallback(() => {
    const first = (player.availableSubtitleTracks ?? [])[0] ?? null;
    if (!first) return;
    if (subtitleOn) {
      player.subtitleTrack = null;
      setSubtitleOn(false);
    } else {
      player.subtitleTrack = first;
      setSubtitleOn(true);
    }
  }, [player, subtitleOn]);

  const toggleControls = useCallback(() => {
    setControlsVisible((visible) => !visible);
  }, []);

  const applyScrub = useCallback(() => {
    setScrubTarget((target) => {
      if (target !== null) {
        player.currentTime = target;
        setCurrentTime(target);
        lastTimeRef.current = target;
      }
      return null;
    });
  }, [player]);

  const gesture = useMemo(() => {
    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(260)
      .onEnd((event, success) => {
        if (!success) return;
        if (event.x < width * 0.4) runOnJS(seekBy)(-10);
        else if (event.x > width * 0.6) runOnJS(seekBy)(10);
        else runOnJS(togglePlay)();
      });

    const singleTap = Gesture.Tap()
      .numberOfTaps(1)
      .onEnd((_event, success) => {
        if (success) runOnJS(toggleControls)();
      });

    const pan = Gesture.Pan()
      .activeOffsetX([-18, 18])
      .onUpdate((event) => {
        const total = duration > 0 ? duration : 0;
        if (total <= 0) return;
        const base = lastTimeRef.current;
        const next = Math.min(
          total,
          Math.max(0, base + (event.translationX / Math.max(1, width)) * total),
        );
        runOnJS(setScrubTarget)(next);
      })
      .onEnd(() => {
        runOnJS(applyScrub)();
      });

    return Gesture.Simultaneous(pan, Gesture.Exclusive(doubleTap, singleTap));
  }, [applyScrub, duration, seekBy, toggleControls, togglePlay, width]);

  const layout = useMemo(() => {
    if (mode === 'mini') {
      return styles.mini;
    }
    if (mode === 'cinema' && !isLandscape) {
      return { width: '100%' as const, height: Math.min(height * 0.56, width * 0.95) };
    }
    // 16:9 oranını koru ama yatay çevrim sırasında ekranı taşırma.
    return {
      width: '100%' as const,
      height: Math.min(width * (9 / 16), height * 0.62),
    };
  }, [height, isLandscape, mode, width]);

  const displayTime = scrubTarget ?? currentTime;
  const total = duration || player.duration || 0;
  const progress = total > 0 ? Math.min(1, displayTime / total) : 0;

  // Aynı oynatıcı örneği hem satır içi hem tam ekran modalında kullanılır.
  // Yalnızca biri aynı anda bağlanır (expo-video Android kısıtı).
  const playerContent = (
    <>
      {hlsUrl ? (
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          nativeControls={false}
          contentFit="contain"
          surfaceType="textureView"
        />
      ) : (
        <View style={styles.centered}>
          {posterUri ? (
            <OptimizedImage uri={posterUri} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : null}
          <Text variant="caption" style={styles.whiteText}>
            Bu video için oynatma kimliği yok.
          </Text>
        </View>
      )}

      {!started && posterUri && hlsUrl ? (
        <OptimizedImage
          uri={posterUri}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
        />
      ) : null}

      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false} />
      </GestureDetector>

      {seekFlash ? (
        <View style={[styles.seekFlash, seekFlash === 'back' ? styles.seekLeft : styles.seekRight]}>
          <Ionicons name={seekFlash === 'back' ? 'play-back' : 'play-forward'} size={22} color="#FFF" />
          <Text style={styles.whiteText}>10 sn</Text>
        </View>
      ) : null}

      {scrubTarget !== null ? (
        <View style={styles.scrubPreview}>
          <Text style={styles.whiteText}>
            {vvFormatDuration(scrubTarget)} / {vvFormatDuration(total)}
          </Text>
        </View>
      ) : null}

      {errorText ? (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={26} color="#EF5350" />
          <Text variant="caption" style={styles.whiteText}>
            {errorText}
          </Text>
          <Pressable onPress={() => onModeChange(mode)} style={styles.retryButton}>
            <Text variant="caption" style={styles.whiteText}>
              Yeniden dene
            </Text>
          </Pressable>
        </View>
      ) : null}

      {!isPlaying && !errorText && hlsUrl && !started ? (
        <View style={styles.centered} pointerEvents="none">
          <ActivityIndicator color="#FFFFFF" />
        </View>
      ) : null}

      {controlsVisible ? (
        <View
          style={[
            styles.controls,
            isFullscreen && {
              paddingTop: Math.max(insets.top, spacing.sm),
              paddingBottom: Math.max(insets.bottom, spacing.sm),
              paddingLeft: Math.max(insets.left, spacing.sm),
              paddingRight: Math.max(insets.right, spacing.sm),
            },
          ]}
          pointerEvents="box-none"
        >
          <View style={styles.controlsTop}>
            <View style={styles.controlsTopLeft}>
              {mode === 'fullscreen' ? (
                <Pressable onPress={() => onModeChange('standard')} hitSlop={10} style={styles.ctrlBtn}>
                  <Ionicons name="chevron-down" size={22} color="#FFF" />
                </Pressable>
              ) : null}
              <Text numberOfLines={1} style={[styles.whiteText, styles.controlsTitle]}>
                {title ?? ''}
              </Text>
            </View>
            <View style={styles.controlsTopRight}>
              {mode !== 'mini' ? (
                <Pressable
                  onPress={() => onModeChange(mode === 'cinema' ? 'standard' : 'cinema')}
                  hitSlop={8}
                  style={styles.ctrlBtn}
                >
                  <Ionicons
                    name={mode === 'cinema' ? 'contract-outline' : 'expand-outline'}
                    size={20}
                    color="#FFF"
                  />
                </Pressable>
              ) : null}
              {mode === 'mini' && onRestore ? (
                <Pressable onPress={onRestore} hitSlop={8} style={styles.ctrlBtn}>
                  <Ionicons name="expand-outline" size={20} color="#FFF" />
                </Pressable>
              ) : null}
              <Pressable onPress={toggleFullscreen} hitSlop={8} style={styles.ctrlBtn}>
                <Ionicons
                  name={mode === 'fullscreen' ? 'contract' : 'scan-outline'}
                  size={20}
                  color="#FFF"
                />
              </Pressable>
              {onClose ? (
                <Pressable onPress={onClose} hitSlop={8} style={styles.ctrlBtn}>
                  <Ionicons name="close" size={22} color="#FFF" />
                </Pressable>
              ) : null}
            </View>
          </View>

          <View style={styles.controlsCenter}>
            <Pressable onPress={() => seekBy(-10)} hitSlop={10} style={styles.skipBtn}>
              <Ionicons name="play-back" size={26} color="#FFF" />
              <Text style={styles.skipText}>10</Text>
            </Pressable>
            <Pressable onPress={togglePlay} style={styles.playBtn}>
              <Ionicons name={isPlaying ? 'pause' : 'play'} size={30} color="#FFF" />
            </Pressable>
            <Pressable onPress={() => seekBy(10)} hitSlop={10} style={styles.skipBtn}>
              <Ionicons name="play-forward" size={26} color="#FFF" />
              <Text style={styles.skipText}>10</Text>
            </Pressable>
          </View>

          <View style={styles.controlsBottom}>
            <View style={styles.timeRow}>
              <Text style={styles.timeText}>{vvFormatDuration(displayTime)}</Text>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
              </View>
              <Text style={styles.timeText}>{vvFormatDuration(total)}</Text>
            </View>
            <View style={styles.bottomRow}>
              <Pressable onPress={() => setMuted((m) => !m)} hitSlop={8} style={styles.ctrlBtn}>
                <Ionicons
                  name={muted || volume === 0 ? 'volume-mute' : 'volume-high'}
                  size={19}
                  color="#FFF"
                />
              </Pressable>
              <Pressable
                onPress={() => {
                  setVolume(0.5);
                  setMuted(false);
                }}
                hitSlop={8}
                style={styles.ctrlBtn}
              >
                <Text style={styles.smallCtrlText}>%50</Text>
              </Pressable>
              <View style={styles.bottomSpacer} />
              <Pressable onPress={() => setShowQuality((v) => !v)} hitSlop={8} style={styles.ctrlBtn}>
                <Text style={styles.smallCtrlText}>{videoQuality ?? 'Otomatik'}</Text>
              </Pressable>
              <Pressable onPress={cycleSpeed} hitSlop={8} style={styles.ctrlBtn}>
                <Text style={styles.smallCtrlText}>{VV_PLAYER_SPEEDS[speedIndex]}x</Text>
              </Pressable>
              {subtitleTracks.length > 0 ? (
                <Pressable onPress={toggleSubtitles} hitSlop={8} style={styles.ctrlBtn}>
                  <Ionicons
                    name="text-outline"
                    size={19}
                    color={subtitleOn ? '#E53935' : '#FFF'}
                  />
                </Pressable>
              ) : null}
              <Pressable onPress={() => setShowSpeed((v) => !v)} hitSlop={8} style={styles.ctrlBtn}>
                <Ionicons name="options-outline" size={19} color="#FFF" />
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      {showQuality ? (
        <Pressable style={styles.popupBackdrop} onPress={() => setShowQuality(false)}>
          <Pressable style={styles.popup} onPress={(event) => event.stopPropagation()}>
            <Text variant="label" style={styles.whiteText}>
              Kalite
            </Text>
            <Text variant="caption" style={styles.popupMuted}>
              HLS uyarlanabilir akış. Cihaz ve bant genişliğine göre otomatik seçilir.
            </Text>
            <Text variant="caption" style={styles.whiteText}>
              Etkin: {videoQuality ?? 'Otomatik'}
            </Text>
          </Pressable>
        </Pressable>
      ) : null}

      {showSpeed ? (
        <Pressable style={styles.popupBackdrop} onPress={() => setShowSpeed(false)}>
          <Pressable style={styles.popup} onPress={(event) => event.stopPropagation()}>
            <Text variant="label" style={styles.whiteText}>
              Oynatma hızı
            </Text>
            {VV_PLAYER_SPEEDS.map((rate, index) => (
              <Pressable
                key={rate}
                onPress={() => {
                  setSpeedIndex(index);
                  try {
                    player.playbackRate = rate;
                  } catch {
                    // yok say
                  }
                  setShowSpeed(false);
                }}
                style={styles.popupRow}
              >
                <Text
                  variant="caption"
                  style={{ color: speedIndex === index ? '#E53935' : '#FFFFFF' }}
                >
                  {rate}x
                </Text>
              </Pressable>
            ))}
            {subtitleTracks.length > 0 ? (
              <Pressable onPress={toggleSubtitles} style={styles.popupRow}>
                <Text variant="caption" style={styles.whiteText}>
                  Altyazı: {subtitleOn ? 'açık' : 'kapalı'}
                </Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      ) : null}
    </>
  );

  const exitFullscreen = () => onModeChange('standard');

  return (
    <>
      <View style={[styles.frame, layout]}>
        {isFullscreen ? null : playerContent}
      </View>

      {isFullscreen ? (
        <Modal
          visible
          animationType="fade"
          presentationStyle="fullScreen"
          statusBarTranslucent
          navigationBarTranslucent
          supportedOrientations={['portrait', 'landscape', 'landscape-left', 'landscape-right']}
          onRequestClose={exitFullscreen}
        >
          <GestureHandlerRootView style={styles.fullscreenRoot}>
            {playerContent}
          </GestureHandlerRootView>
        </Modal>
      ) : null}
    </>
  );
}

const ABSOLUTE_FILL = { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } as const;

const styles = StyleSheet.create({
  frame: { backgroundColor: '#000000', overflow: 'hidden', borderRadius: radius.md },
  fullscreenRoot: { flex: 1, backgroundColor: '#000000' },
  mini: {
    position: 'absolute',
    right: spacing.md,
    bottom: 90,
    width: 208,
    height: 117,
    zIndex: 150,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  centered: {
    ...ABSOLUTE_FILL,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  controls: {
    ...ABSOLUTE_FILL,
    justifyContent: 'space-between',
    padding: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  controlsTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  controlsTopLeft: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  controlsTopRight: { flexDirection: 'row', alignItems: 'center' },
  controlsTitle: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  ctrlBtn: {
    minWidth: 34,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  controlsCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  playBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipBtn: { alignItems: 'center', justifyContent: 'center' },
  skipText: { color: '#FFFFFF', fontSize: 9, fontWeight: '700' },
  controlsBottom: { gap: 6 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  progressTrack: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
  },
  progressFill: { height: 4, backgroundColor: '#E53935' },
  timeText: { color: '#FFFFFF', fontSize: 10, fontVariant: ['tabular-nums'] },
  bottomRow: { flexDirection: 'row', alignItems: 'center' },
  bottomSpacer: { flex: 1 },
  smallCtrlText: { color: '#FFFFFF', fontSize: 11, fontWeight: '600' },
  whiteText: { color: '#FFFFFF' },
  seekFlash: {
    position: 'absolute',
    top: '42%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.55)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seekLeft: { left: '12%' },
  seekRight: { right: '12%' },
  scrubPreview: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  retryButton: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  popupBackdrop: {
    ...ABSOLUTE_FILL,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'flex-end',
    justifyContent: 'center',
    padding: spacing.md,
  },
  popup: {
    backgroundColor: 'rgba(18,24,32,0.96)',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
    minWidth: 180,
  },
  popupMuted: { color: 'rgba(255,255,255,0.7)' },
  popupRow: { paddingVertical: 6 },
});
