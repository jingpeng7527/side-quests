/**
 * Place search and naming via OpenStreetMap's Nominatim (free; ~1 request per
 * second, and it asks apps to identify themselves). Good enough for a party
 * game; swap in a keyed provider if usage grows.
 */
const UA = { "User-Agent": "side-quests/0.1 (party game; https://github.com/r-magnus/side-quests)" };

async function geocode<T>(path: string, params: URLSearchParams): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/${path}?${params}`, { headers: UA, signal: controller.signal });
    if (!res.ok) throw new Error(`Geocoding unavailable (${res.status})`);
    // Read the body within the timeout too.
    return await res.json() as T;
  } finally {
    clearTimeout(timer);
  }
}

export interface PlaceHit {
  name: string;
  detail: string;
  latitude: number;
  longitude: number;
}

interface NominatimPlace {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
  address?: Record<string, string>;
}

const shortName = (p: NominatimPlace) => p.name || p.display_name.split(",")[0];
const detail = (p: NominatimPlace) => {
  const a = p.address ?? {};
  return [a.road && (a.house_number ? `${a.house_number} ${a.road}` : a.road), a.neighbourhood ?? a.suburb, a.city ?? a.town ?? a.village]
    .filter(Boolean)
    .join(", ");
};

/** Places matching `q`, nearest to `near` first. */
export async function searchPlaces(q: string, near?: [number, number]): Promise<PlaceHit[]> {
  const params = new URLSearchParams({ q, format: "jsonv2", addressdetails: "1", limit: "8" });
  if (near) {
    const [lat, lng] = near;
    // Prefer results around the player (about 5 km), without excluding the rest.
    params.set("viewbox", [lng - 0.05, lat + 0.05, lng + 0.05, lat - 0.05].join(","));
  }
  const places = await geocode<NominatimPlace[]>("search", params);
  const hits = places.map((p) => ({
    name: shortName(p),
    detail: detail(p),
    latitude: Number(p.lat),
    longitude: Number(p.lon),
  }));
  if (!near) return hits;
  const d = (h: PlaceHit) => (h.latitude - near[0]) ** 2 + (h.longitude - near[1]) ** 2;
  return hits.sort((a, b) => d(a) - d(b));
}

/** A short human name for a dropped pin: a place name, or the street. */
export async function nameSpot(lat: number, lng: number): Promise<string | null> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lng), format: "jsonv2", zoom: "18", addressdetails: "1" });
  const p = await geocode<NominatimPlace & { error?: string }>("reverse", params);
  if (p.error) return null;
  return p.name || p.address?.road || p.address?.neighbourhood || p.display_name?.split(",")[0] || null;
}
