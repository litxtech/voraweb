import { supabase } from '@/lib/supabase/client';
import { supabaseErrorMessage } from '@/lib/errors';
import type {
  ScreenShareJoinRequest,
  ScreenShareParticipant,
  ScreenShareSession,
  ScreenShareTokenResponse,
} from '@/features/screen-share/types';

type PreviewMemberRow = {
  user_id?: string;
  username?: string;
  avatar_url?: string | null;
};

type SessionRow = {
  id: string;
  join_code: string;
  livekit_room_name: string;
  host_user_id: string;
  title: string;
  status: string;
  participant_count: number;
  created_at: string;
  ended_at: string | null;
  password_hash?: string | null;
  has_password?: boolean;
  is_host?: boolean;
  preview_members?: PreviewMemberRow[] | null;
  cover_image_url?: string | null;
  host_avatar_url?: string | null;
  host_username?: string | null;
};

function mapPreviewMembers(rows: PreviewMemberRow[] | null | undefined) {
  if (!Array.isArray(rows)) return undefined;
  return rows
    .filter((row) => row.user_id && row.username)
    .slice(0, 3)
    .map((row) => ({
      userId: row.user_id as string,
      username: row.username as string,
      avatarUrl: row.avatar_url ?? null,
    }));
}

function mapSession(row: SessionRow): ScreenShareSession {
  return {
    id: row.id,
    joinCode: row.join_code,
    livekitRoomName: row.livekit_room_name,
    hostUserId: row.host_user_id,
    title: row.title,
    status: row.status === 'ended' ? 'ended' : 'live',
    participantCount: row.participant_count,
    createdAt: row.created_at,
    endedAt: row.ended_at,
    hasPassword: Boolean(row.has_password ?? row.password_hash),
    isHost: row.is_host,
    previewMembers: mapPreviewMembers(row.preview_members),
    coverImageUrl: row.cover_image_url ?? null,
    hostAvatarUrl: row.host_avatar_url ?? null,
    hostUsername: row.host_username ?? null,
  };
}

export class ScreenSharePasswordRequiredError extends Error {
  constructor() {
    super('PASSWORD_REQUIRED');
    this.name = 'ScreenSharePasswordRequiredError';
  }
}

export class ScreenShareHasOpenRoomError extends Error {
  constructor() {
    super('HAS_OPEN_ROOM');
    this.name = 'ScreenShareHasOpenRoomError';
  }
}

function rethrowJoinError(error: { message?: string }): never {
  const msg = supabaseErrorMessage(error);
  if (msg.includes('PASSWORD_REQUIRED')) {
    throw new ScreenSharePasswordRequiredError();
  }
  throw new Error(msg);
}

export async function createScreenShareSession(
  title?: string,
  password?: string | null,
  coverImageUrl?: string | null,
  replaceExisting = false,
): Promise<ScreenShareSession> {
  const { data, error } = await supabase.rpc('create_screen_share_session', {
    p_title: title ?? null,
    p_password: password?.trim() ? password.trim() : null,
    p_cover_image_url: coverImageUrl?.trim() ? coverImageUrl.trim() : null,
    p_replace_existing: replaceExisting,
  });
  if (error) {
    const msg = supabaseErrorMessage(error);
    if (msg.includes('HAS_OPEN_ROOM')) throw new ScreenShareHasOpenRoomError();
    throw new Error(msg);
  }
  return mapSession({ ...data, has_password: Boolean(password?.trim()) });
}

export async function listPublicScreenShareSessions(
  limit = 40,
): Promise<ScreenShareSession[]> {
  const { data, error } = await supabase.rpc('list_public_screen_share_sessions', {
    p_limit: limit,
  });
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []).map((row: SessionRow) => mapSession(row));
}

export async function listVisitedScreenShareSessions(
  limit = 24,
): Promise<ScreenShareSession[]> {
  const { data, error } = await supabase.rpc('list_visited_screen_share_sessions', {
    p_limit: limit,
  });
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []).map((row: SessionRow) => mapSession(row));
}

export type ScreenShareFeedPromo = {
  id: string;
  joinCode: string;
  title: string;
  participantCount: number;
  coverImageUrl: string | null;
  hostUserId: string;
  hostAvatarUrl: string | null;
  hostUsername: string | null;
  createdAt: string;
};

export async function listFeedScreenSharePromos(limit = 4): Promise<ScreenShareFeedPromo[]> {
  const { data, error } = await supabase.rpc('list_feed_screen_share_promos', {
    p_limit: limit,
  });
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []).map(
    (row: {
      id: string;
      join_code: string;
      title: string;
      participant_count: number;
      cover_image_url: string | null;
      host_user_id: string;
      host_avatar_url: string | null;
      host_username: string | null;
      created_at: string;
    }) => ({
      id: row.id,
      joinCode: row.join_code,
      title: row.title,
      participantCount: row.participant_count,
      coverImageUrl: row.cover_image_url,
      hostUserId: row.host_user_id,
      hostAvatarUrl: row.host_avatar_url,
      hostUsername: row.host_username,
      createdAt: row.created_at,
    }),
  );
}

