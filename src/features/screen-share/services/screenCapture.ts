import type { Component, RefObject } from 'react';
import { findNodeHandle, NativeModules, Platform } from 'react-native';
import type { Room } from 'livekit-client';
import { ConnectionState } from 'livekit-client';
import { SCREEN_SHARE_CAPTURE, SCREEN_SHARE_PUBLISH } from '@/features/screen-share/constants';
import {
  clearScreenShareIntent,
  markScreenShareIntent,
} from '@/features/screen-share/services/screenShareIntentStore';

function assertRoomReady(room: Room) {
  if (room.state !== ConnectionState.Connected) {
    throw new Error('Bağlantı hazır değil — birkaç saniye sonra tekrar dene');
  }
}

export async function startScreenCapture(
  room: Room,
  pickerRef: RefObject<Component | null>,
): Promise<void> {
  assertRoomReady(room);

  if (Platform.OS === 'ios') {
    const reactTag = findNodeHandle(pickerRef.current as Parameters<typeof findNodeHandle>[0]);
    const manager =
      NativeModules.ScreenCapturePickerViewManager ??
      NativeModules.LKRNScreenCapturePickerViewManager;
    if (reactTag != null && manager?.show) {
      await manager.show(reactTag);
    }
  }

  // Niyet bayrağı izin dialogundan önce — kullanıcı onaylarsa keep-alive korur.
  markScreenShareIntent();

  try {
    // Android getDisplayMedia resolution ignore eder; bitrate/fps publish tarafında kısıtlanır.
    // audio:true → ScreenShareAudio (sistem/uygulama sesi) izleyicilere gider (platform destekliyorsa).
    await room.localParticipant.setScreenShareEnabled(
      true,
      {
        audio: true,
        systemAudio: 'include',
        suppressLocalAudioPlayback: false,
        resolution: SCREEN_SHARE_CAPTURE.resolution,
        contentHint: SCREEN_SHARE_CAPTURE.contentHint,
      },
      {
        videoCodec: SCREEN_SHARE_PUBLISH.videoCodec,
        screenShareEncoding: SCREEN_SHARE_PUBLISH.screenShareEncoding,
        degradationPreference: 'maintain-framerate',
        simulcast: false,
      },
    );
  } catch (err) {
    clearScreenShareIntent();
    throw err;
  }
}

export async function stopScreenCapture(room: Room): Promise<void> {
  clearScreenShareIntent();
  await room.localParticipant.setScreenShareEnabled(false);
}
