import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import type { CameraView as CameraViewType } from 'expo-camera';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Text } from '@/components/ui/Text';
import { radius, spacing } from '@/constants/theme';
import { resolveModalAnimationType } from '@/lib/device/androidPerfProfile';
import { deferAfterInteractions } from '@/lib/ui/deferUntilUiIdle';
import { capturePictureOptions, finalizeCapturedPhoto } from '@/features/compose/services/cameraCapture';
import { useCaptureCameraZoom } from '@/features/compose/hooks/useCaptureCameraZoom';
import { CaptureCameraZoomOverlay } from '@/features/compose/components/CaptureCameraZoomOverlay';
import { prepareStoryVideoPreviewUri } from '@/features/stories/services/prepareStoryVideoPreview';
import { useTheme } from '@/providers/ThemeProvider';
import { CHAT_EPHEMERAL_DEFAULT_DURATION_SEC, CHAT_VIDEO_MAX_DURATION_SEC } from '../constants';

export type ChatQuickCaptureResult = {
  uri: string;
  mediaType: 'image' | 'video';
  durationSec?: number;
  ephemeral: boolean;
};

type CaptureMode = 'photo' | 'video';

type ChatQuickCaptureProps = {
  visible: boolean;
  ephemeral: boolean;
  onEphemeralChange: (ephemeral: boolean) => void;
  onClose: () => void;
  onPreview: (result: ChatQuickCaptureResult) => void;
};

const MIN_VIDEO_MS = 800;
const VIDEO_MODE_READY_TIMEOUT_MS = 6000;
const RECORD_ASYNC_RETRY_MS = 150;
const RECORD_ASYNC_MAX_ATTEMPTS = 10;

