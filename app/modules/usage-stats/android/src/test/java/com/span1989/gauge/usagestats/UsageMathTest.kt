package com.span1989.gauge.usagestats

import com.span1989.gauge.usagestats.UsageMath.Event
import com.span1989.gauge.usagestats.UsageMath.Range
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Calendar
import java.util.TimeZone

/**
 * The widget and the nudges have to report exactly what the app reports. These cases mirror the
 * app's own tests of the TypeScript it ports (src/__tests__/hourly.test.ts,
 * recorder.test.ts, clock.test.ts), so a divergence shows up here, not on a
 * home screen.
 */
class UsageMathTest {
  private val zone: TimeZone = TimeZone.getTimeZone("America/Los_Angeles")

  private fun at(y: Int, m: Int, d: Int, h: Int = 0, min: Int = 0): Long =
    Calendar.getInstance(zone).apply {
      clear()
      set(y, m - 1, d, h, min)
    }.timeInMillis

  private fun today(y: Int, m: Int, d: Int): Calendar = UsageMath.startOfDay(at(y, m, d, 12), zone)

  private fun resume(pkg: String, t: Long) = Event(pkg, t, true)
  private fun pause(pkg: String, t: Long) = Event(pkg, t, false)

  private val eps = 1e-9

  // --- Pairing ---------------------------------------------------------------

  @Test fun `splits a session that crosses midnight between the two days`() {
    val t = today(2026, 9, 24)
    val now = at(2026, 9, 24, 12)
    val days = UsageMath.eventDays(
      listOf(resume("com.a", at(2026, 9, 23, 23, 30)), pause("com.a", at(2026, 9, 24, 0, 30))),
      t,
      now
    )
    assertEquals(30.0, days.getValue("2026-09-23").getValue("com.a"), eps)
    assertEquals(30.0, days.getValue("2026-09-24").getValue("com.a"), eps)
  }

  @Test fun `a session still open runs to now, not to the end of the day`() {
    val t = today(2026, 9, 24)
    val now = at(2026, 9, 24, 10)
    val days = UsageMath.eventDays(listOf(resume("com.a", at(2026, 9, 24, 9))), t, now)
    assertEquals(60.0, days.getValue("2026-09-24").getValue("com.a"), eps)
  }

  @Test fun `a missing pause is closed by the next app's resume`() {
    val s = UsageMath.sessions(
      listOf(resume("com.a", 0), resume("com.b", 600_000), pause("com.b", 1_200_000)),
      now = 5_000_000
    )
    val m = UsageMath.minutesIn(s, 0, 5_000_000)
    assertEquals(10.0, m.getValue("com.a"), eps)
    assertEquals(10.0, m.getValue("com.b"), eps)
  }

  @Test fun `a pause for an app that is not open is ignored`() {
    val s = UsageMath.sessions(
      listOf(pause("com.stale", 100), resume("com.a", 0), pause("com.a", 600_000)),
      now = 5_000_000
    )
    val m = UsageMath.minutesIn(s, 0, 5_000_000)
    assertEquals(setOf("com.a"), m.keys)
    assertEquals(10.0, m.getValue("com.a"), eps)
  }

  @Test fun `events are sorted before pairing`() {
    val s = UsageMath.sessions(listOf(pause("com.a", 600_000), resume("com.a", 0)), now = 5_000_000)
    assertEquals(10.0, UsageMath.minutesIn(s, 0, 5_000_000).getValue("com.a"), eps)
  }

  @Test fun `a duplicate resume neither loses nor double counts time`() {
    val s = UsageMath.sessions(
      listOf(resume("com.a", 0), resume("com.a", 300_000), pause("com.a", 600_000)),
      now = 5_000_000
    )
    assertEquals(10.0, UsageMath.minutesIn(s, 0, 5_000_000).getValue("com.a"), eps)
  }

  @Test fun `events with no package are skipped`() {
    val s = UsageMath.sessions(listOf(resume("", 0), pause("", 600_000)), now = 5_000_000)
    assertTrue(s.isEmpty())
  }

  // --- Filtering -------------------------------------------------------------

  @Test fun `the same packages the app refuses to count are refused here`() {
    assertFalse(UsageMath.isCountable("com.span1989.gauge"))
    assertFalse(UsageMath.isCountable("com.android.dreams.basic"))
    assertFalse(UsageMath.isCountable("com.android.systemui"))
    assertFalse(UsageMath.isCountable("com.sec.android.app.launcher"))
    assertFalse(UsageMath.isCountable("com.google.android.apps.nexuslauncher"))
    assertTrue(UsageMath.isCountable("com.instagram.android"))
  }

