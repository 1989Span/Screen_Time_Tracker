package com.span1989.gauge.usagestats

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import com.span1989.gauge.usagestats.UsageMath.Range
import java.io.File

/**
 * Tracked screen time per range, computed without the JS side.
 *
 * Reads the OS event log and the app's SQLite history directly, so the widget
 * and the hourly nudges keep working when the app hasn't been opened for days.
 * It only ever reads. The app and its background task are the only writers of
 * the history database.
 */
internal object TrackedTotals {
  private const val TAG = "GaugeTotals"

  /** Where expo-sqlite keeps DB_NAME from src/usage/rollupStore.ts. */
  private const val HISTORY_DB = "SQLite/gauge-history.db"

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
    val rollup = readRollup(
      context,
      UsageMath.dayStamp(UsageMath.addDays(today, -deepest)),
      UsageMath.dayStamp(today),
      tracked
    )
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

  /**
   * Tracked minutes per day stamp from the app's history, for [fromStamp, toStamp].
   *
   * Opened read-only: a read-only connection never touches the journal mode, so
   * it can't knock the database out of the WAL mode expo-sqlite relies on while
   * the app holds it open. A missing or unreadable database means no history
   * yet, not a failure. The event log still covers the recent days.
   */
  private fun readRollup(context: Context, fromStamp: String, toStamp: String, tracked: Set<String>): Map<String, Double> {
    val file = File(context.filesDir, HISTORY_DB)
    if (!file.exists()) return emptyMap()
    return try {
      SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READONLY).use { db ->
        db.rawQuery(
          "SELECT day, package, minutes FROM usage_day WHERE day >= ? AND day <= ?",
          arrayOf(fromStamp, toStamp)
        ).use { c ->
          val out = HashMap<String, Double>()
          while (c.moveToNext()) {
            if (c.getString(1) !in tracked) continue
            val day = c.getString(0)
            out[day] = (out[day] ?: 0.0) + c.getDouble(2)
          }
          out
        }
      }
    } catch (e: Exception) {
      Log.w(TAG, "history unreadable, using the event log only", e)
      emptyMap()
    }
  }
}
