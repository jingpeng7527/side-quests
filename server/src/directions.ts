import type { WalkingRoute } from "@side-quests/game";

/**
 * Walking route between two points via the FOSSGIS OSRM foot router
 * (OpenStreetMap data, free, fair-use). Fine for development; for production
 * swap in a keyed provider (Mapbox, Google Routes) or self-hosted OSRM.
 */
export async function walkingRoute(from: [number, number], to: [number, number]): Promise<WalkingRoute | null> {
  const coords = `${from[1]},${from[0]};${to[1]},${to[0]}`; // OSRM wants lng,lat
  const url = `https://routing.openstreetmap.de/routed-foot/route/v1/foot/${coords}?overview=full&geometries=geojson`;
  const res = await fetch(url, { headers: { "User-Agent": "side-quests-dev/0.1" } });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    routes?: { distance: number; duration: number; geometry: { coordinates: [number, number][] } }[];
  };
  const route = body.routes?.[0];
  if (!route) return null;
  return {
    distance: route.distance,
    duration: route.duration,
    coordinates: route.geometry.coordinates.map(([longitude, latitude]) => ({ latitude, longitude })),
  };
}
