-- Gauge groups: requests to stop tracking an app, and push notifications about them.
--
-- Run once in the Supabase SQL Editor after 0001_groups.sql. Then, in the
-- dashboard:
--   * Database > Extensions: pg_net is enabled by the first statement below.
--   * Optional, recommended: turn on "Enhanced security for push notifications"
--     in the Expo project's settings, create an Expo access token, and store it
--     here with
--       select vault.create_secret('<token>', 'expo_access_token');
--     send_push() adds it when it exists, so without it nobody holding a push
--     token can send to that phone.
--
-- How it works
-- ------------
-- Voting is unchanged: each member row lists the apps that member agrees to stop
-- tracking (excludes) and the requests they voted to keep (declines). An app
-- stops being tracked once every member has it in excludes.
--
-- What's new is a trigger on members that compares a member's votes before and
-- after each change:
--   * the first person to vote to stop tracking an app makes the request. They
--     are recorded in stop_requests, and everyone else is notified;
--   * each later vote, either way, notifies the person who asked;
--   * when the last vote is in, the person who asked hears the result.
-- When nobody wants an app stopped any more (everyone withdrew, or someone
-- brought it back and the rest followed), the request ends and its "keep
-- tracking" votes are cleared, so a later request starts fresh.
--
-- Notifications go through Expo's push service (exp.host), which hands them to
-- Firebase Cloud Messaging. pg_net sends them after the vote's transaction
-- commits, so a vote that fails sends nothing.
--
-- What is stored: each phone's Expo push token, while it is in at least one
-- group, and who asked to stop tracking each app. Both go when you delete your
-- group data (by cascade from your anonymous user).
--
-- Like 0001, this file contains no backslashes.

create extension if not exists pg_net;

-- --- Tables -------------------------------------------------------------------

create table public.push_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  token text not null
    check (char_length(token) <= 200 and token ~ '^Expo(nent)?PushToken[[][A-Za-z0-9_-]+[]]$'),
  updated_at timestamptz not null default now()
);

create table public.stop_requests (
  group_id uuid not null,
  app text not null check (char_length(app) between 1 and 255),
  requested_by uuid not null,
  created_at timestamptz not null default now(),
  primary key (group_id, app),
  -- A request ends if the person who made it leaves the group.
  foreign key (group_id, requested_by) references public.members (group_id, user_id) on delete cascade
);

alter table public.push_tokens enable row level security;
alter table public.stop_requests enable row level security;

-- Push tokens are never readable by any phone, only by the functions below.
revoke all on public.push_tokens, public.stop_requests from anon, authenticated;
grant select on public.stop_requests to authenticated;

create policy "members read their groups' requests" on public.stop_requests
  for select to authenticated using (public.is_member(group_id));

-- --- Push tokens --------------------------------------------------------------

-- Register this phone for group notifications. One token per anonymous user.
create function public.set_push_token(p_token text)
  returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.push_tokens (user_id, token)
    values (auth.uid(), p_token)
    on conflict (user_id) do update set token = excluded.token, updated_at = now();
end;
$$;

-- Stop group notifications to this phone, after leaving your last group.
create function public.clear_push_token()
  returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.push_tokens where user_id = auth.uid();
end;
$$;

-- --- Sending ------------------------------------------------------------------

-- Text another phone supplied, made safe to show in a notification: no control
-- or text-direction characters, and capped in length.
create function public.notice_text(t text, max_len integer)
  returns text
  language sql immutable set search_path = ''
as $$
  select left(
    btrim(regexp_replace(
      coalesce(t, ''),
      '[[:cntrl:]' || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || ']',
      '', 'g')),
    max_len);
$$;

-- Queue one notification to each of these users' phones.
create function public.send_push(p_users uuid[], p_title text, p_body text, p_group uuid)
  returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  msgs jsonb;
  hdrs jsonb := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json');
  secret text;
begin
  select jsonb_agg(jsonb_build_object(
      'to', t.token,
      'title', p_title,
      'body', p_body,
      -- Read by the app when the notification is tapped (groupNotifications.ts).
      'data', jsonb_build_object('kind', 'stop-request', 'groupId', p_group),
      -- Created by the app before it registers (groupNotifications.ts).
      'channelId', 'group-requests',
      'priority', 'high'))
    into msgs
    from public.push_tokens t
    where t.user_id = any (p_users);
  -- A group has at most 30 members, well under Expo's 100 messages a request.
  if msgs is null then return; end if;
  begin
    select s.decrypted_secret into secret from vault.decrypted_secrets s where s.name = 'expo_access_token';
  exception when others then
    secret := null;
  end;
  if secret is not null then
    hdrs := hdrs || jsonb_build_object('Authorization', 'Bearer ' || secret);
  end if;
  perform net.http_post(url := 'https://exp.host/--/api/v2/push/send', body := msgs, headers := hdrs);
end;
$$;

-- --- Watching votes -----------------------------------------------------------

create function public.notify_stop_requests() returns trigger
  language plpgsql security definer set search_path = ''
as $$
declare
  v_app text;
  v_label text;
  v_group text;
  v_voter text := public.notice_text(new.name, 30);
  v_requester uuid;
  v_others uuid[];
  n_members integer;
  n_stop integer;
  n_keep integer;
