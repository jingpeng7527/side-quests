# Santa Barbara Data Snapshot (2026-10-25)

Initial collection: approximately 1:59 a.m. PDT on October 25, 2026. OpenTripMap and Ticketmaster were queried again at approximately 2:14–2:19 a.m. This is a small source audit for a quest recommendation demo, not a complete city inventory. The place and weather queries use a downtown reference point (`34.4208, -119.6982`). Whether a player can complete a place-based quest still depends on that player's location and the time of play.

## Results from the four proposed sources

| Source | Query result | What is available |
| --- | --- | --- |
| OpenTripMap | A 10 km radius query around downtown with `rate=2` and `limit=100` returned 70 places. | Place IDs, names, categories, coordinates, and distances from the reference point. Four place details were also fetched. See the [place list](data/santa-barbara-opentripmap-2026-10-25.json) and [place details](data/santa-barbara-opentripmap-details-2026-10-25.json). Neither file contains the API key. |
| Ticketmaster Discovery | Queries covering October 25 through November 8 returned 5 records for Santa Barbara city and 12 records within 25 miles of downtown. | The city query returned no October 25 events; its first event is on October 26. See the [sanitized API result](data/santa-barbara-ticketmaster-2026-10-25.json). The October 25 public events below come from city and tourism calendars. |
| GDELT DOC 2.0 | A query for `"Santa Barbara"` over the previous day received HTTP 429. The response asked clients to leave at least five seconds between requests. | No GDELT article list was obtained. The local news example below came from a separate source. |
| Open-Meteo | A live forecast API response was obtained. | At 1:45 a.m. PDT: 16.3 °C, 0 mm precipitation, weather code 0 (clear), 5% cloud cover, 10 km/h wind, and nighttime. |

