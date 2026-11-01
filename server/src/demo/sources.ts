import type { CityConfig } from "./types";

async function getJSON<T>(url: string, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface OtmPlace {
  xid: string;
  name?: string;
  dist: number;
  kinds?: string;
  osm?: string;
  point: { lat: number; lon: number };
}

/** A 10 km radius query around the city center, places with some notability (rate ≥ 2). */
export async function fetchOpenTripMapPlaces(city: CityConfig, apiKey: string): Promise<OtmPlace[]> {
  const url = `https://api.opentripmap.com/0.1/en/places/radius?radius=10000&lon=${city.lon}&lat=${city.lat}&rate=2&format=json&limit=100&apikey=${encodeURIComponent(apiKey)}`;
  return getJSON<OtmPlace[]>(url, 8000);
}

export interface OtmDetail {
  xid: string;
  name?: string;
  wikipedia?: string;
  wikipedia_extracts?: { text?: string };
}

/** Never includes the API key in anything returned to callers outside this module. */
export async function fetchOpenTripMapDetail(xid: string, apiKey: string): Promise<OtmDetail> {
  const url = `https://api.opentripmap.com/0.1/en/places/xid/${encodeURIComponent(xid)}?apikey=${encodeURIComponent(apiKey)}`;
  return getJSON<OtmDetail>(url, 8000);
}

export interface WeatherSnapshot {
  temperatureC: number;
  weatherCode: number;
  cloudCoverPct: number;
  windKph: number;
  isDay: boolean;
  observedAtLocal: string;
}

/** Open-Meteo needs no key, and its query URL is safe to show as the fact's source link. */
export async function fetchOpenMeteo(city: CityConfig): Promise<{ snapshot: WeatherSnapshot; sourceUrl: string }> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${city.lat}&longitude=${city.lon}&current=temperature_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,is_day&forecast_days=1&timezone=${encodeURIComponent(city.timezone)}`;
  const data = await getJSON<{ current: Record<string, number> }>(url, 6000);
  const c = data.current;
  return {
    snapshot: {
      temperatureC: c.temperature_2m,
      weatherCode: c.weather_code,
      cloudCoverPct: c.cloud_cover,
      windKph: c.wind_speed_10m,
      isDay: c.is_day === 1,
      observedAtLocal: String(c.time ?? ""),
    },
    sourceUrl: url,
  };
}

export interface TmEvent {
  id: string;
  name: string;
  url: string;
  dates?: { start?: { localDate?: string; localTime?: string; dateTime?: string } };
  _embedded?: { venues?: { name?: string }[] };
}

export async function fetchTicketmasterEvents(city: CityConfig, apiKey: string): Promise<TmEvent[]> {
  const params = new URLSearchParams({
    city: city.ticketmaster.city,
    countryCode: city.ticketmaster.countryCode,
    sort: "date,asc",
    size: "20",
    apikey: apiKey,
  });
  if (city.ticketmaster.stateCode) params.set("stateCode", city.ticketmaster.stateCode);
  const url = `https://app.ticketmaster.com/discovery/v2/events.json?${params}`;
  const data = await getJSON<{ _embedded?: { events?: TmEvent[] } }>(url, 8000);
  return data._embedded?.events ?? [];
}

export interface GdeltArticle {
  title: string;
  url: string;
}

/** Best-effort only: GDELT rate-limits aggressively, so a short timeout and a quiet failure are expected. */
export async function fetchGdeltArticles(city: CityConfig): Promise<GdeltArticle[]> {
  const params = new URLSearchParams({
    query: `"${city.gdeltQuery}"`,
    mode: "artlist",
    maxrecords: "5",
    format: "json",
    timespan: "2d",
  });
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params}`;
  const data = await getJSON<{ articles?: GdeltArticle[] }>(url, 1800);
  return data.articles ?? [];
}
