import { Platform } from 'react-native';
import { AndroidAudioTypePresets, AudioSession } from '@livekit/react-native';

/**
 * Sesli oda: hoparlör + medya/konuşma karışımı.
 * İzleyicilerin ekran/mikrofon sesini duyması için speaker öncelikli.
 */
export async function configureScreenShareAudioSession(): Promise<void> {
  try {
    await AudioSession.configureAudio({
      android: {
        preferredOutputList: ['speaker', 'bluetooth', 'headset', 'earpiece'],
        audioTypeOptions: {
          ...AndroidAudioTypePresets.communication,
          audioAttributesUsageType: 'media',
          audioAttributesContentType: 'movie',
          audioStreamType: 'music',
          manageAudioFocus: true,
          forceHandleAudioRouting: true,
        },
      },
      ios: {
        defaultOutput: 'speaker',
      },
    });
    if (Platform.OS === 'ios') {
      await AudioSession.setAppleAudioConfiguration({
        audioCategory: 'playAndRecord',
        audioCategoryOptions: ['allowBluetooth', 'allowBluetoothA2DP', 'defaultToSpeaker', 'mixWithOthers'],
        audioMode: 'videoChat',
      });
    }
    await AudioSession.startAudioSession();
    if (Platform.OS === 'android') {
      await AudioSession.selectAudioOutput('speaker').catch(() => undefined);
    }
  } catch {
    await AudioSession.startAudioSession().catch(() => undefined);
  }
}
