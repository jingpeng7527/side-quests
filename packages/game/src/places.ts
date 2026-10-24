import type { Coordinate, QuestPlace, Submission } from "./types";

/** Great-circle distance in meters. */
export function distance(a: Coordinate, b: Coordinate): number {
  const r = 6_371_000;
  const rad = Math.PI / 180;
  const dp = (b.latitude - a.latitude) * rad;
  const dl = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** "650 M", "1.2 KM" */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters / 10) * 10} M` : `${(meters / 1000).toFixed(1)} KM`;
}

/** true/false if the proof was/wasn't taken at the quest's place; null if unknown or no place. */
export function wasAtPlace(sub: Submission, place: QuestPlace | undefined): boolean | null {
  if (!place || sub.distanceFromPlace == null) return null;
  return sub.distanceFromPlace <= place.radius;
}

const SF: Coordinate = { latitude: 37.7749, longitude: -122.4194 };

/** Places for bot- and dev-written quests: real spots around the simulators' default San Francisco location. */
const DEMO_LANDMARKS: Record<string, QuestPlace> = {
  "Pose like a statue next to an actual statue": {
    name: "Civic Center Plaza",
    coordinate: { latitude: 37.7793, longitude: -122.4177 },
    radius: 100,
  },
  "Find the tiniest door in the neighborhood": {
    name: "Hayes Valley",
    coordinate: { latitude: 37.7763, longitude: -122.4242 },
    radius: 250,
  },
  "Hold a 10-second staring contest with a pigeon": {
    name: "UN Plaza",
    coordinate: { latitude: 37.7801, longitude: -122.4141 },
    radius: 100,
  },
  "Find a dog and learn its full name": {
    name: "Patricia's Green",
    coordinate: { latitude: 37.7766, longitude: -122.4243 },
    radius: 100,
  },
};

/** Elsewhere than SF, keeps the same offset from `near` as the landmark has from SF. */
export function demoPlace(quest: string, near?: Coordinate): QuestPlace | undefined {
  const landmark = DEMO_LANDMARKS[quest];
  if (!landmark) return undefined;
  if (!near || distance(near, SF) < 5_000) return landmark;
  return {
    name: "Mystery spot",
    radius: landmark.radius,
    coordinate: {
      latitude: near.latitude + landmark.coordinate.latitude - SF.latitude,
      longitude: near.longitude + landmark.coordinate.longitude - SF.longitude,
    },
  };
}

export const DEFAULT_LOCATION = SF;
