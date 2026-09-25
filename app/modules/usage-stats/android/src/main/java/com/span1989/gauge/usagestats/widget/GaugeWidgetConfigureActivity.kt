package com.span1989.gauge.usagestats.widget

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import com.span1989.gauge.usagestats.R
import com.span1989.gauge.usagestats.widget.WidgetMath.Range

/**
 * The chooser shown when a Gauge widget is placed, and again when it is
 * reconfigured from a long-press (Android 12 and later).
 *
 * Backing out leaves the result as CANCELED, which tells the launcher not to
 * place the widget. Nothing half-configured ends up on the home screen.
 */
class GaugeWidgetConfigureActivity : Activity() {

  private var widgetId = AppWidgetManager.INVALID_APPWIDGET_ID

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    setResult(RESULT_CANCELED)

    widgetId = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
      ?: AppWidgetManager.INVALID_APPWIDGET_ID
    // This activity is exported, because the launcher has to start it. Only act
    // on an id that really belongs to a Gauge widget, so another app can't use
    // it to write settings for an id of its choosing.
    val provider = AppWidgetManager.getInstance(this).getAppWidgetInfo(widgetId)?.provider
    if (provider != ComponentName(this, GaugeWidgetProvider::class.java)) {
      finish()
      return
    }

    setContentView(R.layout.gauge_widget_configure)
    val current = if (WidgetPrefs.hasRange(this, widgetId)) WidgetPrefs.range(this, widgetId) else null
    val rows = findViewById<LinearLayout>(R.id.gauge_widget_configure_rows)
    for (range in Range.values()) rows.addView(row(rows, range, range == current))
  }

  private fun row(parent: ViewGroup, range: Range, selected: Boolean): View {
    val (title, detail) = when (range) {
      Range.DAY -> R.string.gauge_widget_label_day to R.string.gauge_widget_detail_day
      Range.WEEK -> R.string.gauge_widget_label_week to R.string.gauge_widget_detail_week
      Range.MONTH -> R.string.gauge_widget_label_month to R.string.gauge_widget_detail_month
      Range.YEAR -> R.string.gauge_widget_label_year to R.string.gauge_widget_detail_year
    }
    val view = layoutInflater.inflate(R.layout.gauge_widget_configure_row, parent, false)
    view.findViewById<TextView>(R.id.gauge_widget_row_title).setText(title)
    view.findViewById<TextView>(R.id.gauge_widget_row_detail).setText(detail)
    view.findViewById<View>(R.id.gauge_widget_row_check).visibility = if (selected) View.VISIBLE else View.GONE
    view.isSelected = selected
    view.setOnClickListener { choose(range) }
    return view
  }

  private fun choose(range: Range) {
    WidgetPrefs.setRange(this, widgetId, range)
    // With a configure screen, Android doesn't send the first update itself.
    GaugeWidgets.update(this, intArrayOf(widgetId), null)
    setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId))
    finish()
  }
}