begin
  -- The trigger's own clean-up below updates other member rows. Those changes
  -- aren't anyone's vote, so they mustn't notify.
  if pg_trigger_depth() > 1 then return null; end if;

  select public.notice_text(g.name, 30) into v_group from public.groups g where g.id = new.group_id;
  select count(*) into n_members from public.members m where m.group_id = new.group_id;

  -- Votes to stop tracking that this change added.
  for v_app, v_label in
    select e.key, e.value #>> '{}' from jsonb_each(new.excludes) e where not (old.excludes ? e.key)
  loop
    v_label := coalesce(nullif(public.notice_text(v_label, 60), ''), v_app);
    select r.requested_by into v_requester
      from public.stop_requests r where r.group_id = new.group_id and r.app = v_app;

    if not found then
      -- A new request. (Someone else may already agree, from before this
      -- migration or before the request ended. They count as agreeing, but
      -- this person is the one who asked.)
      insert into public.stop_requests (group_id, app, requested_by) values (new.group_id, v_app, new.user_id);
      v_requester := new.user_id;
      select coalesce(array_agg(m.user_id), '{}') into v_others
        from public.members m where m.group_id = new.group_id and m.user_id <> new.user_id;
      perform public.send_push(
        v_others,
        'Stop tracking ' || v_label || '?',
        v_voter || ' has requested ' || v_label || ' to stop being tracked in ' || v_group
          || '. Do you agree or disagree?',
        new.group_id);
    elsif v_requester <> new.user_id then
      perform public.send_push(
        array[v_requester],
        v_label || ' in ' || v_group,
        v_voter || ' agreed to stop tracking ' || v_label || ' in ' || v_group || '.',
        new.group_id);
    end if;

    -- The last vote decides it. The person who asked hears the result, unless
    -- they cast that vote themselves.
    if v_requester <> new.user_id then
      select count(*) filter (where m.excludes ? v_app),
             count(*) filter (where not (m.excludes ? v_app) and v_app = any (m.declines))
        into n_stop, n_keep
        from public.members m where m.group_id = new.group_id;
      if n_members >= 2 and n_stop = n_members then
        perform public.send_push(
          array[v_requester],
          v_label || ' in ' || v_group,
          'Everyone agreed. ' || v_label || ' is no longer tracked in ' || v_group || '.',
          new.group_id);
      elsif n_members >= 2 and n_stop + n_keep = n_members then
        perform public.send_push(
          array[v_requester],
          v_label || ' in ' || v_group,
          'Everyone in ' || v_group || ' has voted. ' || v_label || ' is still tracked, since not everyone agreed.',
          new.group_id);
      end if;
    end if;
  end loop;

  -- Votes to keep tracking that this change added.
  for v_app in
    select d from unnest(new.declines) d where not (d = any (old.declines))
  loop
    select r.requested_by into v_requester
      from public.stop_requests r where r.group_id = new.group_id and r.app = v_app;
    if not found or v_requester = new.user_id then continue; end if;
    -- The request's own vote carries the app's name. Reset first: a select
    -- that finds no row leaves the variable as the previous app's label.
    v_label := null;
    select coalesce(nullif(public.notice_text(m.excludes ->> v_app, 60), ''), v_app) into v_label
      from public.members m where m.group_id = new.group_id and m.user_id = v_requester;
    v_label := coalesce(v_label, v_app);
    perform public.send_push(
      array[v_requester],
      v_label || ' in ' || v_group,
      v_voter || ' wants to keep tracking ' || v_label || ' in ' || v_group || '.',
      new.group_id);

    select count(*) filter (where m.excludes ? v_app),
           count(*) filter (where not (m.excludes ? v_app) and v_app = any (m.declines))
      into n_stop, n_keep
      from public.members m where m.group_id = new.group_id;
    if n_members >= 2 and n_stop + n_keep = n_members then
      perform public.send_push(
        array[v_requester],
        v_label || ' in ' || v_group,
        'Everyone in ' || v_group || ' has voted. ' || v_label || ' is still tracked, since not everyone agreed.',
        new.group_id);
    end if;
  end loop;

  -- Requests nobody supports any more end, and their "keep tracking" votes go
  -- with them, so asking again later starts a fresh vote.
  for v_app in
    select k from jsonb_object_keys(old.excludes) k where not (new.excludes ? k)
  loop
    if not exists (select 1 from public.members m where m.group_id = new.group_id and m.excludes ? v_app) then
      delete from public.stop_requests r where r.group_id = new.group_id and r.app = v_app;
      update public.members m set declines = array_remove(m.declines, v_app)
        where m.group_id = new.group_id and v_app = any (m.declines);
    end if;
  end loop;

  return null;
end;
$$;

create trigger members_notify_stop_requests
  after update of excludes, declines on public.members
  for each row execute function public.notify_stop_requests();

-- --- Housekeeping -------------------------------------------------------------

-- Tokens for phones that haven't synced in 400 days go with the rest of their data.
create or replace function public.prune_stale()
  returns void
  language sql security definer set search_path = ''
as $$
  delete from public.days where day < current_date - 400;
  delete from public.members where updated_at < now() - interval '400 days';
  delete from public.push_tokens t
    where not exists (select 1 from public.members m where m.user_id = t.user_id);
$$;

revoke execute on function public.set_push_token, public.clear_push_token, public.notice_text, public.send_push,
  public.notify_stop_requests, public.prune_stale from public, anon;
grant execute on function public.set_push_token, public.clear_push_token to authenticated;
revoke execute on function public.notice_text, public.send_push, public.notify_stop_requests, public.prune_stale
  from authenticated;
