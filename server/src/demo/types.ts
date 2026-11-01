/**
 * Shared types for the standalone cross-city quest demo (server/src/demo/*).
 * This demo is independent of the live game: it never touches Lobby state,
 * never reads a device's GPS, and never changes how real quests are written.
 */

export interface CityConfig {
  id: string;
  name: string;
  region: string;
  timezone: string;
  lat: number;
  lon: number;
  ticketmaster: { city: string; stateCode?: string; countryCode: string };
  gdeltQuery: string;
}

export type FactKind = "place" | "event" | "weather" | "news";

/** One sanitized, source-linked fact the model is allowed to ground a quest in. */
export interface BaseFact {
  id: string;
  kind: FactKind;
  title: string;
  detail: string;
  sourceUrl: string;
  sourceLabel: string;
}

export interface FactSheet {
  city: CityConfig;
  retrievedAt: string;
  facts: BaseFact[];
  /** Sanitization/availability notes shown in the UI, e.g. "removed 3 unnamed records". */
  notes: string[];
}

export interface GroundedQuest {
  text: string;
  factId: string;
}

export interface CityResult {
  city: Pick<CityConfig, "id" | "name" | "region">;
  retrievedAt: string;
  facts: BaseFact[];
  notes: string[];
  quests: GroundedQuest[];
  usedFallback: boolean;
  fallbackReason?: string;
}

export interface DemoResponse {
  generatedAt: string;
  results: CityResult[];
}
