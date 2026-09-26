# Play Console: listing text and form answers

Everything the Play Console asks for, answered for Gauge as it ships today. Paste
the listing text as-is. The form answers depend on facts about the build, which are
noted beside each one. If a fact changes (a feature flag flips, a network call or
analytics SDK is added, a permission comes back), re-check the answers it affects.

Privacy policy URL: https://1989span.github.io/Screen_Time_Tracker/privacy/
(source: `docs/privacy/index.html` on the `android-release` branch)

---

## 1. Create the app

| Field | Answer | Note |
|---|---|---|
| App name | `Gauge: Screen Time Tracker` | 26 of 30 characters |
| Default language | English (United States) | |
| App or game | App | |
| Free or paid | **Free** | You can make a paid app free later, but never a free app paid. Gauge has no payment code. |
| Declarations | Accept both | Developer Program Policies and US export laws |

## 2. Store listing (Grow > Store presence > Main store listing)

**Short description** (80 max)

```
See where your screen time goes, app by app, and compete with friends to cut it.
```

**Full description** (4000 max)

```
Gauge shows you exactly how much time you spend in each app, today and over the weeks, months and year.

PICK THE APPS THAT MATTER
Choose each app you want to measure from the apps installed on your phone, or select them all at once. Gauge tracks per app, not by broad category, so you see Instagram, not "Social".

TODAY, THIS WEEK, THIS MONTH, THIS YEAR
See today hour by hour, and your totals for the week, month and year so far. Tap any period for a full breakdown: which apps took the most time, how today compares with yesterday, and a chart you can tap to focus on a single day or hour.

DAILY LIMITS
Give any app a daily time budget and see at a glance how much is left, or when you've gone over. Budgets start fresh at midnight.

HOME SCREEN WIDGET
Keep your total for today, the week, the month or the year on your home screen. Choose the range when you place the widget, and tap it to open the full breakdown.

GROUPS
Compete with friends or family for the lowest screen time. Invite people with a link. Once they join, everyone's daily totals sync automatically, so nobody has to remember to share, and the lowest total each day wins the point. No sign-up, and never a list of which apps anyone used.

HOURLY NUDGES
Each time today's screen time passes another hour, Gauge sends a short, slightly cheeky reminder to look up. Turn them off any time in Settings.

KEEPS COUNTING WHEN YOU DON'T LOOK
Android only keeps a short window of detailed usage history. Gauge saves it as it goes, including in the background, so your history keeps building for up to a year even if you don't open the app for weeks.

PRIVATE BY DESIGN
Your usage stays on your phone. There are no ads, no analytics and no sign-up. Groups are the one exception: they share your display name and daily totals with the members of groups you choose to join, and never which apps you used.

HOW IT WORKS
Android keeps app usage behind a permission called Usage access, which only you can switch on. Gauge walks you through it on first launch. It reads which app was open and for how long, never what you do inside other apps.
```

**Graphics**

| Asset | Requirement | Source |
|---|---|---|
| App icon | 512 x 512 PNG | Scale down `app/assets/icon.png` (1024 x 1024) |
| Feature graphic | 1024 x 500 PNG or JPEG | Still to be made |
| Phone screenshots | 2 to 8. Long side no more than 2x the short side. | `app/store/screenshots/` (gitignored: real usage data). Already cropped to 1080 x 2079 (1.93:1). The phone's native 1080 x 2340 is 2.17:1, over the limit, so the status and navigation bars are trimmed. Use overview, detail and settings. Timers shows every app at "No limit" until some limits are set. |

**Category and contact** (Store settings)

- App category: Productivity
- Email: c2lomon@gmail.com (shown publicly on the listing)
- Website: optional, leave blank
- Phone: optional, leave blank

## 3. App content (Policy > App content)

| Form | Answer | Why it's true |
|---|---|---|
| Privacy policy | URL above | Required, because the app reads usage data |
| Ads | **No**, the app does not contain ads | No ad SDKs in `package.json` |
| App access | **All functionality is available without special access** | No login. Usage access is an Android setting the app walks reviewers through on first launch. |
| Content rating | Category: *All other app types*. Answer **No** to the content questions (violence, language, gambling, etc.) but **Yes** to "Does the app allow users to interact or exchange content with other users?" | Groups show each member's chosen display name and the group name, both typed by users, to other people. Expected result: Everyone / PEGI 3 with a *Users Interact* notice. The app has no chat, and names are capped at 30 characters with control characters stripped. |
| Target audience | **18 and over** only | Selecting any age under 13 brings in the Families policy and its extra requirements. You can widen this later. |
| News app | No | |
| Data safety | **Yes**, the app collects user data. Full answers in the next section. | Groups sync to a Supabase database. Everything else stays on the phone: no analytics, ads or crash SDKs. |
| Advertising ID | **No** | No `AD_ID` permission in the shipped manifest |
| Government app | No | |
| Financial features | My app doesn't provide any financial features | The penalty limit, which mentions charges, is hidden and moves no money |
| Health apps (if shown) | No health features | Screen time is not health data |

