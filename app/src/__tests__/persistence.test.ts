import { promote } from '../state/penaltyStore';

describe('penalty "starts tomorrow" promotion', () => {
  const setting = { limit: 240, rate: 0.1 };
  const tighter = { limit: 120, rate: 0.25 };

  it('does nothing on the same day', () => {
    expect(promote({ current: setting, next: tighter, appliedOn: '2026-09-17' }, '2026-09-17')).toBeNull();
  });

  it('applies a pending change once the day moves on', () => {
    expect(promote({ current: setting, next: tighter, appliedOn: '2026-09-17' }, '2026-09-18')).toEqual({
      current: tighter,
      next: undefined,
      appliedOn: '2026-09-18',
    });
  });

  it('keeps the current setting when nothing was pending', () => {
    expect(promote({ current: setting, next: undefined, appliedOn: '2026-09-17' }, '2026-09-18')).toEqual({
      current: setting,
      next: undefined,
      appliedOn: '2026-09-18',
    });
  });

  it('turns the limit off when the pending change was a removal', () => {
    expect(promote({ current: setting, next: null, appliedOn: '2026-09-17' }, '2026-09-18')).toEqual({
      current: null,
      next: undefined,
      appliedOn: '2026-09-18',
    });
  });

  it('applies once, not repeatedly, when several days passed', () => {
    const first = promote({ current: setting, next: tighter, appliedOn: '2026-09-01' }, '2026-09-18');
    expect(first).toEqual({ current: tighter, next: undefined, appliedOn: '2026-09-18' });
    // Running again the same day must be a no-op, so it is safe to call from
    // both rehydrate and the day-rollover hook.
    expect(promote(first!, '2026-09-18')).toBeNull();
  });
});
