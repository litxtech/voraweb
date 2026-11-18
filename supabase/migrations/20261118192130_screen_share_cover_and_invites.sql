-- Kapak görseli + host avatar önizleme + güvenli davet isteği + join rate limit.

alter table public.screen_share_sessions
  add column if not exists cover_image_url text;

create table if not exists public.screen_share_join_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.screen_share_sessions (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (session_id, requester_id)
);

create index if not exists screen_share_join_requests_session_pending_idx
  on public.screen_share_join_requests (session_id, created_at desc)
  where status = 'pending';

create index if not exists screen_share_join_requests_requester_idx
  on public.screen_share_join_requests (requester_id, created_at desc);

alter table public.screen_share_join_requests enable row level security;

drop policy if exists screen_share_join_requests_select on public.screen_share_join_requests;
create policy screen_share_join_requests_select on public.screen_share_join_requests
  for select to authenticated
  using (
    requester_id = auth.uid()
    or exists (
      select 1 from public.screen_share_sessions s
      where s.id = session_id and s.host_user_id = auth.uid()
    )
  );

create table if not exists public.screen_share_join_attempts (
  id bigserial primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  join_code text not null,
  created_at timestamptz not null default now()
);

create index if not exists screen_share_join_attempts_user_created_idx
  on public.screen_share_join_attempts (user_id, created_at desc);

alter table public.screen_share_join_attempts enable row level security;

-- Kimse doğrudan okuyamaz; yalnızca security definer fonksiyonlar yazar.
drop policy if exists screen_share_join_attempts_deny on public.screen_share_join_attempts;
create policy screen_share_join_attempts_deny on public.screen_share_join_attempts
  for all to authenticated
  using (false)
  with check (false);

create or replace function public._screen_share_assert_join_rate_limit()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    raise exception 'Giriş gerekli';
  end if;

  delete from public.screen_share_join_attempts
  where user_id = v_uid and created_at < now() - interval '10 minutes';

  select count(*)::int into v_count
  from public.screen_share_join_attempts
  where user_id = v_uid and created_at > now() - interval '10 minutes';

  if v_count >= 12 then
    raise exception 'Çok fazla deneme. Birkaç dakika sonra tekrar dene.';
  end if;

  insert into public.screen_share_join_attempts (user_id, join_code)
  values (v_uid, '------');
end;
$$;

drop function if exists public.create_screen_share_session(text, text);
drop function if exists public.create_screen_share_session(text, text, text);

