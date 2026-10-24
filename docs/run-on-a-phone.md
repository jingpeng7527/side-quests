# Running Side Quests on a phone

There are two ways to get the game onto a real iPhone or Android phone:

| | **Expo Go** (quickest) | **Installed build** |
|---|---|---|
| Good for | Trying it out, testing changes live | Playing away from your laptop, sharing with friends |
| Needs | The free Expo Go app; phone on the same Wi-Fi as your Mac | A deployed game server; an Expo account; for iPhones, usually a paid Apple Developer account |
| Time | ~5 minutes | ~30–60 minutes the first time |
| Laptop needed while playing? | Yes — it serves the app and runs the game server | No |

---

## Option 1: Expo Go on your phone

Your Mac runs the game server and serves the app; the phone loads it over Wi-Fi.

1. **Install Expo Go** on the phone from the App Store or Google Play.
2. **Start the server and the app** on your Mac (from the repo root, in two terminals):

   ```sh
   npm install       # first time only
   npm run server    # game server on port 8787
   npm run app       # prints a QR code
   ```

   If macOS asks whether `node` or `workerd` may accept incoming network connections, click **Allow** — that's how the phone reaches your Mac.
3. **Open it on the phone:**
   - **iPhone:** point the Camera app at the QR code in the terminal and tap the banner.
   - **Android:** open Expo Go and tap **Scan QR code**.
4. Allow **location** (for quest maps) and **camera** (for proof photos) when asked.

The app finds the game server automatically: it uses the same address your phone used to load the app. Friends' phones on the same Wi-Fi can join the same way, and simulators or a browser at `http://<your-mac-ip>:8081` can join the same lobby.

**Edits show up live:** save a file and the app reloads on the phone.

### If it doesn't connect

| Symptom | Fix |
|---|---|
| Expo Go spins, or says it can't connect to the dev server | Phone and Mac must be on the same Wi-Fi. Guest and office networks often block devices from seeing each other ("client isolation"); try a home network or your phone's hotspot. |
| App opens but says **Can't reach the game server (http://…:8787)** | Make sure `npm run server` is running, and that you allowed incoming connections. The message shows the address the app tried. |
| Expo Go says the project needs a newer/older SDK | Update Expo Go from the store. This project uses Expo SDK 58. |
| Different networks entirely | Use Option 2, or deploy the server (Option 2, step 1), set `EXPO_PUBLIC_SERVER_URL=https://…workers.dev`, and run `npx expo start --tunnel` from `app/`. |

---

## Option 2: An installed build

An installed build is the real app, with its own name and icon, and it keeps working away from your laptop. It talks to a game server on the internet, so deploy that first.

### Step 1: Deploy the game server (once)

You need a free Cloudflare account.

```sh
cd server
npx wrangler login
npx wrangler r2 bucket create side-quests-photos
npx wrangler secret put ANTHROPIC_API_KEY   # optional: enables Claude-written quests
npx wrangler deploy
```

`deploy` prints your server's URL, like `https://side-quests.<your-subdomain>.workers.dev`. Check it with `curl <url>/api/health`.

`DEV_TOOLS` is `"1"` in `server/wrangler.jsonc`, which shows the DEV menu (bots, skip to end). That's handy for test builds; set it to `"0"` and redeploy before sharing widely.

### Step 2: Point the app at it

In `app/eas.json`, replace `https://side-quests.<your-subdomain>.workers.dev` with your URL in both the `preview` and `production` profiles.

### Step 3: Set up EAS (once)

EAS is Expo's build service: it builds and signs the app in the cloud, so you don't need Android Studio, and for iPhones it manages Apple's certificates for you. You need a free Expo account.

```sh
cd app
npx eas-cli@latest login
npx eas-cli@latest init     # links the project to your Expo account
```

### Step 4a: Android

