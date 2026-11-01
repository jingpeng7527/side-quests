import type { CityConfig } from "./types";

/**
 * The roster the demo page can pick two cities from. Add entries here only — nothing
 * else needs to change for a new city to show up in the picker. Only "santa-barbara"
 * and "chicago" have a curated offline fixture (see fixtures.ts); any other city falls
 * back to an honest "no saved example for this city" state if live data is unavailable.
 */
export const DEMO_CITIES: CityConfig[] = [
  {
    id: "santa-barbara",
    name: "Santa Barbara",
    region: "California, United States",
    timezone: "America/Los_Angeles",
    lat: 34.4208,
    lon: -119.6982,
    ticketmaster: { city: "Santa Barbara", stateCode: "CA", countryCode: "US" },
    gdeltQuery: "Santa Barbara California",
  },
  {
    id: "chicago",
    name: "Chicago",
    region: "Illinois, United States",
    timezone: "America/Chicago",
    lat: 41.8781,
    lon: -87.6298,
    ticketmaster: { city: "Chicago", stateCode: "IL", countryCode: "US" },
    gdeltQuery: "Chicago Illinois",
  },
  {
    id: "new-york",
    name: "New York City",
    region: "New York, United States",
    timezone: "America/New_York",
    lat: 40.7128,
    lon: -74.006,
    ticketmaster: { city: "New York", stateCode: "NY", countryCode: "US" },
    gdeltQuery: "New York City",
  },
  {
    id: "los-angeles",
    name: "Los Angeles",
    region: "California, United States",
    timezone: "America/Los_Angeles",
    lat: 34.0522,
    lon: -118.2437,
    ticketmaster: { city: "Los Angeles", stateCode: "CA", countryCode: "US" },
    gdeltQuery: "Los Angeles California",
  },
  {
    id: "miami",
    name: "Miami",
    region: "Florida, United States",
    timezone: "America/New_York",
    lat: 25.7617,
    lon: -80.1918,
    ticketmaster: { city: "Miami", stateCode: "FL", countryCode: "US" },
    gdeltQuery: "Miami Florida",
  },
  {
    id: "seattle",
    name: "Seattle",
    region: "Washington, United States",
    timezone: "America/Los_Angeles",
    lat: 47.6062,
    lon: -122.3321,
    ticketmaster: { city: "Seattle", stateCode: "WA", countryCode: "US" },
    gdeltQuery: "Seattle Washington",
  },
  {
    id: "denver",
    name: "Denver",
    region: "Colorado, United States",
    timezone: "America/Denver",
    lat: 39.7392,
    lon: -104.9903,
    ticketmaster: { city: "Denver", stateCode: "CO", countryCode: "US" },
    gdeltQuery: "Denver Colorado",
  },
  {
    id: "boston",
    name: "Boston",
    region: "Massachusetts, United States",
    timezone: "America/New_York",
    lat: 42.3601,
    lon: -71.0589,
    ticketmaster: { city: "Boston", stateCode: "MA", countryCode: "US" },
    gdeltQuery: "Boston Massachusetts",
  },
];

export const DEFAULT_CITY_IDS: [string, string] = ["santa-barbara", "chicago"];

export function findCity(id: string): CityConfig | undefined {
  return DEMO_CITIES.find((c) => c.id === id);
}