create or replace function public.create_screen_share_session(
  p_title text default null,
  p_password text default null,
  p_cover_image_url text default null
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

create or replace function public.set_screen_share_cover(
  p_session_id uuid,
  p_cover_image_url text default null
)
returns public.screen_share_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_session public.screen_share_sessions;
  v_cover text := nullif(trim(coalesce(p_cover_image_url, '')), '');
begin
  if v_uid is null then
    raise exception 'Giriş gerekli';
  end if;

  select * into v_session
  from public.screen_share_sessions
  where id = p_session_id and status = 'live';

  if v_session.id is null then
    raise exception 'Oda bulunamadı';
  end if;
  if v_session.host_user_id <> v_uid then
    raise exception 'Yalnızca host kapak ekleyebilir';
  end if;

  if v_cover is not null and length(v_cover) > 2048 then
    raise exception 'Kapak URL çok uzun';
  end if;
  if v_cover is not null and v_cover !~* '^https://' then
    raise exception 'Kapak URL geçersiz';
  end if;

  update public.screen_share_sessions
  set cover_image_url = v_cover
  where id = p_session_id
  returning * into v_session;

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
    perform public._screen_share_assert_join_rate_limit();
    update public.screen_share_join_attempts
    set join_code = v_code
    where id = (
      select a.id from public.screen_share_join_attempts a
      where a.user_id = v_uid
      order by a.created_at desc
      limit 1
    );
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

  -- Doğrulanmış üye yeniden giriyorsa rate limit uygulama
  if v_existing.id is null or v_needs_password then
    perform public._screen_share_assert_join_rate_limit();
    update public.screen_share_join_attempts
    set join_code = v_code
    where id = (
      select a.id from public.screen_share_join_attempts a
      where a.user_id = v_uid
      order by a.created_at desc
      limit 1
    );
  end if;

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

drop function if exists public.list_my_screen_share_sessions();

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

create or replace function public.request_screen_share_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := regexp_replace(coalesce(p_code, ''), '\D', '', 'g');
  v_session public.screen_share_sessions;
  v_existing public.screen_share_participants;
  v_request_id uuid;
  v_username text;
  v_recent int;
begin
  if v_uid is null then
    raise exception 'Giriş gerekli';
  end if;
  if length(v_code) <> 6 then
    raise exception 'Geçersiz kod';
  end if;

  perform public._screen_share_assert_join_rate_limit();

  select count(*)::int into v_recent
  from public.screen_share_join_requests r
  where r.requester_id = v_uid
    and r.created_at > now() - interval '10 minutes';
  if v_recent >= 5 then
    raise exception 'Çok fazla davet isteği. Biraz sonra tekrar dene.';
  end if;

  select * into v_session
  from public.screen_share_sessions
  where join_code = v_code and status = 'live'
  limit 1;

  if v_session.id is null then
    raise exception 'Oturum bulunamadı veya sona erdi';
  end if;

  if v_session.password_hash is null then
    raise exception 'Bu oda şifresiz; kod ile doğrudan girebilirsin';
  end if;

  if v_session.host_user_id = v_uid then
    raise exception 'Kendi odana davet isteği gönderemezsin';
  end if;

  select * into v_existing
  from public.screen_share_participants
  where session_id = v_session.id and user_id = v_uid;

  if v_existing.id is not null and v_existing.kicked_at is null and v_existing.password_verified then
    raise exception 'Zaten bu odadasın';
  end if;

  if v_existing.id is not null and v_existing.kicked_at is not null then
    raise exception 'Bu odadan çıkarıldınız';
  end if;

  insert into public.screen_share_join_requests (session_id, requester_id, status)
  values (v_session.id, v_uid, 'pending')
  on conflict (session_id, requester_id) do update
    set status = 'pending',
        created_at = now(),
        resolved_at = null
  returning id into v_request_id;

  select username into v_username from public.profiles where id = v_uid;

  perform public.notify_user_system(
    v_session.host_user_id,
    'Sesli oda davet isteği',
    coalesce('@' || v_username, 'Bir kullanıcı') || ' "' || v_session.title || '" odasına davet istiyor.',
    jsonb_build_object(
      'kind', 'screen_share_invite',
      'sessionId', v_session.id,
      'requestId', v_request_id,
      'joinCode', v_session.join_code
    ),
    'normal',
    v_uid
  );

  return v_request_id;
end;
$$;

create or replace function public.list_screen_share_join_requests(p_session_id uuid)
returns table (
  id uuid,
  requester_id uuid,
  username text,
  full_name text,
  avatar_url text,
  status text,
  created_at timestamptz
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
  if v_host <> v_uid then
    raise exception 'Yalnızca host istekleri görebilir';
  end if;

  return query
  select
    r.id,
    r.requester_id,
    pr.username::text,
    pr.full_name::text,
    pr.avatar_url::text,
    r.status,
    r.created_at
  from public.screen_share_join_requests r
  join public.profiles pr on pr.id = r.requester_id
  where r.session_id = p_session_id
    and r.status = 'pending'
  order by r.created_at asc;
end;
$$;

create or replace function public.respond_screen_share_invite(
  p_request_id uuid,
  p_approve boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_req public.screen_share_join_requests;
  v_session public.screen_share_sessions;
begin
  if v_uid is null then
    raise exception 'Giriş gerekli';
  end if;

  select * into v_req
  from public.screen_share_join_requests
  where id = p_request_id;

  if v_req.id is null then
    raise exception 'İstek bulunamadı';
  end if;

  select * into v_session
  from public.screen_share_sessions
  where id = v_req.session_id and status = 'live';

  if v_session.id is null then
    raise exception 'Oda bulunamadı veya sona erdi';
  end if;
  if v_session.host_user_id <> v_uid then
    raise exception 'Yalnızca host yanıtlayabilir';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'İstek zaten yanıtlandı';
  end if;

  update public.screen_share_join_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      resolved_at = now()
  where id = p_request_id;

  if p_approve then
    insert into public.screen_share_participants (
      session_id, user_id, password_verified, kicked_at, left_at, joined_at
    ) values (
      v_session.id, v_req.requester_id, true, null, null, now()
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
    where s.id = v_session.id;

    perform public.notify_user_system(
      v_req.requester_id,
      'Davet kabul edildi',
      '"' || v_session.title || '" odasına girebilirsin.',
      jsonb_build_object(
        'kind', 'screen_share_invite_accepted',
        'sessionId', v_session.id,
        'joinCode', v_session.join_code
      ),
      'normal',
      v_uid
    );
  else
    perform public.notify_user_system(
      v_req.requester_id,
      'Davet reddedildi',
      '"' || v_session.title || '" odası için isteğin reddedildi.',
      jsonb_build_object(
        'kind', 'screen_share_invite_rejected',
        'sessionId', v_session.id
      ),
      'normal',
      v_uid
    );
  end if;
end;
$$;

grant execute on function public.create_screen_share_session(text, text, text) to authenticated;
grant execute on function public.set_screen_share_cover(uuid, text) to authenticated;
grant execute on function public.join_screen_share_session(text, text) to authenticated;
grant execute on function public.list_my_screen_share_sessions() to authenticated;
grant execute on function public.request_screen_share_invite(text) to authenticated;
grant execute on function public.list_screen_share_join_requests(uuid) to authenticated;
grant execute on function public.respond_screen_share_invite(uuid, boolean) to authenticated;
