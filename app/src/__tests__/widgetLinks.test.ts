import { rangeFromLink } from '../state/widgetLinks';

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