1. **Get a Google Maps key.** Android builds need one for maps (Expo Go didn't). In the [Google Cloud console](https://console.cloud.google.com/), create a project, enable **Maps SDK for Android**, and create an API key. Under **Application restrictions**, choose **Android apps** and add package `com.sidequests.app` with the SHA-1 fingerprint shown by `npx eas-cli@latest credentials -p android` (run it after your first build, then update the restriction).
2. **Add the key** to the `preview` (and `production`) profile's `env` in `app/eas.json`:

   ```json
   "env": {
     "EXPO_PUBLIC_SERVER_URL": "https://side-quests.<your-subdomain>.workers.dev",
     "GOOGLE_MAPS_ANDROID_API_KEY": "AIza…"
   }
   ```

   This key ends up inside the app either way, so it isn't a secret. The package and fingerprint restriction is what protects it. `app/app.config.js` reads it at build time.
3. **Build:**

   ```sh
   npx eas-cli@latest build -p android --profile preview
   ```

   The `preview` profile makes an `.apk` you can install directly. When the build finishes (~10–15 minutes), EAS prints a link and QR code.
4. **Install:** open the link on the phone, download the `.apk`, and open it. Android will ask to allow installs from your browser ("Install unknown apps"); allow it once.

Anyone with the link can install it. Send it to friends the same way.

### Step 4b: iPhone

Apple only lets apps onto iPhones that are signed for them. Pick one:

**A. Internal build (needs a $99/year Apple Developer account).** Best for you and up to 100 friends' iPhones.

1. Register each iPhone:

   ```sh
   npx eas-cli@latest device:create
   ```

   It prints a link and QR code. Open it on the iPhone and install the small profile it offers; that tells Apple about the device.
2. Build:

   ```sh
   npx eas-cli@latest build -p ios --profile preview
   ```

   Sign in with your Apple ID when asked; EAS creates the certificates.
3. Open the link EAS prints on the iPhone and tap **Install**.
4. **iOS 16 and later:** turn on **Settings → Privacy & Security → Developer Mode**, restart when prompted, and confirm.

Add a friend's iPhone later by registering it (step 1) and building again.

**B. TestFlight (same paid account).** Best for larger groups; no device registration, and testers install from Apple's TestFlight app.

```sh
npx eas-cli@latest build -p ios --profile production
npx eas-cli@latest submit -p ios
```

Then add testers in App Store Connect → your app → TestFlight. The first build goes through a short Apple review before external testers can install it.

**C. Free, from your Mac (no paid account).** Good for your own iPhone only. It needs Xcode and a USB cable, and the app stops opening after 7 days until you reinstall.

1. Plug in the iPhone, unlock it, and tap **Trust**. Turn on Developer Mode as in A.4.
2. From `app/`:

   ```sh
   EXPO_PUBLIC_SERVER_URL=https://side-quests.<your-subdomain>.workers.dev \
     npx expo run:ios --device --configuration Release
   ```

   Pick your iPhone from the list. If Xcode reports a signing error, open `app/ios/SideQuests.xcworkspace`, select the app target → **Signing & Capabilities**, choose your personal team (sign in with your Apple ID), and run the command again.
3. On the iPhone: **Settings → General → VPN & Device Management**, tap your Apple ID, then **Trust**.

The same works for Android over USB without EAS: enable **USB debugging** on the phone, then run `npx expo run:android --device --variant release` with the same `EXPO_PUBLIC_SERVER_URL` (and `GOOGLE_MAPS_ANDROID_API_KEY` for maps).

`expo run` generates `app/ios` and `app/android` folders. They're build output, already ignored by git; never edit them by hand.

### Shipping updates

- **Changes to screens, rules or styling** (anything in JavaScript/TypeScript): `npx eas-cli@latest update` pushes them to installed builds without reinstalling. Players get them the next time they open the app.
- **Changes to native setup** (new native packages, permissions, `app.json` plugins): build and install again.
- **Server changes:** `cd server && npx wrangler deploy`. Every build picks them up immediately.

### Store release

When you're ready for the App Store and Google Play: `npx eas-cli@latest build -p all --profile production`, then `npx eas-cli@latest submit`. Google Play needs a $25 one-time developer account. Both stores need listing details (screenshots, description, privacy policy) before review.
