package com.span1989.gauge.usagestats

import java.util.Calendar
import java.util.Locale
import java.util.TimeZone
import kotlin.math.roundToLong

/**
 * Usage arithmetic for the parts of the app that run without JS: the
 * home-screen widget and the hourly nudges. Kept free of Android APIs so it can
 * be unit tested.
 *
 * Neither can call the code that produces the app's numbers. Every function here is a port of a specific
 * TypeScript function, named in its doc comment. They must agree to the minute,
 * or the widget, the nudges and the app will disagree about the same range.
 * Change them together.
 */
internal object UsageMath {

  /** The four ranges, in the order the app's tabs show them. `id` matches RangeId in src/data.ts. */
  enum class Range(val id: String) {
    DAY("day"),
    WEEK("week"),
    MONTH("month"),
    YEAR("year");

    companion object {
      /** Unknown or missing ids fall back to Day rather than failing. */
      fun fromId(id: String?): Range = values().firstOrNull { it.id == id } ?: DAY
    }
  }

  data class Event(val pkg: String, val timeStamp: Long, val resumed: Boolean)

  data class Session(val pkg: String, val from: Long, val to: Long)

  /**
   * How many days back the app copies from the OS event log.
   * OS_RECORD_DAYS in src/usage/recorder.ts.
   */
  const val OS_RECORD_DAYS = 14

  // --- Pairing (src/usage/hourly.ts, hourlyFromEvents) ---------------------

  /**
   * Foreground sessions from raw resume/pause events.
   *
   * Same rules as hourlyFromEvents: events are sorted first; at most one app is
   * open at a time, so a resume ends whatever was open; a pause closes only the
   * app that is open, and a stale pause is ignored; a session still open at the
   * end runs to `now`. Clipping to a day happens later, in [minutesIn].
   *
   * Pairing once over the whole window and then clipping per day gives exactly
   * what the app gets by pairing over the same events once per day.
   */
  fun sessions(events: List<Event>, now: Long): List<Session> {
    val out = ArrayList<Session>()
    var openPkg: String? = null
    var openAt = 0L
    for (e in events.sortedBy { it.timeStamp }) {
      if (e.pkg.isEmpty()) continue
      if (e.resumed) {
        openPkg?.let { out.add(Session(it, openAt, e.timeStamp)) }
        openPkg = e.pkg
        openAt = e.timeStamp
      } else if (openPkg == e.pkg) {
        out.add(Session(e.pkg, openAt, e.timeStamp))
        openPkg = null
      }
    }
    openPkg?.let { out.add(Session(it, openAt, now)) }
    return out
  }

  /** Per-package minutes of `sessions` that fall inside [start, end). */
  fun minutesIn(sessions: List<Session>, start: Long, end: Long): Map<String, Double> {
    val totals = HashMap<String, Double>()
    for (s in sessions) {
      val from = maxOf(s.from, start)
      val to = minOf(s.to, end)
      if (to <= from) continue
      totals[s.pkg] = (totals[s.pkg] ?: 0.0) + (to - from) / 60_000.0
    }
    return totals
  }

  // --- Filtering (src/usage/appFilter.ts, isCountable) ---------------------

  private val NEVER_COUNT = setOf(
    "com.span1989.gauge",
    "com.android.dreams.basic",
    "com.android.systemui",
    "com.android.settings",
    "android"
  )
  private val LAUNCHER_HINTS = listOf("launcher", "home")

  /** isCountable in src/usage/appFilter.ts. */
  fun isCountable(pkg: String): Boolean =
    pkg !in NEVER_COUNT && LAUNCHER_HINTS.none { pkg.lowercase(Locale.ROOT).contains(it) }

  /** `countable` in src/usage/recorder.ts: countable packages with positive time. */
  fun countable(totals: Map<String, Double>): Map<String, Double> =
    totals.filter { (pkg, minutes) -> isCountable(pkg) && minutes.isFinite() && minutes > 0 }

  // --- Dates (src/clock.ts, src/usage/hourly.ts dayWindow) -----------------

  /** Local midnight of the day containing `ms`. startOfToday in src/clock.ts. */
  fun startOfDay(ms: Long, zone: TimeZone = TimeZone.getDefault()): Calendar =
    Calendar.getInstance(zone).apply {
      timeInMillis = ms
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }

  /**
   * Midnight `n` calendar days from `day`. Calendar arithmetic rather than
   * multiples of 24h, so a daylight-saving change can't shift a day boundary,
   * matching `new Date(y, m, d + n)` in the app.
   */
  fun addDays(day: Calendar, n: Int): Calendar =
    (day.clone() as Calendar).apply { add(Calendar.DAY_OF_MONTH, n) }

