package com.span1989.gauge.usagestats.widget

import android.app.PendingIntent
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.net.Uri
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import com.span1989.gauge.usagestats.R
import com.span1989.gauge.usagestats.UsageAccess
import com.span1989.gauge.usagestats.widget.WidgetMath.Range
import java.io.File
import java.util.concurrent.Executors

/**
 * Computes and draws every placed Gauge widget.
 *
 * Runs without the JS side: it reads the OS event log and the app's SQLite
 * history directly, so the widget keeps counting even when the app has not been
 * opened for days. It only ever reads. The app and its background task are the
 * only writers of the history database.
 */
internal object GaugeWidgets {
  private const val TAG = "GaugeWidget"

  /** Where expo-sqlite keeps DB_NAME from src/usage/rollupStore.ts. */
  private const val HISTORY_DB = "SQLite/gauge-history.db"

  /** One worker, so overlapping update requests queue instead of racing. */
  private val worker = Executors.newSingleThreadExecutor()

  sealed class State {
    data class Minutes(val value: Double) : State()
    /** Usage access is off. */
    object NoAccess : State()
    /** This build has never been opened, so the tracked selection isn't mirrored yet. */
    object NotSetUp : State()
    /** The user tracks nothing. */
    object NoApps : State()
  }

  fun allIds(context: Context): IntArray =
    AppWidgetManager.getInstance(context)
      .getAppWidgetIds(ComponentName(context, GaugeWidgetProvider::class.java))

  /** Redraws every placed widget. Called by the app whenever it loads usage. */
  fun updateAll(context: Context) {
    val ids = allIds(context)
    if (ids.isNotEmpty()) update(context, ids, null)
  }

  /**
   * Redraws `ids` off the main thread. `pending` keeps a broadcast receiver
   * alive until the work is done.
   */
  fun update(context: Context, ids: IntArray, pending: BroadcastReceiver.PendingResult?) {
    val app = context.applicationContext
    worker.execute {
      try {
        render(app, ids)
      } catch (e: Exception) {
        // A widget that fails to update keeps its last good values, which beats
        // crashing the process that hosts the app.
        Log.w(TAG, "widget update failed", e)
      } finally {
        pending?.finish()
      }
    }
  }

  private fun render(context: Context, ids: IntArray) {
    val manager = AppWidgetManager.getInstance(context)
    val rangeById = ids.associateWith { WidgetPrefs.range(context, it) }
    val states = compute(context, rangeById.values.toSet())
    for ((id, range) in rangeById) {
      manager.updateAppWidget(id, views(context, id, range, states.getValue(range)))
    }
  }

  /** Each requested range computed once, however many widgets show it. */
  fun compute(context: Context, ranges: Set<Range>): Map<Range, State> {
    if (!UsageAccess.isGranted(context)) return ranges.associateWith { State.NoAccess }
    val tracked = WidgetPrefs.tracked(context) ?: return ranges.associateWith { State.NotSetUp }
    if (tracked.isEmpty()) return ranges.associateWith { State.NoApps }

    val now = System.currentTimeMillis()
    val today = WidgetMath.startOfDay(now)

    // The same event window the app's recorder queries: the start of the oldest
    // recorded day up to now. Querying only today would miss the part of a
    // session that began before midnight, which the app does count.
    val (windowStart, _) = WidgetMath.dayWindow(today, WidgetMath.OS_RECORD_DAYS - 1, now)
    val eventDays = WidgetMath.eventDays(readEvents(context, windowStart, now), today, now)

    val deepest = ranges.maxOf { WidgetMath.daysBack(it, today) }
    val rollup = readRollup(
      context,
      WidgetMath.dayStamp(WidgetMath.addDays(today, -deepest)),
      WidgetMath.dayStamp(today),
      tracked
    )
    return ranges.associateWith {
      State.Minutes(WidgetMath.rangeMinutes(it, today, eventDays, rollup, tracked))
    }
  }

  /** Resume/pause events, as UsageStatsModule.queryEvents reports them to the app. */
  private fun readEvents(context: Context, from: Long, to: Long): List<WidgetMath.Event> {
    val usm = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val out = ArrayList<WidgetMath.Event>()
    val events = usm.queryEvents(from, to) ?: return out
    val e = UsageEvents.Event()
    while (events.hasNextEvent()) {
      events.getNextEvent(e)
      val type = e.eventType
      if (type != UsageEvents.Event.ACTIVITY_RESUMED && type != UsageEvents.Event.ACTIVITY_PAUSED) continue
      out.add(WidgetMath.Event(e.packageName ?: "", e.timeStamp, type == UsageEvents.Event.ACTIVITY_RESUMED))
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

  private fun labelOf(range: Range): Int = when (range) {
    Range.DAY -> R.string.gauge_widget_label_day
    Range.WEEK -> R.string.gauge_widget_label_week
    Range.MONTH -> R.string.gauge_widget_label_month
    Range.YEAR -> R.string.gauge_widget_label_year
  }

  private fun views(context: Context, id: Int, range: Range, state: State): RemoteViews {
    val v = RemoteViews(context.packageName, R.layout.gauge_widget)
    val label = context.getString(labelOf(range))
    v.setTextViewText(R.id.gauge_widget_label, label)

    val hint = when (state) {
      is State.Minutes -> null
      State.NoAccess -> context.getString(R.string.gauge_widget_hint_access)
      State.NotSetUp -> context.getString(R.string.gauge_widget_hint_setup)
      State.NoApps -> context.getString(R.string.gauge_widget_hint_apps)
    }
    if (state is State.Minutes) {
      val text = WidgetMath.format(state.value)
      v.setTextViewText(R.id.gauge_widget_value, text)
      v.setViewVisibility(R.id.gauge_widget_value, View.VISIBLE)
      v.setViewVisibility(R.id.gauge_widget_hint, View.GONE)
      v.setContentDescription(
        android.R.id.background,
        context.getString(R.string.gauge_widget_value_description, label, text)
      )
    } else {
      v.setTextViewText(R.id.gauge_widget_hint, hint)
      v.setViewVisibility(R.id.gauge_widget_value, View.GONE)
      v.setViewVisibility(R.id.gauge_widget_hint, View.VISIBLE)
      v.setContentDescription(android.R.id.background, "$label: $hint")
    }

    v.setOnClickPendingIntent(android.R.id.background, openBreakdown(context, id, range))
    return v
  }

  /**
   * Opens the app on this range's breakdown through the gauge:// scheme. The
   * package is set explicitly, so no other app that claims the scheme can
   * receive it.
   */
  private fun openBreakdown(context: Context, id: Int, range: Range): PendingIntent {
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("gauge://range/${range.id}")).apply {
      setPackage(context.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    // One request code per widget, so two widgets on different ranges don't
    // share (and overwrite) a single PendingIntent.
    return PendingIntent.getActivity(
      context,
      id,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )
  }
}
