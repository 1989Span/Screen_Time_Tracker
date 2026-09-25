package com.span1989.gauge.usagestats.nudge

import kotlin.random.Random

/**
 * What an hourly nudge says. One line is picked at random each time, never the
 * same line twice in a row. `{hours}` becomes "1 hour", "3 hours" and so on.
 *
 * Written ahead of time rather than generated. Generating text would mean
 * sending usage off the phone, and the privacy policy promises it never leaves.
 * The tone matches the app's own facts ("…or spend 5h 2m on cats freaking out?"):
 * teasing, never shaming.
 */
internal object NudgeSayings {
  val ALL: List<String> = listOf(
    // The original line, as the user wrote it.
    "What are you doing on your phone for {hours}?!",
    "{hours} today. The phone will still be here if you put it down.",
    "That's {hours} on your phone today. Your thumbs just worked a shift.",
    "{hours} in. Look up. Anything interesting happening?",
    "{hours} of screen time today. Go touch some grass.",
    "You've given your phone {hours} today. What has it given you back?",
    "{hours} on your phone. Somewhere, a houseplant needs watering.",
    "{hours}. That's a whole movie you could have watched with actual people.",
    "Your phone has had your attention for {hours} today. Maybe someone else should get a turn.",
    "{hours} of scrolling. The feed never ends, so you'll have to.",
    "Still here? That's {hours} today.",
    "{hours} on your phone today. Stretch, blink, drink some water.",
    "Achievement unlocked: {hours} of screen time. The reward is putting it down.",
    "{hours} today. Your neck would like a word.",
    "That's {hours}. Nothing on there is going anywhere, but your day is.",
    "Quick check: {hours} on your phone today. Worth it?",
    "{hours} on your phone. The real world has much better graphics.",
    "Hey. {hours}. Put it down for a bit?",
    "{hours} today. That's a decent hike you didn't take.",
    "Screen time just hit {hours}. Your eyes are filing a complaint.",
    "{hours} down. How about the rest of the day off-screen?",
    "Phone: {hours}. You: probably ready for a break.",
    "{hours} on your phone today. Doomscrolling isn't cardio.",
    "That's {hours} of your day. You don't get those back.",
    "{hours} in. Your battery isn't the only thing that needs a recharge.",
    "{hours} today. Put the phone face down and see what happens.",
    "Another hour gone. That's {hours} on your phone today.",
    "{hours}. If this were a job, you'd be asking for overtime.",
    "{hours} on your phone. Future you would like some of today back.",
    "Plot twist: the most interesting thing nearby isn't on your screen. {hours} today."
  )

  /** Index of the line to use, never `previous` when there is a choice. */
  fun pickIndex(previous: Int, random: Random = Random.Default): Int {
    if (ALL.size == 1) return 0
    if (previous !in ALL.indices) return random.nextInt(ALL.size)
    // Draw from every index but the previous one.
    val i = random.nextInt(ALL.size - 1)
    return if (i >= previous) i + 1 else i
  }

  /** Lines that open with {hours} open with a digit, so none needs capitalising. */
  fun render(index: Int, hours: Int): String = ALL[index].replace("{hours}", NudgeMath.hoursPhrase(hours))
}
