package com.span1989.gauge.usagestats

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import com.span1989.gauge.usagestats.UsageMath.Range

/**
 * Tracked screen time per range, computed without the JS side.
 *
 * Reads the OS event log and the history the app mirrors here after each load
 * (TrackedSelection.history), so the widget and the hourly nudges keep working
 * when the app hasn't been opened for days. It never opens the app's history
 * database: see TrackedSelection.setHistory for why.
 */
internal object TrackedTotals {
  sealed class State {
    data class Minutes(val value: Double) : State()
    /** Usage access is off. */
    object NoAccess : State()
    /** This build has never been opened, so the tracked selection isn't mirrored yet. */
    object NotSetUp : State()
    /** The user tracks nothing. */
    object NoApps : State()
  }

  /** Each requested range computed once, with one event query and one history read. */
  fun compute(context: Context, ranges: Set<Range>): Map<Range, State> {
    if (!UsageAccess.isGranted(context)) return ranges.associateWith { State.NoAccess }
    val tracked = TrackedSelection.get(context) ?: return ranges.associateWith { State.NotSetUp }
    if (tracked.isEmpty()) return ranges.associateWith { State.NoApps }

    val now = System.currentTimeMillis()
    val today = UsageMath.startOfDay(now)

    // The same event window the app's recorder queries: the start of the oldest
    // recorded day up to now. Querying only today would miss the part of a
    // session that began before midnight, which the app does count.
    val (windowStart, _) = UsageMath.dayWindow(today, UsageMath.OS_RECORD_DAYS - 1, now)
    val eventDays = UsageMath.eventDays(readEvents(context, windowStart, now), today, now)

    val deepest = ranges.maxOf { UsageMath.daysBack(it, today) }
    val from = UsageMath.dayStamp(UsageMath.addDays(today, -deepest))
    val to = UsageMath.dayStamp(today)
    val rollup = TrackedSelection.history(context).filterKeys { it in from..to }
    return ranges.associateWith {
      State.Minutes(UsageMath.rangeMinutes(it, today, eventDays, rollup, tracked))
    }
  }

  /** Resume/pause events, as UsageStatsModule.queryEvents reports them to the app. */
  private fun readEvents(context: Context, from: Long, to: Long): List<UsageMath.Event> {
    val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val out = ArrayList<UsageMath.Event>()
    val events = usm.queryEvents(from, to) ?: return out
    val e = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(e)
      val type = e.eventType
      if (type != UsageEvents.Event.ACTIVITY_RESUMED && type != UsageEvents.Event.ACTIVITY_PAUSED) continue
      out.add(UsageMath.Event(e.packageName ?: "", e.timeStamp, type == UsageEvents.Event.ACTIVITY_RESUMED))
    }
    return out
  }
}
