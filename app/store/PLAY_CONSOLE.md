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
See where your screen time goes, app by app. Private: nothing leaves your phone.
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

KEEPS COUNTING WHEN YOU DON'T LOOK
Android only keeps a short window of detailed usage history. Gauge saves it as it goes, including in the background, so your history keeps building for up to a year even if you don't open the app for weeks.

PRIVATE BY DESIGN
Everything stays on your phone. There's no account, no server, no ads and no analytics. Gauge never sends your usage anywhere.

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
| Content rating | Category: *All other app types*. Answer **No** to every content question, including "Can users interact or exchange content?" | Groups is hidden (`GROUPS_ENABLED = false`), so there is no user-to-user interaction. Expected result: Everyone / PEGI 3. |
| Target audience | **18 and over** only | Selecting any age under 13 brings in the Families policy and its extra requirements. You can widen this later. |
| News app | No | |
| Data safety | **No**, the app does not collect or share any of the required user data types | Play counts data as "collected" only when it leaves the device. Gauge reads and stores usage on the phone and makes no network requests (no `fetch`, no sockets, no analytics or crash SDKs). |
| Advertising ID | **No** | No `AD_ID` permission in the shipped manifest |
| Government app | No | |
| Financial features | My app doesn't provide any financial features | The penalty limit, which mentions charges, is hidden and moves no money |
| Health apps (if shown) | No health features | Screen time is not health data |

**Permissions Play may ask about:** none need a declaration form.
`QUERY_ALL_PACKAGES` was removed (a launcher `<queries>` block covers the picker).
`SYSTEM_ALERT_WINDOW` and the storage pair `READ_`/`WRITE_EXTERNAL_STORAGE` are blocked in
`app.json`. The storage pair came from Expo's bundled file-system module, capped at
Android 12. Gauge never touches shared storage, and leaving them in would contradict the
privacy policy on older phones. `PACKAGE_USAGE_STATS` is granted by the user in Android
settings and needs no form. No typed foreground services are declared, so the
foreground-service declaration does not apply.

Shipped permissions: `INTERNET`, `ACCESS_NETWORK_STATE`, `PACKAGE_USAGE_STATS`,
`FOREGROUND_SERVICE`, `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK`, `VIBRATE`, plus the app's
own `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`. Check any build with a parser that reads
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
