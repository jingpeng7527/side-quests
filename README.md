# Side Quests

A party game for friend groups: everyone writes side quests, the deck gets dealt out at random, and players race the clock to complete as many as they can, proving each one with a photo. Then the lobby votes on the proof and crowns a winner.

Runs on **iOS, Android and the web** from one codebase.

**Play now:** `npm install && npm run party` opens a QR code in your browser. Everyone scans it with their phone camera and plays in the browser, with no app or account. More options (Expo Go for development, installed builds) are in [docs/run-on-a-phone.md](docs/run-on-a-phone.md).

## Layout

```
packages/game/   Shared TypeScript: types, game rules, wire protocol, places (+ tests)
server/          Cloudflare Worker — one Durable Object per lobby, photos stored with each lobby,
                 AI quest writer (OpenAI), walking directions, bots, dev shortcuts
app/             Expo (React Native + expo-router) app for iOS, Android and web
legacy-swiftui/  The original SwiftUI prototype, kept as a reference
```

The server is the referee: every phone sends actions, the lobby's Durable Object runs them through the shared rules in `packages/game` (checking who's allowed to do what), and broadcasts the new state to everyone. Phones never talk to each other directly, so iPhones, Android phones and browsers can share a lobby.

**Moving the game along:** only the host moves between phases, and never abruptly. A host request shows everyone a 3-second "moving to…" banner, which the host can cancel, before the server lands it. While writing and judging, players tap **I'm done**; the host sees how many are done and is asked to confirm before moving on early. Players whose phones drop off are marked away and don't hold anyone up. A half-written quest is saved if the phase changes, and a photo snapped before the buzzer still counts if its upload finishes just after.

## Run it locally

```sh
npm install

# 1. Lobby server on :8787 (no Cloudflare account needed for local dev)
npm run server

# 2. App — then press i (iOS simulator), a (Android emulator) or w (web)
npm run app        # or: cd app && npx expo start
```

Run Expo from `app/` (that's what `npm run app` does). Running `npx expo start` from the repo root starts Metro without the app — web shows a blank page and Expo Go may complain about signing in.

The app finds the server on the same machine that serves the JS bundle, so simulators, emulators and real phones on the same Wi-Fi all just work. To point it elsewhere, set `EXPO_PUBLIC_SERVER_URL`.

**AI quests:** copy `server/.env.example` to `server/.env` and add an OpenAI API key (`OPENAI_API_KEY`). Optionally set `OPENAI_MODEL` (default `gpt-5.4-mini`). Without a key, a built-in offline deck fills in. The key lives only on the server.

**Joining:** the host's lobby screen shows a QR code and a four-letter code. Friends tap **Join a lobby** and scan it, or type the letters — from the app or a browser.

## Testing

```sh
npm test            # game rules (vitest)
npm run typecheck   # all workspaces
cd app && npx expo lint
```

**Solo play:** in a lobby, tap **+ Add a bot**. Bots write quests, complete them with stand-in photos, and vote.

**Dev shortcuts** (server runs with `DEV_TOOLS=1`, host only): tap the black **DEV** tag in the header of any game screen to skip to the end, have everyone complete a quest, add time, deal yourself a quest with a place, or jump to verification or the scoreboard.

**Deep links for driving simulators** (dev): open the app with `?demo=<phase>` to land in a seeded game (you + three bots), `&place=1` to be dealt a quest with a place, `?create=1` for an empty lobby, or `?join=CODE&name=Ana` to join one.

```sh
xcrun simctl openurl booted "exp://<your-ip>:8081/--/?demo=playing&place=1"
adb shell am start -a android.intent.action.VIEW -d "'exp://<your-ip>:8081/--/?join=ABCD&name=Ana'"
# web: http://localhost:8081/?demo=verifying
```

On a cold start Expo Go drops the link's parameters — open the project first, then the link.

## Deploy

**Server and web app** (one Worker serves both, so join links work in any browser):

```sh
cd server && npx wrangler login && cd ..    # once
npm run deploy                              # builds the web app, deploys with DEV_TOOLS off
```

It prints your permanent address, `https://side-quests.<your-subdomain>.workers.dev`. Lobbies and their photos live in Durable Object storage (free tier) and are deleted after 24 quiet hours. Nothing else to set up. For AI-written quests: `cd server && npx wrangler secret put OPENAI_API_KEY`.

**App:** see [docs/run-on-a-phone.md](docs/run-on-a-phone.md) for installable Android and iPhone builds (EAS), TestFlight, and store release.

**Web:** included above. The Worker serves `app/dist`, so `https://<your-worker>/join/ABCD` opens the game in any browser.

## Notes and limits

- **Maps:** react-native-maps (Apple Maps on iOS, Google Maps on Android). Android builds (not Expo Go) need a Google Maps API key via `GOOGLE_MAPS_ANDROID_API_KEY` — see the phone guide. On web, maps are view-only OpenStreetMap embeds and the place picker offers "use my spot" instead of search and tap-to-pin.
- **Walking routes** come from the free FOSSGIS OSRM router (OpenStreetMap data, fair-use). Swap in a keyed provider or self-hosted OSRM before launch.
- **Place search** uses the phone's geocoder (`expo-location`), which finds addresses and well-known landmarks rather than any business by name.
- **Photos** are downscaled on the phone and stored with their lobby; the game state only carries their paths. A lobby and its photos are deleted 24 hours after anything last happened in it.
- **Hosting** passes to another player if the host's phone has been away for a minute, so a game never stalls.
