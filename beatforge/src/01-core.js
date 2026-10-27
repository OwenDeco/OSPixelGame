/* ===================== 01-core: constants, sanitizing, music theory, presets ===================== */
var BF_VERSION = '1.0.1';
var KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
var FLATS = { DB: 'C#', EB: 'D#', GB: 'F#', AB: 'G#', BB: 'A#', CB: 'B', FB: 'E' };
var SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pentatonic: [0, 3, 5, 7, 10],
  blues: [0, 3, 5, 6, 7, 10]
};
var SCALE_NAMES = ['major', 'minor', 'dorian', 'pentatonic', 'blues'];
var KITS = ['808', 'acoustic', 'lofi', 'electro'];
var BASS_SOUNDS = ['sub', 'pluck', 'wobble'];
var CHORD_SOUNDS = ['pad', 'keys', 'strings'];
var MELODY_SOUNDS = ['lead', 'bell', 'flute'];
var VOICE_MODES = ['none', 'hum', 'ooh', 'aah', 'lyrics', 'singer'];
var VOICE_ENGINES = ['auto', 'azure', 'kokoro', 'browser'];
var VISUALS = ['neon', 'sunset', 'ocean', 'galaxy'];
var DRUM_ROWS = ['kick', 'snare', 'hat', 'clap', 'perc'];
var MAX_SPEC = 20000;
var DEFAULT_VOICE_NAME = 'en-US-AriaNeural';
var AZURE_VOICES = [['en-US-AriaNeural', 'Aria'], ['en-US-JennyNeural', 'Jenny'], ['en-US-GuyNeural', 'Guy'], ['en-US-DavisNeural', 'Davis'], ['en-US-SaraNeural', 'Sara']];
var KOKORO_VOICES = [['af_heart', 'Heart'], ['af_bella', 'Bella'], ['am_michael', 'Michael'], ['bm_george', 'George (UK)']];
var VOCALISE = ['Ooh, la la la', 'Oh yeah, yeah, yeah', 'La da di da', 'Mmm, oh oh oh'];

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function toNum(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && v.length < 32 && v.trim() !== '') return Number(v);
  return NaN;
}
function num(v, lo, hi, def) { var n = toNum(v); if (!isFinite(n)) return def; return n < lo ? lo : (n > hi ? hi : n); }
function int(v, lo, hi, def) { return Math.round(num(v, lo, hi, def)); }
function r2(n) { return Math.round(n * 100) / 100; }
function lc(v) { return typeof v === 'string' ? v.trim().toLowerCase() : v; }
function oneOf(v, list, def) { return (typeof v === 'string' && list.indexOf(v) >= 0) ? v : def; }
function bool(v, def) {
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === 0) return !!v;
  if (v === 'true') return true;
  if (v === 'false') return false;
  return def;
}
function cleanText(v, max, multiline) {
  if (typeof v !== 'string') return '';
  var s = v.slice(0, max * 4)
    .replace(/\r\n?/g, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F-\u009F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g, '');
  s = multiline ? s.replace(/\n{3,}/g, '\n\n') : s.replace(/\n+/g, ' ');
  return s.slice(0, max);
}
function normKey(v) {
  if (typeof v !== 'string') return null;
  var s = v.trim().replace('♯', '#').replace('♭', 'b');
  if (!s || s.length > 3) return null;
  var up = s.charAt(0).toUpperCase() + s.slice(1);
  if (KEYS.indexOf(up) >= 0) return up;
  return FLATS[s.toUpperCase()] || null;
}
function normVoiceName(v, def) {
  if (typeof v !== 'string') return def;
  var s = v.trim().slice(0, 60);
  return /^[A-Za-z0-9_-]{1,60}$/.test(s) ? s : def;
}
function arrN(a, n, lo, hi, def, pad) {
  if (!Array.isArray(a)) return def.slice();
  var out = [];
  for (var i = 0; i < n; i++) out.push(i < a.length ? int(a[i], lo, hi, pad) : pad);
  return out;
}
function zeros(n) { var o = []; for (var i = 0; i < n; i++) o.push(0); return o; }
function P(s) { var o = []; for (var i = 0; i < 16; i++) o.push(s.charAt(i) === 'x' ? 1 : 0); return o; }

