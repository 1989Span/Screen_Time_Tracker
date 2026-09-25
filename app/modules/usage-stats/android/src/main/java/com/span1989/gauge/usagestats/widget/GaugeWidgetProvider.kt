package com.span1989.gauge.usagestats.widget

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context

/**
 * The system's entry point for the home-screen widget.
 *
 * Android calls onUpdate on the schedule in gauge_widget_info.xml (every 30
 * minutes, the shortest period it allows) and after a reboot. The app also asks
 * for a redraw whenever it loads usage, and the configure screen does when a
 * range is chosen.
 */
class GaugeWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
    // goAsync keeps the receiver alive while the worker reads usage off the main thread.
    GaugeWidgets.update(context, appWidgetIds, goAsync())
  }

  override fun onDeleted(context: Context, appWidgetIds: IntArray) {
    WidgetPrefs.forget(context, appWidgetIds)
  }
}
