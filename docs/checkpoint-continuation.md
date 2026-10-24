# Checkpoint continuation — October 24, 2026

Read the entire 4,162-line `/Users/erica/Downloads/CHECKPOINT` and compared it with the checkout. Work began on `continuing/Erica` with a clean working tree at `734707b`. A read-only remote check confirmed `origin/main` at the same commit.

- `c9581a5`: Claude's redesign, join/name fixes, interactive maps and geocoding, photo/layout changes, host display, and score retention after leaving.
- `734707b`: reference image and root TypeScript configuration.
- Exact interruption: immediately before the interactive phone-sized “Add a place → tap map → automatic name → search” check, after the Leaflet resize timer cleanup. That cleanup is present.

## Fixes during continuation

- Reproduced a delayed reverse-geocoding reply replacing a typed name. Request generations now reject old pin/search replies, including after picker close or unmount; manually typed names survive later map taps.
- Search-provider HTTP 429 was incorrectly converted into “No match.” Geocoding now has a six-second timeout and returns HTTP 503 on provider failure; existing client fallback keeps pins/manual naming usable and reports search unavailability.
- Attaching a place pushed the composer Add button beyond the phone's right edge. The selected-place chip now occupies its own row in the same card.
- Selected search results now save only latitude/longitude in the coordinate object.
- Leaflet observes container size changes so pixel-to-coordinate mapping stays correct when fields, feedback, or viewport dimensions change. The observer is disconnected on unmount alongside Claude's existing timer cleanup.
- Removed the duplicated older-browser fallback block and corrected stale README map/search descriptions.

## Verification

- `npm test`: 21 existing game-rule tests plus four geocoding tests pass. The existing tests cover retaining scores when players leave after the lobby.
- Workspace typechecks, Expo lint, production web export, and `git diff --check` pass.
- Interactive browser checks pass at 390×844 and 360×640: touch pins, controlled automatic naming, manual-name preservation, out-of-order responses, picker reopening, search selection, empty/error states, attached-place layout, saved coordinates/radius.
- All seven game screens, `WWWW` invite display, photo preview, and real local image upload pass at both sizes. Reviewed screenshots of maps, search results, lobby, invite, photo preview, verification, and scoreboard.
- Normal invite joins preserve a just-entered name and show the host. Joining with storage blocked succeeds using the temporary identity fallback.
- No uncaught browser errors in the completed browser checks.

Reproduction instructions: [mobile-testing.md](mobile-testing.md). Screenshots are written to `/tmp/side-quests-mobile-check` by the browser check.

## Remaining verification limit

The live Nominatim provider returned HTTP 429 from this environment for search and pin naming. OpenStreetMap tiles loaded successfully. The local API now correctly returns 503 for the provider outage. Successful search/naming behavior was verified with controlled responses, and server result parsing with unit tests; a successful live-provider round trip still needs rechecking when the rate limit clears. No provider substitution or hosting change was made.

Testing used Chrome touch emulation, not physical iOS/Android, older Safari, a phone camera, or a real software keyboard. Expo export reports pre-existing warnings for Leaflet's default marker/layer-control image URLs; these controls/icons are not used by the custom map markers.

All continuation changes are local and uncommitted. Nothing was pushed or deployed.
