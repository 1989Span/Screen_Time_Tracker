-- Gauge groups: members' daily screen-time totals, synced automatically.
--
-- Run once in the Supabase SQL Editor (or with `supabase db push`). The project
-- also needs Authentication > Sign In / Providers > "Allow anonymous sign-ins"
-- turned on, and its URL and publishable key under expo.extra.supabase in app.json.
--
-- Security model
-- --------------
-- Every phone signs in as an anonymous Supabase user (role `authenticated`).
-- Row Level Security then decides everything:
--   * you can read a group, its roster and its daily totals only if you are a
--     member of it;
--   * you can change only your own member row (your name and your votes), and
--     only those columns;
--   * daily totals are written only through push_days(), which checks that you
--     are a member and that each number is a plausible day's minutes;
--   * joining needs the group's invite code, checked inside join_group(),
--     because a non-member can't read the groups table to check it.
-- The publishable key built into the app grants nothing beyond this.
--
-- What is stored: an anonymous user id, the name you chose for groups, each
-- group's name, your daily total minutes (never which apps), and the apps you
-- voted to leave out. Nothing else about the phone or its usage.
--
-- This file deliberately contains no backslashes: patterns use [0-9], and
-- special characters are written as chr() codes, so nothing can reinterpret them.

-- --- Tables -------------------------------------------------------------------

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 30),
  created_day date not null,
  -- Set null, not cascade: a group outlives its creator deleting their data.
  created_by uuid references auth.users (id) on delete set null,
  -- 32 hex characters from a v4 UUID: 122 random bits. Knowing it lets you join.
  invite_code text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

create table public.members (
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null
    check (char_length(name) between 1 and 30)
    -- No control characters, and no text-direction controls (U+202A to U+202E,
    -- U+2066 to U+2069), so a name can't reverse or break the text around it
    -- on someone else's screen.
    check (
      name !~ '[[:cntrl:]]'
      and name !~ ('[' || chr(8234) || '-' || chr(8238) || chr(8294) || '-' || chr(8297) || ']')
    ),
  joined_day date not null,
  -- Apps this member agrees to leave out: package -> label.
  excludes jsonb not null default '{}'::jsonb
    check (jsonb_typeof(excludes) = 'object' and pg_column_size(excludes) < 8000),
  -- Proposals this member declined.
  declines text[] not null default '{}' check (cardinality(declines) <= 100),
  -- Set by the server on every change (members_touch), so "as of" times can't be faked.
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.days (
  group_id uuid not null,
  user_id uuid not null,
  day date not null,
  minutes integer not null check (minutes between 0 and 1440),
  updated_at timestamptz not null default now(),
  primary key (group_id, user_id, day),
  foreign key (group_id, user_id) references public.members (group_id, user_id) on delete cascade
);

create index days_group_day on public.days (group_id, day);
create index members_user on public.members (user_id);

-- --- Access -------------------------------------------------------------------

alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.days enable row level security;

-- Supabase grants every table to anon and authenticated by default. Start from
-- nothing and grant back only what the policies below need.
revoke all on public.groups, public.members, public.days from anon, authenticated;
grant select on public.groups, public.members, public.days to authenticated;
grant update (name, excludes, declines) on public.members to authenticated;
grant delete on public.members to authenticated;

-- Security definer so the check itself isn't subject to the policies that call it.
create function public.is_member(g uuid) returns boolean
  language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.members m where m.group_id = g and m.user_id = auth.uid());
$$;

create policy "members read their groups" on public.groups
  for select to authenticated using (public.is_member(id));

create policy "members read the roster" on public.members
  for select to authenticated using (public.is_member(group_id));

create policy "you edit only yourself" on public.members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "you leave only yourself" on public.members
  for delete to authenticated using (user_id = auth.uid());

create policy "members read daily totals" on public.days
  for select to authenticated using (public.is_member(group_id));

-- --- Functions ----------------------------------------------------------------

-- Create a group with you as its first member. Returns its id and invite code.
create function public.create_group(p_name text, p_member_name text, p_today date)
  returns table (id uuid, invite_code text)
  language plpgsql security definer set search_path = ''
as $$
declare
  g public.groups;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.groups (name, created_day, created_by)
    values (p_name, p_today, auth.uid())
    returning * into g;
  insert into public.members (group_id, user_id, name, joined_day)
    values (g.id, auth.uid(), p_member_name, p_today);
  return query select g.id, g.invite_code;
