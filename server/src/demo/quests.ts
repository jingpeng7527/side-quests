import OpenAI from "openai";
import type { BaseFact, GroundedQuest } from "./types";

export const DEFAULT_DEMO_MODEL = "gpt-5.4-mini";

const INSTRUCTIONS = `You write short photo-quest prompts for a travel demo that compares two cities side by side. \
Each quest must be grounded in exactly one fact from the list you are given, and must reference that fact's id \
in "factId". Never invent a place, event, or detail that isn't in the list. Each quest is one sentence, under \
100 characters, imperative voice, no numbering or emoji.

A "place" fact's description is general or historical background, not a report of something happening right \
now — it may mention an annual festival, a seasonal event, or something "best known for" that is not occurring \
today. Only an "event" fact's own date means something is actually scheduled. For a "place" fact, ground the \
quest in a physical, always-there detail (its architecture, a specific feature, its history) and never imply a \
festival, show, or seasonal activity mentioned in its description is happening today unless a matching "event" \
fact with today's date also appears in the list.`;

const SCHEMA = {
  type: "object",
  properties: {
    quests: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string" }, factId: { type: "string" } },
        required: ["text", "factId"],
        additionalProperties: false,
      },
    },
  },
  required: ["quests"],
  additionalProperties: false,
} as const;

/**
 * Asks OpenAI for `count` quests grounded in `facts`. Throws on any failure or if the
 * model returns nothing grounded in a real factId — callers fall back to saved examples.
 */
export async function writeGroundedQuests(
  ai: { apiKey: string; model?: string },
  facts: BaseFact[],
  count: number,
): Promise<GroundedQuest[]> {
  const model = ai.model || DEFAULT_DEMO_MODEL;
  const client = new OpenAI({ apiKey: ai.apiKey });
  const today = new Date().toISOString().slice(0, 10);
  const input = `Today's date is ${today}. Facts for this city:\n${facts
    .map((f) => `- id=${f.id} (${f.kind}) "${f.title}": ${f.detail}`)
    .join("\n")}\n\nWrite ${count} photo quests, each grounded in a different fact above.`;

  const response = await client.responses.create({
    model,
    instructions: INSTRUCTIONS,
    input,
    // Reasoning models (gpt-5.x, o-series) think briefly; a short list doesn't need more.
    ...(/^(gpt-5|gpt-6|o\d)/.test(model) ? { reasoning: { effort: "low" as const } } : {}),
    text: { format: { type: "json_schema", name: "grounded_quests", strict: true, schema: SCHEMA } },
    max_output_tokens: 2000,
    // Demo chatter doesn't need to be kept on OpenAI's side.
    store: false,
  });

  const { quests } = JSON.parse(response.output_text) as { quests: { text: string; factId: string }[] };
  const validIds = new Set(facts.map((f) => f.id));
  const grounded = quests
    .filter((q) => q.text?.trim() && validIds.has(q.factId))
    .map((q) => ({ text: q.text.trim(), factId: q.factId }));
  if (!grounded.length) throw new Error("model returned no quest grounded in a real fact");
  return grounded.slice(0, count);
}
