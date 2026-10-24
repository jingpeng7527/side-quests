import { walkingRoute } from "./directions";
import type { Env } from "./lobby";

export { Lobby } from "./lobby";

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });
    const res = await route(request, env);
    // WebSocket upgrades can't have their headers changed.
    if (res.status === 101) return res;
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(CORS)) out.headers.set(k, v);
    return out;
  },
} satisfies ExportedHandler<Env>;

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname.split("/").filter(Boolean); // ["api", ...]
  if (parts[0] !== "api") return new Response("Side Quests server", { status: 200 });

  // POST /api/lobbies { host } -> { code }
  if (parts[1] === "lobbies" && parts.length === 2 && request.method === "POST") {
    const { host } = (await request.json()) as { host: unknown };
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = Array.from({ length: 4 }, () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)]).join("");
      const res = await lobby(env, code).fetch("https://lobby/init", { method: "POST", body: JSON.stringify({ code, host }) });
      if (res.status !== 409) return res;
    }
    return new Response("couldn't find a free code", { status: 503 });
  }

  // GET /api/lobbies/:code -> summary, GET /api/lobbies/:code/ws -> WebSocket
  if (parts[1] === "lobbies" && parts[2]) {
    const stub = lobby(env, parts[2].toUpperCase());
    if (parts[3] === "ws") return stub.fetch(request);
    return stub.fetch("https://lobby/info");
  }

  // POST /api/photos (image/jpeg body) -> { url }
  if (parts[1] === "photos" && parts.length === 2 && request.method === "POST") {
    const key = `${crypto.randomUUID()}.jpg`;
    await env.PHOTOS.put(key, request.body, { httpMetadata: { contentType: request.headers.get("Content-Type") ?? "image/jpeg" } });
    // Relative: each device prefixes the server address it can reach (localhost, 10.0.2.2, LAN IP…).
    return Response.json({ url: `/api/photos/${key}` });
  }

  // GET /api/photos/:key
  if (parts[1] === "photos" && parts[2]) {
    const obj = await env.PHOTOS.get(parts[2]);
    if (!obj) return new Response("not found", { status: 404 });
    return new Response(obj.body, {
      headers: { "Content-Type": obj.httpMetadata?.contentType ?? "image/jpeg", "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }

  // GET /api/directions?from=lat,lng&to=lat,lng -> WalkingRoute
  if (parts[1] === "directions") {
    const parse = (v: string | null) => v?.split(",").map(Number) as [number, number] | undefined;
    const from = parse(url.searchParams.get("from"));
    const to = parse(url.searchParams.get("to"));
    if (!from || !to || [...from, ...to].some(Number.isNaN)) return new Response("from/to required", { status: 400 });
    const route = await walkingRoute(from, to);
    return route ? Response.json(route) : new Response("no route", { status: 502 });
  }

  if (parts[1] === "health") return Response.json({ ok: true, ai: env.ANTHROPIC_API_KEY ? "claude" : "offline" });
  return new Response("not found", { status: 404 });
}

function lobby(env: Env, code: string) {
  return env.LOBBY.get(env.LOBBY.idFromName(code));
}
