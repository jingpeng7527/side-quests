// Map tiles for the web app, served from the game server instead of straight
// from OpenStreetMap.
//
// Why: the OSM tile servers are run by volunteers. They throttle or block by IP
// address, and turn away requests without a proper Referer or User-Agent; a
// refused tile still arrives as a "200 OK" image saying "Access blocked". A
// group of phones on one Wi-Fi, or on mobile data (carriers share an IP across
// many users), can trip that at random. The map then stayed blank for some
// players and worked for others.
//
// Here every tile is fetched once with an identifying User-Agent, kept in
// Cloudflare's edge cache for everyone, and, if OSM refuses or fails, swapped
// for the same tile from Esri's keyless street map, so a map always draws.

const UA = "side-quests/0.1 (party game; https://github.com/r-magnus/side-quests)";
const REFERER = "https://github.com/r-magnus/side-quests";
const TIMEOUT_MS = 6_000;
/** OSM asks for at least a week of caching; a fallback tile is kept briefly so OSM gets another chance soon. */
const CACHE_SECONDS = 7 * 24 * 3600;
const FALLBACK_CACHE_SECONDS = 3600;

type Source = { name: "osm" | "esri"; url: (z: number, x: number, y: number) => string };
const OSM: Source = { name: "osm", url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png` };
// Note Esri's {z}/{y}/{x} order.
const ESRI: Source = { name: "esri", url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/${z}/${y}/${x}` };

/** Validates a z/x/y tile address; null if it's not a real tile. */
export function parseTile(parts: string[]): { z: number; x: number; y: number } | null {
  if (parts.length !== 3) return null;
  const [z, x, y] = [parts[0], parts[1], parts[2].replace(/\.png$/, "")].map((v) => (/^\d+$/.test(v) ? Number(v) : NaN));
  if (![z, x, y].every(Number.isInteger) || z > 19) return null;
  const n = 2 ** z;
  return x < n && y < n ? { z, x, y } : null;
}

/** GET /api/tiles/:z/:x/:y.png */
export async function serveTile(request: Request, z: number, x: number, y: number, ctx?: ExecutionContext): Promise<Response> {
  // Keyed on our own URL, so every player shares one cached copy.
  const cache = typeof caches !== "undefined" ? caches.default : undefined;
  const key = new Request(new URL(`/api/tiles/${z}/${x}/${y}.png`, request.url).toString());
  const hit = await cache?.match(key);
  if (hit) return hit;

  for (const source of [OSM, ESRI]) {
    const tile = await fetchTile(source, z, x, y);
    if (!tile) continue;
    const res = new Response(tile.body, {
      headers: {
        "Content-Type": tile.type,
        "Cache-Control": `public, max-age=${source === OSM ? CACHE_SECONDS : FALLBACK_CACHE_SECONDS}`,
        "X-Tile-Source": source.name,
      },
    });
    const put = cache?.put(key, res.clone());
    if (put) ctx ? ctx.waitUntil(put) : await put;
    return res;
  }
  return new Response("tile unavailable", { status: 502, headers: { "Cache-Control": "no-store" } });
}

async function fetchTile(source: Source, z: number, x: number, y: number): Promise<{ body: ArrayBuffer; type: string } | null> {
  try {
    const res = await fetch(source.url(z, x, y), {
      headers: { "User-Agent": UA, Referer: REFERER, Accept: "image/png,image/*" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const type = res.headers.get("Content-Type") ?? "";
    // OSM's refusals come back as a normal-looking image with this header.
    if (!res.ok || res.headers.has("x-blocked") || !type.startsWith("image/")) {
      console.warn(`tiles: ${source.name} ${z}/${x}/${y} refused (${res.status}${res.headers.get("x-blocked") ? `, ${res.headers.get("x-blocked")}` : ""})`);
      return null;
    }
    return { body: await res.arrayBuffer(), type };
  } catch (error) {
    console.warn(`tiles: ${source.name} ${z}/${x}/${y} failed: ${error}`);
    return null;
  }
}
