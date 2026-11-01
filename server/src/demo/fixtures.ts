import type { BaseFact, CityResult, GroundedQuest } from "./types";
import { findCity } from "./cities";

/**
 * Saved example results — a real sanitized snapshot collected 2026-10-25, paired with
 * hand-written example quests. Used only when a live source or OpenAI is unavailable,
 * so the demo always has something concrete to show. Never silently passed off as live:
 * callers must set `usedFallback: true` on anything built from here.
 */

const santaBarbaraFacts: BaseFact[] = [
  {
    id: "place:Q2704990",
    kind: "place",
    title: "Santa Barbara County Courthouse",
    detail:
      'The Santa Barbara County Courthouse is a Spanish Colonial Revival style building designed by William Mooser III and completed in 1929. Architect Charles Willard Moore called it the "grandest Spanish Colonial Revival structure ever built."',
    sourceUrl: "https://en.wikipedia.org/wiki/Santa%20Barbara%20County%20Courthouse",
    sourceLabel: "Wikipedia (via OpenTripMap)",
  },
  {
    id: "place:W389994752",
    kind: "place",
    title: "Mission Santa Barbara",
    detail:
      "Mission Santa Barbara was founded by Padre Fermín Lasuén for the Franciscan order on December 4, 1786, as the tenth mission for the religious conversion of the local Chumash-Barbareño people. It is the namesake of the city.",
    sourceUrl: "https://en.wikipedia.org/wiki/Mission%20Santa%20Barbara",
    sourceLabel: "Wikipedia (via OpenTripMap)",
  },
  {
    id: "place:N4302164505",
    kind: "place",
    title: "Moreton Bay Fig Tree",
    detail: "Santa Barbara's Moreton Bay Fig Tree is believed to be the largest Ficus macrophylla in the United States.",
    sourceUrl: "https://en.wikipedia.org/wiki/Moreton%20Bay%20Fig%20Tree%20%28Santa%20Barbara%2C%20California%29",
    sourceLabel: "Wikipedia (via OpenTripMap)",
  },
  {
    id: "place:W349829214",
    kind: "place",
    title: "De la Guerra Plaza",
    detail:
      "Plaza de la Guerra is a public plaza in downtown Santa Barbara, best known for hosting Santa Barbara's annual Fiesta in early August, with booths and musical performances.",
    sourceUrl: "https://en.wikipedia.org/wiki/Plaza%20de%20la%20Guerra",
    sourceLabel: "Wikipedia (via OpenTripMap)",
  },
  {
    id: "weather",
    kind: "weather",
    title: "Current weather",
    detail: "16.3°C, clear sky, 5% cloud cover, 10 km/h wind, nighttime (observed 2026-10-25T01:45 local time).",
    sourceUrl:
      "https://api.open-meteo.com/v1/forecast?latitude=34.4208&longitude=-119.6982&current=temperature_2m,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,is_day&forecast_days=1&timezone=America%2FLos_Angeles",
    sourceLabel: "Open-Meteo",
  },
  {
    id: "event:Z7r9jZ1A7ra-Z",
    kind: "event",
    title: "Trae Crowder",
    detail: "On 2026-10-26 19:30:00 at The Lobero.",
    sourceUrl: "https://www.ticketmaster.com/event/Z7r9jZ1A7ra-Z",
    sourceLabel: "Ticketmaster",
  },
  {
    id: "event:Z7r9jZ1A7-sOd",
    kind: "event",
    title: "Opera Santa Barbara: Rigoletto",
    detail: "On 2026-11-06 19:30:00 at The Lobero.",
    sourceUrl: "https://www.ticketmaster.com/event/Z7r9jZ1A7-sOd",
    sourceLabel: "Ticketmaster",
  },
  {
    id: "event:rZ7HnEZ1AfayoV",
    kind: "event",
    title: "TOO $HORT LUVE IN CONCERT AT SOHO IN SANTA BARBARA",
    detail: "On 2026-11-06 20:00:00 at Soho Restaurant & Music Club.",
    sourceUrl: "https://www.ticketweb.com/event/too-hort-luve-in-concert-soho-restaurant-music-club-tickets/14279474",
    sourceLabel: "Ticketmaster",
  },
];

const santaBarbaraQuests: GroundedQuest[] = [
  { text: "Photograph the Spanish Colonial arches of the County Courthouse.", factId: "place:Q2704990" },
  { text: "Pose beneath the giant Moreton Bay Fig Tree's canopy.", factId: "place:N4302164505" },
  { text: "Catch the Lobero's marquee before Trae Crowder takes the stage.", factId: "event:Z7r9jZ1A7ra-Z" },
];

