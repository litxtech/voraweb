import { ssLog } from '@/features/screen-share/services/screenShareDebugLog';

/** Aynı odaya link / remount ile yeniden girerken leave/join yarışını önler. */
let leaveTimer: ReturnType<typeof setTimeout> | null = null;
let leaveSessionId: string | null = null;

export function cancelScheduledScreenShareLeave(): void {
  if (leaveTimer == null) return;
  ssLog('leave.cancel', { sessionId: leaveSessionId });
  clearTimeout(leaveTimer);
  leaveTimer = null;
  leaveSessionId = null;
}

/**
 * Gecikmeli leave — Strict Mode / nested stack remount leave-before-connected
 * ve çift LiveKit identity (WS 1001) yarışını keser.
 */
export function scheduleScreenShareLeave(
  sessionId: string,
  task: (sessionId: string) => void,
  delayMs = 900,
): void {
  cancelScheduledScreenShareLeave();
  leaveSessionId = sessionId;
  ssLog('leave.schedule', { sessionId, delayMs });
  leaveTimer = setTimeout(() => {
    leaveTimer = null;
    const id = leaveSessionId;
    leaveSessionId = null;
    if (!id) return;
    ssLog('leave.fire', { sessionId: id });
    task(id);
  }, delayMs);
}
