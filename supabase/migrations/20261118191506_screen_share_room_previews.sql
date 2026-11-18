-- Hub kartlarında 2–3 üye avatar önizlemesi için list_my_screen_share_sessions genişletilir.

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
  preview_members jsonb
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
    ), '[]'::jsonb) as preview_members
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

grant execute on function public.list_my_screen_share_sessions() to authenticated;