/* Sanitize any (untrusted) object into a valid v1 spec. Missing fields come from `base`. */
function sanitizeSpec(raw, base) {
  base = base || defaultSpec();
  var s = isObj(raw) ? raw : {};
  function sub(k) { return isObj(s[k]) ? s[k] : {}; }
  var d = sub('drums'), b = sub('bass'), c = sub('chords'), m = sub('melody'), v = sub('voice'), fx = sub('fx');
  var bd = base.drums, bb = base.bass, bc = base.chords, bm = base.melody, bv = base.voice, bf = base.fx;
  var name = s.name === undefined ? base.name : (cleanText(s.name, 40, false).trim() || 'Untitled beat');
  var out = {
    version: 1,
    name: name,
    bpm: int(s.bpm, 60, 180, base.bpm),
    key: normKey(s.key) || base.key,
    scale: oneOf(lc(s.scale), SCALE_NAMES, base.scale),
    swing: r2(num(s.swing, 0, 0.5, base.swing)),
    visual: oneOf(lc(s.visual), VISUALS, base.visual),
    fx: {
      reverb: r2(num(fx.reverb, 0, 1, bf.reverb)),
      delay: r2(num(fx.delay, 0, 1, bf.delay)),
      lofi: r2(num(fx.lofi, 0, 1, bf.lofi))
    },
    drums: {
      on: bool(d.on, bd.on),
      kit: oneOf(lc(d.kit), KITS, bd.kit),
      kick: arrN(d.kick, 16, 0, 1, bd.kick, 0),
      snare: arrN(d.snare, 16, 0, 1, bd.snare, 0),
      hat: arrN(d.hat, 16, 0, 1, bd.hat, 0),
      clap: arrN(d.clap, 16, 0, 1, bd.clap, 0),
      perc: arrN(d.perc, 16, 0, 1, bd.perc, 0),
      vol: r2(num(d.vol, 0, 1, bd.vol))
    },
    bass: { on: bool(b.on, bb.on), sound: oneOf(lc(b.sound), BASS_SOUNDS, bb.sound), notes: arrN(b.notes, 16, 0, 7, bb.notes, 0), vol: r2(num(b.vol, 0, 1, bb.vol)) },
    chords: { on: bool(c.on, bc.on), sound: oneOf(lc(c.sound), CHORD_SOUNDS, bc.sound), progression: arrN(c.progression, 4, 1, 7, bc.progression, 1), vol: r2(num(c.vol, 0, 1, bc.vol)) },
    melody: { on: bool(m.on, bm.on), sound: oneOf(lc(m.sound), MELODY_SOUNDS, bm.sound), notes: arrN(m.notes, 16, 0, 14, bm.notes, 0), vol: r2(num(m.vol, 0, 1, bm.vol)) },
    voice: {
      mode: oneOf(lc(v.mode), VOICE_MODES, bv.mode),
      vol: r2(num(v.vol, 0, 1, bv.vol)),
      engine: oneOf(lc(v.engine), VOICE_ENGINES, bv.engine || 'auto'),
      voiceName: normVoiceName(v.voiceName, bv.voiceName || DEFAULT_VOICE_NAME)
    },
    lyrics: s.lyrics === undefined ? base.lyrics : cleanText(s.lyrics, 600, true)
  };
  return out;
}

/* Parse untrusted input (string or object). */
function parseSpecInput(x) {
  if (x === null || x === undefined || x === '') return { ok: false, empty: true, err: 'Empty song' };
  var str = x;
  if (typeof x === 'object') { try { str = JSON.stringify(x); } catch (e) { return { ok: false, err: 'Song data is not valid' }; } }
  if (typeof str !== 'string') return { ok: false, err: 'Song data is not valid' };
  if (str.length > MAX_SPEC) return { ok: false, err: 'Song is too large (max 20 KB)' };
  var obj;
  try { obj = JSON.parse(str); } catch (e) {
    // AI answers sometimes wrap JSON in prose or code fences: try the outermost {...}
    var a = str.indexOf('{'), z = str.lastIndexOf('}');
    if (a < 0 || z <= a) return { ok: false, err: 'Song data is not valid JSON' };
    try { obj = JSON.parse(str.slice(a, z + 1)); } catch (e2) { return { ok: false, err: 'Song data is not valid JSON' }; }
  }
  if (!isObj(obj)) return { ok: false, err: 'Song data must be a JSON object' };
  return { ok: true, obj: obj };
}

