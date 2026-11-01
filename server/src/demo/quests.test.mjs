import assert from "node:assert/strict";
import { test } from "node:test";
import { writeGroundedQuests } from "./quests.ts";

/**
 * Regression test for a real bug found 2026-10-25: De la Guerra Plaza's Wikipedia-derived
 * description mentions a recurring festival ("Fiesta in early August"), and the model wrote
 * a quest as if it were happening right now, in October. The fix added explicit date-
 * awareness to the prompt (see the INSTRUCTIONS in quests.ts).
 *
 * This has to call the real model, not a mocked one: the factId-grounding check elsewhere
 * (validIds.has(...)) only verifies the model cited a real fact — it says nothing about
 * whether the sentence it wrote about that fact is actually true. A quest can cite a
 * perfectly real factId and still be wrong, which is exactly what happened here.
 */

const DE_LA_GUERRA_PLAZA = {
  id: "place:W349829214",
  kind: "place",
  title: "De la Guerra Plaza",
  detail:
    "Plaza de la Guerra is a public plaza in downtown Santa Barbara, best known for hosting Santa Barbara's annual Fiesta in early August, with booths and musical performances.",
  sourceUrl: "https://en.wikipedia.org/wiki/Plaza%20de%20la%20Guerra",
  sourceLabel: "Wikipedia (via OpenTripMap)",
};

const CURRENT_WEATHER = {
  id: "weather",
  kind: "weather",
  title: "Current weather",
  detail: "16.3°C, clear sky, 5% cloud cover, 10 km/h wind, nighttime.",
  sourceUrl: "https://api.open-meteo.com/v1/forecast?latitude=34.4208&longitude=-119.6982",
  sourceLabel: "Open-Meteo",
};

// Words that only make sense if Fiesta were actually happening today.
const SEASONAL_WORDS = ["fiesta", "festival", "booth"];

// Early August is when Fiesta actually happens — don't flag those words as wrong then,
// or this test would fail every year during the one week it would actually be correct.
function isFiestaSeason(now = new Date()) {
  return now.getUTCMonth() === 7 && now.getUTCDate() <= 10; // August 1–10
}

const skipReason = !process.env.OPENAI_API_KEY
  ? "requires a real OPENAI_API_KEY (server/.env) — this test calls the live model"
  : isFiestaSeason()
    ? "it actually is Fiesta season right now, so mentioning it would be correct"
    : false;

test(
  "a place's seasonal-event trivia isn't treated as happening today",
  { skip: skipReason },
  async () => {
    const RUNS = 3;
    let sawPlazaQuest = false;

    for (let i = 0; i < RUNS; i++) {
      const quests = await writeGroundedQuests(
        { apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL },
        [DE_LA_GUERRA_PLAZA, CURRENT_WEATHER],
        2,
      );
      const plazaQuest = quests.find((q) => q.factId === DE_LA_GUERRA_PLAZA.id);
      if (!plazaQuest) continue; // the model grounded elsewhere this run — nothing to check

      sawPlazaQuest = true;
      const text = plazaQuest.text.toLowerCase();
      for (const word of SEASONAL_WORDS) {
        assert.ok(!text.includes(word), `quest "${plazaQuest.text}" implies Fiesta is happening today (found "${word}")`);
      }
    }

    // Across 3 real generations, the model should have grounded in the plaza at least
    // once (it's one of only two facts offered) — otherwise this test isn't exercising
    // the thing it's meant to check.
    assert.ok(sawPlazaQuest, "the model never grounded a quest in the plaza fact across 3 runs — can't verify the fix");
  },
);