end;
$$;

-- Join with an invite code. Joining again keeps your original join date.
create function public.join_group(p_code text, p_member_name text, p_today date)
  returns table (id uuid, name text)
  language plpgsql security definer set search_path = ''
as $$
declare
  g public.groups;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  select * into g from public.groups where invite_code = p_code;
  if not found then raise exception 'invite not found' using errcode = 'P0002'; end if;
  if (select count(*) from public.members m where m.group_id = g.id) >= 30
     and not public.is_member(g.id) then
    raise exception 'group is full' using errcode = 'P0001';
  end if;
  insert into public.members (group_id, user_id, name, joined_day)
    values (g.id, auth.uid(), p_member_name, p_today)
    on conflict (group_id, user_id) do update set name = excluded.name;
  return query select g.id, g.name;
end;
$$;

-- Upload your daily totals for one group: {"2026-09-25": 184, ...}.
-- Only days from the last 31, up to tomorrow for clock drift, are accepted.
create function public.push_days(p_group uuid, p_days jsonb)
  returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  k text;
  v jsonb;
  d date;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not public.is_member(p_group) then raise exception 'not a member'; end if;
  if jsonb_typeof(p_days) <> 'object' then raise exception 'bad payload'; end if;
  if (select count(*) from jsonb_object_keys(p_days)) > 60 then raise exception 'too many days'; end if;
  for k, v in select * from jsonb_each(p_days) loop
    -- Skip, rather than fail the whole upload on, anything malformed.
    if k !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or jsonb_typeof(v) <> 'number' then continue; end if;
    begin
      d := k::date;
    exception when others then
      continue;
    end;
    if d < current_date - 31 or d > current_date + 1 then continue; end if;
    insert into public.days (group_id, user_id, day, minutes)
      values (p_group, auth.uid(), d, least(1440, greatest(0, round(v::numeric)::integer)))
      on conflict (group_id, user_id, day)
      do update set minutes = excluded.minutes, updated_at = now();
  end loop;
  -- Marks when you last synced, for the others' "as of" line (members_touch sets the time).
  update public.members set name = name where group_id = p_group and user_id = auth.uid();
end;
$$;

-- Delete everything about you: your memberships, your daily totals (by
-- cascade) and your anonymous user.
create function public.delete_my_data()
  returns void
  language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  -- Memberships first, directly, so any group left empty is dropped too. The
  -- cascade from deleting the user would skip that (see drop_empty_group).
  delete from public.members where user_id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

-- A group nobody is in any more is deleted, so its name and code don't linger.
create function public.drop_empty_group() returns trigger
  language plpgsql security definer set search_path = ''
as $$
begin
  -- Only for a member leaving directly. When a whole group is being deleted,
  -- its members go by cascade (trigger depth > 1) and the group is already going.
  if pg_trigger_depth() > 1 then return null; end if;
  delete from public.groups g
    where g.id = old.group_id
      and not exists (select 1 from public.members m where m.group_id = old.group_id);
  return null;
end;
$$;

create trigger members_drop_empty_group
  after delete on public.members
  for each row execute function public.drop_empty_group();

create function public.touch_member() returns trigger
  language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger members_touch
  before update on public.members
  for each row execute function public.touch_member();

-- Nothing is kept forever, even for someone who uninstalls without deleting
-- their data. Once a day: totals older than 400 days go, matching how long the
-- app keeps history, and so does anyone whose phone hasn't synced for 400 days
-- (their totals by cascade, and any group that leaves empty).
create function public.prune_stale()
  returns void
  language sql security definer set search_path = ''
as $$
  delete from public.days where day < current_date - 400;
  delete from public.members where updated_at < now() - interval '400 days';
$$;

revoke execute on function public.create_group, public.join_group, public.push_days, public.delete_my_data,
  public.is_member, public.drop_empty_group, public.touch_member, public.prune_stale from public, anon;
grant execute on function public.create_group, public.join_group, public.push_days, public.delete_my_data,
  public.is_member to authenticated;
revoke execute on function public.prune_stale from authenticated;

create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('gauge-prune-stale', '17 4 * * *', 'select public.prune_stale()');
