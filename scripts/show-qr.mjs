#!/usr/bin/env node
// Shows a big, scannable QR code for a link in the browser — terminal QR codes
// break up when the terminal adds space between lines.
//
//   npm run qr -- https://side-quests.<you>.workers.dev
//
// Also used by `npm run party`.

import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** Writes the QR page for `url` and opens it in the default browser. Returns the file path. */
export async function showQr(url, { note = "Scan with your phone camera — it opens in the browser. No app, no account." } = {}) {
  const svg = await QRCode.toString(url, { type: "svg", margin: 2, errorCorrectionLevel: "M", color: { dark: "#17110F", light: "#FFFAF6" } });
  const html = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Side Quests — scan to play</title>
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@900&family=JetBrains+Mono:wght@600&display=swap" rel="stylesheet">
<style>
  html, body { margin: 0; height: 100%; background: #D9241C; color: #FFFAF6; }
  body { display: grid; place-items: center; font-family: "JetBrains Mono", ui-monospace, monospace; }
  main { display: grid; gap: 3vmin; justify-items: center; text-align: center; padding: 4vmin; }
  h1 { margin: 0; font: 900 clamp(48px, 11vmin, 140px)/0.9 "Big Shoulders Display", Impact, sans-serif; text-transform: uppercase; }
  h1 span { color: #17110F; }
  .qr { width: min(62vmin, 640px); aspect-ratio: 1; background: #FFFAF6; padding: 2vmin; }
  .qr svg { width: 100%; height: 100%; display: block; }
  .url { font-size: clamp(14px, 2.2vmin, 22px); letter-spacing: 0.04em; word-break: break-all; }
  .note { font-size: clamp(12px, 1.7vmin, 16px); letter-spacing: 0.12em; text-transform: uppercase; opacity: 0.9; max-width: 60ch; }
</style>
<main>
  <h1>Side <span>Quests</span></h1>
  <div class="qr">${svg}</div>
  <div class="url">${escape(url)}</div>
  <div class="note">${escape(note)}</div>
</main>`;
  const file = join(tmpdir(), "side-quests-qr.html");
  writeFileSync(file, html);
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  spawnSync(opener, [file], { stdio: "ignore", shell: process.platform === "win32" });
  return file;
}

// Run directly: npm run qr -- <url>
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.argv[2];
  if (!url || !/^https?:\/\//.test(url)) {
    console.error("Usage: npm run qr -- https://side-quests.<you>.workers.dev");
    process.exit(1);
  }
  const file = await showQr(url);
  console.log(`Opened the QR code in your browser (${file}).`);
}
