RallyQ private Studio migration 20261110040636 was applied to paddleq-staging (xlviuobtfszwfmnwcjjr) only.
Owner-role smoke inserted a training session and enabled practice-results sharing; anonymous public profile projection returned it alongside referee-scored results without owner identity. Smoke writes were rolled back.
Public profile route: #/public-player/c5aad885-de92-4e28-a5cd-976ea7e9198c. No production operations.

10 Nov final follow-up: staging UI checks against xlviuobtfszwfmnwcjjr passed without a product-code change.
- RallyQ #/event/pq-demo-night -> Enter the event -> Open Singles 35+ -> Send my entry -> Entry sent -> My entries.
- Registration 6fc6128d-6379-473b-bc07-fb2059b3a60f persisted as pending (register_entry HTTP 200; payment at venue).
- Organiser Desk for Pickleball Central Season 8 -> Call to Court 1 -> Sent to court 1 (HTTP 200).
- Corrected the local preview build setting to VITE_SUPABASE_KEY for staging; no deployment or production change. No robot-failure work in this follow-up.
