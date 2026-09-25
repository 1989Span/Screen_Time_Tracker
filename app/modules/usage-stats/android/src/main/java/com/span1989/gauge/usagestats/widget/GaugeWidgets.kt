package com.span1989.gauge.usagestats.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import android.view.View
import android.widget.RemoteViews
import com.span1989.gauge.usagestats.R
import com.span1989.gauge.usagestats.TrackedTotals
import com.span1989.gauge.usagestats.TrackedTotals.State
import com.span1989.gauge.usagestats.UsageMath
import com.span1989.gauge.usagestats.UsageMath.Range
import java.util.concurrent.Executors

/**
 * Draws every placed Gauge widget. The numbers come from [TrackedTotals], the
 * same calculation the hourly nudges use.
 */
internal object GaugeWidgets {
  private const val TAG = "GaugeWidget"

  /** One worker, so overlapping update requests queue instead of racing. */
  private val worker = Executors.newSingleThreadExecutor()

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
    val states = TrackedTotals.compute(context, rangeById.values.toSet())
    for ((id, range) in rangeById) {
      manager.updateAppWidget(id, views(context, id, range, states.getValue(range)))
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
      val text = UsageMath.format(state.value)
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
