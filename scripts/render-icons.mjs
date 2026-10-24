#!/usr/bin/env node
// Renders app/assets/source/icon.html into the app's icon PNGs with headless Chrome.
//   node scripts/render-icons.mjs
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const assets = join(dirname(fileURLToPath(import.meta.url)), "../app/assets");
const source = pathToFileURL(join(assets, "source/icon.html")).href;
const outputs = [
  ["icon", "icon.png"],
  ["fg", "android-icon-foreground.png"],
  ["bg", "android-icon-background.png"],
  ["mono", "android-icon-monochrome.png"],
];

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const chrome = spawn(chromePath, ["--headless=new", "--remote-debugging-port=9337", "--no-first-run", "--hide-scrollbars", `--user-data-dir=${mkdtempSync(join(tmpdir(), "icons-"))}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets;
for (let i = 0; i < 50 && !targets; i++) {
  try {
    targets = await (await fetch("http://127.0.0.1:9337/json")).json();
  } catch {
    await sleep(200);
  }
}
const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let id = 0;
const pending = new Map();
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m.result);
    pending.delete(m.id);
  }
};
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

await send("Emulation.setDeviceMetricsOverride", { width: 1024, height: 1024, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
for (const [variant, file] of outputs) {
  await send("Page.navigate", { url: `${source}?v=${variant}` });
  for (let i = 0; i < 50; i++) {
    const r = await send("Runtime.evaluate", { expression: "document.body?.dataset.ready === '1'", returnByValue: true });
    if (r.result?.value) break;
    await sleep(200);
  }
  await sleep(300);
  const { data } = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: 1024, height: 1024, scale: 1 } });
  writeFileSync(join(assets, file), Buffer.from(data, "base64"));
  console.log(`wrote assets/${file}`);
}
ws.close();
chrome.kill();
// Small sizes of the full icon: favicon, plus the web app's home-screen icons (app/public).
const publicDir = join(assets, "../public");
for (const [size, out] of [[196, join(assets, "favicon.png")], [196, join(publicDir, "favicon.png")], [180, join(publicDir, "apple-touch-icon.png")], [192, join(publicDir, "icon-192.png")], [512, join(publicDir, "icon-512.png")]]) {
  spawnSync("sips", ["-Z", String(size), join(assets, "icon.png"), "--out", out], { stdio: "ignore" });
  console.log(`wrote ${out.slice(out.indexOf("app/"))}`);
}
process.exit(0);
