package com.span1989.gauge.usagestats.nudge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Runs a nudge check when its alarm fires, and re-arms the chain after a
 * reboot or an app update. Both of those clear pending alarms.
 */
class NudgeReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.action) {
      HourlyNudge.ACTION_CHECK,
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED ->
        HourlyNudge.check(context, inApp = false, pending = goAsync())
    }
  }
}
