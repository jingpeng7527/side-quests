// The game server also serves the web app (app/dist). Wrangler refuses to start
// if that folder is missing, so drop in a placeholder until the first real build.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "../app/dist");
if (!existsSync(join(dist, "index.html"))) {
  mkdirSync(dist, { recursive: true });
  writeFileSync(
    join(dist, "index.html"),
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Side Quests</title>
<body style="font-family:system-ui;background:#D9241C;color:#FFFAF6;padding:24px">
<h1>Side Quests</h1><p>The web app hasn't been built yet. On the host's computer, run <code>npm run web:build</code> (or <code>npm run party</code>).</p>`,
  );
  console.log("ensure-web: no web build yet — serving a placeholder. Run `npm run web:build`.");
}
