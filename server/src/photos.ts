import { averageRating, type GameState } from "@side-quests/game";

/** A quest needs at least this average rating, from at least this many raters, before its photos are worth keeping. */
const MIN_RATING = 4;
const MIN_RATING_COUNT = 2;

/**
 * Copies proof photos for well-rated human quests into R2, so they survive the
 * lobby's 24-hour TTL. Only quests judges actually rated — and rated well —
 * qualify; everything else is left to expire with the rest of the lobby.
 * Must run in the same Durable Object whose storage holds the photos (reads
 * them via `storage`, the Lobby's own `ctx.storage`).
 */
export async function saveGoodPhotos(bucket: R2Bucket | undefined, storage: DurableObjectStorage, state: GameState): Promise<void> {
  if (!bucket) return;
  const puts: Promise<unknown>[] = [];
  for (const q of state.quests) {
    if (q.source !== "human") continue;
    const subs = state.submissions.filter((s) => s.questId === q.id);
    const rated = averageRating(subs);
    if (!rated || rated.average < MIN_RATING || rated.count < MIN_RATING_COUNT) continue;
    for (const sub of subs) {
      if (sub.proof.kind !== "photo") continue;
      const id = sub.proof.url.match(/\/photos\/([^/]+)\.jpg$/)?.[1];
      if (!id) continue;
      const key = `${state.code}/${id}.jpg`;
      puts.push(
        storage.get<Uint8Array>(`photo:${id}`).then((bytes) => {
          if (bytes) return bucket.put(key, bytes, { httpMetadata: { contentType: "image/jpeg" } });
        }),
      );
    }
  }
  if (puts.length) await Promise.all(puts);
}
