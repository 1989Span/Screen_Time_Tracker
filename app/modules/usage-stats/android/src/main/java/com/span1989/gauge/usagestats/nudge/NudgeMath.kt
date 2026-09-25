package com.span1989.gauge.usagestats.nudge

import kotlin.math.floor
import kotlin.math.max

/**
 * When to nudge, kept free of Android APIs so it can be unit tested.
 *
 * A nudge goes out each time today's tracked screen time passes another whole
 * hour: 1h, 2h, 3h. At most one goes out per hour mark, and the count starts
 * again at midnight.
 */
internal object NudgeMath {

  data class Plan(
    /** Hours to announce now, or null to stay quiet. */
    val notifyHours: Int?,
    /** The highest hour mark already covered today, to remember for next time. */
    val coveredHour: Int,
    /**
     * Minutes until the next hour mark could be reached. That's the earliest the
     * next nudge could be due, since usage can't grow faster than the clock.
     */
    val nextCheckMinutes: Double
  )

  /**
   * @param minutesToday tracked minutes so far today
   * @param today today's day stamp
   * @param coveredDay the day [coveredHour] belongs to, or null if never set
   * @param coveredHour the last hour mark already announced (or seen in the app)
   * @param inApp true when the check comes from the app itself. The user is
   *   looking at their total right then, so a newly passed mark counts as covered
   *   without a notification. Opening Gauge shouldn't set off a nudge about Gauge.
   */
  fun plan(minutesToday: Double, today: String, coveredDay: String?, coveredHour: Int, inApp: Boolean): Plan {
    val hours = floor(max(0.0, minutesToday) / 60.0).toInt()
    val covered = if (coveredDay == today) coveredHour else 0
    val next = max(MIN_WAIT_MINUTES, (hours + 1) * 60.0 - minutesToday)
    return when {
      hours <= covered -> Plan(null, covered, next)
      inApp -> Plan(null, hours, next)
      // If a check was delayed past more than one mark, announce only the latest.
      else -> Plan(hours, hours, next)
    }
  }

  /** "1 hour", "3 hours". */
  fun hoursPhrase(hours: Int): String = if (hours == 1) "1 hour" else "$hours hours"

  /** Never schedule a re-check sooner than this, even right at a mark. */
  const val MIN_WAIT_MINUTES = 1.0
}