[Open-Meteo request used for this snapshot](https://api.open-meteo.com/v1/forecast?latitude=34.4208&longitude=-119.6982&current=temperature_2m,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,is_day&forecast_days=1&timezone=America%2FLos_Angeles)

## OpenTripMap place sample

| Place | XID | Distance from reference point | Coordinates (latitude, longitude) | Detail coverage |
| --- | --- | ---: | --- | --- |
| De la Guerra Plaza | `W349829214` | 106 m | `34.419945, -119.698708` | Description; no preview image. |
| Santa Barbara County Courthouse | `Q2704990` | 555 m | `34.424351, -119.702461` | Description and preview image. |
| Moreton Bay Fig Tree | `N4302164505` | 881 m | `34.413643, -119.694031` | Description and preview image. |
| Mission Santa Barbara | `W389994752` | 2,389 m | `34.438374, -119.713226` | Description and preview image. |

Three of the 70 place records have no name. The list also contains duplicate names and a misspelling. Stearns Wharf did not appear in this `rate=2` query; that does not establish that OpenTripMap has no record for it. Some detail fields need verification: for example, the `house` field of De la Guerra Plaza contains a business name. A quest generator should remove unnamed records, resolve duplicates, and verify the usable location. Distances above are measured from the **query reference point**, not from a player.

## Ticketmaster event sample

Query window: local midnight on October 25 (PDT) through the end of November 8 (PST). One search used `city=Santa Barbara` and `stateCode=CA`; the other searched within 25 miles of downtown. The radius query used `latlong`, which Ticketmaster marks as deprecated; production code should use its recommended `geoPoint` parameter. These are all five city records, ordered by local event time:

| Local date and time | Event | Venue | Event link |
| --- | --- | --- | --- |
| October 26, 7:30 p.m. | Trae Crowder | The Lobero | [Ticketmaster](https://www.ticketmaster.com/event/Z7r9jZ1A7ra-Z) |
| October 26, 7:30 p.m. | Trae Crowder | Lobero Theatre | [Lobero checkout](https://checkout.lobero.com/21669) |
| November 6, 7:30 p.m. | Opera Santa Barbara: Rigoletto | The Lobero | [Ticketmaster](https://www.ticketmaster.com/event/Z7r9jZ1A7-sOd) |
| November 6, 8:00 p.m. | TOO $HORT LUVE IN CONCERT | Soho Restaurant & Music Club | [TicketWeb](https://www.ticketweb.com/event/too-hort-luve-in-concert-soho-restaurant-music-club-tickets/14279474) |
| November 8, 2:30 p.m. | Opera Santa Barbara: Rigoletto | The Lobero | [Ticketmaster](https://www.ticketmaster.com/event/Z7r9jZ1A7-sO7) |

The first two records share an event name, time, and street address, so they appear to describe the same performance. Their venue coordinates differ by **1,090 m**. OpenTripMap's Lobero Theatre coordinates are close to the second record. The venue names should be reconciled and the coordinates checked before creating a pinned photo quest.

The 25-mile query returned 12 records, including events at venues in Ventura. Those records are not all Santa Barbara city events. A cross-city quest would need distance calculated from the actual player position.

## Landmarks described by the tourism board

| Place | Useful visible features | Source |
| --- | --- | --- |
| Stearns Wharf | Waterfront landmark at the end of State Street with ocean views. | [Visit Santa Barbara](https://santabarbaraca.com/itinerary/must-visit-museums-attractions/) |
| Santa Barbara County Courthouse | Public building with arches and a garden. | [Visit Santa Barbara](https://santabarbaraca.com/itinerary/must-visit-museums-attractions/) |
| Old Mission Santa Barbara | Twin bell towers; its exterior can be viewed without an interior tour. | [Visit Santa Barbara](https://santabarbaraca.com/itinerary/must-visit-museums-attractions/) |

The courthouse and mission also appear in the OpenTripMap sample. Stearns Wharf is in the tourism board's list but not in this OpenTripMap query result. A place-based quest still needs player-distance and access checks.

## Public events on Sunday, October 25

| Time (PDT) | Event and location | Access condition | Source |
| --- | --- | --- | --- |
| 10:00 a.m.–6:00 p.m. | Santa Barbara Arts & Crafts Show, Cabrillo Boulevard | Public show. Verify the exact entrance or exhibition area before pinning a quest. | [City event page](https://calendar.santabarbaraca.gov/event/santa-barbara-arts-crafts-show-cabrillo-boulevard-6239) |
| 2:00–4:00 p.m. | Halloween Pooch Parade, Santa Barbara Botanic Garden, 1212 Mission Canyon Road | Free; advance reservation required. | [Visit Santa Barbara event page](https://santabarbaraca.com/events/halloween-pooch-parade/) |
| 3:30–8:00 p.m. | Día de Muertos Calenda, 1130 State Street toward De La Guerra Plaza | Free public procession. | [Visit Santa Barbara event page](https://santabarbaraca.com/events/dia-de-muertos-calenda-2026/) |

The [tourism board's Halloween roundup](https://santabarbaraca.com/itinerary/halloween-events/) also lists ticketed Boo at the Zoo activities on October 25. Free admission, reservation, and ticket requirements should be stored as separate fields.

## Recent local news example

[Edhat's October 22 Downtown Santa Barbara event guide](https://www.edhat.com/news/downtown-santa-barbara-halloween-events-artober-october-lineup/) covers October 22–28. It mentions Fútbol on State Street and the Calenda on October 25, plus the month-long ARTOBER arts program. This is an example of a local news signal, **not** a GDELT API result.

## Findings from this sample

- Public place, event, and weather data can support a Santa Barbara-specific recommendation demo without player history.
- City and tourism calendars provided same-day event times, locations, and access conditions. Ticketmaster returned later performances but no city event on October 25 in this query.
- Ticketmaster's apparent duplicate and conflicting venue coordinates show why event records need deduplication, venue-name normalization, and location checks before they become quests.
- OpenTripMap returned useful coordinates, categories, images, and descriptions, but its raw records need filtering and cross-checking. A single query does not establish coverage for the whole city.
- GDELT was rate-limited in this attempt. A live news request should not be required for a demo quest to appear; a timestamped cache or a permitted local news source can provide a fallback.
- Collection happened at night. The listed October 25 events had not started, so they were not immediately playable at collection time.
