import type { Coordinate } from "@side-quests/game";
import { fetchWithTimeout, serverUrl } from "./config";

export interface PlaceHit {
  name: string;
  detail: string;
  latitude: number;
  longitude: number;
}

/** Search places (businesses, parks, landmarks, addresses) near the player, via the game server. */
export async function searchPlaces(query: string, near: Coordinate | null): Promise<PlaceHit[]> {
  const params = new URLSearchParams({ q: query });
  if (near) params.set("near", `${near.latitude},${near.longitude}`);
  const res = await fetchWithTimeout(`${serverUrl()}/api/geocode?${params}`, {}, 10_000);
  if (!res.ok) throw new Error(`search failed (${res.status})`);
  return (await res.json()) as PlaceHit[];
}

/** A short name for a dropped pin ("Patricia's Green", "Hayes St"), or null. */
export async function nameSpot(c: Coordinate): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${serverUrl()}/api/geocode?at=${c.latitude},${c.longitude}`, {}, 8000);
    if (!res.ok) return null;
    return ((await res.json()) as { name: string | null }).name;
  } catch {
    return null;
  }
}
