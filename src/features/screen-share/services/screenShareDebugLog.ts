/** Geçici teşhis — odadan atılma / Abort / WS 1001 kaynağını bulmak için. */
const TAG = '[ss-debug]';

export function ssLog(event: string, data?: Record<string, unknown>): void {
  if (data) {
    console.log(TAG, event, data);
  } else {
    console.log(TAG, event);
  }
}