/* ---------- music theory ---------- */
function keyIdx(sp) { var i = KEYS.indexOf(sp.key); return i < 0 ? 9 : i; }
function degSemi(scale, deg) {
  var iv = SCALES[scale] || SCALES.minor, n = iv.length, i = deg - 1;
  var o = Math.floor(i / n), k = ((i % n) + n) % n;
  return iv[k] + 12 * o;
}
function midiToFreq(m) { return 440 * Math.pow(2, (m - 69) / 12); }
function midiName(m) { return KEYS[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); }
function pcName(m) { return KEYS[((m % 12) + 12) % 12]; }
function inWindow(pc, lo) { return lo + ((pc - (lo % 12)) % 12 + 12) % 12; }
function chordName(sp, deg) {
  var r = degSemi(sp.scale, deg), t = degSemi(sp.scale, deg + 2) - r, f = degSemi(sp.scale, deg + 4) - r;
  var root = KEYS[(keyIdx(sp) + r) % 12];
  if (t === 3 && f === 6) return root + 'dim';
  if (t === 3) return root + 'm';
  if (t === 4) return root;
  if (t === 5) return root + 'sus4';
  if (t === 2) return root + 'sus2';
  return root + '5';
}
function chordMidis(sp, deg, seventh) {
  var ki = keyIdx(sp), out = [], seen = {};
  var degs = seventh ? [deg, deg + 2, deg + 4, deg + 6] : [deg, deg + 2, deg + 4];
  for (var i = 0; i < degs.length; i++) {
    var pc = (ki + degSemi(sp.scale, degs[i])) % 12;
    if (seen[pc]) continue; seen[pc] = 1;
    out.push(inWindow(pc, 52));
  }
  return out.sort(function (a, b) { return a - b; });
}
function bassMidi(sp, chordDeg, b) {
  var semi = degSemi(sp.scale, chordDeg + b - 1);
  semi = ((semi % 12) + 12) % 12;
  var ki = keyIdx(sp);
  return 33 + ((ki - 9 + 12) % 12) + semi;
}
function melodyMidi(sp, d) {
  var ki = keyIdx(sp), base = 60 + ki;
  if (ki > 5) base -= 12;
  var m = base + degSemi(sp.scale, d);
  while (m > 86) m -= 12;
  return m;
}
function noteLen(arr, step, cap) {
  for (var k = 1; k < cap; k++) if (arr[(step + k) % 16]) return k;
  return cap;
}
function hasNotes(a) { for (var i = 0; i < a.length; i++) if (a[i]) return true; return false; }
var VOICE_PLAN = [{ s: 0, len: 6, t: 2 }, { s: 6, len: 2, t: 1 }, { s: 8, len: 8, t: -1 }];
/* Note the vocal (hum/ooh/aah or singer target) sings at a step: follows melody if on, else chord tones. */
function voiceNote(sp, bar, step) {
  if (sp.melody.on && hasNotes(sp.melody.notes)) {
    var mn = sp.melody.notes[step];
    if (!mn) return null;
    var m = melodyMidi(sp, mn);
    while (m > 72) m -= 12;
    while (m < 52) m += 12;
    return { m: m, len: noteLen(sp.melody.notes, step, 6) };
  }
  for (var i = 0; i < VOICE_PLAN.length; i++) {
    var p = VOICE_PLAN[i];
    if (p.s !== step) continue;
    var deg = sp.chords.progression[bar];
    var t = p.t >= 0 ? p.t : (bar % 2 ? 0 : 1);
    var pc = (keyIdx(sp) + degSemi(sp.scale, deg + 2 * t)) % 12;
    return { m: inWindow(pc, 55), len: p.len };
  }
  return null;
}
/* 16 target midis (carried forward) for the singer's auto-tune in a bar. */
function voiceTargets(sp, bar) {
  var out = [], cur = null;
  for (var s = 0; s < 16; s++) { var v = voiceNote(sp, bar, s); if (v) cur = v.m; out.push(cur); }
  var first = null;
  for (s = 0; s < 16; s++) if (out[s] != null) { first = out[s]; break; }
  if (first == null) first = inWindow((keyIdx(sp) + degSemi(sp.scale, sp.chords.progression[bar])) % 12, 55);
  for (s = 0; s < 16 && out[s] == null; s++) out[s] = first;
  return out;
}
function lyricLines(sp) {
  return sp.lyrics.split('\n').map(function (l) { return l.trim(); }).filter(function (l) { return l.length > 0; }).slice(0, 16);
}
function singerLines(sp) {
  var l = lyricLines(sp).slice(0, 8).map(function (x) { return x.slice(0, 120); });
  return l.length ? l : VOCALISE.slice();
}