  /** dayStamp in src/clock.ts: `YYYY-MM-DD`, the rollup table's key. */
  fun dayStamp(day: Calendar): String = String.format(
    Locale.ROOT,
    "%04d-%02d-%02d",
    day.get(Calendar.YEAR),
    day.get(Calendar.MONTH) + 1,
    day.get(Calendar.DAY_OF_MONTH)
  )

  /** daysBetween in src/clock.ts: whole calendar days, immune to DST. */
  fun daysBetween(from: Calendar, to: Calendar): Int {
    fun utcDay(c: Calendar): Long = Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply {
      clear()
      set(c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH))
    }.timeInMillis
    return Math.round((utcDay(to) - utcDay(from)) / 86_400_000.0).toInt()
  }

  /** dayWindow in src/usage/hourly.ts: [midnight, next midnight), clipped to `now`. */
  fun dayWindow(today: Calendar, idx: Int, now: Long): Pair<Long, Long> {
    val start = addDays(today, -idx).timeInMillis
    val end = addDays(today, -idx + 1).timeInMillis
    return start to minOf(end, now)
  }

  /**
   * The first day a range covers, from `buckets` in src/data.ts:
   * Day is today; Week the last 7 days and Month the last 30, both counting
   * today; Year the 12 calendar months ending with the current one.
   */
  fun firstDay(range: Range, today: Calendar): Calendar = when (range) {
    Range.DAY -> today.clone() as Calendar
    Range.WEEK -> addDays(today, -6)
    Range.MONTH -> addDays(today, -29)
    Range.YEAR -> (today.clone() as Calendar).apply {
      set(Calendar.DAY_OF_MONTH, 1)
      add(Calendar.MONTH, -11)
    }
  }

  /** How many days back the widget needs, counting today as 0. */
  fun daysBack(range: Range, today: Calendar): Int = daysBetween(firstDay(range, today), today)

  // --- Totals ---------------------------------------------------------------

  /**
   * Countable per-package minutes for each of the last [OS_RECORD_DAYS] days,
   * keyed by day stamp. Days with nothing countable are left out.
   *
   * Mirrors recordOsDays in src/usage/recorder.ts: one event query from the
   * start of the oldest day to now, sliced per day.
   */
  fun eventDays(events: List<Event>, today: Calendar, now: Long): Map<String, Map<String, Double>> {
    val paired = sessions(events, now)
    val out = HashMap<String, Map<String, Double>>()
    for (idx in 0 until OS_RECORD_DAYS) {
      val (start, end) = dayWindow(today, idx, now)
      if (end <= start) continue
      val day = countable(minutesIn(paired, start, end))
      if (day.isNotEmpty()) out[dayStamp(addDays(today, -idx))] = day
    }
    return out
  }

  /**
   * Total tracked minutes for a range.
   *
   * Per day, the same precedence the app ends up with: recordOsDays rewrites a
   * day in the rollup whenever the event log has anything countable for it, and
   * leaves the stored day alone otherwise. So a day with event data uses the
   * events; any other day uses what the rollup holds.
   *
   * @param rollupTracked tracked minutes per day stamp, read from the rollup.
   */
  fun rangeMinutes(
    range: Range,
    today: Calendar,
    eventDays: Map<String, Map<String, Double>>,
    rollupTracked: Map<String, Double>,
    tracked: Set<String>
  ): Double {
    var total = 0.0
    for (idx in 0..daysBack(range, today)) {
      val stamp = dayStamp(addDays(today, -idx))
      val fromEvents = eventDays[stamp]
      total += if (fromEvents != null) {
        fromEvents.entries.sumOf { (pkg, minutes) -> if (pkg in tracked) minutes else 0.0 }
      } else {
        rollupTracked[stamp] ?: 0.0
      }
    }
    return total
  }

  // --- Formatting (src/data.ts, fmt) ----------------------------------------

  /** fmt in src/data.ts: "0m", "45m", "3h 34m", "1d 3h 54m". */
  fun format(minutes: Double): String {
    val m = minutes.roundToLong()
    val d = m / 1440
    val h = (m % 1440) / 60
    val mm = m % 60
    val parts = ArrayList<String>()
    if (d != 0L) parts.add("${d}d")
    if (d != 0L || h != 0L) parts.add("${h}h")
    parts.add("${mm}m")
    return parts.joinToString(" ")
  }
}
