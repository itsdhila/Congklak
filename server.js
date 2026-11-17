// Congklak realtime server. No dependencies: Node's http + Server-Sent Events.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { newBoard, play, isLegal, winnerOf } = require('./game');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const BOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');

// ---------- leaderboard (persisted) ----------
let board = {};
try {
  board = JSON.parse(fs.readFileSync(BOARD_FILE, 'utf8'));
} catch {
  board = {};
}
function saveBoard() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(BOARD_FILE, JSON.stringify(board, null, 2));
}
function record(name, result, seeds) {
  const key = name.toLowerCase();
  const e = (board[key] ||= { name, played: 0, wins: 0, draws: 0, losses: 0, points: 0, seeds: 0 });
  e.name = name;
  e.played++;
  e.seeds += seeds;
  if (result === 'win') { e.wins++; e.points += 3; }
  else if (result === 'draw') { e.draws++; e.points += 1; }
  else e.losses++;
}
function rankings() {
  return Object.values(board)
    .sort((a, b) => b.points - a.points || b.wins - a.wins || b.seeds - a.seeds || a.name.localeCompare(b.name))
    .map((e, i) => ({ rank: i + 1, ...e }));
}

// ---------- rooms ----------
const rooms = new Map();
const rnd = () => Math.random().toString(36).slice(2, 6).toUpperCase().replace(/[01OIL]/g, 'X');

function newRoom() {
  let code;
  do code = rnd(); while (rooms.has(code));
  const room = {
    code,
    players: [null, null], // { pid, name }
    clients: new Set(), // { res, pid }
    board: newBoard(),
    first: 0,
    turn: 0,
    status: 'waiting', // waiting | playing | over
    winner: null,
    frames: [],
    moveSeq: 0,
    lastMove: null,
    rematch: new Set(),
    touched: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

function snapshot(room, pid) {
  const you = room.players.findIndex((p) => p && p.pid === pid);
  const online = (p) => !!p && [...room.clients].some((c) => c.pid === p.pid);
  return {
    code: room.code,
    you,
    players: room.players.map((p) => (p ? { name: p.name, online: online(p) } : null)),
    board: room.board,
    turn: room.turn,
    status: room.status,
    winner: room.winner,
    frames: room.frames,
    moveSeq: room.moveSeq,
    lastMove: room.lastMove,
    rematch: room.players.map((p) => !!p && room.rematch.has(p.pid)),
  };
}
function broadcast(room) {
  room.touched = Date.now();
  for (const c of room.clients) c.res.write(`data: ${JSON.stringify(snapshot(room, c.pid))}\n\n`);
}

function startGame(room) {
  room.board = newBoard();
  room.turn = room.first;
  room.status = 'playing';
  room.winner = null;
  room.frames = [];
  room.lastMove = null;
  room.rematch.clear();
}

function finish(room) {
  room.status = 'over';
  room.winner = winnerOf(room.board);
  room.players.forEach((p, i) => {
    const result = room.winner === -1 ? 'draw' : room.winner === i ? 'win' : 'loss';
    record(p.name, result, room.board[i * 8 + 7]);
  });
  saveBoard();
}

// ---------- http ----------
const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};
const readBody = (req) =>
  new Promise((resolve) => {
    let s = '';
    req.on('data', (d) => { s += d; if (s.length > 10000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch { resolve({}); } });
  });
const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 16);
const validPid = (p) => typeof p === 'string' && /^[\w-]{8,64}$/.test(p);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(path.join(__dirname, 'public', 'index.html')));
    }
    if (req.method === 'GET' && url.pathname === '/api/leaderboard') return json(res, 200, rankings());

    if (req.method === 'GET' && url.pathname === '/api/events') {
      const room = rooms.get((url.searchParams.get('room') || '').toUpperCase());
      const pid = url.searchParams.get('pid');
      if (!room || !validPid(pid)) return json(res, 404, { error: 'Room not found' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      const client = { res, pid };
      room.clients.add(client);
      res.write(`data: ${JSON.stringify(snapshot(room, pid))}\n\n`);
      broadcast(room); // tell the other player we are online
      req.on('close', () => { room.clients.delete(client); broadcast(room); });
      return;
    }

    if (req.method === 'POST') {
      const b = await readBody(req);
      const pid = b.pid;
      if (!validPid(pid)) return json(res, 400, { error: 'Bad player id' });

      if (url.pathname === '/api/create') {
        const name = cleanName(b.name);
        if (!name) return json(res, 400, { error: 'Please enter your name' });
        const room = newRoom();
        room.players[0] = { pid, name };
        return json(res, 200, { room: room.code });
      }

      const room = rooms.get(String(b.room || '').toUpperCase());
      if (!room) return json(res, 404, { error: 'Room not found. Check the code.' });
      const me = room.players.findIndex((p) => p && p.pid === pid);

      if (url.pathname === '/api/join') {
        if (me >= 0) return json(res, 200, { room: room.code });
        const name = cleanName(b.name);
        if (!name) return json(res, 400, { error: 'Please enter your name' });
        if (room.players[1]) return json(res, 409, { error: 'This room already has two players.' });
        if (room.players[0].name.toLowerCase() === name.toLowerCase())
          return json(res, 409, { error: `"${room.players[0].name}" is already in this room. Pick a different name.` });
        room.players[1] = { pid, name };
        startGame(room);
        broadcast(room);
        return json(res, 200, { room: room.code });
      }

      if (me < 0) return json(res, 403, { error: 'You are not in this room' });

      if (url.pathname === '/api/move') {
        if (room.status !== 'playing') return json(res, 409, { error: 'Game is not running' });
        if (room.turn !== me) return json(res, 409, { error: 'Not your turn' });
        const hole = Number(b.hole);
        if (!isLegal(room.board, me, hole)) return json(res, 400, { error: 'Pick one of your own holes that has seeds' });
        const r = play(room.board, me, hole);
        room.board = r.board;
        room.turn = r.next;
        room.frames = r.frames;
        room.moveSeq++;
        room.lastMove = { by: me, hole, extra: r.extra, captured: r.captured };
        if (r.over) finish(room);
        broadcast(room);
        return json(res, 200, { ok: true });
      }

      if (url.pathname === '/api/rematch') {
        if (room.status !== 'over') return json(res, 409, { error: 'Game is not over' });
        room.rematch.add(pid);
        if (room.rematch.size === 2) {
          room.first = 1 - room.first;
          startGame(room);
        }
        broadcast(room);
        return json(res, 200, { ok: true });
      }
    }
    json(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e);
    json(res, 500, { error: 'Server error' });
  }
});

// keep SSE connections alive through proxies; drop idle rooms
setInterval(() => {
  for (const room of rooms.values()) {
    for (const c of room.clients) c.res.write(': ping\n\n');
    if (room.clients.size === 0 && Date.now() - room.touched > 6 * 3600 * 1000) rooms.delete(room.code);
  }
}, 20000).unref();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Congklak running.\n  This computer: http://localhost:${PORT}`);
  for (const list of Object.values(os.networkInterfaces()))
    for (const i of list || []) if (i.family === 'IPv4' && !i.internal) console.log(`  Same Wi-Fi/network: http://${i.address}:${PORT}`);
});

module.exports = server;
