import { dayStamp } from '../clock';
import { appLinkFor, groupLink } from '../groupLink';
import { newMember } from '../groups';
import { useDetailStore } from '../state/detailStore';
import { useGroupsStore } from '../state/groupsStore';
import { openLink, rangeFromLink } from '../state/incomingLinks';
import { useNavStore } from '../state/navStore';

describe('widget links', () => {
  it('reads each of the four ranges a widget can show', () => {
    expect(rangeFromLink('gauge://range/day')).toBe('day');
    expect(rangeFromLink('gauge://range/week')).toBe('week');
    expect(rangeFromLink('gauge://range/month')).toBe('month');
    expect(rangeFromLink('gauge://range/year')).toBe('year');
  });

  it('tolerates a trailing slash', () => {
    expect(rangeFromLink('gauge://range/week/')).toBe('week');
  });

  it('ignores anything that is not exactly a widget link', () => {
    // Any app can send a gauge:// link, so nothing outside the widget's own
    // shape should navigate anywhere.
    for (const url of [
      null,
      undefined,
      '',
      'gauge://range/decade',
      'gauge://range/',
      'gauge://range/WEEK',
      'gauge://range/week?x=1',
      'gauge://detail/week',
      'https://range/week',
      'gauge://range/week/extra',
      'xgauge://range/week',
    ]) {
      expect(rangeFromLink(url)).toBeNull();
    }
  });
});

describe('routing an incoming link', () => {
  beforeEach(() => {
    useGroupsStore.setState({ groups: [], incoming: null, notice: null });
  });

  it('opens a widget range', () => {
    openLink('gauge://range/month');
    expect(useDetailStore.getState().range).toBe('month');
    expect(useNavStore.getState().view).toBe('detail');
  });

  it('hands a group link to the groups store', () => {
    const alex = { ...newMember('alex0001', 'Alex', dayStamp()), sharedAt: Date.now() - 1000 };
    const https = groupLink({ id: 'fam00001', name: 'Family', created: dayStamp(), members: [alex] }, alex);
    openLink(appLinkFor(https));
    expect(useGroupsStore.getState().incoming?.name).toBe('Family');
    expect(useNavStore.getState().view).toBe('groupJoin');
  });

  it('explains a group link that was cut short', () => {
    openLink('gauge://g/eyJ2Ijox');
    expect(useGroupsStore.getState().notice).toMatch(/incomplete/);
    expect(useNavStore.getState().view).toBe('groups');
  });

  it('ignores anything else', () => {
    useNavStore.setState({ view: 'ov' });
    openLink('gauge://settings');
    openLink(null);
    expect(useNavStore.getState().view).toBe('ov');
  });
});
