import {
  fetchGdeltArticles,
  fetchOpenMeteo,
  fetchOpenTripMapDetail,
  fetchOpenTripMapPlaces,
  fetchTicketmasterEvents,
  type OtmPlace,
  type TmEvent,
} from "./sources";
import type { BaseFact, CityConfig, FactSheet } from "./types";

const WEATHER_TEXT: Record<number, string> = {
  0: "clear sky",
  1: "mostly clear",
  2: "partly cloudy",
  3: "overcast",
  45: "fog",
  48: "freezing fog",
  51: "light drizzle",
  53: "drizzle",
  55: "dense drizzle",
  61: "light rain",
  63: "rain",
  65: "heavy rain",
  71: "light snow",
  73: "snow",
  75: "heavy snow",
  77: "snow grains",
  80: "light showers",
  81: "showers",
  82: "violent showers",
  95: "thunderstorm",
  96: "thunderstorm with hail",
  99: "severe thunderstorm with hail",
};
const weatherText = (code: number) => WEATHER_TEXT[code] ?? `weather code ${code}`;

/** Nearest-first, named, de-duplicated by name — drops the blanks and repeats a single query returns. */
function sanitizePlaces(raw: OtmPlace[]) {
  const seen = new Set<string>();
  let droppedUnnamed = 0;
  let droppedDuplicate = 0;
  const kept: OtmPlace[] = [];
  for (const p of [...raw].sort((a, b) => a.dist - b.dist)) {
    const name = p.name?.trim();
    if (!name) {
      droppedUnnamed++;
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      droppedDuplicate++;
      continue;
    }
    seen.add(key);
    kept.push(p);
  }
  return { kept, droppedUnnamed, droppedDuplicate };
}

/** Drops events already underway, then collapses same-name/same-day repeats (e.g. hourly showtimes). */
function sanitizeEvents(raw: TmEvent[]) {
  const now = Date.now();
  let droppedPast = 0;
  let droppedDuplicate = 0;
  const seen = new Set<string>();
  const kept: TmEvent[] = [];
  for (const e of raw) {
    const iso = e.dates?.start?.dateTime;
    const startMs = iso ? Date.parse(iso) : NaN;
    if (!Number.isNaN(startMs) && startMs < now) {
      droppedPast++;
      continue;
    }
    // Name + date only (not venue): the same show sometimes appears twice under slightly
    // different venue-name spellings (e.g. "The Lobero" vs. "Lobero Theatre").
    const key = `${e.name.toLowerCase()}|${e.dates?.start?.localDate}`;
    if (seen.has(key)) {
      droppedDuplicate++;
      continue;
    }
    seen.add(key);
    kept.push(e);
  }
  return { kept, droppedPast, droppedDuplicate };
}

export interface DemoKeys {
  openTripMap?: string;
  ticketmaster?: string;
}

interface TaskResult {
  facts: BaseFact[];
  notes: string[];
}

/** Nearest named places with a usable Wikipedia description — fetched concurrently, not one at a time. */
async function placesTask(city: CityConfig, apiKey: string): Promise<TaskResult> {
  const notes: string[] = [];
  const facts: BaseFact[] = [];
  try {
    const raw = await fetchOpenTripMapPlaces(city, apiKey);
    const { kept, droppedUnnamed, droppedDuplicate } = sanitizePlaces(raw);
    if (droppedUnnamed) notes.push(`OpenTripMap: removed ${droppedUnnamed} unnamed record(s).`);
    if (droppedDuplicate) notes.push(`OpenTripMap: removed ${droppedDuplicate} duplicate-name record(s).`);

    // Only need 4 with a description; checking the nearest 6 candidates is enough in practice
    // and keeps this one fetch batch smaller/faster than checking 10.
    const candidates = kept.slice(0, 6);
    const details = await Promise.all(candidates.map((p) => fetchOpenTripMapDetail(p.xid, apiKey).catch(() => null)));
    let used = 0;
    for (let i = 0; i < candidates.length && used < 4; i++) {
      const d = details[i];
      const text = d?.wikipedia_extracts?.text?.trim();
      if (!text || !d?.wikipedia) continue; // require both a description and a clickable source
      const p = candidates[i];
      facts.push({
        id: `place:${p.xid}`,
        kind: "place",
        title: p.name!.trim(),
        detail: text.length > 400 ? `${text.slice(0, 400)}…` : text,
        sourceUrl: d.wikipedia,
        sourceLabel: "Wikipedia (via OpenTripMap)",
      });
      used++;
    }
    if (!used) notes.push("OpenTripMap: no nearby place had both a description and a source link.");
  } catch (err) {
    notes.push(`OpenTripMap unavailable: ${(err as Error).message}`);
  }
  return { facts, notes };
}

