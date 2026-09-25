import { NO_COMPARISON, changeVsPrevious } from '../models/overview';

describe('comparison with the previous period', () => {
  it('spells the placeholder as two dashes and a percent sign', () => {
    // Separated by a hair space so the two hyphens can't render as one dash.
    expect(NO_COMPARISON.replace(/\s/g, '')).toBe('--%');
    expect(NO_COMPARISON).toBe('-\u200A-%');
  });

  it('shows --% when the previous period has no usage', () => {
    // The case seen on the device: 1d 18h 2m this month, nothing the month
    // before. It used to read "↑ 252232% vs last month".
    const c = changeVsPrevious(2522.32, 0, 'last month');
    expect(c.text).toBe(NO_COMPARISON + ' vs last month');
    expect(c.neutral).toBe(true);
    expect(c.positive).toBe(false);
  });

  it('treats less than half a minute as no usage, as the app would show 0m', () => {
    expect(changeVsPrevious(90, 0.4, 'yesterday').text).toBe(NO_COMPARISON + ' vs yesterday');
  });

  it('shows --% for every range name it is given', () => {
    for (const name of ['yesterday', 'last week', 'last month', 'last year']) {
      expect(changeVsPrevious(10, 0, name).text).toBe(NO_COMPARISON + ' vs ' + name);
    }
  });

  it('calculates the change once there is usage to compare with', () => {
    expect(changeVsPrevious(90, 60, 'last week')).toEqual({
      text: '↑ 50% vs last week',
      positive: true,
      neutral: false,
    });
    expect(changeVsPrevious(30, 60, 'last week')).toEqual({
      text: '↓ 50% vs last week',
      positive: false,
      neutral: false,
    });
  });

  it('calls it the same when the difference is under a minute', () => {
    expect(changeVsPrevious(60.4, 60, 'yesterday').text).toBe('Same as yesterday');
  });

  it('still compares when this period is empty but the last one was not', () => {
    // A real drop to zero is worth reporting, not hiding.
    expect(changeVsPrevious(0, 120, 'yesterday').text).toBe('↓ 100% vs yesterday');
  });
});