function formatRecordingTime(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec));
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function ChatQuickCapture({
  visible,
  ephemeral,
  onEphemeralChange,
  onClose,
  onPreview,
}: ChatQuickCaptureProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<CameraViewType>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [captureMode, setCaptureMode] = useState<CaptureMode>('photo');
  const [cameraMode, setCameraMode] = useState<'picture' | 'video'>('picture');
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [busy, setBusy] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraLive, setCameraLive] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingElapsedSec, setRecordingElapsedSec] = useState(0);
  const recordStartedAt = useRef<number | null>(null);
  const pendingRecordRef = useRef(false);
  const stopWhenReadyRef = useRef(false);
  const recordingRef = useRef(false);
  const recordAsyncActiveRef = useRef(false);
  const videoModeReadyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressActive = useRef(false);

  const cameraMute = !micPermission?.granted;

  const handleClose = useCallback(() => {
    if (recordingRef.current || recordAsyncActiveRef.current) {
      try {
        cameraRef.current?.stopRecording();
      } catch {
        // ignore
      }
    }
    setBusy(false);
    setRecording(false);
    pendingRecordRef.current = false;
    stopWhenReadyRef.current = false;
    recordAsyncActiveRef.current = false;
    onClose();
  }, [onClose]);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  useEffect(() => {
    if (!recording) {
      setRecordingElapsedSec(0);
      return;
    }
    const startedAt = recordStartedAt.current ?? Date.now();
    const tick = () => setRecordingElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const intervalId = setInterval(tick, 200);
    return () => clearInterval(intervalId);
  }, [recording]);

  useEffect(() => {
    if (visible) return;
    setBusy(false);
    setFacing('back');
    setCaptureMode('photo');
    setCameraMode('picture');
    setCameraReady(false);
    setCameraLive(false);
    setRecording(false);
    pendingRecordRef.current = false;
    stopWhenReadyRef.current = false;
    recordAsyncActiveRef.current = false;
  }, [visible]);

  useEffect(() => {
    setCameraReady(false);
    if (captureMode === 'photo') {
      setCameraMode('picture');
    }
  }, [facing, captureMode]);

  useEffect(() => {
    if (!visible || !cameraPermission?.granted) {
      setCameraLive(false);
      return;
    }

    let cancelled = false;
    const task = deferAfterInteractions(() => {
      requestAnimationFrame(() => {
        if (!cancelled) setCameraLive(true);
      });
    });

    return () => {
      cancelled = true;
      task.cancel();
      setCameraLive(false);
    };
  }, [visible, cameraPermission?.granted]);

  // Modal ilk açıldığında izin sorulmadıysa siyah "hazırlanıyor" ekranında kalmasın.
  useEffect(() => {
    if (!visible) return;
    if (cameraPermission?.granted) return;
    if (cameraPermission && !cameraPermission.granted && cameraPermission.canAskAgain) {
      void requestCameraPermission();
    }
  }, [visible, cameraPermission, requestCameraPermission]);

  useEffect(() => {
    return () => {
      if (videoModeReadyTimeoutRef.current) {
        clearTimeout(videoModeReadyTimeoutRef.current);
      }
      try {
        cameraRef.current?.stopRecording();
      } catch {
        // ignore
      }
    };
  }, []);

  const clearVideoModeReadyTimeout = useCallback(() => {
    if (videoModeReadyTimeoutRef.current) {
      clearTimeout(videoModeReadyTimeoutRef.current);
      videoModeReadyTimeoutRef.current = null;
    }
  }, []);

  const handleCameraReady = useCallback(() => {
    clearVideoModeReadyTimeout();
    setCameraReady(true);
  }, [clearVideoModeReadyTimeout]);

  const ensureCameraPermission = async (): Promise<boolean> => {
    if (cameraPermission?.granted) return true;
    const result = await requestCameraPermission();
    if (result.granted) return true;
    Alert.alert(
      'Kamera izni gerekli',
      'Medya çekmek için kamera erişimine izin verin.',
      [
        { text: 'Vazgeç', style: 'cancel', onPress: handleClose },
        { text: 'Ayarlar', onPress: () => void Linking.openSettings() },
      ],
    );
    return false;
  };

  const ensureMicForVideo = async (): Promise<boolean> => {
    if (micPermission?.granted) return true;
    const result = await requestMicPermission();
    return result.granted;
  };

  const resetRecordingState = useCallback(() => {
    recordAsyncActiveRef.current = false;
    setRecording(false);
    pendingRecordRef.current = false;
    stopWhenReadyRef.current = false;
    setCameraMode(captureMode === 'video' ? 'video' : 'picture');
    recordStartedAt.current = null;
    clearVideoModeReadyTimeout();
  }, [captureMode, clearVideoModeReadyTimeout]);

  const flipCamera = useCallback(() => {
    if (recording || busy) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setFacing((current) => (current === 'back' ? 'front' : 'back'));
  }, [busy, recording]);

  const {
    linearZoom,
    displayZoom,
    selectedLens,
    indicatorVisible,
    activePresetId,
    presets,
    previewGesture,
    applyPreset,
    handleAvailableLensesChanged,
    updateZoomFromRail,
    handleZoomRailStart,
    handleZoomRailEnd,
    flipCameraWithReset,
    isPinchingRef,
  } = useCaptureCameraZoom({
    enabled: cameraLive,
    recording,
    facing,
    resetKey: `${facing}-${cameraMode}`,
    onFlipCamera: flipCamera,
  });

  const finishCapture = useCallback(
    (result: ChatQuickCaptureResult) => {
      // Önce kamerayı kapat; VideoView'ı aynı anda iki Modal'da açma (siyah kare)
      handleClose();
      setTimeout(() => onPreview(result), 280);
    },
    [handleClose, onPreview],
  );

  const handleCapturePhoto = async () => {
    if (busy || recording || !cameraRef.current || !cameraReady || captureMode !== 'photo') return;
    if (!(await ensureCameraPermission())) return;

    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync(capturePictureOptions());
      if (!photo?.uri) return;
      const finalized = await finalizeCapturedPhoto(photo.uri, photo);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      finishCapture({ uri: finalized.uri, mediaType: 'image', ephemeral });
    } catch {
      Alert.alert('Hata', 'Fotoğraf çekilemedi. Tekrar deneyin.');
    } finally {
      setBusy(false);
    }
  };

  const runVideoRecording = useCallback(async () => {
    recordAsyncActiveRef.current = true;
    const shouldStopImmediately = stopWhenReadyRef.current;
    const camera = cameraRef.current;

    if (!camera) {
      resetRecordingState();
      return;
    }

    setBusy(true);
    try {
      let video: { uri: string } | undefined;

      for (let attempt = 0; attempt < RECORD_ASYNC_MAX_ATTEMPTS; attempt += 1) {
        try {
          const recordPromise = camera.recordAsync({ maxDuration: CHAT_VIDEO_MAX_DURATION_SEC });
          if (shouldStopImmediately) {
            setTimeout(() => {
              try {
                camera.stopRecording();
              } catch {
                // ignore
              }
            }, 120);
          }
          video = await recordPromise;
          break;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const outputNotReady = /not ready|output/i.test(message);
          if (!outputNotReady || attempt === RECORD_ASYNC_MAX_ATTEMPTS - 1) {
            throw err;
          }
          await new Promise<void>((resolve) => {
            setTimeout(resolve, RECORD_ASYNC_RETRY_MS);
          });
        }
      }

      if (video?.uri) {
        const elapsed = recordStartedAt.current ? Date.now() - recordStartedAt.current : 0;
        if (elapsed < MIN_VIDEO_MS) {
          if (!shouldStopImmediately) {
            Alert.alert('Çok kısa', 'Video kaydı için biraz daha basılı tutun.');
          }
          return;
        }
        const durationSec = elapsed / 1000;
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        const playableUri = await prepareStoryVideoPreviewUri(video.uri);
        finishCapture({
          uri: playableUri,
          mediaType: 'video',
          durationSec,
          ephemeral,
        });
      }
    } catch {
      if (!shouldStopImmediately) {
        Alert.alert('Hata', 'Video kaydedilemedi.');
      }
    } finally {
      setBusy(false);
      resetRecordingState();
    }
  }, [ephemeral, finishCapture, resetRecordingState]);

  useEffect(() => {
    if (!cameraReady || !pendingRecordRef.current || cameraMode !== 'video') return;
    pendingRecordRef.current = false;
    void runVideoRecording();
  }, [cameraReady, cameraMode, runVideoRecording]);

  const startVideoRecording = async () => {
    if (busy || recording || captureMode !== 'video') return;
    if (!(await ensureCameraPermission())) return;

    const micGranted = await ensureMicForVideo();
    if (!micGranted) {
      Alert.alert('Ses kapalı', 'Mikrofon izni verilmediği için video sessiz kaydedilecek.', [
        { text: 'Tamam' },
      ]);
    }

    stopWhenReadyRef.current = false;
    setRecording(true);
    recordStartedAt.current = Date.now();
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    if (cameraMode === 'video' && cameraReady) {
      void runVideoRecording();
      return;
    }

    pendingRecordRef.current = true;
    clearVideoModeReadyTimeout();
    videoModeReadyTimeoutRef.current = setTimeout(() => {
      if (!pendingRecordRef.current) return;
      resetRecordingState();
      Alert.alert('Kamera hazır değil', 'Video kaydı başlatılamadı. Lütfen tekrar deneyin.');
    }, VIDEO_MODE_READY_TIMEOUT_MS);

    if (cameraMode !== 'video') {
      setCameraMode('video');
    }
  };

  const stopVideoRecording = useCallback(() => {
    // Pinch zoom sırasında dokunuş iptali kaydı kesmesin
    if (isPinchingRef.current) return;

    longPressActive.current = false;

    if (pendingRecordRef.current && !recordAsyncActiveRef.current) {
      stopWhenReadyRef.current = true;
      setRecording(false);
      return;
    }

    if (!recordingRef.current && !recordAsyncActiveRef.current) return;

    try {
      cameraRef.current?.stopRecording();
    } catch {
      if (!recordAsyncActiveRef.current) {
        resetRecordingState();
      }
    }
  }, [isPinchingRef, resetRecordingState]);

  /** Video: dokun → başlat / dokun → bitir (pinch zoom ile uyumlu). Foto: tek dokunuş. */
  const handleShutterPress = () => {
    if (captureMode === 'video') {
      if (recordingRef.current || recordAsyncActiveRef.current) {
        stopVideoRecording();
        return;
      }
      void startVideoRecording();
      return;
    }

    if (recordingRef.current || recordAsyncActiveRef.current) {
      stopVideoRecording();
      return;
    }
    if (longPressActive.current) {
      longPressActive.current = false;
      return;
    }
    void handleCapturePhoto();
  };

  const switchCaptureMode = (mode: CaptureMode) => {
    if (recording || busy) return;
    setCaptureMode(mode);
    setCameraMode(mode === 'video' ? 'video' : 'picture');
    void Haptics.selectionAsync();
  };

  if (!visible) return null;

  const permissionDenied =
    cameraPermission && !cameraPermission.granted && !cameraPermission.canAskAgain;
  const shutterDisabled = busy || !cameraReady;

  return (
    <Modal
      visible
      animationType={resolveModalAnimationType('slide')}
      presentationStyle="fullScreen"
      onRequestClose={handleClose}
    >
      <StatusBar style="light" />
      <GestureHandlerRootView style={styles.container}>
        {permissionDenied ? (
          <View style={[styles.permissionWrap, { paddingTop: insets.top }]}>
            <Ionicons name="camera-outline" size={48} color="#fff" />
            <Text variant="body" style={styles.permissionText}>
              Kamera izni kapalı. Ayarlardan izin verin.
            </Text>
            <Pressable
              onPress={() => void Linking.openSettings()}
              style={[styles.modeBtn, { backgroundColor: colors.primary }]}
            >
              <Text variant="body" style={styles.modeBtnText}>
                Ayarları Aç
              </Text>
            </Pressable>
            <Pressable onPress={handleClose} hitSlop={12}>
              <Text variant="caption" style={styles.permissionText}>
                Vazgeç
              </Text>
            </Pressable>
          </View>
        ) : (
          <>
            {cameraLive ? (
              <CameraView
                key={`${facing}-${cameraMode}`}
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing={facing}
                mode={cameraMode}
                mute={cameraMute}
                mirror={facing === 'front'}
                zoom={linearZoom}
                {...(Platform.OS === 'android' ? { ratio: '4:3' as const } : {})}
                {...(Platform.OS === 'ios'
                  ? {
                      selectedLens,
                      onAvailableLensesChanged: ({ lenses }: { lenses: string[] }) =>
                        handleAvailableLensesChanged(lenses),
                    }
                  : {})}
                onCameraReady={handleCameraReady}
                onMountError={({ message }) => {
                  setCameraLive(false);
                  Alert.alert('Kamera açılamadı', message, [{ text: 'Tamam', onPress: handleClose }]);
                }}
              />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.cameraPlaceholder]} />
            )}

            {cameraLive ? (
              <CaptureCameraZoomOverlay
                enabled
                showZoomChrome
                showManualControls={false}
                bounds={{
                  top: insets.top + 64,
                  bottom: insets.bottom + 248,
                }}
                linearZoom={linearZoom}
                displayZoom={displayZoom}
                indicatorVisible={indicatorVisible}
                activePresetId={activePresetId}
                presets={presets}
                previewGesture={previewGesture}
                applyPreset={applyPreset}
                onZoomRailChange={updateZoomFromRail}
                onZoomRailStart={handleZoomRailStart}
                onZoomRailEnd={handleZoomRailEnd}
              />
            ) : null}

            {cameraLive && !cameraReady ? (
              <View style={styles.cameraLoading} pointerEvents="none">
                <ActivityIndicator color="#fff" size="large" />
              </View>
            ) : null}

            <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
              <Pressable onPress={handleClose} style={styles.iconCircle} hitSlop={12} accessibilityLabel="Kapat">
                <Ionicons name="close" size={24} color="#fff" />
              </Pressable>
              {recording ? (
                <View style={styles.recordingBadge}>
                  <View style={styles.recordingDot} />
                  <Text style={styles.recordingTime}>
                    {formatRecordingTime(recordingElapsedSec)} /{' '}
                    {formatRecordingTime(CHAT_VIDEO_MAX_DURATION_SEC)}
                  </Text>
                </View>
              ) : (
                <View style={styles.topSpacer} />
              )}
              <Pressable
                onPress={flipCameraWithReset}
                style={styles.iconCircle}
                hitSlop={12}
                accessibilityLabel="Kamerayı çevir"
                disabled={recording || busy}
              >
                <Ionicons name="camera-reverse-outline" size={22} color="#fff" />
              </Pressable>
            </View>

            <View
              style={[styles.bottomDock, { paddingBottom: Math.max(insets.bottom, 14) + 8 }]}
              pointerEvents="box-none"
            >
              <View style={styles.dockCard}>
                <View style={styles.segmentTrack}>
                  <Pressable
                    onPress={() => switchCaptureMode('photo')}
                    disabled={recording}
                    style={[
                      styles.segmentItem,
                      captureMode === 'photo' && styles.segmentItemOn,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: captureMode === 'photo' }}
                    accessibilityLabel="Fotoğraf"
                  >
                    <Ionicons
                      name="camera"
                      size={15}
                      color={captureMode === 'photo' ? '#0B0F14' : 'rgba(255,255,255,0.72)'}
                    />
                    <Text
                      style={[
                        styles.segmentLabel,
                        captureMode === 'photo' && styles.segmentLabelOn,
                      ]}
                    >
                      Fotoğraf
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => switchCaptureMode('video')}
                    disabled={recording}
                    style={[
                      styles.segmentItem,
                      captureMode === 'video' && styles.segmentItemOn,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: captureMode === 'video' }}
                    accessibilityLabel="Video"
                  >
                    <Ionicons
                      name="videocam"
                      size={15}
                      color={captureMode === 'video' ? '#0B0F14' : 'rgba(255,255,255,0.72)'}
                    />
                    <Text
                      style={[
                        styles.segmentLabel,
                        captureMode === 'video' && styles.segmentLabelOn,
                      ]}
                    >
                      Video
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.segmentTrack}>
                  <Pressable
                    onPress={() => onEphemeralChange(true)}
                    disabled={recording}
                    style={[styles.segmentItem, ephemeral && styles.segmentItemTimed]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: ephemeral }}
                    accessibilityLabel={`Süreli ${CHAT_EPHEMERAL_DEFAULT_DURATION_SEC} saniye`}
                  >
                    <Ionicons
                      name="timer-outline"
                      size={15}
                      color={ephemeral ? '#0B0F14' : 'rgba(255,255,255,0.72)'}
                    />
                    <Text style={[styles.segmentLabel, ephemeral && styles.segmentLabelOn]}>
                      Süreli · {CHAT_EPHEMERAL_DEFAULT_DURATION_SEC}s
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onEphemeralChange(false)}
                    disabled={recording}
                    style={[styles.segmentItem, !ephemeral && styles.segmentItemOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: !ephemeral }}
                    accessibilityLabel="Süresiz"
                  >
                    <Ionicons
                      name="infinite-outline"
                      size={15}
                      color={!ephemeral ? '#0B0F14' : 'rgba(255,255,255,0.72)'}
                    />
                    <Text style={[styles.segmentLabel, !ephemeral && styles.segmentLabelOn]}>
                      Süresiz
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.shutterRow}>
                  <View style={styles.shutterSide} />
                  <Pressable
                    onPress={handleShutterPress}
                    disabled={shutterDisabled && !recording}
                    accessibilityLabel={
                      captureMode === 'video' ? 'Video kaydet' : 'Fotoğraf çek'
                    }
                    style={[
                      styles.shutterOuter,
                      recording && styles.shutterOuterRecording,
                      shutterDisabled && !recording && { opacity: 0.55 },
                    ]}
                  >
                    {busy && !recording ? (
                      <ActivityIndicator color="#111" size="large" />
                    ) : (
                      <View
                        style={[styles.shutterInner, recording && styles.shutterInnerRecording]}
                      />
                    )}
                  </Pressable>
                  <View style={styles.shutterSide}>
                    {ephemeral ? (
                      <View style={styles.timedPill}>
                        <Ionicons name="flame" size={12} color="#FFB020" />
                        <Text style={styles.timedPillText}>
                          {CHAT_EPHEMERAL_DEFAULT_DURATION_SEC}s
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>

                <Text style={styles.hintText}>
                  {captureMode === 'video'
                    ? recording
                      ? 'Durdurmak için deklanşöre dokun'
                      : 'İki parmakla yakınlaştır · deklanşöre dokun'
                    : cameraReady
                      ? 'İki parmakla yakınlaştır · çekmek için dokun'
                      : 'Kamera hazırlanıyor…'}
                </Text>
              </View>
            </View>
          </>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraPlaceholder: {
    backgroundColor: '#000',
  },
  cameraLoading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    zIndex: 10,
    elevation: 10,
  },
  topSpacer: {
    flex: 1,
  },
  recordingBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginHorizontal: spacing.sm,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: '#ff3b30',
  },
  recordingTime: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  bottomDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.md,
    zIndex: 10,
    elevation: 10,
  },
  dockCard: {
    borderRadius: 28,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
    gap: 12,
    backgroundColor: 'rgba(8,12,18,0.72)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  segmentTrack: {
    flexDirection: 'row',
    gap: 6,
    padding: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  segmentItem: {
    flex: 1,
    minHeight: 40,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10,
  },
  segmentItemOn: {
    backgroundColor: '#fff',
  },
  segmentItemTimed: {
    backgroundColor: '#FFD27A',
  },
  segmentLabel: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    fontWeight: '800',
  },
  segmentLabelOn: {
    color: '#0B0F14',
  },
  shutterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  shutterSide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 28,
  },
  timedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,176,32,0.18)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,176,32,0.45)',
  },
  timedPillText: {
    color: '#FFD27A',
    fontSize: 11,
    fontWeight: '800',
  },
  hintText: {
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '600',
    fontSize: 11,
    textAlign: 'center',
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
  },
  modeBtnText: {
    color: '#fff',
    fontWeight: '700',
  },
  shutterOuter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  shutterOuterRecording: {
    borderColor: '#ff3b30',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
  },
  shutterInnerRecording: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#ff3b30',
  },
  permissionWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  permissionText: {
    color: '#fff',
    textAlign: 'center',
  },
});
