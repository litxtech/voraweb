export const SCREEN_SHARE_SEAT_ATTR = 'ss_seat';
export const SCREEN_SHARE_MOD_TOPIC = 'ss_mod';

/** '1' = koltukta, '0' = ayakta (dinleyici) */
export type SeatFlag = '0' | '1';

export type SeatModPayload =
  | { v: 1; action: 'force_mute'; targetUserId: string }
  | { v: 1; action: 'force_stand'; targetUserId: string };

export function encodeSeatMod(payload: SeatModPayload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function decodeSeatMod(raw: Uint8Array): SeatModPayload | null {
  try {
    const data = JSON.parse(new TextDecoder().decode(raw)) as SeatModPayload;
    if (!data || data.v !== 1) return null;
    if (
      (data.action === 'force_mute' || data.action === 'force_stand') &&
      typeof data.targetUserId === 'string' &&
      data.targetUserId.length > 0
    ) {
      return data;
    }
    return null;
  } catch {
    return null;
  }
}

export function readSeatFlag(attributes: Record<string, string> | undefined): SeatFlag {
  if (!attributes) return '1';
  return attributes[SCREEN_SHARE_SEAT_ATTR] === '0' ? '0' : '1';
}
