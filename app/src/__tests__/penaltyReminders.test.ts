import { confirm, Plans } from '../penaltyPlan';
import { remindersFor } from '../state/penaltyReminders';

const SIX_HOURS = { limit: 360, rate: 1 };
const october = confirm({}, SIX_HOURS, '2026-10-07') as Plans;

describe('monthly penalty reminders', () => {
  it('reminds at 10am on each of the first 4 days of next month', () => {
    const due = remindersFor(october, new Date(2026, 9, 20, 12, 0));
    expect(due.map((r) => r.id)).toEqual([
      'penalty-window-2026-11-01',
      'penalty-window-2026-11-02',
      'penalty-window-2026-11-03',
      'penalty-window-2026-11-04',
    ]);
    expect(due[0].at).toEqual(new Date(2026, 10, 1, 10, 0));
    expect(due[0].title).toBe('Confirm November’s penalty limit');
    expect(due[0].body).toBe('6h a day and $1.00/min carried over. Keep or change it by November 4.');
  });

  it('during an unconfirmed window, reminds on the days left of it', () => {
    const due = remindersFor(october, new Date(2026, 10, 2, 12, 0)); // 2 Nov, noon
    expect(due.map((r) => r.id).slice(0, 2)).toEqual(['penalty-window-2026-11-03', 'penalty-window-2026-11-04']);
  });

  it('stops for this month once confirmed', () => {
    const kept = confirm(october, SIX_HOURS, '2026-11-02') as Plans;
    const due = remindersFor(kept, new Date(2026, 10, 2, 12, 0));
    expect(due.every((r) => r.id.startsWith('penalty-window-2026-12'))).toBe(true);
  });

  it('sends nothing once switched off, or when nothing was ever set', () => {
    const off = confirm(october, null, '2026-11-02') as Plans;
    expect(remindersFor(off, new Date(2026, 10, 2, 12, 0))).toEqual([]);
    expect(remindersFor({}, new Date(2026, 10, 2, 12, 0))).toEqual([]);
  });
});
