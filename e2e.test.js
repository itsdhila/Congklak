// Two simulated players play a full game over HTTP + SSE against a real server.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.PORT = '3917';
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'congklak-'));
const server = require('./server');
const base = 'http://localhost:3917';

const post = async (p, body) => {
  const r = await fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
};

async function listen(room, pid, onState) {
  const r = await fetch(`${base}/api/events?room=${room}&pid=${pid}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  (async () => {
    let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buf += dec.decode(value);
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0) {
        const chunk = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (chunk.startsWith('data: ')) onState(JSON.parse(chunk.slice(6)));
      }
    }
  })().catch(() => {});
  return () => reader.cancel();
}

test('two players play a full game and the rankings update', async () => {
  const A = 'player-aaaaaaaa', B = 'player-bbbbbbbb', C = 'player-cccccccc';
  const { body: created } = await post('/api/create', { pid: A, name: 'Siti' });
  const room = created.room;
  assert.match(room, /^[A-Z0-9]{4}$/);

  assert.strictEqual((await post('/api/join', { pid: B, room, name: 'siti' })).status, 409); // same name
  assert.strictEqual((await post('/api/join', { pid: B, room, name: 'Budi' })).status, 200);
  assert.strictEqual((await post('/api/join', { pid: C, room, name: 'Extra' })).status, 409); // full

  const states = {};
  const stops = [];
  stops.push(await listen(room, A, (s) => (states.A = s)));
  stops.push(await listen(room, B, (s) => (states.B = s)));
  await new Promise((r) => setTimeout(r, 200));
  assert.strictEqual(states.A.you, 0);
  assert.strictEqual(states.B.you, 1);
  assert.strictEqual(states.A.status, 'playing');

  // wrong turn is refused
  assert.strictEqual((await post('/api/move', { pid: B, room, hole: 8 })).status, 409);

  const pids = [A, B];
  for (let n = 0; n < 3000 && states.A.status === 'playing'; n++) {
    const s = states.A;
    const legal = [];
    for (let i = 0; i < 7; i++) if (s.board[s.turn * 8 + i] > 0) legal.push(s.turn * 8 + i);
    const r = await post('/api/move', { pid: pids[s.turn], room, hole: legal[0] });
    assert.strictEqual(r.status, 200);
    await new Promise((r) => setTimeout(r, 3));
  }
  assert.strictEqual(states.A.status, 'over');
  assert.strictEqual(states.A.board[7] + states.A.board[15], 98);

  const rank = await (await fetch(base + '/api/leaderboard')).json();
  assert.strictEqual(rank.length, 2);
  assert.strictEqual(rank.reduce((a, r) => a + r.played, 0), 2);
  assert.strictEqual(rank.reduce((a, r) => a + r.seeds, 0), 98);

  // rematch needs both players, and swaps who starts
  await post('/api/rematch', { pid: A, room });
  assert.strictEqual(states.A.status, 'over');
  await post('/api/rematch', { pid: B, room });
  await new Promise((r) => setTimeout(r, 100));
  assert.strictEqual(states.A.status, 'playing');
  assert.strictEqual(states.A.turn, 1);

  stops.forEach((s) => s());
  server.closeAllConnections();
  server.close();
});
