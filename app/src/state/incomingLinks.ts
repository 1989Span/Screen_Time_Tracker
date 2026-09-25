// Links that open the app.
//
//   gauge://range/<id>  from the home-screen widget: opens that range's breakdown
//                       (see GaugeWidgets.openBreakdown in the usage-stats module).
//   gauge://g/<payload> from a group link: joins or updates a group (groupLink.ts).
//                       The https form reaches the app as this, via the landing
//                       page in docs/g/.
//
// Any app can send a gauge:// link, so each form is checked strictly, and
// anything else is ignored rather than guessed at.

import { useEffect } from 'react';
import { Linking } from 'react-native';

import { RangeId } from '../data';
import { useDetailStore } from './detailStore';
import { useGroupsStore } from './groupsStore';
import { goTo } from './navStore';

const RANGES: readonly RangeId[] = ['day', 'week', 'month', 'year'];

/** The range a widget link asks for, or null for anything else. */
export function rangeFromLink(url: string | null | undefined): RangeId | null {
  if (!url) return null;
  const id = /^gauge:\/\/range\/([a-z]+)\/?$/.exec(url)?.[1];
  return id !== undefined && (RANGES as readonly string[]).includes(id) ? (id as RangeId) : null;
}

/** Routes one incoming link. */
export function openLink(url: string | null): void {
  if (!url) return;
  const range = rangeFromLink(url);
  if (range) {
    useDetailStore.getState().openRange(range);
    return;
  }
  if (url.startsWith('gauge://g/')) {
    // A link cut short in transit (some apps truncate long messages) lands here too.
    if (!useGroupsStore.getState().receive(url)) {
      useGroupsStore.setState({
        notice: 'That group link was incomplete. Ask for it again, or paste the whole message below.',
      });
      goTo('groups');
    }
  }
}

/**
 * Handles a link whether it started the app or arrived while the app was open.
 *
 * Waits for `ready` (saved state rehydrated). Handling a cold-start link first
 * would let restored state overwrite it: the breakdown's persisted range, or
 * the groups a link is merged into.
 */
export function useIncomingLinks(ready: boolean): void {
  useEffect(() => {
    if (!ready) return;
    Linking.getInitialURL()
      .then(openLink)
      .catch(() => {});
    const sub = Linking.addEventListener('url', (e) => openLink(e.url));
    return () => sub.remove();
  }, [ready]);
}