  @Test fun `a day with only uncountable use is left out, so the rollup answers for it`() {
    val t = today(2026, 9, 24)
    val days = UsageMath.eventDays(
      listOf(resume("com.android.dreams.basic", at(2026, 9, 24, 1)), pause("com.android.dreams.basic", at(2026, 9, 24, 3))),
      t,
      at(2026, 9, 24, 12)
    )
    assertNull(days["2026-09-24"])
  }

  // --- Ranges ------------------------------------------------------------------

  @Test fun `each range reaches back as far as the app's buckets do`() {
    val t = today(2026, 9, 24)
    assertEquals(0, UsageMath.daysBack(Range.DAY, t))
    assertEquals(6, UsageMath.daysBack(Range.WEEK, t))
    assertEquals(29, UsageMath.daysBack(Range.MONTH, t))
    // 12 calendar months ending with September 2026 start on 1 October 2025.
    assertEquals("2025-10-01", UsageMath.dayStamp(UsageMath.firstDay(Range.YEAR, t)))
    assertEquals(358, UsageMath.daysBack(Range.YEAR, t))
  }

  @Test fun `day boundaries survive the end of daylight saving`() {
    // 1 November 2026 is 25 hours long in Los Angeles.
    val t = today(2026, 11, 3)
    val (start, end) = UsageMath.dayWindow(t, 2, at(2026, 11, 3, 12))
    assertEquals(at(2026, 11, 1), start)
    assertEquals(at(2026, 11, 2), end)
    assertEquals(25 * 3_600_000L, end - start)
    assertEquals("2026-10-28", UsageMath.dayStamp(UsageMath.firstDay(Range.WEEK, t)))
    assertEquals(6, UsageMath.daysBack(Range.WEEK, t))
  }

  @Test fun `day stamps are ASCII whatever the locale`() {
    val previous = java.util.Locale.getDefault()
    try {
      java.util.Locale.setDefault(java.util.Locale.forLanguageTag("ar-EG"))
      assertEquals("2026-09-24", UsageMath.dayStamp(today(2026, 9, 24)))
    } finally {
      java.util.Locale.setDefault(previous)
    }
  }

  // --- Totals ------------------------------------------------------------------

  @Test fun `a day with event data uses it, and any other day uses the rollup`() {
    val t = today(2026, 9, 24)
    val eventDays = mapOf(
      "2026-09-24" to mapOf("com.a" to 30.0, "com.untracked" to 500.0),
      "2026-09-23" to mapOf("com.a" to 20.0)
    )
    val rollup = mapOf(
      "2026-09-23" to 999.0, // overridden: the app rewrites this day from events
      "2026-09-20" to 40.0, // no events for this day, so the rollup stands
      "2026-09-10" to 1000.0 // outside the week
    )
    val tracked = setOf("com.a")
    assertEquals(30.0, UsageMath.rangeMinutes(Range.DAY, t, eventDays, rollup, tracked), eps)
    assertEquals(90.0, UsageMath.rangeMinutes(Range.WEEK, t, eventDays, rollup, tracked), eps)
    assertEquals(1090.0, UsageMath.rangeMinutes(Range.MONTH, t, eventDays, rollup, tracked), eps)
  }

  @Test fun `nothing tracked sums to zero`() {
    val t = today(2026, 9, 24)
    val eventDays = mapOf("2026-09-24" to mapOf("com.a" to 30.0))
    assertEquals(0.0, UsageMath.rangeMinutes(Range.DAY, t, eventDays, emptyMap(), emptySet()), eps)
  }

  // --- Formatting --------------------------------------------------------------

  @Test fun `formats minutes the way the app's fmt does`() {
    assertEquals("0m", UsageMath.format(0.0))
    assertEquals("0m", UsageMath.format(0.4))
    assertEquals("45m", UsageMath.format(45.4))
    assertEquals("1h 0m", UsageMath.format(59.5))
    assertEquals("3h 34m", UsageMath.format(214.0))
    assertEquals("1d 0h 0m", UsageMath.format(1440.0))
    assertEquals("1d 3h 54m", UsageMath.format(1674.0))
  }
}
