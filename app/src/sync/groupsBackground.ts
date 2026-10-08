// Group sync from the background task, which runs with the app closed.
//
// The usage source isn't loaded there, so your numbers come straight from the
// history database the recorder just wrote. It is the same data the app shows,
// read without the source in front of it.

import { dayStamp } from '../clock';
import { SHARE_DAYS, shiftStamp } from '../groups';
import { useGroupsStore } from '../state/groupsStore';
import { readRange } from '../usage/rollupStore';
import { postChallengeNotices } from './challengeNotices';

export async function syncGroupsFromHistory(): Promise<void> {
  // The persisted store hasn't loaded in a headless run until asked to.
  await useGroupsStore.persist.rehydrate();
  const s = useGroupsStore.getState();
  if (s.groups.length === 0) return;
  const today = dayStamp();
  const history = await readRange(shiftStamp(today, -(SHARE_DAYS - 1)), today);
  const readDay = (stamp: string) => history[stamp] ?? {};
  await s.sync(readDay);
  // A day just settled, or the month's challenge just ended: say so.
  await postChallengeNotices(readDay).catch(() => {});
}
