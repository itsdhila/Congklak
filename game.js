// Congklak rules engine (pure functions, no I/O).
//
// Board: 16 positions, counter-clockwise.
//   0..6   player 0's holes     7  player 0's store
//   8..14  player 1's holes     15 player 1's store
// Opposite of hole i is 14 - i.

const HOLES = 7;
const SEEDS = 7;

function newBoard() {
  const b = Array(16).fill(SEEDS);
  b[7] = 0;
  b[15] = 0;
  return b;
}

const storeOf = (p) => p * 8 + 7;
const ownerOf = (pos) => Math.floor(pos / 8);
const sideTotal = (b, p) => {
  let t = 0;
  for (let i = 0; i < HOLES; i++) t += b[p * 8 + i];
  return t;
};

function isLegal(board, player, hole) {
  return Number.isInteger(hole) && hole >= player * 8 && hole < player * 8 + HOLES && board[hole] > 0;
}

// Play one turn. Returns { board, frames, next, over, captured }.
// frames: snapshots for animation: { board, hand, pos, note }.
function play(board, player, hole) {
  if (!isLegal(board, player, hole)) throw new Error('illegal move');
  const b = board.slice();
  const frames = [];
  const myStore = storeOf(player);
  const skip = storeOf(1 - player); // never drop a seed in the opponent's store
  let hand = b[hole];
  b[hole] = 0;
  let pos = hole;
  let extra = false;
  let captured = 0;
  frames.push({ board: b.slice(), hand, pos, note: 'pick' });

  for (let laps = 0; laps < 200; laps++) {
    while (hand > 0) {
      pos = (pos + 1) % 16;
      if (pos === skip) continue;
      b[pos]++;
      hand--;
      frames.push({ board: b.slice(), hand, pos });
    }
    if (pos === myStore) {
      extra = true;
      frames[frames.length - 1].note = 'store';
      break;
    }
    if (b[pos] > 1) {
      // Landed in an occupied hole: pick everything up and keep sowing.
      hand = b[pos];
      b[pos] = 0;
      frames.push({ board: b.slice(), hand, pos, note: 'pick' });
      continue;
    }
    // Landed in an empty hole.
    if (ownerOf(pos) === player) {
      const opp = 14 - pos;
      if (b[opp] > 0) {
        captured = b[opp] + 1;
        b[myStore] += captured;
        b[opp] = 0;
        b[pos] = 0;
        frames.push({ board: b.slice(), hand: 0, pos, note: 'capture' });
      }
    }
    break;
  }

  let next = extra ? player : 1 - player;
  let over = false;
  // The player to move has nothing left: game ends, the other side keeps its seeds.
  if (sideTotal(b, next) === 0) {
    over = true;
    const other = 1 - next;
    for (let i = 0; i < HOLES; i++) {
      b[storeOf(other)] += b[other * 8 + i];
      b[other * 8 + i] = 0;
    }
  }
  return { board: b, frames, next, over, captured, extra };
}

function winnerOf(board) {
  const a = board[7];
  const c = board[15];
  return a === c ? -1 : a > c ? 0 : 1; // -1 = draw
}

module.exports = { newBoard, play, isLegal, winnerOf, storeOf, sideTotal, HOLES };
