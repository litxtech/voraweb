-- Hub listelerini hızlandır: her oda için ağır preview_members alt sorgusunu kaldır.
-- Kart zaten host_avatar / cover kullanıyor.

create or replace function public.list_public_screen_share_sessions(p_limit integer default 40)
returns table (
  id uuid,
  join_code text,
  livekit_room_name text,
  host_user_id uuid,
  title text,
  status text,
  participant_count integer,
  created_at timestamptz,
  ended_at timestamptz,
  has_password boolean,
  is_host boolean,
  preview_members jsonb,
  cover_image_url text,
  host_avatar_url text,
  host_username text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_limit int := greatest(1, least(coalesce(p_limit, 40), 60));
begin
  if v_uid is null then
    raise exception 'Giriş gerekli';
  end if;

  return query
  select
    s.id,
    s.join_code,
    s.livekit_room_name,
    s.host_user_id,
    s.title,
    s.status,
    s.participant_count,
    s.created_at,
    s.ended_at,
    false as has_password,
    (s.host_user_id = v_uid) as is_host,
    '[]'::jsonb as preview_members,
    s.cover_image_url,
    host.avatar_url::text as host_avatar_url,
    host.username::text as host_username
  from public.screen_share_sessions s
  join public.profiles host on host.id = s.host_user_id
  where s.status = 'live'
    and s.password_hash is null
    and s.host_user_id <> v_uid
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = v_uid and b.blocked_id = s.host_user_id)
         or (b.blocker_id = s.host_user_id and b.blocked_id = v_uid)
    )
  order by s.participant_count desc, s.created_at desc
  limit v_limit;
end;
$$;

create or replace function public.list_my_screen_share_sessions()
returns table (
  id uuid,
  join_code text,
  livekit_room_name text,
  host_user_id uuid,
  title text,
  status text,
  participant_count integer,
  created_at timestamptz,
  ended_at timestamptz,
  has_password boolean,
  is_host boolean,
  preview_members jsonb,
  cover_image_url text,
  host_avatar_url text,
  host_username text
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Giriş gerekli';
  end if;

  return query
  select
    s.id,
    s.join_code,
    s.livekit_room_name,
    s.host_user_id,
    s.title,
    s.status,
    s.participant_count,
    s.created_at,
    s.ended_at,
    (s.password_hash is not null) as has_password,
    (s.host_user_id = v_uid) as is_host,
    '[]'::jsonb as preview_members,
    s.cover_image_url,
    host.avatar_url::text as host_avatar_url,
    host.username::text as host_username
  from public.screen_share_sessions s
  join public.profiles host on host.id = s.host_user_id
  where s.status = 'live'
    and (
      s.host_user_id = v_uid
      or exists (
        select 1 from public.screen_share_participants p
        where p.session_id = s.id and p.user_id = v_uid and p.kicked_at is null
      )
    )
  order by (s.host_user_id = v_uid) desc, s.created_at desc;
end;
$$;

grant execute on function public.list_public_screen_share_sessions(integer) to authenticated;
grant execute on function public.list_my_screen_share_sessions() to authenticated;
