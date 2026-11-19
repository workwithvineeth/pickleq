# Monitoring (Sentry and PostHog)

Two optional tools for the **RallyQ club app**. Both are **off unless you set a key when building**; with no key nothing is
loaded, nothing is sent, and the app behaves exactly as before. The personal app is not touched.

| Tool | What it gives you | Build setting |
|---|---|---|
| Sentry | Error reports (what broke, on which screen) | `VITE_SENTRY_DSN` |
| PostHog | Anonymous page counts and a few named events | `VITE_POSTHOG_KEY` (and `VITE_POSTHOG_HOST` for the EU cloud) |

## Setup (about 10 minutes)

1. **Sentry**: create a free project, platform "Browser JavaScript". Copy the DSN (looks like `https://…@o123.ingest.sentry.io/456`).
2. **PostHog**: create a free project (US or EU cloud). Copy the "Project API key" (starts with `phc_`). For the EU cloud also set `VITE_POSTHOG_HOST=https://eu.i.posthog.com`.
3. Add them where the club site is built (`pqclub` → Settings → Secrets and variables → Actions → Variables) and pass them to the club build as `VITE_SENTRY_DSN` and `VITE_POSTHOG_KEY` (or put them in `.env.club` on your own machine). They are public-by-design browser keys, not secrets, but keep them out of commits.
4. Rebuild and deploy. The build's security policy then allows exactly those two addresses, and nothing else new.
5. Check: open the site, open the browser's Network tab, and look for requests to `sentry.io` and `posthog.com`. Trigger a test error from the console: `setTimeout(() => { throw new Error('monitoring test') })` and see it in Sentry within a minute.

**Do not turn this on during a live tournament** (freeze rule: no deploys after 2:30 pm on the day).

## What is and is not collected

- Session recording / replay: **off** (the code does not even include it).
- Page address: sent with secrets removed. Referee court links, desk links, helper and claim links lose their token (`#/court/[token]`), PINs and any `pin`, `token`, `email`, `phone`, `dupr` value in an address become `[removed]`, and any long unknown id becomes `[id]`. This is tested in `src/monitoring/scrub.test.ts`.
- Error text, breadcrumbs and tags: emails, phone numbers, DUPR ids and PINs are removed before sending.
- No user, name, email, phone or DUPR id is ever attached. Nobody is "identified"; PostHog only sees a random anonymous id kept on the phone. IP address is not stored (PostHog `ip: false`; Sentry `sendDefaultPii: false`). Do-Not-Track is respected.
- Autocapture (clicks and typed text) is off. Only page views and these named events are sent: `score_refused`, `scores_not_sent`, `went_offline`.

## Privacy notice (one sentence for the site)

> To keep match days running, RallyQ counts page visits and records technical errors without your name, contact details, PIN or session recordings, using a random anonymous ID, and secret links are stripped before anything is sent.

## If something looks wrong

- Seeing a token, PIN or phone number in Sentry or PostHog? Delete the event there, switch the key off in the build, and fix `src/monitoring/scrub.ts` with a test.
- Nothing arrives: an ad blocker or the security policy is the usual cause; the app carries on regardless.