### Data safety answers

Play counts data as collected when it leaves the device, which Groups now does
(`app/src/sync/`, schema in `app/supabase/migrations/0001_groups.sql`).

| Question | Answer | Why it's true |
|---|---|---|
| Collects or shares required data types? | **Yes** | Groups upload to Supabase |
| Encrypted in transit? | **Yes** | supabase-js talks to the project over HTTPS only |
| Account creation | **My app does not allow users to create an account** | No sign-up, email or password. The anonymous Supabase user is invisible to the person. Deletion is still offered (below). |
| Users can request deletion? | **Yes**. Data deletion URL: `https://1989span.github.io/Screen_Time_Tracker/privacy/#choices` | In app: Leave group, and Delete my group data (deletes memberships, totals and the anonymous user). By email after uninstalling. The server also deletes anything unsynced for 400 days. |

Declare these data types. For each: **Collected** yes, **Shared** no, **Processed
ephemerally** no, **Optional** (users choose, since only people who join a group
send anything), purpose **App functionality** only.

| Data type | What Gauge sends |
|---|---|
| Personal info > Name | The display name chosen for groups |
| Personal info > User IDs | The random anonymous ID Supabase issues |
| App activity > App interactions | Total screen time per day. It's about app usage and is the closest fit Play offers. |
| App activity > Installed apps | Package names of apps someone votes to leave out of a group's totals |

**Shared: no.** Supabase stores the data on Gauge's behalf as a service provider,
which Play doesn't count as sharing. Other members see your totals only after you
join their group on a screen that says exactly what they'll see. That is a
transfer the user starts and expects, which Play also exempts.

If Groups ever uploads anything else (more fields, per-app numbers, an analytics
or crash SDK), redo this section and the privacy policy first.

**Permissions Play may ask about:** none need a declaration form.
`QUERY_ALL_PACKAGES` was removed (a launcher `<queries>` block covers the picker).
`SYSTEM_ALERT_WINDOW` and the storage pair `READ_`/`WRITE_EXTERNAL_STORAGE` are blocked in
`app.json`. The storage pair came from Expo's bundled file-system module, capped at
Android 12. Gauge never touches shared storage, and leaving them in would contradict the
privacy policy on older phones. `PACKAGE_USAGE_STATS` is granted by the user in Android
settings and needs no form. No typed foreground services are declared, so the
foreground-service declaration does not apply.

Shipped permissions: `INTERNET`, `ACCESS_NETWORK_STATE`, `PACKAGE_USAGE_STATS`,
`POST_NOTIFICATIONS`, `FOREGROUND_SERVICE`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `VIBRATE`,
plus the app's own `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. `INTERNET` and
`ACCESS_NETWORK_STATE` are used by Groups sync. `POST_NOTIFICATIONS` is for
the hourly nudges. It is a normal runtime permission with no Play form. The nudges use
inexact, non-wakeup alarms, so there is no `SCHEDULE_EXACT_ALARM` / `USE_EXACT_ALARM` (both
restricted by Play) and no foreground service. Check any build with a parser that reads
whole `<uses-permission>` elements. A line-based grep misses elements whose
attributes wrap onto a second line.

## 4. First upload

1. Build: `eas build -p android --profile production` from `app/`. The version code
   increments automatically on EAS (`appVersionSource: remote`). Don't set it in `app.json`.
2. **Testing > Internal testing > Create new release.** Upload the `.aab` from the EAS build page.
   The first upload has to be done by hand in the Console: Google's API can't
   create an app's first release, so `eas submit` only works from the second upload on.
3. Play App Signing is set up automatically on that first upload. Google generates the
   app signing key, and the EAS keystore becomes your upload key
   (SHA-256 `FE:26:54:74:A7:2C:F5:20:BA:0E:F0:ED:E5:E1:68:D3:6F:2C:55:97:40:94:8D:CC:26:83:8F:FC:EC:B5:FE:66`).
4. Add yourself as an internal tester, install from the opt-in link, and check the
   store-installed build end to end: permission flow, picker, charts, background history.

## 5. Before production (personal developer accounts)

Personal accounts created after 13 November 2023 must run a **closed test with at least
12 testers opted in for 14 consecutive days** before applying for production access.
Internal testing does not count toward this. Start the closed test as soon as the
internal build checks out. The 14 days is the long pole.

## 6. Later uploads

Create a Google Cloud service account with Play Console access, then add its key
path under `submit.production.android.serviceAccountKeyPath` in `eas.json`. Keep the
key out of the repo: `*.json` keys are not gitignored by default. After that,
`eas build --auto-submit` builds and uploads in one step.
