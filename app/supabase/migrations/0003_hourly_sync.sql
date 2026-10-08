-- Gauge groups: an hourly signal that makes every member's phone sync.
--
-- Run once in the Supabase SQL Editor after 0002_stop_tracking_requests.sql.
--
-- Phones can't sync on the hour by themselves: Android only gives exact timing
-- through the exact-alarm permission, which Play reserves for alarm clocks and
-- calendars. So the server keeps time instead. At the top of every hour pg_cron
-- sends a silent push to every phone that is in a group. The push has no title
-- or body, so nothing appears on screen; it wakes Gauge, which records the
-- latest usage and uploads the day's totals (src/sync/groupNotifications.ts).
--
-- Android may still hold a ping back from a phone in deep sleep, or one that
-- has been sent many silent pushes. The phone's own background task (every few
-- hours) and opening the app remain as fallbacks, as before.
--
-- Nothing new is stored. Like 0001 and 0002, this file contains no backslashes.

-- Posts messages to Expo's push service, at most 100 per request as Expo
-- allows. The access token from Vault is added when one exists (see 0002).
create function public.expo_post(p_msgs jsonb)
  returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  hdrs jsonb := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json');
  secret text;
  n integer := coalesce(jsonb_array_length(p_msgs), 0);
  i integer := 0;
begin
  if n = 0 then return; end if;
  begin
    select s.decrypted_secret into secret from vault.decrypted_secrets s where s.name = 'expo_access_token';
  exception when others then
    secret := null;
  end;
  if secret is not null then
    hdrs := hdrs || jsonb_build_object('Authorization', 'Bearer ' || secret);
  end if;
  while i < n loop
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := (select jsonb_agg(m.value order by m.ord)
                 from jsonb_array_elements(p_msgs) with ordinality m (value, ord)
                 where m.ord > i and m.ord <= i + 100),
      headers := hdrs);
    i := i + 100;
  end loop;
end;
$$;

-- The hourly ping: one silent push to each phone registered in any group.
create function public.send_sync_pings()
  returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  msgs jsonb;
begin
  select jsonb_agg(jsonb_build_object(
      'to', t.token,
      -- Read by the app's background task. No title or body: a data-only push
      -- runs code without showing anything.
      'data', jsonb_build_object('kind', 'sync'),
      'priority', 'high',
      -- A ping that arrives more than 50 minutes late is worthless: the next
      -- one is about to be sent. Android drops it instead of delivering it.
      'ttl', 3000))
    into msgs
    from public.push_tokens t
    where exists (select 1 from public.members m where m.user_id = t.user_id);
  perform public.expo_post(msgs);
end;
$$;

revoke execute on function public.expo_post, public.send_sync_pings from public, anon, authenticated;

-- pg_cron runs in UTC. On the hour in UTC is on the hour in every time zone
-- that's a whole number of hours from UTC (most of the world).
select cron.schedule('gauge-hourly-sync', '0 * * * *', 'select public.send_sync_pings()');
