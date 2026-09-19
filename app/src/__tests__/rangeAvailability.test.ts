import { DAYS_REQUIRED, availableRanges, defaultRange, rangeAvailability } from '../usage/rangeAvailability';

describe('every range stays visible', () => {
  it('shows all four regardless of how little history exists', () => {
    // Month-to-date from a handful of days is useful; hiding it is not.
    for (const days of [0, 1, 10, 30, 400]) {
      expect(availableRanges()).toEqual(['day', 'week', 'month', 'year']);
      const s = rangeAvailability(days);
      expect([s.day.visible, s.week.visible, s.month.visible, s.year.visible]).toEqual([true, true, true, true]);
    }
  });
});

describe('completeness is reported, never faked', () => {
  it('says nothing is recorded on a fresh install', () => {
    const s = rangeAvailability(0);
    expect(s.day.complete).toBe(false);
    expect(s.day.note).toBe('No history recorded yet');
    expect(s.year.note).toBe('No history recorded yet');
  });

  it('marks Day and Week complete at the retention the OS actually gives (~10 days)', () => {
    const s = rangeAvailability(10);
    expect(s.day.complete).toBe(true);
    expect(s.week.complete).toBe(true);
    expect(s.day.note).toBeNull();
    expect(s.week.note).toBeNull();
  });

  it('reports Month and Year as partial at 10 days, with the real numerator', () => {
    const s = rangeAvailability(10);
    expect(s.month.complete).toBe(false);
    expect(s.month.have).toBe(10);
    expect(s.month.need).toBe(30);
    expect(s.month.note).toBe('10 of 30 days recorded · month so far');
    expect(s.year.note).toBe('10 of 365 days recorded · year so far');
  });

  it('completes Month at thirty days and Year at a full year', () => {
    expect(rangeAvailability(30).month.complete).toBe(true);
    expect(rangeAvailability(364).year.complete).toBe(false);
    expect(rangeAvailability(365).year.complete).toBe(true);
    expect(rangeAvailability(365).year.note).toBeNull();
  });

  it('caps `have` at the span, so a range never reads as over-complete', () => {
    const s = rangeAvailability(500);
    expect(s.week.have).toBe(7);
    expect(s.year.have).toBe(DAYS_REQUIRED.year);
  });

  it('counts recorded days, not elapsed calendar days', () => {
    // 5 days tracked, a month idle, 2 more tracked = 7 real days. Padding the
    // gap with zeros would invent data and understate usage.
    expect(rangeAvailability(7).week.complete).toBe(true);
  });
});

describe('defaultRange', () => {
  it('opens on Day before a week of history exists', () => {
    expect(defaultRange(0)).toBe('day');
    expect(defaultRange(6)).toBe('day');
  });

  it('prefers Week once it is real, since one day is too noisy to judge a habit', () => {
    expect(defaultRange(7)).toBe('week');
    expect(defaultRange(400)).toBe('week');
  });
});
