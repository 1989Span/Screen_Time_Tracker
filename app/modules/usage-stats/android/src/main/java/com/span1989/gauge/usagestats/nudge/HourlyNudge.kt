package com.span1989.gauge.usagestats.nudge

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.net.Uri
import android.os.Build
import android.os.SystemClock
import android.util.Log
import com.span1989.gauge.usagestats.R
import com.span1989.gauge.usagestats.TrackedTotals
import com.span1989.gauge.usagestats.UsageMath
import java.util.concurrent.Executors

/**
 * A notification each time today's tracked screen time passes another hour.
 *
 * Scheduling. Android lets a normal app neither watch usage continuously
 * (short of a permanent "running" notification) nor set exact alarms (a
 * permission reserved for alarm-clock apps). So each check works out how long
 * until the next hour mark if use carried on without a break, and asks to be
 * woken then. Usage can't grow faster than the clock, so the mark is never
 * missed by waiting that long. If the phone was put down in the meantime, the
 * check finds the mark not yet reached and schedules the remainder.
 *
 * The alarm is ELAPSED_REALTIME, not a wakeup alarm, so it never wakes a
 * sleeping phone. Nothing is used while it sleeps, so there's nothing to check.
 * It fires when the phone next wakes. Android delivers inexact alarms within a
 * window, 10 minutes on Android 12 and later, so a nudge can arrive a few
 * minutes after the mark.
 *
 * The chain is re-armed whenever the app loads usage, after a reboot, and after
 * an app update, the three things that clear pending alarms.
 */
internal object HourlyNudge {
  private const val TAG = "GaugeNudge"
  const val ACTION_CHECK = "com.span1989.gauge.usagestats.nudge.CHECK"

  private const val CHANNEL_ID = "hourly_screen_time"
  private const val NOTIFICATION_ID = 7001
  private const val WINDOW_MS = 10 * 60_000L

  private const val FILE = "gauge_nudges"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_PROMPTED = "prompted"
  private const val KEY_DAY = "covered_day"
  private const val KEY_HOUR = "covered_hour"
  private const val KEY_SAYING = "last_saying"

  private val worker = Executors.newSingleThreadExecutor()

  private fun prefs(context: Context): SharedPreferences =
    context.getSharedPreferences(FILE, Context.MODE_PRIVATE)

  /** On unless the user has switched it off. */
  fun isEnabled(context: Context): Boolean = prefs(context).getBoolean(KEY_ENABLED, true)

  fun setEnabled(context: Context, on: Boolean) {
    prefs(context).edit().putBoolean(KEY_ENABLED, on).apply()
    if (on) check(context, inApp = true, pending = null) else cancel(context)
  }

  /** Whether the app has already asked for notification permission once. */
  fun wasPrompted(context: Context): Boolean = prefs(context).getBoolean(KEY_PROMPTED, false)

  fun markPrompted(context: Context) {
    prefs(context).edit().putBoolean(KEY_PROMPTED, true).apply()
  }

  /**
   * Whether Android will show this app's notifications: false before the
   * Android 13+ permission is granted, or when the user turned them off.
   */
  fun notificationsAllowed(context: Context): Boolean =
    (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).areNotificationsEnabled()

  /** Checks off the main thread. `pending` keeps a broadcast receiver alive until done. */
  fun check(context: Context, inApp: Boolean, pending: BroadcastReceiver.PendingResult?) {
    val app = context.applicationContext
    worker.execute {
      try {
        run(app, inApp)
      } catch (e: Exception) {
        Log.w(TAG, "nudge check failed", e)
      } finally {
        pending?.finish()
      }
    }
  }

  private fun run(context: Context, inApp: Boolean) {
    // Nothing to do, so nothing to schedule. The app re-arms on its next load.
    if (!isEnabled(context) || !notificationsAllowed(context)) return cancel(context)
    val state = TrackedTotals.compute(context, setOf(UsageMath.Range.DAY))[UsageMath.Range.DAY]
    if (state !is TrackedTotals.State.Minutes) return cancel(context)

    val today = UsageMath.dayStamp(UsageMath.startOfDay(System.currentTimeMillis()))
    val p = prefs(context)
    val plan = NudgeMath.plan(
      minutesToday = state.value,
      today = today,
      coveredDay = p.getString(KEY_DAY, null),
      coveredHour = p.getInt(KEY_HOUR, 0),
      inApp = inApp
    )
    p.edit().putString(KEY_DAY, today).putInt(KEY_HOUR, plan.coveredHour).apply()
    plan.notifyHours?.let { post(context, it, state.value) }
    schedule(context, plan.nextCheckMinutes)
  }

  private fun alarmIntent(context: Context): PendingIntent =
    PendingIntent.getBroadcast(
      context,
      0,
      Intent(context, NudgeReceiver::class.java).setAction(ACTION_CHECK),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

  private fun schedule(context: Context, minutes: Double) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val at = SystemClock.elapsedRealtime() + (minutes * 60_000).toLong()
    am.setWindow(AlarmManager.ELAPSED_REALTIME, at, WINDOW_MS, alarmIntent(context))
  }

  private fun cancel(context: Context) {
    (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(alarmIntent(context))
  }

  private fun post(context: Context, hours: Int, minutes: Double) {
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      nm.createNotificationChannel(
        NotificationChannel(
          CHANNEL_ID,
          context.getString(R.string.gauge_nudge_channel_name),
          NotificationManager.IMPORTANCE_DEFAULT
        ).apply { description = context.getString(R.string.gauge_nudge_channel_description) }
      )
    }

    val p = prefs(context)
    val index = NudgeSayings.pickIndex(p.getInt(KEY_SAYING, -1))
    p.edit().putInt(KEY_SAYING, index).apply()
    val saying = NudgeSayings.render(index, hours)

    // Tapping opens today's breakdown, the same link the widget uses.
    val open = PendingIntent.getActivity(
      context,
      NOTIFICATION_ID,
      Intent(Intent.ACTION_VIEW, Uri.parse("gauge://range/day")).apply {
        setPackage(context.packageName)
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(context, CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(context)
    }
    val notification = builder
      .setSmallIcon(R.drawable.gauge_nudge_icon)
      .setColor(0xFF416180.toInt())
      .setContentTitle(context.getString(R.string.gauge_nudge_title, UsageMath.format(minutes)))
      .setContentText(saying)
      .setStyle(Notification.BigTextStyle().bigText(saying))
      .setContentIntent(open)
      .setAutoCancel(true)
      .setCategory(Notification.CATEGORY_REMINDER)
      .build()
    // One id, so each hour replaces the last nudge instead of stacking them.
    nm.notify(NOTIFICATION_ID, notification)
  }
}
