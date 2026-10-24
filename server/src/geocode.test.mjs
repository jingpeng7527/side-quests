import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nameSpot, searchPlaces } from './geocode.ts';

const place = (name, lat, lon) => ({ name, lat: String(lat), lon: String(lon), display_name: `${name}, San Francisco`, address: { road: 'Hayes St', city: 'San Francisco' } });

test('search preserves names and coordinates and prefers nearby results', async t => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('q'), 'park');
    assert.ok(parsed.searchParams.has('viewbox'));
    assert.ok(init.headers['User-Agent']);
    assert.ok(init.signal instanceof AbortSignal);
    return Response.json([place('Far park', 38, -123), place('Nearby park', 37.775, -122.42)]);
  });
  const hits = await searchPlaces('park', [37.7749, -122.4194]);
  assert.equal(hits[0].name, 'Nearby park');
  assert.equal(hits[0].latitude, 37.775);
  assert.equal(hits[0].detail, 'Hayes St, San Francisco');
});

test('empty search is distinct from a provider failure', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json([]));
  assert.deepEqual(await searchPlaces('no match'), []);
  fetch.mock.mockImplementation(async () => new Response('rate limited', { status: 429 }));
  await assert.rejects(searchPlaces('park'), /429/);
});

test('reverse lookup uses the place name, then street, and handles uncharted spots', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json(place('A park', 1, 2)));
  assert.equal(await nameSpot(1, 2), 'A park');
  fetch.mock.mockImplementation(async () => Response.json({ address: { road: 'Hayes St' } }));
  assert.equal(await nameSpot(1, 2), 'Hayes St');
  fetch.mock.mockImplementation(async () => Response.json({ error: 'Unable to geocode' }));
  assert.equal(await nameSpot(1, 2), null);
});

test('upstream timeouts abort instead of leaving requests hanging', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason));
  }));
  const result = assert.rejects(searchPlaces('park'), { name: 'AbortError' });
  t.mock.timers.tick(6000);
  await result;
});
