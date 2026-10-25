import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseTile, serveTile } from './tiles.ts';

const request = new Request('https://game.example/api/tiles/15/5240/12666.png');
const png = (headers = {}) => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'Content-Type': 'image/png', ...headers } });

/** Replaces fetch for one test; records which upstreams were asked. */
function upstream(reply) {
  const asked = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url) => {
    asked.push(String(url));
    return reply(String(url));
  };
  return { asked, restore: () => (globalThis.fetch = real) };
}

test('only real tile addresses are accepted', () => {
  assert.deepEqual(parseTile(['15', '5240', '12666.png']), { z: 15, x: 5240, y: 12666 });
  assert.equal(parseTile(['2', '4', '1.png']), null); // x out of range at z2
  assert.equal(parseTile(['20', '1', '1.png']), null);
  assert.equal(parseTile(['15', '-1', '1.png']), null);
  assert.equal(parseTile(['15', '1']), null);
});

test('serves OSM tiles, identifying the game', async () => {
  const { asked, restore } = upstream(() => png());
  try {
    const res = await serveTile(request, 15, 5240, 12666);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('X-Tile-Source'), 'osm');
    assert.match(res.headers.get('Cache-Control'), /max-age=604800/);
    assert.equal(asked.length, 1);
  } finally {
    restore();
  }
});

test('an OSM "Access blocked" tile is swapped for Esri, not passed on', async () => {
  const { asked, restore } = upstream((url) => (url.includes('openstreetmap') ? png({ 'x-blocked': 'Access denied.' }) : png()));
  try {
    const res = await serveTile(request, 15, 5240, 12666);
    assert.equal(res.headers.get('X-Tile-Source'), 'esri');
    assert.match(asked[1], /World_Street_Map\/MapServer\/tile\/15\/12666\/5240$/);
  } finally {
    restore();
  }
});

test('falls back when OSM errors or times out, and says so when nothing works', async () => {
  let { restore } = upstream((url) => {
    if (url.includes('openstreetmap')) throw new Error('network down');
    return png();
  });
  try {
    assert.equal((await serveTile(request, 15, 5240, 12666)).headers.get('X-Tile-Source'), 'esri');
  } finally {
    restore();
  }
  ({ restore } = upstream(() => new Response('nope', { status: 503 })));
  try {
    assert.equal((await serveTile(request, 15, 5240, 12666)).status, 502);
  } finally {
    restore();
  }
});
