-- Bağımsız ekran paylaşımı oturumları (city-voice'tan ayrı; LiveKit aynı altyapı).

create table if not exists public.screen_share_sessions (
  id uuid primary key default gen_random_uuid(),
  join_code text not null,
  livekit_room_name text not null unique,
  host_user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null default 'Ekran paylaşımı',
  status text not null default 'live' check (status in ('live', 'ended')),
  participant_count integer not null default 1,
  created_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint screen_share_sessions_join_code_format check (join_code ~ '^[0-9]{6}$')
);

create unique index if not exists screen_share_sessions_live_code_uidx
  on public.screen_share_sessions (join_code)
  where status = 'live';

create index if not exists screen_share_sessions_host_live_idx
  on public.screen_share_sessions (host_user_id, status, created_at desc);

create table if not exists public.screen_share_participants (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.screen_share_sessions (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (session_id, user_id)
);

create index if not exists screen_share_participants_session_idx
  on public.screen_share_participants (session_id)
  where left_at is null;

alter table public.screen_share_sessions enable row level security;
alter table public.screen_share_participants enable row level security;

create policy screen_share_sessions_select on public.screen_share_sessions
  for select to authenticated using (true);

create policy screen_share_participants_select on public.screen_share_participants
  for select to authenticated using (true);

create or replace function public._screen_share_random_code()
returns text
language plpgsql
as $$
declare
  v_code text;
  v_tries int := 0;
begin
  loop
    v_tries := v_tries + 1;
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (
      select 1 from public.screen_share_sessions s
      where s.join_code = v_code and s.status = 'live'
    );
    if v_tries > 20 then
      raise exception 'join code üretilemedi';
    end if;
  end loop;
  return v_code;
end;
$$;

create or replace function public.create_screen_share_session(p_title text default null)
returns public.screen_share_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.screen_share_sessions;
  v_code text;
begin
  if v_uid is null then
    raise exception 'Giriş gerekli';
  end if;

  -- Aynı host'un önceki canlı oturumunu kapat
  update public.screen_share_sessions
  set status = 'ended', ended_at = now()
  where host_user_id = v_uid and status = 'live';

  v_code := public._screen_share_random_code();

  insert into public.screen_share_sessions (
    join_code,
    livekit_room_name,
    host_user_id,
    title,
    status
  ) values (
    v_code,
    'ss_' || gen_random_uuid()::text,
    v_uid,
    coalesce(nullif(trim(p_title), ''), 'Ekran paylaşımı'),
    'live'
  )
  returning * into v_session;

  insert into public.screen_share_participants (session_id, user_id)
  values (v_session.id, v_uid);

  return v_session;
end;
$$;

create or replace function public.join_screen_share_session(p_code text)
returns public.screen_share_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.screen_share_sessions;
  v_code text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
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

  insert into public.screen_share_participants (session_id, user_id)
  values (v_session.id, v_uid)
  on conflict (session_id, user_id) do update
    set left_at = null, joined_at = now();

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

create or replace function public.leave_screen_share_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Giriş gerekli';
  end if;

  update public.screen_share_participants
  set left_at = now()
  where session_id = p_session_id and user_id = v_uid and left_at is null;

  update public.screen_share_sessions s
  set participant_count = (
    select count(*)::int from public.screen_share_participants p
    where p.session_id = s.id and p.left_at is null
  )
  where s.id = p_session_id and status = 'live';
end;
$$;

create or replace function public.end_screen_share_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Giriş gerekli';
  end if;

  update public.screen_share_sessions
  set status = 'ended', ended_at = now()
  where id = p_session_id and host_user_id = v_uid and status = 'live';

  update public.screen_share_participants
  set left_at = coalesce(left_at, now())
  where session_id = p_session_id and left_at is null;
end;
$$;

grant execute on function public.create_screen_share_session(text) to authenticated;
grant execute on function public.join_screen_share_session(text) to authenticated;
grant execute on function public.leave_screen_share_session(uuid) to authenticated;
grant execute on function public.end_screen_share_session(uuid) to authenticated;

insert into public.app_feature_flags (feature_id, label, feature_group, is_button_visible)
values ('screen-share', 'Ekran Paylaşımı', 'actions', true)
on conflict (feature_id) do update
set label = excluded.label,
    feature_group = excluded.feature_group,
    is_button_visible = true;
