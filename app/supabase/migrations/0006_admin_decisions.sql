-- Gauge groups: the group's creator can decide for members who haven't answered.
--
-- Run once in the Supabase SQL Editor after 0005_best_effort_pushes.sql.
--
-- Leaving an app out needs every member to agree (0001), and a request can sit
-- for days waiting on someone who never opens the app. The member who created
-- the group (groups.created_by) is its admin, and can now settle such a request:
-- everyone who hasn't answered is counted as agreeing, so the app stops being
-- tracked for the whole group. An explicit "Keep tracking" is still respected:
-- while any member has said keep, the admin can't overrule it.
--
-- Members are told who decided, in one notification, rather than each being
-- reported as having agreed. Anyone can still bring the app back, as before.
--
-- Like the earlier migrations, this file contains no backslashes.

-- The vote trigger from 0002, unchanged except that it stays quiet while an
-- admin's decision is being recorded.
create or replace function public.notify_stop_requests() returns trigger
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
  -- An admin's decision isn't anyone's vote either: admin_stop_tracking below
  -- sends one notice of its own instead of one "agreed" per member.
  if current_setting('gauge.admin_decision', true) = 'on' then return null; end if;

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

-- Settle a request to stop tracking an app, as the group's admin.
create function public.admin_stop_tracking(p_group uuid, p_app text)
  returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  v_label text;
  v_admin text;
  v_group text;
  v_others uuid[];
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.groups g where g.id = p_group and g.created_by = auth.uid())
     or not public.is_member(p_group) then
    raise exception 'not the admin' using errcode = 'P0007';
  end if;
  -- Only an open request can be settled: someone has asked.
  select m.excludes ->> p_app into v_label
    from public.members m where m.group_id = p_group and m.excludes ? p_app limit 1;
  if v_label is null then raise exception 'no request' using errcode = 'P0008'; end if;
  -- An explicit "Keep tracking" is respected.
  if exists (select 1 from public.members m
             where m.group_id = p_group and p_app = any (m.declines) and not (m.excludes ? p_app)) then
    raise exception 'someone said keep' using errcode = 'P0006';
  end if;

  perform set_config('gauge.admin_decision', 'on', true);
  update public.members m
    set excludes = m.excludes || jsonb_build_object(p_app, v_label)
    where m.group_id = p_group and not (m.excludes ? p_app);
  perform set_config('gauge.admin_decision', 'off', true);

  v_label := coalesce(nullif(public.notice_text(v_label, 60), ''), p_app);
  select public.notice_text(m.name, 30) into v_admin
    from public.members m where m.group_id = p_group and m.user_id = auth.uid();
  select public.notice_text(g.name, 30) into v_group from public.groups g where g.id = p_group;
  select coalesce(array_agg(m.user_id), '{}') into v_others
    from public.members m where m.group_id = p_group and m.user_id <> auth.uid();
  perform public.send_push(
    v_others,
    v_label || ' in ' || v_group,
    v_admin || ' (the group''s admin) stopped tracking ' || v_label || ' in ' || v_group
      || ' for everyone, counting members who hadn''t answered as agreeing. Anyone can bring it back.',
    p_group);
end;
$$;

revoke execute on function public.admin_stop_tracking from public, anon;
grant execute on function public.admin_stop_tracking to authenticated;
