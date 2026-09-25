package com.span1989.gauge.usagestats.widget

import android.content.Context
import android.content.SharedPreferences
import com.span1989.gauge.usagestats.UsageMath

/**
 * Which range each placed widget shows, keyed by its widget id.
 *
 * Shares a file with TrackedSelection, which it predates. The keys don't overlap.
 */
internal object WidgetPrefs {
  private const val FILE = "gauge_widget"
  private fun rangeKey(widgetId: Int) = "range_$widgetId"

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  fun setRange(context: Context, widgetId: Int, range: UsageMath.Range) {
    prefs(context).edit().putString(rangeKey(widgetId), range.id).apply()
  }

  fun range(context: Context, widgetId: Int): UsageMath.Range =
    UsageMath.Range.fromId(prefs(context).getString(rangeKey(widgetId), null))

  fun hasRange(context: Context, widgetId: Int): Boolean = prefs(context).contains(rangeKey(widgetId))

  fun forget(context: Context, widgetIds: IntArray) {
    val edit = prefs(context).edit()
    for (id in widgetIds) edit.remove(rangeKey(id))
    edit.apply()
  }
}