const chicagoFacts: BaseFact[] = [
  {
    id: "place:Q29294",
    kind: "place",
    title: "Willis Tower",
    detail:
      "The Willis Tower (formerly the Sears Tower) is a 108-story, 1,450-foot skyscraper in Chicago, long one of the tallest buildings in the world.",
    sourceUrl: "https://en.wikipedia.org/wiki/Willis%20Tower",
    sourceLabel: "Wikipedia (via OpenTripMap)",
  },
  {
    id: "place:R1870546",
    kind: "place",
    title: "The Art Institute of Chicago",
    detail:
      "The Art Institute of Chicago, in Chicago's Grant Park and founded in 1879, is one of the oldest and largest art museums in the world.",
    sourceUrl: "https://en.wikipedia.org/wiki/Art%20Institute%20of%20Chicago",
    sourceLabel: "Wikipedia (via OpenTripMap)",
  },
  {
    id: "place:W73671128",
    kind: "place",
    title: "Monadnock Building",
    detail:
      "The Monadnock Building is a 16-story skyscraper at 53 West Jackson Boulevard in Chicago's south Loop, with a north half dating to 1891 among the tallest load-bearing masonry buildings ever constructed.",
    sourceUrl: "https://en.wikipedia.org/wiki/Monadnock%20Building",
    sourceLabel: "Wikipedia (via OpenTripMap)",
  },
  {
    id: "place:N1299823016",
    kind: "place",
    title: "Calder's Flamingo",
    detail:
      "Flamingo, created by artist Alexander Calder, is a 53-foot tall red stabile located in Federal Plaza in front of the Kluczynski Federal Building in Chicago.",
    sourceUrl: "https://en.wikipedia.org/wiki/Flamingo%20%28sculpture%29",
    sourceLabel: "Wikipedia (via OpenTripMap)",
  },
  {
    id: "weather",
    kind: "weather",
    title: "Current weather",
    detail: "11.0°C, overcast, 83% cloud cover, 9.3 km/h wind, daytime (observed 2026-10-25T09:00 local time).",
    sourceUrl:
      "https://api.open-meteo.com/v1/forecast?latitude=41.8781&longitude=-87.6298&current=temperature_2m,precipitation,weather_code,cloud_cover,wind_speed_10m,is_day&forecast_days=1&timezone=America%2FChicago",
    sourceLabel: "Open-Meteo",
  },
  {
    id: "event:LvZ18Qt6lwXR0zliB0k2w",
    kind: "event",
    title: "Balloon Museum | EmotionAir - Art You Can Feel",
    detail: "On 2026-10-25 10:00:00 at The Fields Studios.",
    sourceUrl: "https://www.universe.com/events/balloon-museum-emotionair-art-you-can-feel-chicago-tickets-XZFMJ7?ref=ticketmaster",
    sourceLabel: "Ticketmaster",
  },
  {
    id: "event:vvG1jZ_G4XboH4",
    kind: "event",
    title: "The Book of Mormon (Chicago)",
    detail: "On 2026-10-25 13:00:00 at Cadillac Palace.",
    sourceUrl: "https://www.ticketmaster.com/the-book-of-mormon-chicago-chicago-illinois-10-25-2026/event/070064C57E611F15",
    sourceLabel: "Ticketmaster",
  },
  {
    id: "event:vvG1jZ_GwoNdo_",
    kind: "event",
    title: "Kokandy Productions Jekyll & Hyde (Chicago)",
    detail: "On 2026-10-25 13:00:00 at Broadway Playhouse at Water Tower Place.",
    sourceUrl: "https://www.ticketmaster.com/kokandy-productions-jekyll-hyde-chicago-chicago-illinois-10-25-2026/event/070064CC918C3459",
    sourceLabel: "Ticketmaster",
  },
];

const chicagoQuests: GroundedQuest[] = [
  { text: "Frame Willis Tower from street level, looking straight up.", factId: "place:Q29294" },
  { text: "Find Calder's red Flamingo and match its curve with your pose.", factId: "place:N1299823016" },
  { text: "Snap the Cadillac Palace marquee before Book of Mormon's curtain.", factId: "event:vvG1jZ_G4XboH4" },
];

function fixtureFor(cityId: string, retrievedAt: string, facts: BaseFact[], quests: GroundedQuest[]): CityResult {
  const city = findCity(cityId)!;
  return {
    city: { id: city.id, name: city.name, region: city.region },
    retrievedAt,
    facts,
    notes: ["This is a saved example snapshot, not a live fetch — shown because a live source or OpenAI was unavailable."],
    quests,
    usedFallback: true,
  };
}

/** Only these two cities have a curated, hand-verified offline snapshot. */
const CURATED: Record<string, () => CityResult> = {
  "santa-barbara": () => fixtureFor("santa-barbara", "2026-10-25T09:19:15.400Z", santaBarbaraFacts, santaBarbaraQuests),
  chicago: () => fixtureFor("chicago", "2026-10-25T14:05:54.000Z", chicagoFacts, chicagoQuests),
};

export function fixtureResult(cityId: string, reason: string): CityResult {
  const curated = CURATED[cityId];
  if (curated) return { ...curated(), fallbackReason: reason };

  // Any other city in the roster: be honest that there's no saved example for it,
  // rather than mislabeling a different city's fixture as this one's.
  const city = findCity(cityId);
  return {
    city: city ? { id: city.id, name: city.name, region: city.region } : { id: cityId, name: cityId, region: "" },
    retrievedAt: new Date().toISOString(),
    facts: [],
    notes: ["No saved example snapshot exists for this city yet — only Santa Barbara and Chicago have one."],
    quests: [],
    usedFallback: true,
    fallbackReason: reason,
  };
}
