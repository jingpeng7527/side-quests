# Mobile browser regression check

Use Node 24. Run the existing web build and local Worker, then start a separate Chrome debugging profile (the script never uses your normal browser profile):

```sh
npm ci
npm run web:build
npm run server
```

In another terminal on macOS:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9339 \
  --user-data-dir="$(mktemp -d /tmp/side-quests-chrome.XXXXXX)" \
  --no-first-run about:blank
```

In a third terminal:

```sh
npm run test:mobile
```

On other platforms, use the installed Chrome executable with the same flags. `CHROME_DEBUG_URL` can override the discovery endpoint (`http://127.0.0.1:9339/json`). `BASE_URL` defaults to `http://localhost:8787`; point it only at a development server with dev tools enabled. The test creates local lobbies and uploads screenshots as proof photos. `ARTIFACTS_DIR` defaults to `/tmp/side-quests-mobile-check`.

The test uses touch events at 390×844 and 360×640. It checks map pins, naming/search response races, cancellation and reopening, search selection, availability versus empty-result feedback, saving coordinates and radius, the composer Add button, all seven phases, a wide invite code, photo preview/upload, immediate join names, host visibility, and blocked-storage joins. Screenshots are saved for visual review; browser errors fail the run.

Geocoding responses are controlled inside the test browser, so the regression suite does not repeatedly call the public provider. Map tiles and local lobby/photo APIs are real. Separately check `/api/geocode` when verifying live provider availability. This suite does not emulate a physical phone's camera or software keyboard, or certify native iOS/Android or older Safari.

For focused reruns, use `node scripts/test-mobile.mjs --screens-only` (screens and joins) or `--joins-only`. Run `npm test`, `npm run typecheck`, and `npm run lint -w app` for the non-browser checks. Stop the test Chrome and local server when finished.
