-- Herkese açık şifresiz odalar, ziyaret edilen odalar, yeni oda açınca eskiyi kapatma.

drop function if exists public.create_screen_share_session(text, text, text);
drop function if exists public.create_screen_share_session(text, text, text, boolean);

create or replace function public.create_screen_share_session(
  p_title text default null,
  p_password text default null,
  p_cover_image_url text default null,
  p_replace_existing boolean default false
)
returns public.screen_share_sessions
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.screen_share_sessions;
  v_code text;
  v_hash text := null;
  v_cover text := nullif(trim(coalesce(p_cover_image_url, '')), '');
  v_open_count int := 0;
begin
  if v_uid is null then
    raise exception 'Giriş gerekli';
  end if;

  select count(*)::int into v_open_count
  from public.screen_share_sessions s
  where s.host_user_id = v_uid and s.status = 'live';

  if v_open_count > 0 and not coalesce(p_replace_existing, false) then
    raise exception 'HAS_OPEN_ROOM';
  end if;

  if v_open_count > 0 and coalesce(p_replace_existing, false) then
    update public.screen_share_sessions
    set status = 'ended', ended_at = now()
    where host_user_id = v_uid and status = 'live';

    update public.screen_share_participants p
    set left_at = coalesce(p.left_at, now())
    from public.screen_share_sessions s
    where p.session_id = s.id
      and s.host_user_id = v_uid
      and s.status = 'ended'
      and p.left_at is null;
  end if;

  if p_password is not null and length(trim(p_password)) > 0 then
    if length(trim(p_password)) < 4 then
      raise exception 'Şifre en az 4 karakter olmalı';
    end if;
    v_hash := extensions.crypt(trim(p_password), extensions.gen_salt('bf'));
  end if;

  if v_cover is not null and length(v_cover) > 2048 then
    raise exception 'Kapak URL çok uzun';
  end if;
  if v_cover is not null and v_cover !~* '^https://' then
    raise exception 'Kapak URL geçersiz';
  end if;

  v_code := public._screen_share_random_code();

  insert into public.screen_share_sessions (
    join_code,
    livekit_room_name,
    host_user_id,
    title,
    status,
    password_hash,
    cover_image_url
  ) values (
    v_code,
    'ss_' || gen_random_uuid()::text,
    v_uid,
    coalesce(nullif(trim(p_title), ''), 'Sesli oda'),
    'live',
    v_hash,
    v_cover
  )
  returning * into v_session;

  insert into public.screen_share_participants (session_id, user_id, password_verified)
  values (v_session.id, v_uid, true);

  return v_session;
end;
$$;

-- Ortak satır şekli: hub / public / visited / feed
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
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'user_id', x.user_id,
          'username', x.username,
          'avatar_url', x.avatar_url
        )
        order by x.ord
      )
      from (
        select
          p.user_id,
          pr.username,
          pr.avatar_url,
          row_number() over (
            order by (p.user_id = s.host_user_id) desc, p.joined_at asc
          ) as ord
        from public.screen_share_participants p
        join public.profiles pr on pr.id = p.user_id
        where p.session_id = s.id
          and p.left_at is null
        order by (p.user_id = s.host_user_id) desc, p.joined_at asc
        limit 3
      ) x
    ), '[]'::jsonb) as preview_members,
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

create or replace function public.list_visited_screen_share_sessions(p_limit integer default 24)
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
  host_username text,
  last_visited_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_limit int := greatest(1, least(coalesce(p_limit, 24), 40));
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
    false as is_host,
    '[]'::jsonb as preview_members,
    s.cover_image_url,
    host.avatar_url::text as host_avatar_url,
    host.username::text as host_username,
    p.joined_at as last_visited_at
  from public.screen_share_participants p
  join public.screen_share_sessions s on s.id = p.session_id
  join public.profiles host on host.id = s.host_user_id
  where p.user_id = v_uid
    and p.kicked_at is null
    and s.status = 'live'
    and s.host_user_id <> v_uid
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = v_uid and b.blocked_id = s.host_user_id)
         or (b.blocker_id = s.host_user_id and b.blocked_id = v_uid)
    )
  order by p.joined_at desc
  limit v_limit;
end;
$$;

-- Feed teşviki: ara sıra şifresiz canlı odalar
create or replace function public.list_feed_screen_share_promos(p_limit integer default 4)
returns table (
  id uuid,
  join_code text,
  title text,
  participant_count integer,
  cover_image_url text,
  host_user_id uuid,
  host_avatar_url text,
  host_username text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_limit int := greatest(1, least(coalesce(p_limit, 4), 8));
begin
  if v_uid is null then
    return;
  end if;

  return query
  select
    s.id,
    s.join_code,
    s.title,
    s.participant_count,
    s.cover_image_url,
    s.host_user_id,
    host.avatar_url::text,
    host.username::text,
    s.created_at
  from public.screen_share_sessions s
  join public.profiles host on host.id = s.host_user_id
  where s.status = 'live'
    and s.password_hash is null
    and s.host_user_id <> v_uid
    and s.participant_count >= 1
    and not exists (
      select 1 from public.user_blocks b
      where (b.blocker_id = v_uid and b.blocked_id = s.host_user_id)
         or (b.blocker_id = s.host_user_id and b.blocked_id = v_uid)
    )
  order by s.participant_count desc, s.created_at desc
  limit v_limit;
end;
$$;

-- Rapor hedef çözümü: screen_share_session → host (mevcut case'ler korunur)
create or replace function public.resolve_report_target_user(p_target_type text, p_target_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  case p_target_type
    when 'profile' then return p_target_id;
    when 'post' then
      select author_id into v_user_id from public.posts where id = p_target_id;
      return v_user_id;
    when 'reel' then
      select author_id into v_user_id from public.reels where id = p_target_id;
      return v_user_id;
    when 'comment' then
      select author_id into v_user_id from public.post_comments where id = p_target_id;
      return v_user_id;
    when 'business_ad' then
      select owner_id into v_user_id from public.business_ads where id = p_target_id;
      return v_user_id;
    when 'marketplace_listing' then
      select author_id into v_user_id from public.marketplace_listings where id = p_target_id;
      return v_user_id;
    when 'business_shop', 'business' then
      select owner_id into v_user_id from public.businesses where id = p_target_id;
      return v_user_id;
    when 'event' then
      select organizer_id into v_user_id from public.events where id = p_target_id;
      return v_user_id;
    when 'lost_item' then
      select author_id into v_user_id from public.lost_items where id = p_target_id;
      return v_user_id;
    when 'screen_share_session' then
      select host_user_id into v_user_id from public.screen_share_sessions where id = p_target_id;
      return v_user_id;
    else return null;
  end case;
end;
$$;

grant execute on function public.create_screen_share_session(text, text, text, boolean) to authenticated;
grant execute on function public.list_public_screen_share_sessions(integer) to authenticated;
grant execute on function public.list_visited_screen_share_sessions(integer) to authenticated;
grant execute on function public.list_feed_screen_share_promos(integer) to authenticated;
