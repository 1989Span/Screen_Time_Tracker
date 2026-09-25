package com.span1989.gauge.usagestats

import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.provider.Settings
import com.span1989.gauge.usagestats.widget.GaugeWidgets
import com.span1989.gauge.usagestats.widget.WidgetPrefs
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads per-app screen time from Android's UsageStatsManager.
 *
 * Two properties of this API shape the whole design:
 *
 *  1. PACKAGE_USAGE_STATS is a *special* permission. There is no runtime prompt
 *     and no grant callback, so the app deep-links to Settings and re-checks
 *     when it regains focus.
 *
 *  2. Retention is short and varies by OEM. queryUsageStats only returns buckets
 *     the platform still holds, which is why probeRetention exists: measure what
 *     this device actually has rather than trusting a documented figure.
 */
class UsageStatsModule : Module() {

  private val context: Context
    get() = requireNotNull(appContext.reactContext) { "No react context available" }

  private val usage: UsageStatsManager
    get() = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager

  private fun permissionGranted(): Boolean = UsageAccess.isGranted(context)

  override fun definition() = ModuleDefinition {
    Name("UsageStats")

    /** Whether usage access has been granted. Cheap, so safe to poll on resume. */
    Function("hasPermission") { permissionGranted() }

    /**
     * Opens the system screen where usage access is granted. There is no result
     * callback: the caller re-checks hasPermission when the app resumes.
     */
    Function("openSettings") {
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }

    /**
     * Every installed app, for the picker.
     *
     * The category field is Android's own ApplicationInfo.category, reported
     * only so group views can aggregate; this app tracks per package. A value of
     * -1 is CATEGORY_UNDEFINED, which is common because many apps declare none.
     */
    AsyncFunction("installedApps") {
      val pm = context.packageManager
      val launchable = pm.queryIntentActivities(
        Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER),
        0
      ).mapNotNull { it.activityInfo?.packageName }.toSet()

      pm.getInstalledApplications(PackageManager.GET_META_DATA).map { info ->
        mapOf(
          "packageName" to info.packageName,
          "label" to pm.getApplicationLabel(info).toString(),
          "category" to if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) info.category else -1,
          "isSystem" to ((info.flags and ApplicationInfo.FLAG_SYSTEM) != 0),
          "hasLauncherIcon" to launchable.contains(info.packageName)
        )
      }
    }

    /**
     * Per-package foreground milliseconds between two instants.
     *
     * Sums the INTERVAL_DAILY buckets the platform returns. Aged-out buckets
     * simply do not appear, so a caller cannot distinguish a quiet day from a
     * forgotten one; probeRetention is how the boundary is found.
     */
    AsyncFunction("queryTotals") { startMs: Double, endMs: Double ->
      val stats = usage.queryUsageStats(
        UsageStatsManager.INTERVAL_DAILY,
        startMs.toLong(),
        endMs.toLong()
      ) ?: emptyList()
      val totals = HashMap<String, Double>()
      for (s in stats) {
        if (s.totalTimeInForeground <= 0L) continue
        totals[s.packageName] = (totals[s.packageName] ?: 0.0) + s.totalTimeInForeground.toDouble()
      }
      totals
    }

    /**
     * Raw app-switch events, the only way to attribute usage to an hour. Events
     * are retained far more briefly than aggregate buckets, so hourly detail is
     * available only for very recent days.
     */
    AsyncFunction("queryEvents") { startMs: Double, endMs: Double ->
      val out = ArrayList<Map<String, Any>>()
      val events = usage.queryEvents(startMs.toLong(), endMs.toLong())
      val event = UsageEvents.Event()
      while (events.hasNextEvent()) {
        events.getNextEvent(event)
        val type = event.eventType
        if (type != UsageEvents.Event.ACTIVITY_RESUMED && type != UsageEvents.Event.ACTIVITY_PAUSED) {
          continue
        }
        out.add(
          mapOf(
            "packageName" to (event.packageName ?: ""),
            "timeStamp" to event.timeStamp.toDouble(),
            "resumed" to (type == UsageEvents.Event.ACTIVITY_RESUMED)
          )
        )
      }
      out
    }

    /**
     * Hands the widget the tracked-app selection and redraws every placed widget.
     *
     * The widget runs without JS and can't read AsyncStorage, so the app
     * mirrors the selection here each time it loads usage. Opening the app also
     * refreshes the widget, instead of waiting up to 30 minutes for Android.
     */
    Function("syncWidgets") { tracked: List<String> ->
      WidgetPrefs.setTracked(context, tracked)
      GaugeWidgets.updateAll(context)
    }

    /**
     * How far back this device actually holds data, per interval.
     *
     * Documented retention is approximate and OEM-dependent, so measure instead
     * of assuming: ask for two years at each granularity and report the oldest
     * bucket that comes back.
     */
    AsyncFunction("probeRetention") {
      val now = System.currentTimeMillis()
      val twoYearsAgo = now - 730L * 24 * 60 * 60 * 1000
      val intervals = linkedMapOf(
        "daily" to UsageStatsManager.INTERVAL_DAILY,
        "weekly" to UsageStatsManager.INTERVAL_WEEKLY,
        "monthly" to UsageStatsManager.INTERVAL_MONTHLY,
        "yearly" to UsageStatsManager.INTERVAL_YEARLY
      )
      val result = HashMap<String, Map<String, Any>>()
      for ((label, interval) in intervals) {
        val stats = usage.queryUsageStats(interval, twoYearsAgo, now) ?: emptyList()
        val oldest = stats.minOfOrNull { it.firstTimeStamp } ?: 0L
        val newest = stats.maxOfOrNull { it.lastTimeStamp } ?: 0L
        result[label] = mapOf(
          "buckets" to stats.size,
          "distinctPeriods" to stats.map { it.firstTimeStamp }.distinct().size,
          "packages" to stats.map { it.packageName }.distinct().size,
          "oldestMs" to oldest.toDouble(),
          "newestMs" to newest.toDouble(),
          "spanDays" to if (oldest > 0L) (now - oldest) / 86_400_000.0 else 0.0
        )
      }
      // Events are retained separately, and much more briefly.
      var eventCount = 0
      var oldestEvent = Long.MAX_VALUE
      val events = usage.queryEvents(twoYearsAgo, now)
      val probe = UsageEvents.Event()
      while (events.hasNextEvent()) {
        events.getNextEvent(probe)
        eventCount++
        if (probe.timeStamp in 1 until oldestEvent) oldestEvent = probe.timeStamp
      }
      val foundEvents = oldestEvent != Long.MAX_VALUE
      result["events"] = mapOf(
        "buckets" to eventCount,
        "distinctPeriods" to 0,
        "packages" to 0,
        "oldestMs" to if (foundEvents) oldestEvent.toDouble() else 0.0,
        "newestMs" to now.toDouble(),
        "spanDays" to if (foundEvents) (now - oldestEvent) / 86_400_000.0 else 0.0
      )
      result
    }
  }
}
