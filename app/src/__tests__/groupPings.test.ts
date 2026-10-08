import { AppState } from 'react-native';

import * as bootstrap from '../usage/bootstrap';
import * as recorder from '../usage/recorder';
import * as groupsBackground from '../sync/groupsBackground';
import { isSyncPing, syncOnPing } from '../sync/groupNotifications';

const setAppState = (state: string) =>
  Object.defineProperty(AppState, 'currentState', { value: state, configurable: true });

afterEach(() => {
  jest.restoreAllMocks();
  setAppState('active');
});

describe('recognising the hourly ping', () => {
  it('reads it from a notification while the app is open', () => {
    expect(isSyncPing({ kind: 'sync' })).toBe(true);
  });

  it('reads it from the raw message a background task gets, where Expo sends the data as JSON text', () => {
    expect(isSyncPing({ data: { dataString: '{"kind":"sync"}', body: '{"kind":"sync"}' } })).toBe(true);
    expect(isSyncPing({ data: { body: '{"kind":"sync"}' } })).toBe(true);
    expect(isSyncPing({ data: { kind: 'sync' } })).toBe(true);
  });

  it('ignores request notifications and anything malformed', () => {
    for (const p of [
      null,
      'sync',
      {},
      { kind: 'stop-request', groupId: 'g1' },
      { data: { dataString: '{"kind":"stop-request"}' } },
      { data: { dataString: 'not json' } },
    ]) {
      expect(isSyncPing(p)).toBe(false);
    }
  });
});

describe('syncing on the ping', () => {
  it('with the app open, reloads usage, which syncs when it lands', async () => {
    const reload = jest.spyOn(bootstrap, 'reloadUsage').mockResolvedValue();
    const record = jest.spyOn(recorder, 'recordOsDays');
    await syncOnPing();
    expect(reload).toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('with the app closed, records today and yesterday, then uploads from history', async () => {
    setAppState('background');
    const calls: string[] = [];
    jest.spyOn(recorder, 'recordOsDays').mockImplementation(async (days) => {
      calls.push('record ' + days);
      return { daysRecorded: 0, packagesSeen: 0, events: [], unlocks: [], source: 'none', skipped: null };
    });
    jest.spyOn(groupsBackground, 'syncGroupsFromHistory').mockImplementation(async () => {
      calls.push('upload');
    });
    await syncOnPing();
    expect(calls).toEqual(['record 2', 'upload']);
  });
});
