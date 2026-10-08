-- Gauge groups: monthly time challenges, played for paper money.
--
-- Run once in the Supabase SQL Editor after 0003_hourly_sync.sql.
--
-- The rules
-- ---------
-- Any member proposes a daily fee. Every member of the group must accept; one
-- decline and there's no challenge (someone can propose again). When the last
-- member accepts it starts that day and runs to the end of the month, for the
-- members in the group at that moment. Anyone who joins later waits for the
-- next challenge. One challenge per month: when it ends, someone proposes the
-- next.
--
-- Each day, whoever had the lowest screen time (everyone tied for lowest) wins
-- the point and pays nothing; every other player pays the fee into the pool.
-- At the end of the month the most points takes the pool, split evenly on a
-- tie. No money moves: the amounts are a tally.
--
-- The server only records the challenge and the votes, and sends the pushes
-- for proposals, declines and the start. Days, points and the pool are worked
-- out on each phone from the group's daily totals, exactly as points already
-- are (src/challenge.ts), so the server never needs anyone's per-app usage.
--
-- What is stored: each challenge's fee, month, who proposed it, who is
-- playing, and each member's accept or decline. All of it goes with the group,
-- and votes go with the anonymous user.
--
-- Like the earlier migrations, this file contains no backslashes.

-- --- Tables -------------------------------------------------------------------

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  -- The month it runs in, as its 1st day (the proposer's local calendar).
  month date not null check (extract(day from month) = 1),
  fee numeric(6, 2) not null check (fee between 0.25 and 100),
  proposed_by uuid references auth.users (id) on delete set null,
  status text not null default 'proposed' check (status in ('proposed', 'active', 'declined', 'withdrawn')),
  -- Set when the last member accepts.
  start_day date,
  -- Who plays, fixed when it starts.
  players uuid[] not null default '{}' check (cardinality(players) <= 30),
  created_at timestamptz not null default now()
);

create index challenges_group_month on public.challenges (group_id, month);

create table public.challenge_votes (
  challenge_id uuid not null references public.challenges (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  accepted boolean not null,
  voted_at timestamptz not null default now(),
  primary key (challenge_id, user_id)
);

alter table public.challenges enable row level security;
alter table public.challenge_votes enable row level security;

-- Read-only for phones. Every change goes through the functions below.
revoke all on public.challenges, public.challenge_votes from anon, authenticated;
grant select on public.challenges, public.challenge_votes to authenticated;

create policy "members read their groups' challenges" on public.challenges
  for select to authenticated using (public.is_member(group_id));

create policy "members read their groups' challenge votes" on public.challenge_votes
  for select to authenticated using (
    exists (select 1 from public.challenges c where c.id = challenge_id and public.is_member(c.group_id))
  );

-- --- Helpers ------------------------------------------------------------------

-- "$1.00"
create function public.money_text(v numeric)
  returns text
  language sql immutable set search_path = ''
as $$
  select '$' || to_char(v, 'FM999990.00');
$$;

-- "October 31": the last day of a challenge's month.
create function public.challenge_end_text(p_month date)
  returns text
  language sql immutable set search_path = ''
as $$
  select to_char((p_month + interval '1 month')::date - 1, 'FMMonth FMDD');
$$;

-- Queue one push to each of these users' phones, about a group's challenge.
create function public.push_challenge(p_users uuid[], p_title text, p_body text, p_group uuid)
  returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object(
      'to', t.token,
      'title', p_title,
      'body', p_body,
      -- Read by the app when tapped (groupNotifications.ts).
      'data', jsonb_build_object('kind', 'challenge', 'groupId', p_group),
      -- Created by the app when it registers (groupNotifications.ts).
      'channelId', 'group-challenge',
      'priority', 'high'))
    into msgs
    from public.push_tokens t
    where t.user_id = any (p_users);
  perform public.expo_post(msgs);
end;
$$;

-- --- Proposing and voting -----------------------------------------------------

-- Propose a challenge for the rest of this month. You accept it by proposing.
create function public.propose_challenge(p_group uuid, p_fee numeric, p_today date)
  returns uuid
  language plpgsql security definer set search_path = ''
