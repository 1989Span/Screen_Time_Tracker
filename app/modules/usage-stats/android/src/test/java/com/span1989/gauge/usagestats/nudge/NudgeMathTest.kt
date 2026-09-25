package com.span1989.gauge.usagestats.nudge

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.random.Random

class NudgeMathTest {
  private val today = "2026-09-24"
  private val yesterday = "2026-09-23"
  private val eps = 1e-9

  // --- When to nudge ---------------------------------------------------------

  @Test fun `nothing before the first hour, and the next check is when it could arrive`() {
    val p = NudgeMath.plan(40.0, today, null, 0, inApp = false)
    assertNull(p.notifyHours)
    assertEquals(20.0, p.nextCheckMinutes, eps)
  }

  @Test fun `passing an hour mark nudges once`() {
    val first = NudgeMath.plan(61.0, today, today, 0, inApp = false)
    assertEquals(1, first.notifyHours)
    assertEquals(1, first.coveredHour)
    // The next check in the same hour stays quiet.
    val again = NudgeMath.plan(75.0, today, today, first.coveredHour, inApp = false)
    assertNull(again.notifyHours)
    assertEquals(45.0, again.nextCheckMinutes, eps)
  }

  @Test fun `a check delayed past several marks announces only the latest`() {
    val p = NudgeMath.plan(3 * 60 + 5.0, today, today, 1, inApp = false)
    assertEquals(3, p.notifyHours)
    assertEquals(3, p.coveredHour)
  }

  @Test fun `the count starts again at midnight`() {
    // Yesterday reached 5 hours. Today's first hour still gets its nudge.
    val p = NudgeMath.plan(62.0, today, yesterday, 5, inApp = false)
    assertEquals(1, p.notifyHours)
  }

  @Test fun `a mark passed while the app is open is noted, not announced`() {
    val p = NudgeMath.plan(2 * 60 + 10.0, today, today, 1, inApp = true)
    assertNull(p.notifyHours)
    assertEquals(2, p.coveredHour)
    // ...so the next nudge is for 3 hours, not a late one for 2.
    val later = NudgeMath.plan(3 * 60 + 1.0, today, today, p.coveredHour, inApp = false)
    assertEquals(3, later.notifyHours)
  }

  @Test fun `never re-checks sooner than a minute, even right at a mark`() {
    val p = NudgeMath.plan(119.95, today, today, 1, inApp = false)
    assertEquals(NudgeMath.MIN_WAIT_MINUTES, p.nextCheckMinutes, eps)
  }

  @Test fun `negative or empty totals are treated as zero`() {
    val p = NudgeMath.plan(-5.0, today, null, 0, inApp = false)
    assertNull(p.notifyHours)
    assertEquals(0, p.coveredHour)
  }

  // --- What it says ------------------------------------------------------------

  @Test fun `hours read naturally`() {
    assertEquals("1 hour", NudgeMath.hoursPhrase(1))
    assertEquals("2 hours", NudgeMath.hoursPhrase(2))
    assertEquals("11 hours", NudgeMath.hoursPhrase(11))
  }

  @Test fun `the user's own line is one of the sayings, word for word`() {
    assertEquals(
      "What are you doing on your phone for 3 hours?!",
      NudgeSayings.render(NudgeSayings.ALL.indexOf("What are you doing on your phone for {hours}?!"), 3)
    )
  }

  @Test fun `every saying mentions the hours and leaves no placeholder behind`() {
    assertTrue(NudgeSayings.ALL.size >= 30)
    for (i in NudgeSayings.ALL.indices) {
      assertTrue(NudgeSayings.ALL[i], NudgeSayings.ALL[i].contains("{hours}"))
      val text = NudgeSayings.render(i, 1)
      assertFalse(text, text.contains("{") || text.contains("}"))
      assertTrue(text, text.contains("1 hour"))
    }
  }

  @Test fun `sayings are all different`() {
    assertEquals(NudgeSayings.ALL.size, NudgeSayings.ALL.toSet().size)
  }

  @Test fun `the same saying never comes up twice in a row`() {
    val random = Random(42)
    var previous = -1
    repeat(2_000) {
      val next = NudgeSayings.pickIndex(previous, random)
      assertTrue(next in NudgeSayings.ALL.indices)
      assertNotEquals(previous, next)
      previous = next
    }
  }

  @Test fun `every saying can come up`() {
    val random = Random(7)
    val seen = HashSet<Int>()
    var previous = -1
    repeat(5_000) {
      previous = NudgeSayings.pickIndex(previous, random)
      seen.add(previous)
    }
    assertEquals(NudgeSayings.ALL.size, seen.size)
  }
}
