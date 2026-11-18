-- Sesli oda Phase 1: kalıcılık, şifre, üye hatırlama, kick, liste.

create extension if not exists pgcrypto with schema extensions;

alter table public.screen_share_sessions
  add column if not exists password_hash text;

alter table public.screen_share_participants
  add column if not exists password_verified boolean not null default false;

alter table public.screen_share_participants
  add column if not exists kicked_at timestamptz;

-- Eski tek-arg imzaları kaldır; iki opsiyonel argümanlı sürüm kullanılacak.
drop function if exists public.create_screen_share_session(text);
drop function if exists public.join_screen_share_session(text);

-- Host önceki live odaları otomatik kapatmaz; manuel silinene kadar live kalır.
create or replace function public.create_screen_share_session(
  p_title text default null,
  p_password text default null
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
begin
  if v_uid is null then
    raise exception 'Giriş gerekli';
  end if;

  if p_password is not null and length(trim(p_password)) > 0 then
    if length(trim(p_password)) < 4 then
      raise exception 'Şifre en az 4 karakter olmalı';
    end if;
    v_hash := extensions.crypt(trim(p_password), extensions.gen_salt('bf'));
  end if;

  v_code := public._screen_share_random_code();

  insert into public.screen_share_sessions (
    join_code,
    livekit_room_name,
    host_user_id,
    title,
    status,
    password_hash
  ) values (
    v_code,
    'ss_' || gen_random_uuid()::text,
    v_uid,
    coalesce(nullif(trim(p_title), ''), 'Sesli oda'),
    'live',
    v_hash
  )
  returning * into v_session;

  insert into public.screen_share_participants (session_id, user_id, password_verified)
  values (v_session.id, v_uid, true);

  return v_session;
end;
$$;

create or replace function public.join_screen_share_session(
  p_code text,
  p_password text default null
)
returns public.screen_share_sessions
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.screen_share_sessions;
  v_code text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  v_existing public.screen_share_participants;
  v_needs_password boolean := false;
begin
  if v_uid is null then
    raise exception 'Giriş gerekli';
  end if;
  if length(v_code) <> 6 then
    raise exception 'Geçersiz kod';
  end if;

  select * into v_session
  from public.screen_share_sessions
  where join_code = v_code and status = 'live'
  limit 1;

  if v_session.id is null then
    raise exception 'Oturum bulunamadı veya sona erdi';
  end if;

  select * into v_existing
  from public.screen_share_participants
  where session_id = v_session.id and user_id = v_uid;

  if v_existing.id is not null and v_existing.kicked_at is not null then
    raise exception 'Bu odadan çıkarıldınız';
  end if;

  v_needs_password := v_session.password_hash is not null
    and (v_existing.id is null or v_existing.password_verified is not true);

  if v_needs_password then
    if p_password is null or length(trim(p_password)) = 0 then
      raise exception 'PASSWORD_REQUIRED';
    end if;
    if extensions.crypt(trim(p_password), v_session.password_hash) <> v_session.password_hash then
      raise exception 'Şifre hatalı';
    end if;
  end if;

  insert into public.screen_share_participants (
    session_id, user_id, password_verified, kicked_at, left_at, joined_at
  ) values (
    v_session.id, v_uid, true, null, null, now()
  )
  on conflict (session_id, user_id) do update
    set left_at = null,
        joined_at = now(),
        password_verified = true,
        kicked_at = null;

  update public.screen_share_sessions s
  set participant_count = (
    select count(*)::int from public.screen_share_participants p
    where p.session_id = s.id and p.left_at is null
  )
  where s.id = v_session.id
  returning * into v_session;

  return v_session;
end;
$$;

create or replace function public.set_screen_share_password(
  p_session_id uuid,
  p_password text default null
)
returns public.screen_share_sessions
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.screen_share_sessions;
  v_hash text := null;
begin
  if v_uid is null then
    raise exception 'Giriş gerekli';
  end if;

  select * into v_session
  from public.screen_share_sessions
  where id = p_session_id and status = 'live'
  limit 1;

  if v_session.id is null then
    raise exception 'Oda bulunamadı';
  end if;
  if v_session.host_user_id <> v_uid then
    raise exception 'Sadece oda sahibi şifreyi değiştirebilir';
  end if;

  if p_password is not null and length(trim(p_password)) > 0 then
    if length(trim(p_password)) < 4 then
      raise exception 'Şifre en az 4 karakter olmalı';
    end if;
    v_hash := extensions.crypt(trim(p_password), extensions.gen_salt('bf'));
  end if;

  update public.screen_share_sessions
  set password_hash = v_hash
  where id = p_session_id
  returning * into v_session;

  if v_hash is not null then
    update public.screen_share_participants
    set password_verified = (user_id = v_uid)
    where session_id = p_session_id;
  else
    update public.screen_share_participants
    set password_verified = true
    where session_id = p_session_id;
  end if;

  return v_session;
end;
$$;

create or replace function public.delete_screen_share_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_updated int;
begin
  if v_uid is null then
    raise exception 'Giriş gerekli';
  end if;

  update public.screen_share_sessions
  set status = 'ended', ended_at = now()
  where id = p_session_id and host_user_id = v_uid and status = 'live';

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    raise exception 'Oda silinemedi';
  end if;

  update public.screen_share_participants
  set left_at = coalesce(left_at, now())
  where session_id = p_session_id and left_at is null;
end;
$$;

create or replace function public.end_screen_share_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.delete_screen_share_session(p_session_id);
end;
$$;

create or replace function public.kick_screen_share_participant(
  p_session_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_host uuid;
begin
  if v_uid is null then
    raise exception 'Giriş gerekli';
  end if;

  select host_user_id into v_host
  from public.screen_share_sessions
  where id = p_session_id and status = 'live';

  if v_host is null then
    raise exception 'Oda bulunamadı';
  end if;
  if v_host <> v_uid then
    raise exception 'Sadece oda sahibi üye atabilir';
  end if;
  if p_user_id = v_uid then
    raise exception 'Kendinizi atamazsınız';
  end if;

  update public.screen_share_participants
  set left_at = coalesce(left_at, now()),
      kicked_at = now()
  where session_id = p_session_id and user_id = p_user_id;

  update public.screen_share_sessions s
  set participant_count = (
    select count(*)::int from public.screen_share_participants p
    where p.session_id = s.id and p.left_at is null
  )
  where s.id = p_session_id and status = 'live';
end;
$$;

create or replace function public.list_screen_share_participants(p_session_id uuid)
returns table (
  user_id uuid,
  username text,
  full_name text,
  avatar_url text,
  is_host boolean,
  is_online boolean,
  joined_at timestamptz,
  kicked_at timestamptz
)
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_uid uuid := auth.uid();
  v_host uuid;
begin
  if v_uid is null then
    raise exception 'Giriş gerekli';
  end if;

  select s.host_user_id into v_host
  from public.screen_share_sessions s
  where s.id = p_session_id;

  if v_host is null then
    raise exception 'Oda bulunamadı';
  end if;

  if not exists (
    select 1 from public.screen_share_participants p
    where p.session_id = p_session_id and p.user_id = v_uid
  ) and v_host <> v_uid then
    raise exception 'Bu odayı görme yetkiniz yok';
  end if;

  return query
  select
    p.user_id,
    pr.username::text,
    pr.full_name::text,
    pr.avatar_url::text,
    (p.user_id = v_host) as is_host,
    (p.left_at is null) as is_online,
    p.joined_at,
    p.kicked_at
  from public.screen_share_participants p
  join public.profiles pr on pr.id = p.user_id
  where p.session_id = p_session_id
  order by
    (p.user_id = v_host) desc,
    (p.left_at is null) desc,
    p.joined_at asc;
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
  is_host boolean
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
    (s.host_user_id = v_uid) as is_host
  from public.screen_share_sessions s
  where s.status = 'live'
    and (
      s.host_user_id = v_uid
      or exists (
        select 1 from public.screen_share_participants p
        where p.session_id = s.id and p.user_id = v_uid and p.kicked_at is null
      )
    )
  order by s.created_at desc;
end;
$$;

grant execute on function public.create_screen_share_session(text, text) to authenticated;
grant execute on function public.join_screen_share_session(text, text) to authenticated;
grant execute on function public.set_screen_share_password(uuid, text) to authenticated;
grant execute on function public.delete_screen_share_session(uuid) to authenticated;
grant execute on function public.end_screen_share_session(uuid) to authenticated;
grant execute on function public.kick_screen_share_participant(uuid, uuid) to authenticated;
grant execute on function public.list_screen_share_participants(uuid) to authenticated;
grant execute on function public.list_my_screen_share_sessions() to authenticated;