async function weatherTask(city: CityConfig): Promise<TaskResult> {
  try {
    const { snapshot, sourceUrl } = await fetchOpenMeteo(city);
    return {
      facts: [
        {
          id: "weather",
          kind: "weather",
          title: "Current weather",
          detail: `${snapshot.temperatureC.toFixed(1)}°C, ${weatherText(snapshot.weatherCode)}, ${snapshot.cloudCoverPct}% cloud cover, ${snapshot.windKph} km/h wind, ${snapshot.isDay ? "daytime" : "nighttime"} (observed ${snapshot.observedAtLocal} local time).`,
          sourceUrl,
          sourceLabel: "Open-Meteo",
        },
      ],
      notes: [],
    };
  } catch (err) {
    return { facts: [], notes: [`Open-Meteo unavailable: ${(err as Error).message}`] };
  }
}

async function eventsTask(city: CityConfig, apiKey: string): Promise<TaskResult> {
  const notes: string[] = [];
  const facts: BaseFact[] = [];
  try {
    const raw = await fetchTicketmasterEvents(city, apiKey);
    const { kept, droppedPast, droppedDuplicate } = sanitizeEvents(raw);
    if (droppedPast) notes.push(`Ticketmaster: removed ${droppedPast} already-started event(s).`);
    if (droppedDuplicate) notes.push(`Ticketmaster: removed ${droppedDuplicate} duplicate showtime(s).`);
    for (const e of kept.slice(0, 3)) {
      const venue = e._embedded?.venues?.[0]?.name ?? "an unnamed venue";
      const when = [e.dates?.start?.localDate, e.dates?.start?.localTime].filter(Boolean).join(" ");
      facts.push({
        id: `event:${e.id}`,
        kind: "event",
        title: e.name,
        detail: `${when ? `On ${when} at` : "At"} ${venue}.`,
        sourceUrl: e.url,
        sourceLabel: "Ticketmaster",
      });
    }
    if (!kept.length) notes.push("Ticketmaster: no upcoming event in this window.");
  } catch (err) {
    notes.push(`Ticketmaster unavailable: ${(err as Error).message}`);
  }
  return { facts, notes };
}

/** Optional: GDELT rate-limits aggressively, so this is allowed to come back empty quickly. */
async function newsTask(city: CityConfig): Promise<TaskResult> {
  try {
    const [article] = await fetchGdeltArticles(city);
    if (article?.title && article?.url) {
      return {
        facts: [
          {
            id: `news:${article.url}`,
            kind: "news",
            title: article.title,
            detail: `Recent local news coverage mentioning ${city.name}.`,
            sourceUrl: article.url,
            sourceLabel: "GDELT",
          },
        ],
        notes: [],
      };
    }
    return { facts: [], notes: ["GDELT: no article returned (optional source)."] };
  } catch (err) {
    return { facts: [], notes: [`GDELT unavailable (optional source): ${(err as Error).message}`] };
  }
}

/**
 * The one process both cities go through: fetch, sanitize (drop invalid/duplicate
 * records), and select a small set of relevant, source-linked facts. The four sources
 * are independent of each other, so they run concurrently — a slow or failed one
 * (GDELT, usually) only costs its own time, not the whole city's.
 */
export async function buildFactSheet(city: CityConfig, keys: DemoKeys): Promise<FactSheet> {
  const [places, weather, events, news] = await Promise.all([
    keys.openTripMap ? placesTask(city, keys.openTripMap) : Promise.resolve({ facts: [], notes: ["OpenTripMap: no API key configured."] }),
    weatherTask(city),
    keys.ticketmaster ? eventsTask(city, keys.ticketmaster) : Promise.resolve({ facts: [], notes: ["Ticketmaster: no API key configured."] }),
    newsTask(city),
  ]);

  return {
    city,
    retrievedAt: new Date().toISOString(),
    facts: [...places.facts, ...weather.facts, ...events.facts, ...news.facts],
    notes: [...places.notes, ...weather.notes, ...events.notes, ...news.notes],
  };
}
