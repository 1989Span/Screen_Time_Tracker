// Opening the app from the home-screen widget.
//
// Tapping a widget sends gauge://range/<id>, where <id> is the range that widget
// shows (see GaugeWidgets.openBreakdown in the usage-stats module). The app opens
// that range's breakdown.

import { useEffect } from 'react';
import { Linking } from 'react-native';

import { RangeId } from '../data';
import { useDetailStore } from './detailStore';

const RANGES: readonly RangeId[] = ['day', 'week', 'month', 'year'];

/**
 * The range a widget link asks for, or null for anything else.
 *
 * Any app can send a gauge:// link, so only the exact widget shape is accepted.
 * Everything else is ignored, never guessed at.
 */
export function rangeFromLink(url: string | null | undefined): RangeId | null {
  if (!url) return null;
  const id = /^gauge:\/\/range\/([a-z]+)\/?$/.exec(url)?.[1];
  return id !== undefined && (RANGES as readonly string[]).includes(id) ? (id as RangeId) : null;
}

/**
 * Opens the breakdown a widget link points at, whether the link started the app
 * or arrived while it was already open.
 *
 * Waits for `ready` (saved state rehydrated). The breakdown's range is
 * persisted, so handling a cold-start link before rehydration would let the
 * restored range overwrite the one the widget asked for.
 */
export function useWidgetLinks(ready: boolean): void {
  useEffect(() => {
    if (!ready) return;
    const open = (url: string | null) => {
      const range = rangeFromLink(url);
      if (range) useDetailStore.getState().openRange(range);
    };
    Linking.getInitialURL()
      .then(open)
      .catch(() => {});
    const sub = Linking.addEventListener('url', (e) => open(e.url));
    return () => sub.remove();
  }, [ready]);
}
