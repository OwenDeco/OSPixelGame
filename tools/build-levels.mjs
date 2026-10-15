// Builds the level JSON files from a small layout DSL so rows always line up.
// Usage: node game/tools/build-levels.mjs
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROWS = 15;
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'levels');

function makeLevel(width) {
  const g = Array.from({ length: ROWS }, () => Array(width).fill('.'));
  return {
    set(x, y, c) { if (x >= 0 && x < width && y >= 0 && y < ROWS) g[y][x] = c; },
    str(x, y, s) { [...s].forEach((c, i) => { if (c !== ' ') this.set(x + i, y, c); }); },
    ground(x0, x1, top = 13) { for (let x = x0; x <= x1; x++) for (let y = top; y < ROWS; y++) this.set(x, y, 'G'); },
    col(x, y0, y1, c) { for (let y = y0; y <= y1; y++) this.set(x, y, c); },
    stairsUp(x, n, base = 12) { for (let i = 0; i < n; i++) this.col(x + i, base - i, base, 'X'); },
    stairsDown(x, n, base = 12) { for (let i = 0; i < n; i++) this.col(x + i, base - (n - 1 - i), base, 'X'); },
    flag(x, base = 12) { this.set(x, base, 'X'); this.col(x, 3, base - 1, '|'); },
    rows() { return g.map(r => r.join('')); },
  };
}

// Legend: G ground, B brick, ? coin block, * 1UP block, X hard block, I pipe, = one-way platform,
// ^ spikes, o coin, | flag pole, P player start, E walker, S spiky, F flyer,
// decor (non-solid): p q plants, t tree, c cactus, m mushroom, s sign, D door
function level1() {
  const L = makeLevel(200);
  L.ground(0, 68); L.ground(72, 108); L.ground(112, 150); L.ground(154, 199);
  L.set(3, 12, 'P'); L.set(6, 12, 's');
  for (const x of [9, 31, 61, 95, 126, 158]) L.set(x, 12, 'p');
  for (const x of [12, 66, 90, 121, 177]) L.set(x, 12, 't');
  for (const x of [35, 101, 160]) L.set(x, 12, 'm');

  L.set(16, 9, '?');
  L.str(20, 9, 'B?B*B');
  L.set(22, 5, '?');
  L.col(28, 11, 12, 'I'); L.col(38, 10, 12, 'I'); L.col(46, 9, 12, 'I'); L.col(57, 9, 12, 'I');
  for (const x of [24, 41, 50, 52]) L.set(x, 12, 'E');
  L.str(31, 8, 'ooo');
  L.set(68, 10, 'o'); L.set(70, 8, 'o'); L.set(72, 10, 'o');

  L.str(76, 9, '=====');
  L.str(76, 7, 'ooooo');
  L.str(83, 9, 'B?B');
  L.str(85, 5, 'BBBBBBBB');
  for (const x of [87, 89]) L.set(x, 12, 'E');
  L.str(96, 5, 'BBB?');
  L.set(99, 9, 'B');
  L.str(103, 9, '?'); L.str(106, 9, '?'); L.str(106, 5, '?');
  L.set(109, 9, 'o'); L.set(110, 8, 'o'); L.set(111, 9, 'o');

  for (const x of [118, 120]) L.set(x, 12, 'E');
  L.str(117, 9, 'B?B');
  L.set(125, 7, 'F');
  L.str(128, 5, 'BBB');
  L.str(127, 9, 'oooo');

  L.stairsUp(134, 4); L.stairsDown(139, 4);
  L.stairsUp(145, 4); L.col(149, 9, 12, 'X'); L.col(150, 9, 12, 'X');
  L.stairsDown(154, 4);
  L.set(152, 6, 'o'); L.set(153, 6, 'o');

  for (const x of [162, 164]) L.set(x, 12, 'E');
  L.str(160, 9, 'BB?B');
  L.stairsUp(166, 8); L.col(174, 5, 12, 'X');
  L.flag(183);
  L.set(190, 12, 'D');
  return { name: 'Green Hills', theme: 'green', time: 300, rows: L.rows() };
}

function level2() {
  const L = makeLevel(220);
  L.ground(0, 30); L.ground(34, 62); L.ground(66, 72, 11); L.ground(76, 112);
  L.ground(118, 124, 10); L.ground(128, 134, 12); L.ground(138, 170); L.ground(175, 219);
  L.set(2, 12, 'P'); L.set(5, 12, 's');
  for (const x of [8, 26, 44, 100, 150, 190]) L.set(x, 12, 'c');
  for (const x of [14, 58, 160, 205]) L.set(x, 12, 'q');

  L.str(12, 9, '?B?');
  L.set(13, 5, '*');
  L.set(20, 12, 'S');
  L.str(24, 9, 'oooo');
  L.set(32, 9, 'o');
  L.col(40, 10, 12, 'I'); L.col(48, 9, 12, 'I');
  L.set(44, 12, 'E'); L.set(52, 12, 'S'); L.set(55, 8, 'F');
  L.str(52, 9, 'BB?BB');

  L.set(64, 8, 'o'); L.set(74, 8, 'o');
  L.str(67, 7, 'ooooo');
  L.set(70, 10, 'E');

  L.str(86, 12, '^^^^^^');
  L.str(85, 9, '========');
  L.str(86, 7, 'oooooo');
  L.set(88, 5, 'F');
  L.set(98, 12, 'S'); L.set(102, 12, 'E'); L.set(104, 12, 'E');
  L.str(98, 9, '?BB?');
  L.str(100, 5, 'B*B');

  L.str(114, 8, '===');
  L.str(114, 6, 'ooo');
  L.set(121, 9, 'E');
  L.str(126, 7, '==');
  L.set(131, 11, 'S');
  L.str(135, 8, '===');
  L.set(127, 5, 'F');

  L.stairsUp(142, 3);
  L.str(146, 12, '^^^^');
  L.stairsDown(150, 3);
  L.str(145, 7, '======');
  L.str(146, 5, 'oooo');
  L.set(158, 12, 'S'); L.set(162, 12, 'E'); L.set(164, 12, 'E'); L.set(166, 8, 'F');
  L.str(158, 9, 'B?B?B');

  L.set(171, 9, 'o'); L.set(172, 8, 'o'); L.set(173, 8, 'o'); L.set(174, 9, 'o');
  L.stairsUp(180, 8); L.col(188, 5, 12, 'X');
  L.flag(197);
  L.set(204, 12, 'D');
  return { name: 'Sunset Desert', theme: 'desert', time: 300, rows: L.rows() };
}

mkdirSync(outDir, { recursive: true });
for (const [file, lvl] of [['level1.json', level1()], ['level2.json', level2()]]) {
  writeFileSync(join(outDir, file), JSON.stringify(lvl, null, 1));
  console.log(file, lvl.rows[0].length, 'cols');
}
