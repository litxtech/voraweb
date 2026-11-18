import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { AccessToken, TrackSource } from 'npm:livekit-server-sdk@2.9.1';
import { jsonSafeError } from '../_shared/supabaseAuth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type TokenBody = {
  kind?: 'city_voice' | 'screen_share';
  roomId?: string;
  sessionId?: string;
  roomName?: string;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const livekitUrl = Deno.env.get('LIVEKIT_URL');
    const apiKey = Deno.env.get('LIVEKIT_API_KEY');
    const apiSecret = Deno.env.get('LIVEKIT_API_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!livekitUrl || !apiKey || !apiSecret) {
      return new Response(JSON.stringify({ error: 'LiveKit credentials missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (!supabaseUrl || !serviceKey || !anonKey) {
      return new Response(JSON.stringify({ error: 'Supabase credentials missing' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userId = authData.user.id;
    const body = (await req.json()) as TokenBody;
    const kind = body.kind === 'screen_share' ? 'screen_share' : 'city_voice';

    if (kind === 'screen_share') {
      const sessionId = body.sessionId?.trim();
      if (!sessionId) {
        return new Response(JSON.stringify({ error: 'sessionId required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: session, error: sessionError } = await admin
        .from('screen_share_sessions')
        .select('id, livekit_room_name, status, host_user_id')
        .eq('id', sessionId)
        .maybeSingle();

      if (sessionError || !session) {
        return new Response(JSON.stringify({ error: 'Session not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (session.status !== 'live') {
        return new Response(JSON.stringify({ error: 'Session ended' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: participant } = await admin
        .from('screen_share_participants')
        .select('id, kicked_at')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .is('left_at', null)
        .maybeSingle();

      if (!participant) {
        return new Response(JSON.stringify({ error: 'Join session first' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (participant.kicked_at) {
        return new Response(JSON.stringify({ error: 'Kicked from session' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const isHost = session.host_user_id === userId;
      // İzleyici: yalnızca mikrofon. Ekran / ekran sesi sadece host.
      const publishSources = isHost
        ? [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
        : [TrackSource.MICROPHONE];
      const at = new AccessToken(apiKey, apiSecret, {
        identity: userId,
        ttl: '2h',
      });
      at.addGrant({
        roomJoin: true,
        room: session.livekit_room_name,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canUpdateOwnMetadata: isHost,
        canPublishSources: publishSources,
      });

      const token = await at.toJwt();
      return new Response(
        JSON.stringify({
          token,
          url: livekitUrl,
          roomName: session.livekit_room_name,
          canPublish: true,
          canPublishScreen: isHost,
          isHost,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const roomId = body.roomId?.trim();
    if (!roomId) {
      return new Response(JSON.stringify({ error: 'roomId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: room, error: roomError } = await admin
      .from('city_voice_rooms')
      .select('id, livekit_room_name, status, region_ids')
      .eq('id', roomId)
      .maybeSingle();

    if (roomError || !room) {
      return new Response(JSON.stringify({ error: 'Room not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (room.status !== 'live') {
      return new Response(JSON.stringify({ error: 'Room not live' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: participant } = await admin
      .from('city_voice_room_participants')
      .select('role')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .is('left_at', null)
      .maybeSingle();

    if (!participant) {
      return new Response(JSON.stringify({ error: 'Join room first' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const canPublish = ['speaker', 'city_leader', 'council_member', 'moderator', 'admin'].includes(
      participant.role,
    );

    const at = new AccessToken(apiKey, apiSecret, {
      identity: userId,
      ttl: '1h',
    });
    at.addGrant({
      roomJoin: true,
      room: room.livekit_room_name,
      canPublish,
      canSubscribe: true,
      ...(canPublish
        ? {
            canPublishSources: [
              TrackSource.MICROPHONE,
              TrackSource.SCREEN_SHARE,
              TrackSource.SCREEN_SHARE_AUDIO,
            ],
          }
        : {}),
    });

    const token = await at.toJwt();

    return new Response(
      JSON.stringify({
        token,
        url: livekitUrl,
        roomName: room.livekit_room_name,
        canPublish,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    return jsonSafeError(error, 500);
  }
});
