-- Gauge groups: a notification that can't be sent never blocks what caused it.
--
-- Run once in the Supabase SQL Editor after 0004_time_challenges.sql.
--
-- Pushes are sent from inside the functions and trigger that record votes and
-- challenges. Until now, a failure while sending one (a missing function, as
-- when 0004 was run before 0003, or pg_net rejecting the request) failed the
-- whole call, so the proposal or vote itself was lost and the app showed an
-- error. Notifications are a courtesy; the vote is the point. Both senders now
-- log a warning (Database > Logs) and carry on.
--
-- Like the earlier migrations, this file contains no backslashes.

-- From 0002: requests to stop tracking an app.
create or replace function public.send_push(p_users uuid[], p_title text, p_body text, p_group uuid)
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
      -- Read by the app when the notification is tapped (groupNotifications.ts).
      'data', jsonb_build_object('kind', 'stop-request', 'groupId', p_group),
      -- Created by the app before it registers (groupNotifications.ts).
      'channelId', 'group-requests',
      'priority', 'high'))
    into msgs
    from public.push_tokens t
    where t.user_id = any (p_users);
  begin
    perform public.expo_post(msgs);
  exception when others then
    raise warning 'gauge: stop-request push not sent: %', sqlerrm;
  end;
end;
$$;

-- From 0004: time challenges.
create or replace function public.push_challenge(p_users uuid[], p_title text, p_body text, p_group uuid)
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
  begin
    perform public.expo_post(msgs);
  exception when others then
    raise warning 'gauge: challenge push not sent: %', sqlerrm;
  end;
end;
$$;

-- create or replace keeps existing grants, but restate them so this file stands alone.
revoke execute on function public.send_push, public.push_challenge from public, anon, authenticated;
