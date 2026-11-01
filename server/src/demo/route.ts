import { DEFAULT_CITY_IDS, DEMO_CITIES, findCity } from "./cities";
import { fixtureResult } from "./fixtures";
import { buildFactSheet } from "./pipeline";
import { writeGroundedQuests } from "./quests";
import type { CityConfig, CityResult, DemoResponse, FactSheet } from "./types";

export interface DemoEnv {
  OPENTRIPMAP_API_KEY?: string;
  TICKETMASTER_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  /** Durable cache for fact snapshots, shared across isolates. Optional — falls back to in-memory only. */
  DEMO_SNAPSHOTS?: KVNamespace;
}

/**
 * The raw snapshot (places/weather/events) is cached briefly so repeated "Generate again"
 * clicks don't hammer free third-party APIs — only the OpenAI step re-runs on every click,
 * which is the part the demo is meant to show off. Two tiers: an in-memory map (fastest,
 * but gone on cold start / in a different isolate) backed by KV (durable, shared).
 */
const FACTSHEET_CACHE_MS = 10 * 60_000;
const factSheetCache = new Map<string, { expiresAt: number; sheet: FactSheet }>();
const kvKey = (cityId: string) => `factsheet:${cityId}`;

async function cachedFactSheet(city: CityConfig, env: DemoEnv): Promise<FactSheet> {
  const memHit = factSheetCache.get(city.id);
  if (memHit && memHit.expiresAt > Date.now()) return memHit.sheet;

  if (env.DEMO_SNAPSHOTS) {
    try {
      const stored = await env.DEMO_SNAPSHOTS.get(kvKey(city.id));
      if (stored) {
        const sheet = JSON.parse(stored) as FactSheet;
        factSheetCache.set(city.id, { expiresAt: Date.now() + FACTSHEET_CACHE_MS, sheet });
        return sheet;
      }
    } catch {
      // KV read failed — fall through to a live fetch instead of failing the request.
    }
  }

  const sheet = await buildFactSheet(city, { openTripMap: env.OPENTRIPMAP_API_KEY, ticketmaster: env.TICKETMASTER_API_KEY });
  factSheetCache.set(city.id, { expiresAt: Date.now() + FACTSHEET_CACHE_MS, sheet });
  if (env.DEMO_SNAPSHOTS) {
    try {
      await env.DEMO_SNAPSHOTS.put(kvKey(city.id), JSON.stringify(sheet), { expirationTtl: FACTSHEET_CACHE_MS / 1000 });
    } catch {
      // Non-fatal: the in-memory cache still serves this isolate either way.
    }
  }
  return sheet;
}

async function resultFor(city: CityConfig, env: DemoEnv): Promise<CityResult> {
  let sheet: FactSheet;
  try {
    sheet = await cachedFactSheet(city, env);
    if (!sheet.facts.length) throw new Error("no usable facts from any source");
  } catch (err) {
    return fixtureResult(city.id, `live data unavailable: ${(err as Error).message}`);
  }

  if (!env.OPENAI_API_KEY) return fixtureResult(city.id, "OpenAI API key not configured");

  try {
    const quests = await writeGroundedQuests({ apiKey: env.OPENAI_API_KEY, model: env.OPENAI_MODEL }, sheet.facts, 3);
    return {
      city: { id: city.id, name: city.name, region: city.region },
      retrievedAt: sheet.retrievedAt,
      facts: sheet.facts,
      notes: sheet.notes,
      quests,
      usedFallback: false,
    };
  } catch (err) {
    return fixtureResult(city.id, `quest generation unavailable: ${(err as Error).message}`);
  }
}

/** GET /api/demo/cities — the roster the picker can choose from. No external calls. */
export function handleDemoCities(): Response {
  return Response.json(DEMO_CITIES.map((c) => ({ id: c.id, name: c.name, region: c.region })));
}

/**
 * GET /api/demo/cross-city?a=<cityId>&b=<cityId> — the demo for a chosen pair of cities
 * from the roster (defaults to Santa Barbara + Chicago). Touches no game state.
 */
export async function handleCrossCityDemo(env: DemoEnv, requestedIds: [string, string] = DEFAULT_CITY_IDS): Promise<Response> {
  const cities = requestedIds.map((id) => findCity(id));
  const unknown = requestedIds.filter((_, i) => !cities[i]);
  if (unknown.length) return new Response(`unknown city id(s): ${unknown.join(", ")}`, { status: 400 });

  const results = await Promise.all(cities.map((city) => resultFor(city!, env)));
  const body: DemoResponse = { generatedAt: new Date().toISOString(), results };
  return Response.json(body);
}
