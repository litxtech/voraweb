import { Platform } from 'react-native';
import { registerGlobals } from '@livekit/react-native';
import { getLogger, LogLevel, LoggerNames, setLogLevel } from 'livekit-client';

let globalsReady = false;
let logFilterReady = false;
let settingsPatchReady = false;

/** RN screen-share / kamera track’leri çoğu zaman width/height vermez; LiveKit ERROR basar. */
const FALLBACK_VIDEO_WIDTH = 1280;
const FALLBACK_VIDEO_HEIGHT = 720;
const FALLBACK_VIDEO_FPS = 18;

const BENIGN_LIVEKIT_ERROR =
  /could not determine track dimensions|error reading from signal stream|WS closed unexpectedly with code 1000|RTCRtpSender .+ not found/i;

function disableWebrtcDebugLogs(): void {
  try {
    // Transitive dep of @livekit/react-native-webrtc; no @types/debug in tree.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const debug = require('debug') as { disable?: () => void };
    debug.disable?.();
  } catch {
    // optional
  }
}

/**
 * React Native WebRTC screen capture sıkça boş getSettings() döner.
 * LiveKit `waitForDimensions` timeout → ERROR → 1280x720 default.
 * Settings’e bilinen çözünürlüğü yazarak hatayı kökünden keseriz.
 */
function patchVideoTrackSettingsFallback(): void {
  if (settingsPatchReady) return;
  if (typeof MediaStreamTrack === 'undefined') return;
  const proto = MediaStreamTrack.prototype as MediaStreamTrack & {
    getSettings: () => MediaTrackSettings;
    __voraDimsPatched?: boolean;
  };
  if (proto.__voraDimsPatched) {
    settingsPatchReady = true;
    return;
  }
  const original = proto.getSettings;
  if (typeof original !== 'function') return;

  proto.getSettings = function voraPatchedGetSettings(this: MediaStreamTrack) {
    const settings = original.call(this);
    if (this.kind === 'video' && (!settings.width || !settings.height)) {
      return {
        ...settings,
        width: settings.width || FALLBACK_VIDEO_WIDTH,
        height: settings.height || FALLBACK_VIDEO_HEIGHT,
        frameRate: settings.frameRate || FALLBACK_VIDEO_FPS,
      };
    }
    return settings;
  };
  proto.__voraDimsPatched = true;
  settingsPatchReady = true;
}

function isBenignLiveKitError(msg: unknown, context?: object): boolean {
  const text = typeof msg === 'string' ? msg : String(msg ?? '');
  if (BENIGN_LIVEKIT_ERROR.test(text)) return true;
  if (!context || typeof context !== 'object') return false;
  const err = (context as { error?: unknown }).error;
  if (err == null) return false;
  const nested = err instanceof Error ? err.message : String(err);
  return BENIGN_LIVEKIT_ERROR.test(nested);
}

/**
 * RN’de kasıtlı disconnect çoğu zaman wasClean=false + code 1000 → LiveKit ERROR.
 * Gerçek hataları tut, bilinen gürültüyü debug’a düşür (warn eşiğinin altında = sessiz).
 */
function installBenignLiveKitErrorFilter(): void {
  if (logFilterReady) return;
  for (const name of Object.values(LoggerNames)) {
    const logger = getLogger(name);
    const originalError = logger.error.bind(logger);
    logger.error = ((msg: string, context?: object) => {
      if (isBenignLiveKitError(msg, context)) {
        logger.debug(msg, context);
        return;
      }
      originalError(msg, context);
    }) as typeof logger.error;
  }
  logFilterReady = true;
}

function quietLiveKitLogs(): void {
  setLogLevel(LogLevel.warn);
  disableWebrtcDebugLogs();
  installBenignLiveKitErrorFilter();
}

/**
 * LiveKit globals + RN screen-share boyut polyfill + verbose/benign log kesimi.
 * `@livekit/react-native-webrtc` import’ta `rn-webrtc:*` açıyor; her console
 * köprüsü Android JS thread’ini yavaşlatır — warn altını kapatırız.
 */
export function ensureLiveKitGlobals(): void {
  if (!globalsReady) {
    registerGlobals();
    // registerGlobals MediaStreamTrack’i polyfill eder — patch ondan sonra.
    if (Platform.OS !== 'web') {
      patchVideoTrackSettingsFallback();
    }
    globalsReady = true;
  }
  // HMR / yeniden import enable ederse her oda girişinde tekrar kes.
  quietLiveKitLogs();
}
