# Side Quests

A party game for friend groups: everyone writes side quests, the deck gets dealt out at random, and players race the clock to complete as many as they can, proving each one with a photo. Then the lobby votes on the proof and crowns a winner.

Runs on **iOS, Android and the web** from one codebase.

## Layout

```
packages/game/   Shared TypeScript: types, game rules, wire protocol, places (+ tests)
server/          Cloudflare Worker — one Durable Object per lobby, photo storage (R2),
                 Claude quest writer, walking directions, bots, dev shortcuts
app/             Expo (React Native + expo-router) app for iOS, Android and web
legacy-swiftui/  The original SwiftUI prototype, kept as a reference
```

The server is the referee: every phone sends actions, the lobby's Durable Object runs them through the shared rules in `packages/game` (checking who's allowed to do what), and broadcasts the new state to everyone. Phones never talk to each other directly, so iPhones, Android phones and browsers can share a lobby.

## Run it locally

```sh
npm install

# 1. Lobby server on :8787 (no Cloudflare account needed for local dev)
npm run server

# 2. App — then press i (iOS simulator), a (Android emulator) or w (web)
npm run app
```

The app finds the server on the same machine that serves the JS bundle, so simulators, emulators and real phones on the same Wi-Fi all just work. To point it elsewhere, set `EXPO_PUBLIC_SERVER_URL`.

**AI quests:** copy `server/.dev.vars.example` to `server/.dev.vars` and add an Anthropic API key. Without one, a built-in offline deck fills in. The key lives only on the server.

**Joining:** the host's lobby screen shows a QR code and a four-letter code. Friends tap **Join a lobby** and scan it, or type the letters — from the app or a browser.

## Testing

```sh
npm test            # game rules (vitest)
npm run typecheck   # all workspaces
cd app && npx expo lint
```

**Solo play:** in a lobby, tap **+ Add a bot**. Bots write quests, complete them with stand-in photos, and vote.

**Dev shortcuts** (server runs with `DEV_TOOLS=1`): tap the black **DEV** tag in the header of any game screen to skip to the end, have everyone complete a quest, add time, deal yourself a quest with a place, or jump to verification or the scoreboard.

**Deep links for driving simulators** (dev): open the app with `?demo=<phase>` to land in a seeded game (you + three bots), `&place=1` to be dealt a quest with a place, `?create=1` for an empty lobby, or `?join=CODE&name=Ana` to join one.

```sh
xcrun simctl openurl booted "exp://<your-ip>:8081/--/?demo=playing&place=1"
adb shell am start -a android.intent.action.VIEW -d "'exp://<your-ip>:8081/--/?join=ABCD&name=Ana'"
# web: http://localhost:8081/?demo=verifying
```

On a cold start Expo Go drops the link's parameters — open the project first, then the link.

## Deploy

**Server:**

```sh
cd server
npx wrangler login
npx wrangler r2 bucket create side-quests-photos
npx wrangler secret put ANTHROPIC_API_KEY
# set DEV_TOOLS to "0" in wrangler.jsonc for production
npx wrangler deploy
```

**App** (EAS): put the deployed server URL in `app/eas.json`, then

```sh
cd app
npx eas-cli@latest init
npx eas-cli@latest build --platform all --profile preview   # installable test builds
npx eas-cli@latest submit                                   # store submission
npx eas-cli@latest update                                   # ship JS/design changes without review
```

**Web:** `cd app && npx expo export --platform web`, then host `dist/` anywhere static (e.g. Cloudflare Pages).

## Notes and limits

- **Maps:** react-native-maps (Apple Maps on iOS, Google Maps on Android). Store builds for Android need a Google Maps API key in `app.json`. On web, maps are view-only OpenStreetMap embeds and the place picker offers "use my spot" instead of search and tap-to-pin.
- **Walking routes** come from the free FOSSGIS OSRM router (OpenStreetMap data, fair-use). Swap in a keyed provider or self-hosted OSRM before launch.
- **Place search** uses the phone's geocoder (`expo-location`), which finds addresses and well-known landmarks rather than any business by name.
- **Photos** are downscaled on the phone and stored in R2; the game state only carries their paths.
