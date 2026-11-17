const test = require('node:test');
const assert = require('node:assert');
const { newBoard, play, isLegal, winnerOf } = require('./game');

const total = (b) => b.reduce((a, x) => a + x, 0);

test('start board has 98 seeds', () => {
  assert.strictEqual(total(newBoard()), 98);
});

test('hole 0 of 7 seeds ends in the store: extra turn', () => {
  // 7 seeds from hole 0 land in holes 1..6 and the store (position 7).
  const r = play(newBoard(), 0, 0);
  assert.strictEqual(r.board[7], 1);
  assert.strictEqual(r.next, 0);
});

test('opponent store is skipped', () => {
  const b = Array(16).fill(0);
  b[6] = 12;
  b[14] = 1;
  const r = play(b, 0, 6);
  assert.strictEqual(r.board[15], 0);
  assert.strictEqual(total(r.board), 13);
});

test('landing in an empty own hole captures the opposite hole', () => {
  const b = Array(16).fill(0);
  b[0] = 1; // lands in hole 1 (empty)
  b[13] = 5; // opposite of 1
  b[8] = 3; // so player 1 still has seeds
  const r = play(b, 0, 0);
  assert.strictEqual(r.board[7], 6);
  assert.strictEqual(r.board[13], 0);
  assert.strictEqual(r.captured, 6);
});

test('empty opposite hole: no capture, turn passes', () => {
  const b = Array(16).fill(0);
  b[0] = 1;
  b[8] = 3;
  const r = play(b, 0, 0);
  assert.strictEqual(r.board[1], 1);
  assert.strictEqual(r.next, 1);
});

test('illegal moves are rejected', () => {
  const b = newBoard();
  assert.ok(!isLegal(b, 0, 8));
  assert.ok(!isLegal(b, 0, 7));
  assert.throws(() => play(b, 1, 3));
});

test('random games always finish and conserve seeds', () => {
  for (let g = 0; g < 300; g++) {
    let board = newBoard();
    let player = g % 2;
    let moves = 0;
    for (;;) {
      const legal = [];
      for (let i = 0; i < 7; i++) if (isLegal(board, player, player * 8 + i)) legal.push(player * 8 + i);
      assert.ok(legal.length > 0, 'player to move must have a legal move');
      const r = play(board, player, legal[Math.floor(Math.random() * legal.length)]);
      assert.strictEqual(total(r.board), 98);
      board = r.board;
      player = r.next;
      if (r.over) break;
      assert.ok(++moves < 2000, 'game too long');
    }
    assert.strictEqual(board[7] + board[15], 98);
    assert.ok([-1, 0, 1].includes(winnerOf(board)));
  }
});
