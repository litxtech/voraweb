import type { Component, RefObject } from 'react';
import { findNodeHandle, NativeModules, Platform } from 'react-native';
import type { Room } from 'livekit-client';
import { SCREEN_SHARE_CAPTURE, SCREEN_SHARE_PUBLISH } from '@/features/screen-share/constants';

export async function startScreenCapture(
  room: Room,
  pickerRef: RefObject<Component | null>,
): Promise<void> {
  if (Platform.OS === 'ios') {
    const reactTag = findNodeHandle(pickerRef.current as Parameters<typeof findNodeHandle>[0]);
    const manager =
      NativeModules.ScreenCapturePickerViewManager ??
      NativeModules.LKRNScreenCapturePickerViewManager;
    if (reactTag != null && manager?.show) {
      await manager.show(reactTag);
    }
  }

  await room.localParticipant.setScreenShareEnabled(
    true,
    {
      audio: false,
      resolution: SCREEN_SHARE_CAPTURE.resolution,
      contentHint: SCREEN_SHARE_CAPTURE.contentHint,
    },
    {
      videoCodec: SCREEN_SHARE_PUBLISH.videoCodec,
      screenShareEncoding: SCREEN_SHARE_PUBLISH.screenShareEncoding,
      degradationPreference: 'maintain-framerate',
    },
  );
}

export async function stopScreenCapture(room: Room): Promise<void> {
  await room.localParticipant.setScreenShareEnabled(false);
}
