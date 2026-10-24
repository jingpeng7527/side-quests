#!/usr/bin/env node
// Host a game that friends join by scanning one QR code — in their phone's
// browser, no app or account needed.
//
//   npm run party          public link through a free Cloudflare quick tunnel
//   npm run party:local    link on this Wi-Fi only (no tunnel)
//
// It builds the web app, starts the game server (which serves that web app and
// the game from one address), opens the tunnel, and opens a QR code page.
// Options: --local, --skip-build

import { spawn, spawnSync } from "node:child_process";
import { networkInterfaces } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { showQr } from "./show-qr.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const local = args.has("--local");
const PORT = 8787;
// 127.0.0.1, not localhost: on macOS localhost resolves to IPv6 first, where the server isn't listening.
const LOCAL_SERVER = `http://127.0.0.1:${PORT}`;
const children = [];

const say = (msg) => console.log(`\x1b[31m▌\x1b[0m ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Children run in their own process groups so stopping the party stops
// everything underneath them too (npm → wrangler → workerd), not just npm.
function stopAll() {
  for (const c of children) {
    try {
      process.kill(-c.pid, "SIGTERM");
    } catch {
      c.kill("SIGTERM");
    }
  }
}

let stopping = false;
function shutdown(code = 0) {
  stopping = true;
  stopAll();
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("exit", stopAll);

async function healthy(base, timeoutMs = 3000) {
  try {
    const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

async function waitFor(base, label, seconds, { quiet = false } = {}) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    if (await healthy(base)) return true;
    await sleep(1000);
  }
  if (!quiet) console.error(`✘ ${label} didn't come up within ${seconds}s.`);
  return false;
}

function lanAddress() {
  for (const addrs of Object.values(networkInterfaces())) {
    for (const a of addrs ?? []) if (a.family === "IPv4" && !a.internal) return a.address;
  }
  return null;
}

// 1. Web app — built so it talks to whatever address serves it.
if (!args.has("--skip-build")) {
  say("Building the web app…");
  const env = { ...process.env };
  delete env.EXPO_PUBLIC_SERVER_URL;
  const build = spawnSync("npx", ["expo", "export", "--platform", "web"], { cwd: join(root, "app"), env, stdio: ["ignore", "ignore", "inherit"] });
  if (build.status !== 0) {
    console.error("✘ Web build failed (see above).");
    process.exit(1);
  }
}

// 2. Game server — reuse one that's already running.
if (await healthy(LOCAL_SERVER)) {
  say(`Game server already running on port ${PORT}${args.has("--skip-build") ? "" : " (refresh open pages to get the new build)"}.`);
} else {
  say("Starting the game server…");
  const server = spawn("npm", ["run", "dev", "-w", "server"], { cwd: root, stdio: ["ignore", "ignore", "inherit"], detached: true });
  children.push(server);
  server.on("exit", (code) => {
    if (stopping) return;
    console.error(`✘ Game server stopped (exit ${code}).`);
    shutdown(1);
  });
  if (!(await waitFor(LOCAL_SERVER, "The game server", 60))) shutdown(1);
}

// 3. The address friends use.
let publicUrl;
if (local) {
  const ip = lanAddress();
  if (!ip) {
    console.error("✘ Couldn't find this computer's Wi-Fi address.");
    shutdown(1);
  }
  publicUrl = `http://${ip}:${PORT}`;
} else {
  if (spawnSync("cloudflared", ["--version"], { stdio: "ignore" }).error) {
    console.error("✘ cloudflared isn't installed. Run `brew install cloudflared`, or use `npm run party:local` for same-Wi-Fi play.");
    shutdown(1);
  }
  say("Opening a public tunnel…");
  // http2 rather than cloudflared's default QUIC: QUIC needs outbound UDP, which
  // many office and campus networks block.
  const protocol = process.env.PARTY_TUNNEL_PROTOCOL ?? "http2";
  const tunnel = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--protocol", protocol, "--url", LOCAL_SERVER], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  children.push(tunnel);
  const recent = []; // cloudflared's last lines, shown if something goes wrong
  const showRecent = () => {
    console.error("  cloudflared said:");
    for (const line of recent.slice(-12)) console.error(`    ${line}`);
  };

  // Ready = we have the address AND cloudflared reports a live connection to
  // Cloudflare. (Checking the link from this Mac is unreliable: a brand-new
  // address can take a while to resolve here, and macOS caches the miss.)
  const ready = await new Promise((resolve) => {
    let url = null;
    const timer = setTimeout(() => resolve(url ? { url, registered: false } : null), 60_000);
    const onData = (buf) => {
      for (const line of String(buf).split("\n")) {
        if (line.trim()) recent.push(line.replace(/^\S+\s+/, "").trim().slice(0, 160));
        if (recent.length > 50) recent.shift();
        const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (m && !url) url = m[0];
        if (url && /Registered tunnel connection/.test(line)) {
          clearTimeout(timer);
          resolve({ url, registered: true });
        }
      }
    };
    tunnel.stdout.on("data", onData);
    tunnel.stderr.on("data", onData);
    tunnel.on("exit", (code) => {
      if (stopping) return;
      console.error(`✘ The tunnel closed (exit ${code}).`);
      showRecent();
      shutdown(1);
    });
  });

  if (!ready) {
    console.error("✘ cloudflared didn't hand out an address within 60s.");
    showRecent();
    console.error("  Your network may block Cloudflare tunnels. Everyone on the same Wi-Fi? Use `npm run party:local`.");
    shutdown(1);
  }
  publicUrl = ready.url;
  if (!ready.registered) {
    say("\x1b[33mcloudflared hasn't confirmed a connection yet — the link may take a minute to work.\x1b[0m");
    showRecent();
  } else {
    say("Tunnel connected.");
  }
  // Best effort: confirm the link end to end, but don't block on it.
  if (await waitFor(publicUrl, "", 20, { quiet: true })) say("Link checked: the game answers through the tunnel.");
  else say("\x1b[33mCouldn't open the link from this computer yet (new links take a moment to appear). Try it on a phone; if it doesn't load within a minute, use `npm run party:local`.\x1b[0m");
}

// 4. The QR code — in the browser, big and crisp (terminal QR codes break up when
// the terminal adds space between lines).
await showQr(publicUrl);
console.log("");
say(`\x1b[1mScan to play:\x1b[0m ${publicUrl}`);
say("The QR code just opened in your browser — put it on screen for everyone.");
say("Everyone opens it in their phone browser (camera app → tap the link). No app, no account.");
say("One person taps Create lobby; the lobby screen has its own QR code and an Invite link for everyone else.");
if (local) say("Same Wi-Fi only. Location-based quests need the public link (`npm run party`) — browsers only share location over https.");
else say("Anyone with this link can reach your game while this runs. Ctrl+C ends the party.");
