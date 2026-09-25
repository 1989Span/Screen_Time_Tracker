package com.span1989.gauge.usagestats.widget

import android.content.Context
import android.content.SharedPreferences

/**
 * What the widget needs that only the app knows.
 *
 * The tracked-app selection lives in the JS side's AsyncStorage, which native
 * code has no stable way to read, so the app mirrors it here every time it
 * loads usage. Each placed widget's chosen range is stored here too, keyed by
 * its widget id.
 */
internal object WidgetPrefs {
  private const val FILE = "gauge_widget"
  private const val KEY_TRACKED = "tracked"
  private const val KEY_SYNCED = "tracked_synced"
  private fun rangeKey(widgetId: Int) = "range_$widgetId"

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  fun setTracked(context: Context, packages: Collection<String>) {
    prefs(context).edit()
      .putStringSet(KEY_TRACKED, HashSet(packages))
      .putBoolean(KEY_SYNCED, true)
      .apply()
  }

  /**
   * The mirrored selection, or null if the app has never synced it: this build
   * was installed but not opened yet. That differs from an empty selection, and
   * the widget says so differently.
   */
  fun tracked(context: Context): Set<String>? {
    val p = prefs(context)
    if (!p.getBoolean(KEY_SYNCED, false)) return null
    // getStringSet hands back the stored instance, which must not be modified. Copy it.
    return HashSet(p.getStringSet(KEY_TRACKED, emptySet()) ?: emptySet())
  }

  fun setRange(context: Context, widgetId: Int, range: WidgetMath.Range) {
    prefs(context).edit().putString(rangeKey(widgetId), range.id).apply()
  }

  fun range(context: Context, widgetId: Int): WidgetMath.Range =
    WidgetMath.Range.fromId(prefs(context).getString(rangeKey(widgetId), null))

  fun hasRange(context: Context, widgetId: Int): Boolean = prefs(context).contains(rangeKey(widgetId))

  fun forget(context: Context, widgetIds: IntArray) {
    val edit = prefs(context).edit()
    for (id in widgetIds) edit.remove(rangeKey(id))
    edit.apply()
  }
}