/* ---------- random generators ---------- */
function rand(n) { return Math.floor(Math.random() * n); }
function pick(a) { return a[rand(a.length)]; }
function chance(p) { return Math.random() < p; }
var DRUM_STYLES = {
  lofi: { kick: ['x.....x...x.....', 'x......x..x..x..', 'x.....x.x.......'], snare: ['....x.......x...', '....x.......x..x'], hat: ['x.x.x.x.x.x.x.x.', 'x.xxx.x.x.xxx.x.'], clap: ['................'], perc: ['.......x.......x', '...x.......x....'] },
  boombap: { kick: ['x......x..x.....', 'x.x....x..x..x..', 'x.......x.x.....'], snare: ['....x.......x...'], hat: ['x.x.x.x.x.x.x.x.', 'x.x.x.xxx.x.x.x.'], clap: ['................', '............x...'], perc: ['.......x.......x', '..x.........x...'] },
  house: { kick: ['x...x...x...x...'], snare: ['................'], hat: ['..x...x...x...x.', 'x.xxx.xxx.xxx.xx'], clap: ['....x.......x...'], perc: ['.x.....x.x......', '...x..x....x..x.'] },
  trap: { kick: ['x......x..x.....', 'x.....x...x...x.', 'x..........x..x.'], snare: ['........x.......'], hat: ['xxxxxxxxxxxxxxxx', 'x.x.x.x.xxx.x.xx', 'xx.x.x.xxxxx.x.x'], clap: ['........x.......'], perc: ['..............x.', '.......x........'] },
  ambient: { kick: ['x.........x.....', 'x...............'], snare: ['................'], hat: ['..x...x...x...x.', '................'], clap: ['............x...', '................'], perc: ['...x.....x.....x', '......x.......x.'] }
};
function styleFor(sp) {
  var k = sp.drums.kit;
  if (sp.bpm < 76) return 'ambient';
  if (k === 'lofi') return 'lofi';
  if (k === 'electro') return sp.bpm >= 110 ? 'house' : 'boombap';
  if (k === '808') return sp.bpm >= 120 ? 'trap' : pick(['boombap', 'trap']);
  return 'boombap';
}
function genDrums(style) {
  var st = DRUM_STYLES[style] || DRUM_STYLES.boombap, o = {};
  DRUM_ROWS.forEach(function (r) { o[r] = P(pick(st[r])); });
  if (style !== 'house' && chance(0.5)) o.kick[pick([3, 9, 13, 15])] = 1;
  for (var i = 0; i < 16; i++) {
    if (style !== 'trap' && chance(0.08)) o.hat[i] = o.hat[i] ? 0 : 1;
    if (chance(0.05)) o.perc[i] = o.perc[i] ? 0 : 1;
  }
  if (style === 'trap' && chance(0.6)) { var p = pick([12, 13, 14]); o.hat[p] = o.hat[p + 1] = 1; }
  return o;
}
function genBass(style, kick) {
  var n = zeros(16), i;
  if (style === 'house') { [2, 6, 10, 14].forEach(function (s) { n[s] = 1; }); if (chance(0.6)) n[pick([7, 15])] = pick([5, 3]); return n; }
  if (style === 'ambient') { n[0] = 1; if (chance(0.5)) n[8] = 5; return n; }
  for (i = 0; i < 16; i++) if (kick[i]) n[i] = (i > 0 && chance(0.25)) ? pick([5, 3, 1]) : 1;
  if (!hasNotes(n)) n[0] = 1;
  if (chance(0.45)) { var s = pick([14, 15, 7]); if (!n[s]) n[s] = pick([5, 7, 3]); }
  return n;
}
var PROGS_MAJOR = [[1, 5, 6, 4], [1, 6, 4, 5], [2, 5, 1, 6], [4, 1, 5, 6], [1, 4, 6, 5], [6, 4, 1, 5]];
var PROGS_MINOR = [[1, 6, 3, 7], [1, 4, 6, 5], [1, 7, 6, 7], [6, 7, 1, 1], [1, 4, 7, 3], [1, 6, 4, 5]];
function genChords(scale) { return (scale === 'major' ? pick(PROGS_MAJOR) : pick(PROGS_MINOR)).slice(); }
function genMelody(density) {
  var n = zeros(16), cur = pick([5, 8, 10]), tones = [1, 3, 5, 8, 10, 12], count = 0;
  for (var i = 0; i < 16; i++) {
    var p = i % 4 === 0 ? density + 0.2 : (i % 2 === 0 ? density : density * 0.45);
    if (!chance(p)) continue;
    cur = Math.max(1, Math.min(13, cur + pick([-2, -1, 1, 2, 0, -3, 3])));
    if (i % 4 === 0 && chance(0.6)) {
      var best = tones[0];
      tones.forEach(function (t) { if (Math.abs(t - cur) < Math.abs(best - cur)) best = t; });
      cur = best;
    }
    n[i] = cur; count++;
  }
  if (count < 3) { n[0] = 8; n[6] = 10; n[12] = 5; }
  return n;
}

