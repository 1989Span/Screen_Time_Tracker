// The generated dataset the app ships with, behind the UsageSource interface.
//
// Ported from `project/Gauge Screen Time.dc.html` (turn 3 script block) - the
// same formulas as the original mockup, so the numbers match the design.
// Deterministic: usage for a given day offset is a pure function of that offset,
// so the same day always looks the same and charts do not jitter between reads.
//
// Loading is synchronous here (it is arithmetic), so load() resolves
// immediately. It still exists because a real source genuinely needs it, and
// callers must be written against the slow case.

import { CATS, Cat } from './categories';
import { SourceStatus, UsageSource } from './source';
import { Series } from './series';
import { CCOL } from '../theme';
import { currentHour, dateAt } from '../clock';

/** Cheap deterministic hash in [0,1). Same formula as the mockup. */
function rnd(a: number, b: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Per-hour distribution for a category, peaking at its `peak` hour and
 *  suppressed overnight. Not day-dependent, so it is cached for the process. */
const _weights: Record<number, number[]> = {};
function weights(ai: number): number[] {
  if (_weights[ai]) return _weights[ai];
  const p = CATS[ai].peak;
  const w: number[] = [];
  let s = 0;
  for (let h = 0; h < 24; h++) {
    let d = Math.abs(h - p);
    d = Math.min(d, 24 - d);
    const v = Math.exp(-(d * d) / 7) * (h < 6 ? 0.12 : 1);
    w.push(v);
    s += v;
  }
  _weights[ai] = w.map((v) => v / s);
  return _weights[ai];
}

/** Weekday/weekend multiplier. Work inverts: heavy on weekdays, near-zero at
 *  the weekend; everything else goes the other way. */
function dayShape(isWeekend: boolean, cat: Cat): number {
  if (cat.work) return isWeekend ? 0.12 : 1.12;
  return isWeekend ? 1.34 : 0.92;
}

export class DemoUsageSource implements UsageSource {
  readonly id = 'demo';
  private _status: SourceStatus = 'idle';
  // Full-day totals per day offset. Day-scoped: an offset means a different
  // calendar day tomorrow, so invalidate() must clear it.
  private cache: Record<number, number[]> = {};

  get status(): SourceStatus {
    return this._status;
  }

  /** The eight demo categories, presented as series. Colours come from the
   *  hand-picked palette rather than colorForId, so the demo keeps matching the
   *  original design. */
  series(): Series[] {
    return CATS.map((c, i) => ({ id: c.id, name: c.name, color: CCOL[i] }));
  }

  async load(_days: number): Promise<void> {
    // Arithmetic, so there is nothing to await. Real sources do I/O here.
    this._status = 'ready';
  }

  invalidate(): void {
    this.cache = {};
  }

  /** Untruncated full-day totals, including for today. `dayTotals` is what
   *  applies the "so far today" cut. */
  private fullDay(idx: number): number[] {
    const hit = this.cache[idx];
    if (hit) return hit;
    const dow = dateAt(idx).getDay();
    const weekend = dow === 0 || dow === 6;
    const out = CATS.map((cat, ai) => {
      const shape = dayShape(weekend, cat);
      // sin(idx/57) puts a slow seasonal drift over the year.
      return cat.base * shape * (1 + 0.14 * Math.sin(idx / 57)) * (0.55 + 0.95 * rnd(ai + 1, idx + 3));
    });
    this.cache[idx] = out;
    return out;
  }

  hourTotals(idx: number, h: number): number[] {
    // The future has no usage in it.
    if (idx === 0 && h > currentHour()) return CATS.map(() => 0);
    const day = this.fullDay(idx);
    return day.map((v, ai) => v * weights(ai)[h]);
  }

  dayTotals(idx: number): number[] {
    if (idx !== 0) return this.fullDay(idx);
    // Today is "so far", summed over the hours that have actually happened.
    const out = CATS.map(() => 0);
    const cur = currentHour();
    for (let h = 0; h <= cur; h++) {
      const hour = this.hourTotals(0, h);
      for (let i = 0; i < out.length; i++) out[i] += hour[i];
    }
    return out;
  }

  /** Another group member's day, from a per-category scale and a seed.
   *
   *  Deliberately not part of UsageSource: the OS can only tell you about this
   *  device. Other people's usage has to arrive from a backend, so a real build
   *  replaces this with a sync API rather than a device source. */
  memberDay(idx: number, scale: number[], seed: number): number[] {
    const dow = dateAt(idx).getDay();
    const weekend = dow === 0 || dow === 6;
    return CATS.map((cat, ai) => {
      const shape = dayShape(weekend, cat);
      let v = cat.base * scale[ai] * shape * (0.55 + 0.95 * rnd(ai + 1 + seed * 17, idx + 3 + seed * 29));
      if (idx === 0) {
        v *= weights(ai)
          .slice(0, currentHour() + 1)
          .reduce((s, w) => s + w, 0);
      }
      return v;
    });
  }
}

export const demoSource = new DemoUsageSource();