as $$
declare
  v_month date := date_trunc('month', p_today)::date;
  v_id uuid;
  v_name text;
  v_group text;
  v_others uuid[];
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.is_member(p_group) then raise exception 'not a member'; end if;
  if p_fee is null or p_fee < 0.25 or p_fee > 100 then raise exception 'bad fee' using errcode = 'P0005'; end if;
  if (select count(*) from public.members m where m.group_id = p_group) < 2 then
    raise exception 'not enough members' using errcode = 'P0003';
  end if;
  -- Proposals nobody finished before their month ended are over.
  update public.challenges c set status = 'withdrawn'
    where c.group_id = p_group and c.status = 'proposed' and c.month < v_month;
  if exists (select 1 from public.challenges c
             where c.group_id = p_group and c.month = v_month and c.status in ('proposed', 'active')) then
    raise exception 'challenge exists' using errcode = 'P0004';
  end if;

  insert into public.challenges (group_id, month, fee, proposed_by)
    values (p_group, v_month, round(p_fee, 2), auth.uid())
    returning id into v_id;
  insert into public.challenge_votes (challenge_id, user_id, accepted) values (v_id, auth.uid(), true);

  select public.notice_text(m.name, 30) into v_name
    from public.members m where m.group_id = p_group and m.user_id = auth.uid();
  select public.notice_text(g.name, 30) into v_group from public.groups g where g.id = p_group;
  select coalesce(array_agg(m.user_id), '{}') into v_others
    from public.members m where m.group_id = p_group and m.user_id <> auth.uid();
  perform public.push_challenge(
    v_others,
    'Time challenge in ' || v_group || '?',
    v_name || ' proposed a time challenge until ' || public.challenge_end_text(v_month) || ': '
      || public.money_text(round(p_fee, 2)) || ' a day from everyone except the day''s lowest screen time. '
      || 'Most points wins the pool. Accept?',
    p_group);
  return v_id;
end;
$$;

-- Accept or decline. One decline ends it; the last accept starts it, today.
create function public.respond_challenge(p_challenge uuid, p_accept boolean, p_today date)
  returns text
  language plpgsql security definer set search_path = ''
as $$
declare
  c public.challenges;
  v_name text;
  v_group text;
  v_members uuid[];
  v_others uuid[];
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into c from public.challenges where id = p_challenge for update;
  if not found or not public.is_member(c.group_id) then raise exception 'not found' using errcode = 'P0002'; end if;
  if c.status <> 'proposed' then return c.status; end if;
  if c.month < date_trunc('month', p_today)::date then
    update public.challenges set status = 'withdrawn' where id = c.id;
    return 'withdrawn';
  end if;

  insert into public.challenge_votes (challenge_id, user_id, accepted)
    values (c.id, auth.uid(), p_accept)
    on conflict (challenge_id, user_id) do update set accepted = excluded.accepted, voted_at = now();

  select public.notice_text(m.name, 30) into v_name
    from public.members m where m.group_id = c.group_id and m.user_id = auth.uid();
  select public.notice_text(g.name, 30) into v_group from public.groups g where g.id = c.group_id;
  select coalesce(array_agg(m.user_id), '{}') into v_members from public.members m where m.group_id = c.group_id;
  v_others := array_remove(v_members, auth.uid());

  if not p_accept then
    update public.challenges set status = 'declined' where id = c.id;
    perform public.push_challenge(
      v_others,
      'No time challenge in ' || v_group,
      v_name || ' declined the ' || public.money_text(c.fee) || '-a-day challenge, so it''s off. '
        || 'Anyone can propose another.',
      c.group_id);
    return 'declined';
  end if;

  -- Everyone in the group now, not just whoever was there when it was proposed.
  if not exists (
    select 1 from public.members m
    where m.group_id = c.group_id
      and not exists (select 1 from public.challenge_votes v
                      where v.challenge_id = c.id and v.user_id = m.user_id and v.accepted)
  ) then
    update public.challenges set status = 'active', start_day = p_today, players = v_members where id = c.id;
    perform public.push_challenge(
      v_members,
      'Time challenge started',
      'Everyone''s in. ' || v_group || '''s ' || public.money_text(c.fee) || '-a-day challenge runs until '
        || public.challenge_end_text(c.month) || '. Lowest screen time each day pays nothing.',
      c.group_id);
    return 'active';
  end if;
  return 'proposed';
end;
$$;

-- The proposer can take a proposal back until it starts.
create function public.withdraw_challenge(p_challenge uuid)
  returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.challenges set status = 'withdrawn'
    where id = p_challenge and proposed_by = auth.uid() and status = 'proposed';
end;
$$;

revoke execute on function public.money_text, public.challenge_end_text, public.push_challenge,
  public.propose_challenge, public.respond_challenge, public.withdraw_challenge from public, anon;
grant execute on function public.propose_challenge, public.respond_challenge, public.withdraw_challenge
  to authenticated;
revoke execute on function public.money_text, public.challenge_end_text, public.push_challenge from authenticated;
