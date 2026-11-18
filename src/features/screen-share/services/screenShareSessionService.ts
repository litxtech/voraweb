import { supabase } from '@/lib/supabase/client';
import { supabaseErrorMessage } from '@/lib/errors';
import type { ScreenShareSession, ScreenShareTokenResponse } from '@/features/screen-share/types';

function mapSession(row: {
  id: string;
  join_code: string;
  livekit_room_name: string;
  host_user_id: string;
  title: string;
  status: string;
  participant_count: number;
  created_at: string;
  ended_at: string | null;
}): ScreenShareSession {
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
  };
}

export async function createScreenShareSession(title?: string): Promise<ScreenShareSession> {
  const { data, error } = await supabase.rpc('create_screen_share_session', {
    p_title: title ?? null,
  });
  if (error) throw new Error(supabaseErrorMessage(error));
  return mapSession(data);
}

export async function joinScreenShareSession(code: string): Promise<ScreenShareSession> {
  const { data, error } = await supabase.rpc('join_screen_share_session', {
    p_code: code,
  });
  if (error) throw new Error(supabaseErrorMessage(error));
  return mapSession(data);
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

export async function fetchScreenShareSession(sessionId: string): Promise<ScreenShareSession | null> {
  const { data, error } = await supabase
    .from('screen_share_sessions')
    .select(
      'id, join_code, livekit_room_name, host_user_id, title, status, participant_count, created_at, ended_at',
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
