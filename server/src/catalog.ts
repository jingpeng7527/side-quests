import { isVerified, type GameState } from "@side-quests/game";

/** A quest pulled from a finished game, for LLM inspiration or later curation. */
export interface CatalogEntry {
  text: string;
  source: "human" | "ai";
  verified: boolean;
  place: { name: string; radius: number } | null;
  playedAt: number;
}

interface CatalogRow {
  text: string;
  source: "human" | "ai";
  place_name: string | null;
  place_radius: number | null;
  played_at: number;
  times_verified: number;
}

/**
 * Saves human-written quests from a finished game that were actually dealt and
 * attempted (have at least one submission). AI-written quests are skipped —
 * the point is capturing people's own ideas, not the AI's own output — and
 * quests that were written but never played don't make the catalog either.
 */
export async function saveToCatalog(db: D1Database | undefined, state: GameState): Promise<void> {
  if (!db) return;
  const playedAt = Date.now();
  const stmts = state.quests
    .map((q) => {
      if (q.source !== "human") return null;
      const subs = state.submissions.filter((s) => s.questId === q.id);
      if (!subs.length) return null;
      return db
        .prepare(
          `INSERT INTO catalog_quests (id, text, source, place_name, place_lat, place_lng, place_radius, lobby_code, played_at, times_submitted, times_verified)
           VALUES (?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
          q.id,
          q.text,
          q.source,
          q.place?.name ?? null,
          q.place?.coordinate.latitude ?? null,
          q.place?.coordinate.longitude ?? null,
          q.place?.radius ?? null,
          state.code,
          playedAt,
          subs.length,
          subs.filter(isVerified).length,
        );
    })
    .filter((s): s is NonNullable<typeof s> => !!s);
  if (stmts.length) await db.batch(stmts);
}

/** Recent or random quests from the catalog — plain text, for LLM few-shot context or future display. */
export async function listCatalog(
  db: D1Database | undefined,
  opts: { limit: number; verifiedOnly: boolean; random: boolean },
): Promise<CatalogEntry[]> {
  if (!db) return [];
  const where = opts.verifiedOnly ? "WHERE times_verified > 0" : "";
  const order = opts.random ? "ORDER BY RANDOM()" : "ORDER BY played_at DESC";
  const { results } = await db
    .prepare(`SELECT text, source, place_name, place_radius, played_at, times_verified FROM catalog_quests ${where} ${order} LIMIT ?`)
    .bind(opts.limit)
    .all<CatalogRow>();
  return results.map((r) => ({
    text: r.text,
    source: r.source,
    verified: r.times_verified > 0,
    place: r.place_name ? { name: r.place_name, radius: r.place_radius ?? 0 } : null,
    playedAt: r.played_at,
  }));
}