/* ---------- presets ("vibes") ---------- */
var VIBES = [
  { id: 'lofi', label: 'Lo-fi chill', icon: '☕' },
  { id: 'hiphop', label: 'Hip-hop', icon: '🧢' },
  { id: 'house', label: 'House', icon: '🪩' },
  { id: 'trap', label: 'Trap', icon: '🔥' },
  { id: 'ambient', label: 'Ambient', icon: '🌌' },
  { id: 'drumshum', label: 'Just drums + humming', icon: '🥁' },
  { id: 'surprise', label: 'Surprise me', icon: '🎲' }
];
function mk(o) {
  var v = o.voice || {};
  return {
    version: 1, name: o.name, bpm: o.bpm, key: o.key, scale: o.scale, swing: o.swing, visual: o.visual, fx: o.fx,
    drums: o.drums, bass: o.bass, chords: o.chords, melody: o.melody,
    voice: { mode: v.mode || 'none', vol: v.vol == null ? 0.6 : v.vol, engine: 'auto', voiceName: DEFAULT_VOICE_NAME },
    lyrics: o.lyrics || ''
  };
}
function presetSpec(id) {
  switch (id) {
    case 'hiphop': return mk({
      name: 'Head Nod', bpm: 90, key: 'C', scale: 'minor', swing: 0.12, visual: 'neon', fx: { reverb: 0.2, delay: 0.12, lofi: 0.15 },
      drums: { on: true, kit: 'acoustic', kick: P('x.......x.x.....'), snare: P('....x.......x...'), hat: P('x.x.x.x.x.x.x.x.'), clap: P('............x...'), perc: P('..........x.....'), vol: 0.85 },
      bass: { on: true, sound: 'pluck', notes: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 5], vol: 0.7 },
      chords: { on: true, sound: 'keys', progression: [1, 6, 3, 7], vol: 0.45 },
      melody: { on: false, sound: 'lead', notes: [8, 0, 0, 7, 0, 0, 5, 0, 0, 0, 3, 0, 5, 0, 0, 0], vol: 0.4 }
    });
    case 'house': return mk({
      name: 'Midnight House', bpm: 124, key: 'A', scale: 'minor', swing: 0.05, visual: 'ocean', fx: { reverb: 0.3, delay: 0.25, lofi: 0 },
      drums: { on: true, kit: 'electro', kick: P('x...x...x...x...'), snare: zeros(16), hat: P('..x...x...x...x.'), clap: P('....x.......x...'), perc: P('...x..x....x..x.'), vol: 0.85 },
      bass: { on: true, sound: 'pluck', notes: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 5, 0], vol: 0.65 },
      chords: { on: true, sound: 'pad', progression: [1, 6, 4, 5], vol: 0.45 },
      melody: { on: true, sound: 'lead', notes: [8, 0, 0, 8, 0, 0, 10, 0, 0, 8, 0, 0, 12, 0, 10, 0], vol: 0.35 }
    });
    case 'trap': return mk({
      name: 'Dark Trap', bpm: 140, key: 'G', scale: 'minor', swing: 0, visual: 'galaxy', fx: { reverb: 0.25, delay: 0.2, lofi: 0 },
      drums: { on: true, kit: '808', kick: P('x......x..x.....'), snare: zeros(16), hat: P('x.x.x.x.xxx.x.xx'), clap: P('........x.......'), perc: P('..............x.'), vol: 0.85 },
      bass: { on: true, sound: 'sub', notes: [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0], vol: 0.8 },
      chords: { on: true, sound: 'strings', progression: [1, 6, 7, 6], vol: 0.35 },
      melody: { on: true, sound: 'bell', notes: [12, 0, 0, 10, 0, 0, 8, 0, 0, 0, 7, 0, 8, 0, 0, 0], vol: 0.35 }
    });
    case 'ambient': return mk({
      name: 'Ambient Drift', bpm: 70, key: 'E', scale: 'major', swing: 0, visual: 'ocean', fx: { reverb: 0.75, delay: 0.4, lofi: 0.1 },
      drums: { on: true, kit: 'lofi', kick: P('x.........x.....'), snare: zeros(16), hat: zeros(16), clap: zeros(16), perc: P('...x.....x.....x'), vol: 0.4 },
      bass: { on: true, sound: 'sub', notes: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], vol: 0.5 },
      chords: { on: true, sound: 'pad', progression: [1, 5, 6, 4], vol: 0.5 },
      melody: { on: true, sound: 'flute', notes: [10, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 9, 0, 0, 0], vol: 0.4 },
      voice: { mode: 'aah', vol: 0.45 }
    });
    case 'drumshum': return mk({
      name: 'Drums & Hum', bpm: 88, key: 'D', scale: 'minor', swing: 0.2, visual: 'neon', fx: { reverb: 0.32, delay: 0.18, lofi: 0.2 },
      drums: { on: true, kit: 'acoustic', kick: P('x......x..x.....'), snare: P('....x.......x...'), hat: P('x.x.x.xxx.x.x.x.'), clap: zeros(16), perc: P('...x.......x....'), vol: 0.85 },
      bass: { on: false, sound: 'sub', notes: [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0], vol: 0.6 },
      chords: { on: false, sound: 'pad', progression: [1, 6, 3, 7], vol: 0.4 },
      melody: { on: false, sound: 'flute', notes: zeros(16), vol: 0.4 },
      voice: { mode: 'hum', vol: 0.75 }
    });
    case 'surprise': return surpriseSpec();
    default: return mk({
      name: 'Lo-fi Chill', bpm: 82, key: 'F', scale: 'dorian', swing: 0.28, visual: 'sunset', fx: { reverb: 0.35, delay: 0.2, lofi: 0.55 },
      drums: { on: true, kit: 'lofi', kick: P('x.....x...x.....'), snare: P('....x.......x...'), hat: P('x.xxx.x.x.xxx.x.'), clap: zeros(16), perc: P('.......x.......x'), vol: 0.75 },
      bass: { on: true, sound: 'sub', notes: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 5, 0, 0, 0, 0, 0], vol: 0.7 },
      chords: { on: true, sound: 'keys', progression: [1, 4, 7, 3], vol: 0.5 },
      melody: { on: true, sound: 'bell', notes: [8, 0, 0, 0, 0, 0, 10, 0, 0, 0, 0, 0, 7, 0, 5, 0], vol: 0.4 }
    });
  }
}
function surpriseSpec() {
  var style = pick(['lofi', 'boombap', 'house', 'trap', 'ambient']);
  var bpm = { lofi: 70 + rand(18), boombap: 84 + rand(12), house: 118 + rand(10), trap: 132 + rand(16), ambient: 62 + rand(14) }[style];
  var kit = { lofi: 'lofi', boombap: pick(['acoustic', '808']), house: 'electro', trap: '808', ambient: pick(['lofi', 'acoustic']) }[style];
  var scale = pick(SCALE_NAMES), dr = genDrums(style);
  var names = ['Neon Rain', 'Velvet Static', 'Cloud Engine', 'Night Bloom', 'Glass City', 'Lucid Loop', 'Orbit Café', 'Sugar Comet'];
  return mk({
    name: pick(names), bpm: bpm, key: pick(KEYS), scale: scale, swing: style === 'house' || style === 'trap' ? 0 : r2(0.1 + Math.random() * 0.2),
    visual: pick(VISUALS), fx: { reverb: r2(0.15 + Math.random() * 0.5), delay: r2(Math.random() * 0.35), lofi: style === 'lofi' ? 0.5 : r2(Math.random() * 0.25) },
    drums: { on: true, kit: kit, kick: dr.kick, snare: dr.snare, hat: dr.hat, clap: dr.clap, perc: dr.perc, vol: 0.8 },
    bass: { on: chance(0.85), sound: pick(BASS_SOUNDS), notes: genBass(style, dr.kick), vol: 0.7 },
    chords: { on: chance(0.85), sound: pick(CHORD_SOUNDS), progression: genChords(scale), vol: 0.45 },
    melody: { on: chance(0.6), sound: pick(MELODY_SOUNDS), notes: genMelody(0.35), vol: 0.4 },
    voice: { mode: pick(['none', 'hum', 'ooh', 'aah']), vol: 0.6 }
  });
}
function defaultSpec() { return presetSpec('lofi'); }
