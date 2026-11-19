export const SCREEN_SHARE_SEAT_ATTR = 'ss_seat';
/** 'L' = lider koltuğu, '0'..'10' = ızgara */
export const SCREEN_SHARE_SLOT_ATTR = 'ss_slot';
/** '1' = mik açmaya izinli */
export const SCREEN_SHARE_MIC_OK_ATTR = 'ss_mic_ok';
/** '1' = ekran paylaşımına izinli (lider/admin dışı) */
export const SCREEN_SHARE_SCREEN_OK_ATTR = 'ss_screen_ok';
/** Host participant attributes — oda politikası (herkes okur) */
export const SCREEN_SHARE_LEADER_ID_ATTR = 'ss_leader_id';
export const SCREEN_SHARE_LEADER_LOCK_ATTR = 'ss_leader_lock';
export const SCREEN_SHARE_MIC_AUTO_ATTR = 'ss_mic_auto';

export const SCREEN_SHARE_MOD_TOPIC = 'ss_mod';

/** '1' = koltukta, '0' = ayakta (dinleyici) */
export type SeatFlag = '0' | '1';

export type SeatSlot = 'L' | `${number}`;

export type SeatModPayload =
  | { v: 1; action: 'force_mute'; targetUserId: string }
  | { v: 1; action: 'force_stand'; targetUserId: string }
  | { v: 1; action: 'grant_mic'; targetUserId: string }
  | { v: 1; action: 'revoke_mic'; targetUserId: string }
  | { v: 1; action: 'grant_screen'; targetUserId: string }
  | { v: 1; action: 'revoke_screen'; targetUserId: string }
  | { v: 1; action: 'assign_leader'; targetUserId: string }
  | { v: 1; action: 'clear_leader'; targetUserId: string }
  | { v: 1; action: 'take_slot'; targetUserId: string; slot: SeatSlot }
  | {
      v: 1;
      action: 'room_policy';
      targetUserId: '*';
      leaderLocked?: boolean;
      micAuto?: boolean;
      leaderId?: string | null;
    };

export function encodeSeatMod(payload: SeatModPayload): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(payload));
}

export function decodeSeatMod(raw: Uint8Array): SeatModPayload | null {
  try {
    const data = JSON.parse(new TextDecoder().decode(raw)) as SeatModPayload;
    if (!data || data.v !== 1) return null;
    const actions = new Set([
      'force_mute',
      'force_stand',
      'grant_mic',
      'revoke_mic',
      'grant_screen',
      'revoke_screen',
      'assign_leader',
      'clear_leader',
      'take_slot',
      'room_policy',
    ]);
    if (!actions.has(data.action)) return null;
    if (typeof (data as { targetUserId?: string }).targetUserId !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

/** Yalnızca açıkça '1' ise koltukta — eksik attr hayali koltuk üretmesin. */
export function readSeatFlag(attributes: Record<string, string> | undefined): SeatFlag {
  if (!attributes) return '0';
  return attributes[SCREEN_SHARE_SEAT_ATTR] === '1' ? '1' : '0';
}

export function readSeatSlot(attributes: Record<string, string> | undefined): SeatSlot | null {
  if (!attributes) return null;
  const raw = attributes[SCREEN_SHARE_SLOT_ATTR];
  if (raw === 'L') return 'L';
  if (raw != null && /^\d{1,2}$/.test(raw)) {
    const n = Number(raw);
    if (n >= 0 && n <= 10) return String(n) as SeatSlot;
  }
  return null;
}

export function readMicOk(attributes: Record<string, string> | undefined): boolean {
  if (!attributes) return false;
  return attributes[SCREEN_SHARE_MIC_OK_ATTR] === '1';
}

export function readScreenOk(attributes: Record<string, string> | undefined): boolean {
  if (!attributes) return false;
  return attributes[SCREEN_SHARE_SCREEN_OK_ATTR] === '1';
}

/** Lider koltuğu: yalnızca oda admini veya atanmış lider. */
export function canClaimLeaderSeat(userId: string, hostUserId: string, leaderId: string | null): boolean {
  if (userId === hostUserId) return true;
  if (leaderId && userId === leaderId) return true;
  return false;
}

export function readAttrFlag(
  attributes: Record<string, string> | undefined,
  key: string,
  fallback: boolean,
): boolean {
  if (!attributes || attributes[key] == null || attributes[key] === '') return fallback;
  return attributes[key] === '1';
}

export type RoomPolicyState = {
  leaderId: string | null;
  leaderLocked: boolean;
  micAuto: boolean;
};

/** Host (veya lider) participant attr’larından oda politikasını oku. */
export function readRoomPolicyFromParticipants(
  participants: Array<{ identity: string; attributes?: Record<string, string> }>,
  hostUserId: string,
): RoomPolicyState {
  const host = participants.find((p) => p.identity === hostUserId);
  const attrs = host?.attributes;
  const leaderFromAttr = attrs?.[SCREEN_SHARE_LEADER_ID_ATTR]?.trim() || null;
  return {
    leaderId: leaderFromAttr || hostUserId,
    // Varsayılan kilitli: lider koltuğu yalnızca yetki/atama ile
    leaderLocked: readAttrFlag(attrs, SCREEN_SHARE_LEADER_LOCK_ATTR, true),
    micAuto: readAttrFlag(attrs, SCREEN_SHARE_MIC_AUTO_ATTR, true),
  };
}
