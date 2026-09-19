import { DAYS_REQUIRED, availableRanges, defaultRange, rangeAvailability } from '../usage/rangeAvailability';

describe('rangeAvailability', () => {
  it('offers nothing on a device with no history yet', () => {
    expect(availableRanges(0)).toEqual([]);
    expect(rangeAvailability(0).day.available).toBe(false);
    expect(rangeAvailability(0).day.note).toMatch(/hasn't been recorded/);
  });

  it('opens Day after one recorded day', () => {
    expect(availableRanges(1)).toEqual(['day']);
  });

  it('keeps Week closed until there are seven real days', () => {
    expect(availableRanges(6)).toEqual(['day']);
    expect(availableRanges(7)).toEqual(['day', 'week']);
  });

  it('keeps Month and Year closed at the retention the OS actually gives (~10 days)', () => {
    // This is the whole point of progressive unlock: a real device has ~10 days,
    // so Month and Year must not appear on first run.
    const at10 = rangeAvailability(10);
    expect(at10.day.available).toBe(true);
    expect(at10.week.available).toBe(true);
    expect(at10.month.available).toBe(false);
    expect(at10.year.available).toBe(false);
  });

  it('opens Month at thirty days and Year at a full year', () => {
    expect(availableRanges(30)).toEqual(['day', 'week', 'month']);
    expect(availableRanges(364)).toEqual(['day', 'week', 'month']);
    expect(availableRanges(365)).toEqual(['day', 'week', 'month', 'year']);
  });

  it('counts recorded days, not elapsed calendar days', () => {
    // A user who tracked 5 days, stopped for a month, then tracked 2 more has 7
    // real days. Padding the gap with zeros would understate their usage and
    // present a fabricated week.
    expect(availableRanges(7)).toContain('week');
  });

  it('reports how much longer each closed range needs', () => {
    const s = rangeAvailability(25);
    expect(s.month.available).toBe(false);
    expect(s.month.have).toBe(25);
    expect(s.month.need).toBe(DAYS_REQUIRED.month);
    expect(s.month.note).toMatch(/5 more days/);
  });

  it('uses the singular when one day remains', () => {
    expect(rangeAvailability(29).month.note).toMatch(/1 more day\b/);
  });

  it('caps `have` at what the range needs, so it never reads as over-complete', () => {
    const s = rangeAvailability(500);
    expect(s.week.have).toBe(7);
    expect(s.year.have).toBe(365);
    expect(s.year.available).toBe(true);
    expect(s.year.note).toBeNull();
  });
});

describe('defaultRange', () => {
  it('opens on Day before a week exists', () => {
    expect(defaultRange(0)).toBe('day');
    expect(defaultRange(6)).toBe('day');
  });

  it('prefers Week once it is real, since one day is too noisy to judge a habit', () => {
    expect(defaultRange(7)).toBe('week');
    expect(defaultRange(400)).toBe('week');
  });
});
