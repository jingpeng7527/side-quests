import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimate, rateQuests } from './ratings.ts';

// Total difficulty (the engine turns this into points).
const total = (d) => d.time + d.nerve + d.effort;

const quest = (text, extra = {}) => ({ id: crypto.randomUUID(), text, authorId: 'a', source: 'human', included: true, ...extra });

test('offline estimate ranks awkward, effortful quests above easy ones', () => {
  const easy = total(estimate(quest('Take a selfie with a red car')));
  const awkward = total(estimate(quest('Serenade a stranger with a song about their shoes')));
  const elaborate = total(estimate(quest('Build a tower of five unrelated objects')));
  assert.ok(awkward > easy, `awkward ${awkward} > easy ${easy}`);
  assert.ok(elaborate > easy, `elaborate ${elaborate} > easy ${easy}`);
});

test('a far-off place adds effort', () => {
  const here = estimate(quest('Find a dog and learn its name'));
  const there = estimate(quest('Find a dog and learn its name', { place: { name: 'Dolores Park', coordinate: { latitude: 0, longitude: 0 }, radius: 50 } }));
  assert.ok(there.effort > here.effort);
});

test('without an API key every quest still gets a rating', async () => {
  const qs = [quest('Get a high five from someone wearing a hat'), quest('Find a sign with a typo')];
  const ratings = await rateQuests({ model: 'gpt-5.4-mini' }, qs);
  assert.deepEqual(ratings.map((r) => r.questId).sort(), qs.map((q) => q.id).sort());
  assert.ok(ratings.every((r) => r.difficulty.by === 'estimate'));
});

test('an API failure falls back to the estimate', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response('{"error":{"message":"nope"}}', { status: 500 }));
  t.mock.method(console, 'error', () => {});
  const qs = [quest('Order something using only a fake accent')];
  const ratings = await rateQuests({ apiKey: 'sk-test', model: 'gpt-5.4-mini' }, qs);
  assert.equal(ratings.length, 1);
  assert.equal(ratings[0].difficulty.by, 'estimate');
});
