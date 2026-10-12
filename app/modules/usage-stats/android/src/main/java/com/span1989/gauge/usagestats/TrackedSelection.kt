package com.span1989.gauge.usagestats

import android.content.Context
import android.content.SharedPreferences
import org.json.JSONObject

/**
 * The app's tracked-app selection, mirrored for the code that runs without JS.
 *
 * The selection lives in the JS side's AsyncStorage, which native code has no
 * stable way to read, so the app writes a copy here every time it loads usage.
 * The widget and the hourly nudges both read it.
 *
 * The file and keys predate the nudges ("gauge_widget"). They are kept, so an
 * update doesn't lose a selection the app has already synced.
 */
internal object TrackedSelection {
  private const val FILE = "gauge_widget"
  private const val KEY_TRACKED = "tracked"
  private const val KEY_SYNCED = "tracked_synced"
  private const val KEY_HISTORY = "tracked_history"

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  fun set(context: Context, packages: Collection<String>) {
    prefs(context).edit()
      .putStringSet(KEY_TRACKED, HashSet(packages))
      .putBoolean(KEY_SYNCED, true)
      .apply()
  }

  /**
   * Tracked minutes per day stamp, from the app's history database.
   *
   * Native code must never open that database itself: it would be a second
   * SQLite library in the process alongside expo-sqlite's, and two libraries
   * release each other's file locks, which corrupted it on a real phone. So the
   * app sums each day's tracked minutes and hands them over here instead.
   */
  fun setHistory(context: Context, days: Map<String, Double>) {
    prefs(context).edit().putString(KEY_HISTORY, JSONObject(days).toString()).apply()
  }

  fun history(context: Context): Map<String, Double> {
    val raw = prefs(context).getString(KEY_HISTORY, null) ?: return emptyMap()
    return try {
      val json = JSONObject(raw)
      json.keys().asSequence().associateWith { json.optDouble(it, 0.0) }
    } catch (e: Exception) {
      emptyMap()
    }
  }

  /**
   * The mirrored selection, or null if the app has never synced it: this build
   * was installed but not opened yet. That differs from an empty selection.
   */
  fun get(context: Context): Set<String>? {
    val p = prefs(context)
    if (!p.getBoolean(KEY_SYNCED, false)) return null
    // getStringSet hands back the stored instance, which must not be modified. Copy it.
    return HashSet(p.getStringSet(KEY_TRACKED, emptySet()) ?: emptySet())
  }
}