export async function setScreenShareCover(
  sessionId: string,
  coverImageUrl: string | null,
): Promise<ScreenShareSession> {
  const { data, error } = await supabase.rpc('set_screen_share_cover', {
    p_session_id: sessionId,
    p_cover_image_url: coverImageUrl?.trim() ? coverImageUrl.trim() : null,
  });
  if (error) throw new Error(supabaseErrorMessage(error));
  return mapSession(data);
}

export async function joinScreenShareSession(
  code: string,
  password?: string | null,
): Promise<ScreenShareSession> {
  const { data, error } = await supabase.rpc('join_screen_share_session', {
    p_code: code,
    p_password: password?.trim() ? password.trim() : null,
  });
  if (error) rethrowJoinError(error);
  return mapSession(data);
}

export async function requestScreenShareInvite(code: string): Promise<string> {
  const { data, error } = await supabase.rpc('request_screen_share_invite', {
    p_code: code,
  });
  if (error) throw new Error(supabaseErrorMessage(error));
  return data as string;
}

export async function listScreenShareJoinRequests(
  sessionId: string,
): Promise<ScreenShareJoinRequest[]> {
  const { data, error } = await supabase.rpc('list_screen_share_join_requests', {
    p_session_id: sessionId,
  });
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []).map(
    (row: {
      id: string;
      requester_id: string;
      username: string;
      full_name: string | null;
      avatar_url: string | null;
      status: string;
      created_at: string;
    }) => ({
      id: row.id,
      requesterId: row.requester_id,
      username: row.username,
      fullName: row.full_name,
      avatarUrl: row.avatar_url,
      status: row.status,
      createdAt: row.created_at,
    }),
  );
}

export async function respondScreenShareInvite(
  requestId: string,
  approve: boolean,
): Promise<void> {
  const { error } = await supabase.rpc('respond_screen_share_invite', {
    p_request_id: requestId,
    p_approve: approve,
  });
  if (error) throw new Error(supabaseErrorMessage(error));
}

export async function leaveScreenShareSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_screen_share_session', {
    p_session_id: sessionId,
  });
  if (error) throw new Error(supabaseErrorMessage(error));
}

export async function endScreenShareSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('end_screen_share_session', {
    p_session_id: sessionId,
  });
  if (error) throw new Error(supabaseErrorMessage(error));
}

export async function deleteScreenShareSession(sessionId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_screen_share_session', {
    p_session_id: sessionId,
  });
  if (error) throw new Error(supabaseErrorMessage(error));
}

export async function setScreenSharePassword(
  sessionId: string,
  password: string | null,
): Promise<ScreenShareSession> {
  const { data, error } = await supabase.rpc('set_screen_share_password', {
    p_session_id: sessionId,
    p_password: password?.trim() ? password.trim() : null,
  });
  if (error) throw new Error(supabaseErrorMessage(error));
  return mapSession({ ...data, has_password: Boolean(password?.trim()) });
}

export async function kickScreenShareParticipant(
  sessionId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase.rpc('kick_screen_share_participant', {
    p_session_id: sessionId,
    p_user_id: userId,
  });
  if (error) throw new Error(supabaseErrorMessage(error));
}

export async function listScreenShareParticipants(
  sessionId: string,
): Promise<ScreenShareParticipant[]> {
  const { data, error } = await supabase.rpc('list_screen_share_participants', {
    p_session_id: sessionId,
  });
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []).map(
    (row: {
      user_id: string;
      username: string;
      full_name: string | null;
      avatar_url: string | null;
      is_host: boolean;
      is_online: boolean;
      joined_at: string;
      kicked_at: string | null;
    }) => ({
      userId: row.user_id,
      username: row.username,
      fullName: row.full_name,
      avatarUrl: row.avatar_url,
      isHost: row.is_host,
      isOnline: row.is_online,
      joinedAt: row.joined_at,
      kickedAt: row.kicked_at,
    }),
  );
}

export async function listMyScreenShareSessions(): Promise<ScreenShareSession[]> {
  const { data, error } = await supabase.rpc('list_my_screen_share_sessions');
  if (error) throw new Error(supabaseErrorMessage(error));
  return (data ?? []).map((row: SessionRow) => mapSession(row));
}

export async function fetchScreenShareSession(sessionId: string): Promise<ScreenShareSession | null> {
  const { data, error } = await supabase
    .from('screen_share_sessions')
    .select(
      'id, join_code, livekit_room_name, host_user_id, title, status, participant_count, created_at, ended_at, password_hash, cover_image_url',
    )
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw new Error(supabaseErrorMessage(error));
  if (!data) return null;
  return mapSession(data);
}

export async function fetchLiveKitScreenShareToken(
  sessionId: string,
): Promise<ScreenShareTokenResponse> {
  const { data, error } = await supabase.functions.invoke<ScreenShareTokenResponse>('livekit-token', {
    body: { kind: 'screen_share', sessionId },
  });
  if (error) throw error;
  if (!data?.token) throw new Error('LiveKit token alınamadı');
  return data;
}
