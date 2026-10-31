-- Gauge groups: a phone that loses its sign-in gets its identity back.
--
-- Run once in the Supabase SQL Editor after 0006_admin_decisions.sql.
--
-- Why
-- ---
-- Each phone is an anonymous Supabase user, and the app keeps only that user's
-- session. If the session is ever discarded (a rejected refresh token, say),
-- the app used to sign in again as a brand-new anonymous user: a stranger in
-- no group. The old member row stayed behind, and rejoining by invite added a
-- second copy of the same person.
--
-- Now each phone holds a recovery key: 32 random bytes the server issues and
-- keeps only a SHA-256 hash of. The app stores it apart from the session. If
-- the session is lost, the app signs in afresh and presents the key, and every
-- membership, daily total, vote, challenge and admin role moves from the old
-- user to the new one. The old user is then deleted.
--
-- move_identity() also lets the project owner merge a duplicate left behind
-- before this existed. It is not callable from the app; see the end of this file.
--
-- What is stored: a hash of each phone's recovery key. It goes with the
-- anonymous user, like everything else.
--
-- Like the earlier migrations, this file contains no backslashes.

create extension if not exists pgcrypto with schema extensions;

-- --- Let a member's rows follow a change of user id ------------------------------

alter table public.days drop constraint days_group_id_user_id_fkey;
alter table public.days add constraint days_group_id_user_id_fkey
  foreign key (group_id, user_id) references public.members (group_id, user_id)
  on delete cascade on update cascade;

alter table public.stop_requests drop constraint stop_requests_group_id_requested_by_fkey;
alter table public.stop_requests add constraint stop_requests_group_id_requested_by_fkey
  foreign key (group_id, requested_by) references public.members (group_id, user_id)
  on delete cascade on update cascade;

-- --- Recovery keys ----------------------------------------------------------------

create table public.recovery_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  key_hash bytea not null,
  created_at timestamptz not null default now()
);

alter table public.recovery_keys enable row level security;
revoke all on public.recovery_keys from anon, authenticated;

-- Issue this phone a new recovery key, replacing any earlier one. The key is
-- returned once and only its hash is kept.
create function public.create_recovery_key()
  returns text
  language plpgsql security definer set search_path = ''
as $$
declare
  v_key text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  insert into public.recovery_keys (user_id, key_hash)
    values (auth.uid(), extensions.digest(v_key, 'sha256'))
    on conflict (user_id) do update set key_hash = excluded.key_hash, created_at = now();
  return v_key;
end;
$$;

-- --- Moving an identity -------------------------------------------------------------

-- Moves everything p_from has to p_to, then deletes p_from. Where both are in
-- the same group (a duplicate after rejoining), the two rows are merged:
-- p_from's days fill in any p_to lacks, and their votes are combined.
create function public.move_identity(p_from uuid, p_to uuid)
  returns void
  language plpgsql security definer set search_path = ''
as $$
declare
  g uuid;
begin
  if p_from is null or p_to is null or p_from = p_to then raise exception 'bad identities'; end if;
  -- Moving votes isn't anyone voting: keep the stop-tracking notifications quiet.
  perform set_config('gauge.admin_decision', 'on', true);

  for g in select m.group_id from public.members m where m.user_id = p_from loop
    if exists (select 1 from public.members m where m.group_id = g and m.user_id = p_to) then
      -- Both in this group: keep p_to's row, fold p_from's into it.
      insert into public.days (group_id, user_id, day, minutes, updated_at)
        select d.group_id, p_to, d.day, d.minutes, d.updated_at
        from public.days d where d.group_id = g and d.user_id = p_from
        on conflict (group_id, user_id, day) do nothing;
      update public.members t
        set excludes = f.excludes || t.excludes,
            declines = array(select distinct unnest(f.declines || t.declines)),
            joined_day = least(f.joined_day, t.joined_day)
        from public.members f
        where t.group_id = g and t.user_id = p_to and f.group_id = g and f.user_id = p_from;
      update public.stop_requests r set requested_by = p_to where r.group_id = g and r.requested_by = p_from;
      delete from public.members m where m.group_id = g and m.user_id = p_from;
    else
      -- Days and requests follow by cascade.
      update public.members m set user_id = p_to where m.group_id = g and m.user_id = p_from;
    end if;
  end loop;

  update public.groups set created_by = p_to where created_by = p_from;
  update public.challenges set proposed_by = p_to where proposed_by = p_from;
  update public.challenges set players = array_replace(players, p_from, p_to) where p_from = any (players);
  -- A vote of p_to's own wins over p_from's on the same challenge.
  delete from public.challenge_votes v
    where v.user_id = p_from
      and exists (select 1 from public.challenge_votes w where w.challenge_id = v.challenge_id and w.user_id = p_to);
  update public.challenge_votes set user_id = p_to where user_id = p_from;

  perform set_config('gauge.admin_decision', 'off', true);
  -- Push token and recovery key go with it.
  delete from auth.users where id = p_from;
end;
$$;

-- The app's side: the phone signed in afresh and presents its old identity's key.
-- Returns false, changing nothing, if the key doesn't match.
create function public.reclaim_identity(p_old uuid, p_key text)
  returns boolean
  language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_old is null or p_old = auth.uid() or p_key is null or char_length(p_key) <> 64 then return false; end if;
  if not exists (select 1 from public.recovery_keys k
                 where k.user_id = p_old and k.key_hash = extensions.digest(p_key, 'sha256')) then
    return false;
  end if;
  perform public.move_identity(p_old, auth.uid());
  return true;
end;
$$;

revoke execute on function public.create_recovery_key, public.move_identity, public.reclaim_identity
  from public, anon;
grant execute on function public.create_recovery_key, public.reclaim_identity to authenticated;
revoke execute on function public.move_identity from authenticated;

-- --- Merging a duplicate left behind before this existed --------------------------
--
-- Find the two rows (same name, one stale) in your group:
--
--   select m.user_id, m.name, m.joined_day, m.updated_at
--     from public.members m join public.groups g on g.id = m.group_id
--     where g.name = 'Your group name'
--     order by m.name, m.updated_at;
--
-- Then move the old (stale) identity onto the one your phone uses now:
--
--   select public.move_identity('<old user_id>', '<current user_id>');
