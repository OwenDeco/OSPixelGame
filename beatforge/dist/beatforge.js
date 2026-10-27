/*! BeatForge engine v1.0.1 | music studio + visualizer + VR | requires Tone.js 14.8.49 and three.js r128 (globals) */
(function () {
'use strict';
if (typeof window === 'undefined') return;
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
  var s = v.trim().replace('\u266f', '#').replace('\u266d', 'b');
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
  { id: 'lofi', label: 'Lo-fi chill', icon: '\u2615' },
  { id: 'hiphop', label: 'Hip-hop', icon: '\ud83e\udde2' },
  { id: 'house', label: 'House', icon: '\ud83e\udea9' },
  { id: 'trap', label: 'Trap', icon: '\ud83d\udd25' },
  { id: 'ambient', label: 'Ambient', icon: '\ud83c\udf0c' },
  { id: 'drumshum', label: 'Just drums + humming', icon: '\ud83e\udd41' },
  { id: 'surprise', label: 'Surprise me', icon: '\ud83c\udfb2' }
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
  var names = ['Neon Rain', 'Velvet Static', 'Cloud Engine', 'Night Bloom', 'Glass City', 'Lucid Loop', 'Orbit Caf\u00e9', 'Sugar Comet'];
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

/* ===================== 02-audio: Tone.js graph, instruments, sequencer ===================== */
var KIT_DEF = {
  '808': {
    kick: { pd: 0.06, oct: 7, decay: 0.9, note: 'G1', vol: 0, drive: 0.15 },
    snare: { noise: 'white', decay: 0.18, ft: 'highpass', f: 1800, body: 'E3', bodyVol: -10, vol: -6 },
    hat: { decay: 0.05, f: 8000, vol: -13 }, clap: { decay: 0.18, f: 1400, vol: -4 },
    perc: { osc: 'square', pd: 0.005, oct: 1.5, decay: 0.12, note: 'C#5', vol: -20 }
  },
  acoustic: {
    kick: { pd: 0.02, oct: 4, decay: 0.35, note: 'B1', vol: 0 },
    snare: { noise: 'white', decay: 0.22, ft: 'highpass', f: 1000, body: 'G3', bodyVol: -5, vol: -7 },
    hat: { decay: 0.035, f: 7000, vol: -13 }, clap: { decay: 0.2, f: 1200, vol: -6 },
    perc: { osc: 'triangle', pd: 0.01, oct: 2, decay: 0.06, note: 'G4', vol: -10 }
  },
  lofi: {
    kick: { pd: 0.03, oct: 5, decay: 0.45, note: 'A1', vol: -1 },
    snare: { noise: 'pink', decay: 0.25, ft: 'bandpass', f: 1800, body: 'F3', bodyVol: -8, vol: -2 },
    hat: { decay: 0.03, f: 6000, vol: -17 }, clap: { decay: 0.2, f: 1000, vol: -6 },
    perc: { osc: 'sine', pd: 0.02, oct: 3, decay: 0.08, note: 'E4', vol: -9 }
  },
  electro: {
    kick: { pd: 0.05, oct: 8, decay: 0.32, note: 'C2', vol: 0, drive: 0.3 },
    snare: { noise: 'white', decay: 0.12, ft: 'highpass', f: 2500, body: 'A3', bodyVol: -6, vol: -6 },
    hat: { decay: 0.025, f: 10000, vol: -12 }, clap: { decay: 0.14, f: 1600, vol: -3 },
    perc: { osc: 'sawtooth', pd: 0.05, oct: 5, decay: 0.1, note: 'C5', vol: -18 }
  }
};
var VOWELS = {
  hum: { f: [[270, 5, 1], [1100, 10, 0.12], [2300, 12, 0.04]], lp: 900 },
  ooh: { f: [[330, 6, 1], [850, 8, 0.45], [2400, 10, 0.12]], lp: 2600 },
  aah: { f: [[760, 6, 1], [1180, 8, 0.65], [2600, 10, 0.25]], lp: 4200 }
};

function disposeAll(list) {
  for (var i = list.length - 1; i >= 0; i--) {
    try { if (list[i] && list[i].dispose) list[i].dispose(); } catch (e) { /* ignore */ }
  }
  list.length = 0;
}

function AudioEngine(host) {
  this.host = host;          // { getSpec(), onTick(time, step, bar, events), singerBuffer(lineIdx, bar) }
  this.T = window.Tone;
  this.nodes = []; this.sets = {}; this.cur = {};
  this.built = false; this.playing = false; this.disposed = false;
  this.step = 0; this.barCount = 0; this.loopId = null; this.vp = 0; this.errLogged = false;
}
var AP = AudioEngine.prototype;

/* Call from a user gesture. */
AP.ensure = function () {
  var self = this;
  return this.T.start().then(function () { if (!self.built && !self.disposed) self.build(); return self.built; });
};

AP.build = function () {
  var T = this.T, self = this;
  function keep(n) { self.nodes.push(n); return n; }
  this.limiter = keep(new T.Limiter(-1.5)); this.limiter.toDestination();
  this.out = keep(new T.Gain(0.85)); this.out.connect(this.limiter);
  this.fft = keep(new T.Analyser('fft', 64)); this.wave = keep(new T.Analyser('waveform', 128));
  this.limiter.connect(this.fft); this.limiter.connect(this.wave);
  // lo-fi stage: amplitude quantizer (worklet-free bitcrush) + lowpass + hiss
  this.lofiFilter = keep(new T.Filter({ type: 'lowpass', frequency: 18000, Q: 0.5 })); this.lofiFilter.connect(this.out);
  this.dry = keep(new T.Gain(1)); this.wet = keep(new T.Gain(0));
  this.shaper = keep(new T.WaveShaper(function (x) { return Math.round(x * 9) / 9; }, 2048));
  this.master = keep(new T.Gain(1));
  this.master.connect(this.dry); this.master.connect(this.shaper); this.shaper.connect(this.wet);
  this.dry.connect(this.lofiFilter); this.wet.connect(this.lofiFilter);
  this.hiss = keep(new T.Noise('pink')); this.hissHP = keep(new T.Filter(3000, 'highpass')); this.hissG = keep(new T.Gain(0));
  this.hiss.connect(this.hissHP); this.hissHP.connect(this.hissG); this.hissG.connect(this.master); this.hiss.start();
  // send effects
  this.reverb = keep(new T.Reverb({ decay: 3.4, preDelay: 0.02, wet: 1 })); this.reverb.connect(this.master);
  this.delay = keep(new T.FeedbackDelay({ delayTime: 0.3, feedback: 0.3, wet: 1 })); this.delay.connect(this.master);
  this.delayToRev = keep(new T.Gain(0.3)); this.delay.connect(this.delayToRev); this.delayToRev.connect(this.reverb);
  this.musicBus = keep(new T.Gain(1)); this.drumBus = keep(new T.Gain(1));
  this.musicBus.connect(this.master); this.drumBus.connect(this.master);
  this.revM = keep(new T.Gain(0)); this.revD = keep(new T.Gain(0)); this.del = keep(new T.Gain(0));
  this.musicBus.connect(this.revM); this.revM.connect(this.reverb);
  this.drumBus.connect(this.revD); this.revD.connect(this.reverb);
  this.musicBus.connect(this.del); this.del.connect(this.delay);
  this.g = {};
  ['drums', 'bass', 'chords', 'melody', 'voice', 'singer'].forEach(function (k) {
    self.g[k] = keep(new T.Gain(0.6));
    self.g[k].connect(k === 'drums' ? self.drumBus : self.musicBus);
  });
  // singer chain: players -> chorus -> slap delay -> singer gain
  this.sChorus = keep(new T.Chorus({ frequency: 1.5, delayTime: 3.5, depth: 0.5, wet: 0.35 })); this.sChorus.start();
  this.sSlap = keep(new T.FeedbackDelay({ delayTime: 0.12, feedback: 0.15, wet: 0.18 }));
  this.sChorus.connect(this.sSlap); this.sSlap.connect(this.g.singer);
  this.players = [keep(new T.Player()), keep(new T.Player())];
  this.players.forEach(function (p) { p.fadeIn = 0.01; p.fadeOut = 0.06; p.connect(self.sChorus); });
  this.built = true;
  this.sync(this.host.getSpec(), true);
  this.loopId = T.Transport.scheduleRepeat(function (time) { self.tick(time); }, '16n', 0);
};

AP.makeSet = function (name, v) {
  var T = this.T, old = this.sets[name];
  if (old) disposeAll(old.nodes);
  var set = { nodes: [] }, out = this.g[name];
  function k(n) { set.nodes.push(n); return n; }
  if (name === 'drums') {
    var K = KIT_DEF[v] || KIT_DEF['808'];
    set.kick = k(new T.MembraneSynth({ pitchDecay: K.kick.pd, octaves: K.kick.oct, oscillator: { type: 'sine' }, envelope: { attack: 0.001, decay: K.kick.decay, sustain: 0, release: 0.1 } }));
    set.kick.volume.value = K.kick.vol; set.kickNote = K.kick.note;
    if (K.kick.drive) { var dist = k(new T.Distortion(K.kick.drive)); set.kick.connect(dist); dist.connect(out); } else set.kick.connect(out);
    set.snare = k(new T.NoiseSynth({ noise: { type: K.snare.noise }, envelope: { attack: 0.001, decay: K.snare.decay, sustain: 0, release: 0.05 } }));
    set.snare.volume.value = K.snare.vol;
    var sf = k(new T.Filter({ type: K.snare.ft, frequency: K.snare.f, Q: 0.8 })); set.snare.connect(sf); sf.connect(out);
    set.body = k(new T.MembraneSynth({ pitchDecay: 0.015, octaves: 2, envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 } }));
    set.body.volume.value = K.snare.bodyVol; set.body.connect(out); set.bodyNote = K.snare.body;
    set.hat = k(new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: K.hat.decay, sustain: 0, release: 0.02 } }));
    set.hat.volume.value = K.hat.vol;
    var hf = k(new T.Filter({ type: 'highpass', frequency: K.hat.f, Q: 0.7 })); set.hat.connect(hf); hf.connect(out);
    set.clap = k(new T.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: K.clap.decay, sustain: 0, release: 0.05 } }));
    set.clap.volume.value = K.clap.vol;
    var cf = k(new T.Filter({ type: 'bandpass', frequency: K.clap.f, Q: 1.2 })); set.clap.connect(cf); cf.connect(out);
    set.perc = k(new T.MembraneSynth({ pitchDecay: K.perc.pd, octaves: K.perc.oct, oscillator: { type: K.perc.osc }, envelope: { attack: 0.001, decay: K.perc.decay, sustain: 0, release: 0.05 } }));
    set.perc.volume.value = K.perc.vol; set.percNote = K.perc.note;
    var pf = k(new T.Filter({ type: 'highpass', frequency: 250 })); set.perc.connect(pf); pf.connect(out);
  } else if (name === 'bass') {
    if (v === 'pluck') {
      set.syn = k(new T.MonoSynth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.002, decay: 0.25, sustain: 0.15, release: 0.2 }, filter: { type: 'lowpass', Q: 4 }, filterEnvelope: { attack: 0.001, decay: 0.18, sustain: 0.05, release: 0.2, baseFrequency: 120, octaves: 3.5 } }));
      set.syn.volume.value = -7; set.syn.connect(out);
    } else if (v === 'wobble') {
      set.syn = k(new T.MonoSynth({ oscillator: { type: 'fatsawtooth', count: 2, spread: 20 }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.9, release: 0.2 }, filter: { type: 'lowpass', Q: 1 }, filterEnvelope: { attack: 0.01, decay: 0.1, sustain: 1, release: 0.2, baseFrequency: 3000, octaves: 0 } }));
      set.syn.volume.value = -9;
      set.auto = k(new T.AutoFilter({ frequency: 4, baseFrequency: 120, octaves: 4.5, depth: 1, filter: { type: 'lowpass', rolloff: -24, Q: 4 } }));
      set.auto.start(); set.syn.connect(set.auto); set.auto.connect(out);
    } else {
      set.syn = k(new T.MonoSynth({ oscillator: { type: 'sine' }, envelope: { attack: 0.005, decay: 0.5, sustain: 0.6, release: 0.3 }, filter: { type: 'lowpass', Q: 0.5 }, filterEnvelope: { attack: 0.001, decay: 0.2, sustain: 1, release: 0.3, baseFrequency: 400, octaves: 1.5 } }));
      set.syn.volume.value = -2;
      var d2 = k(new T.Distortion(0.3)); set.syn.connect(d2); d2.connect(out);
    }
  } else if (name === 'chords') {
    if (v === 'keys') {
      set.syn = k(new T.PolySynth(T.FMSynth, { harmonicity: 2, modulationIndex: 1.6, oscillator: { type: 'sine' }, modulation: { type: 'sine' }, envelope: { attack: 0.005, decay: 1.4, sustain: 0.25, release: 1.2 }, modulationEnvelope: { attack: 0.002, decay: 0.6, sustain: 0.1, release: 0.5 } }));
      set.syn.volume.value = -11;
      var trem = k(new T.Tremolo({ frequency: 3, depth: 0.25 })); trem.start();
      set.syn.connect(trem); trem.connect(out);
    } else if (v === 'strings') {
      set.syn = k(new T.PolySynth(T.Synth, { oscillator: { type: 'fatsawtooth', count: 2, spread: 12 }, envelope: { attack: 0.35, decay: 0.3, sustain: 0.9, release: 1.5 } }));
      set.syn.volume.value = -17;
      var sl = k(new T.Filter({ type: 'lowpass', frequency: 2600, Q: 0.5 })); set.syn.connect(sl); sl.connect(out);
    } else {
      set.syn = k(new T.PolySynth(T.Synth, { oscillator: { type: 'fatsawtooth', count: 3, spread: 24 }, envelope: { attack: 0.6, decay: 0.5, sustain: 0.8, release: 2.2 } }));
      set.syn.volume.value = -17;
      var pl = k(new T.Filter({ type: 'lowpass', frequency: 1400, Q: 0.6 })); set.syn.connect(pl); pl.connect(out);
    }
    try { set.syn.maxPolyphony = 48; } catch (e) { /* older Tone */ }
  } else if (name === 'melody') {
    if (v === 'bell') {
      set.syn = k(new T.PolySynth(T.FMSynth, { harmonicity: 3.01, modulationIndex: 12, envelope: { attack: 0.001, decay: 1.2, sustain: 0, release: 1.2 }, modulationEnvelope: { attack: 0.001, decay: 0.5, sustain: 0, release: 0.5 } }));
      set.syn.volume.value = -15; set.syn.connect(out);
    } else if (v === 'flute') {
      set.syn = k(new T.Synth({ oscillator: { type: 'triangle' }, envelope: { attack: 0.06, decay: 0.1, sustain: 0.8, release: 0.25 } }));
      set.syn.volume.value = -7;
      var vib = k(new T.Vibrato({ frequency: 5, depth: 0.08 })); set.syn.connect(vib); vib.connect(out);
    } else {
      set.syn = k(new T.MonoSynth({ portamento: 0.02, oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.2 }, filterEnvelope: { attack: 0.005, decay: 0.2, sustain: 0.4, release: 0.3, baseFrequency: 600, octaves: 2.5 } }));
      set.syn.volume.value = -13; set.syn.connect(out);
    }
  } else if (name === 'voice') {
    set.src = k(new T.Synth({ portamento: 0.06, oscillator: { type: 'fatsawtooth', count: 2, spread: 14 }, envelope: { attack: 0.12, decay: 0.2, sustain: 0.85, release: 0.5 } }));
    set.src.volume.value = -4;
    set.vib = k(new T.Vibrato({ frequency: 5.2, depth: 0.12 }));
    set.lp = k(new T.Filter({ type: 'lowpass', frequency: 2600, Q: 0.7 }));
    set.mk = k(new T.Gain(2.2));
    set.src.connect(set.vib);
    set.f = []; set.fg = [];
    for (var i = 0; i < 3; i++) {
      var f = k(new T.Filter({ type: 'bandpass', frequency: 500, Q: 6 })), g = k(new T.Gain(1));
      set.vib.connect(f); f.connect(g); g.connect(set.lp);
      set.f.push(f); set.fg.push(g);
    }
    set.lp.connect(set.mk); set.mk.connect(out);
  }
  this.sets[name] = set;
  return set;
};

AP.setVowel = function (mode) {
  var s = this.sets.voice;
  if (!s) return;
  var V = VOWELS[mode] || VOWELS.hum;
  for (var i = 0; i < 3; i++) {
    s.f[i].frequency.rampTo(V.f[i][0], 0.1);
    s.f[i].Q.value = V.f[i][1];
    s.fg[i].gain.rampTo(V.f[i][2], 0.1);
  }
  s.lp.frequency.rampTo(V.lp, 0.1);
};

AP.sync = function (sp, force) {
  if (!this.built) return;
  var T = this.T, c = this.cur;
  if (force || c.kit !== sp.drums.kit) { this.makeSet('drums', sp.drums.kit); c.kit = sp.drums.kit; }
  if (force || c.bass !== sp.bass.sound) { this.makeSet('bass', sp.bass.sound); c.bass = sp.bass.sound; }
  if (force || c.chords !== sp.chords.sound) { this.makeSet('chords', sp.chords.sound); c.chords = sp.chords.sound; }
  if (force || c.melody !== sp.melody.sound) { this.makeSet('melody', sp.melody.sound); c.melody = sp.melody.sound; }
  if (force || !this.sets.voice) this.makeSet('voice');
  T.Transport.bpm.value = sp.bpm;
  T.Transport.swing = sp.swing;
  T.Transport.swingSubdivision = '16n';
  var g = this.g, vm = sp.voice.mode;
  g.drums.gain.rampTo(sp.drums.on ? sp.drums.vol : 0, 0.05);
  g.bass.gain.rampTo(sp.bass.on ? sp.bass.vol : 0, 0.05);
  g.chords.gain.rampTo(sp.chords.on ? sp.chords.vol : 0, 0.05);
  g.melody.gain.rampTo(sp.melody.on ? sp.melody.vol : 0, 0.05);
  var hum = vm === 'none' ? 0 : (vm === 'lyrics' ? 0.4 : (vm === 'singer' ? 0.3 : 1));
  g.voice.gain.rampTo(sp.voice.vol * hum, 0.05);
  g.singer.gain.rampTo(vm === 'singer' ? sp.voice.vol * 1.4 : 0, 0.05);
  this.setVowel(vm === 'ooh' || vm === 'aah' ? vm : 'hum');
  this.revM.gain.rampTo(sp.fx.reverb * 0.9, 0.1);
  this.revD.gain.rampTo(sp.fx.reverb * 0.3, 0.1);
  this.del.gain.rampTo(sp.fx.delay * 0.6, 0.1);
  this.delay.delayTime.rampTo(60 / sp.bpm * 0.75, 0.1);
  this.delay.feedback.rampTo(0.2 + sp.fx.delay * 0.35, 0.1);
  var lo = sp.fx.lofi;
  this.wet.gain.rampTo(lo * 0.55, 0.1); this.dry.gain.rampTo(1 - lo * 0.55, 0.1);
  this.lofiFilter.frequency.rampTo(18000 - lo * 15500, 0.1);
  this.hissG.gain.rampTo(lo * 0.035, 0.1);
  if (this.sets.bass && this.sets.bass.auto) this.sets.bass.auto.frequency.value = sp.bpm / 60 * 2;
};

AP.tick = function (time) {
  try { this._tick(time); } catch (e) { if (!this.errLogged) { this.errLogged = true; console.warn('BeatForge: sequencer error', e); } }
};
AP._tick = function (time) {
  var sp = this.host.getSpec(), s = this.sets, mf = midiToFreq;
  var step = this.step % 16, bar = Math.floor(this.step / 16) % 4, gbar = this.barCount;
  this.step = (this.step + 1) % 64;
  if (step === 15) this.barCount++;
  var six = 60 / sp.bpm / 4, ev = [];
  var deg = sp.chords.progression[bar], i, d, S;
  if (sp.drums.on && s.drums) {
    d = sp.drums; S = s.drums;
    if (d.kick[step]) { S.kick.triggerAttackRelease(S.kickNote, '8n', time, 1); ev.push({ i: 'kick' }); }
    if (d.snare[step]) { S.snare.triggerAttackRelease(0.2, time, 0.9); S.body.triggerAttackRelease(S.bodyNote, 0.1, time, 0.7); ev.push({ i: 'snare' }); }
    if (d.hat[step]) { var hv = (step % 4 === 0 ? 0.9 : (step % 2 === 0 ? 0.7 : 0.5)) * (0.9 + Math.random() * 0.2); S.hat.triggerAttackRelease(0.03, time, hv); ev.push({ i: 'hat' }); }
    if (d.clap[step]) { S.clap.triggerAttackRelease(0.008, time, 0.7); S.clap.triggerAttackRelease(0.008, time + 0.012, 0.6); S.clap.triggerAttackRelease(0.15, time + 0.024, 0.9); ev.push({ i: 'clap' }); }
    if (d.perc[step]) { S.perc.triggerAttackRelease(S.percNote, 0.08, time, 0.6); ev.push({ i: 'perc' }); }
  }
  if (sp.bass.on && s.bass) {
    var bn = sp.bass.notes[step];
    if (bn) {
      var bm = bassMidi(sp, deg, bn), bl = noteLen(sp.bass.notes, step, sp.bass.sound === 'pluck' ? 3 : 8);
      s.bass.syn.triggerAttackRelease(mf(bm), bl * six * 0.92, time, 0.9);
      ev.push({ i: 'bass', m: bm });
    }
  }
  if (sp.chords.on && s.chords) {
    var snd = sp.chords.sound, notes = null, dur = 0, vel = 0.6;
    if (snd === 'keys') {
      if (step === 0) { dur = 6; vel = 0.7; } else if (step === 7) { dur = 2; vel = 0.45; } else if (step === 10) { dur = 5; vel = 0.55; }
      if (dur) notes = chordMidis(sp, deg, true);
    } else if (step === 0) { dur = 16 * 0.98; notes = chordMidis(sp, deg, snd === 'pad'); }
    if (notes) {
      s.chords.syn.triggerAttackRelease(notes.map(mf), dur * six, time, vel);
      for (i = 0; i < notes.length; i++) ev.push({ i: 'chords', m: notes[i] });
    }
  }
  if (sp.melody.on && s.melody) {
    var mn = sp.melody.notes[step];
    if (mn) {
      var mm = melodyMidi(sp, mn);
      s.melody.syn.triggerAttackRelease(mf(mm), noteLen(sp.melody.notes, step, 4) * six * 0.9, time, 0.8);
      ev.push({ i: 'melody', m: mm });
    }
  }
  var vm = sp.voice.mode;
  if (vm !== 'none' && s.voice) {
    var vn = voiceNote(sp, bar, step);
    if (vn) { s.voice.src.triggerAttackRelease(mf(vn.m), vn.len * six * 0.95, time, 0.8); ev.push({ i: 'voice', m: vn.m }); }
  }
  if ((vm === 'lyrics' || vm === 'singer') && step === 0) {
    var res = this.host.lineFor(gbar, bar) || { line: -1 };
    if (res.buffer) {
      var pl = this.players[this.vp = (this.vp + 1) % 2];
      try { pl.stop(time); } catch (e) { /* not started */ }
      pl.buffer = res.buffer;
      pl.start(time + 0.005);
      ev.push({ i: 'lyric', bar: gbar, line: res.line, sung: true });
    } else {
      ev.push({ i: 'lyric', bar: gbar, line: res.line, speak: !!res.speak });
    }
  }
  if (step === 0) ev.push({ i: 'bar', bar: bar, deg: deg });
  this.host.onTick(time, step, bar, ev, gbar);
};

AP.play = function () {
  var T = this.T;
  this.step = 0; this.barCount = 0;
  T.Transport.stop();
  T.Transport.position = 0;
  T.Transport.start('+0.06');
  this.playing = true;
};
AP.stop = function () {
  var T = this.T;
  try { T.Transport.stop(); } catch (e) { /* ignore */ }
  this.playing = false;
  if (!this.built) return;
  try {
    if (this.sets.voice) this.sets.voice.src.triggerRelease();
    if (this.sets.chords) this.sets.chords.syn.releaseAll();
    if (this.sets.melody && this.sets.melody.syn.releaseAll) this.sets.melody.syn.releaseAll();
    this.players.forEach(function (p) { try { p.stop(); } catch (e) { /* idle */ } });
  } catch (e) { /* ignore */ }
};
/* Audition a sound right now (grid clicks). */
AP.preview = function (kind, midi) {
  if (!this.built || this.T.context.state !== 'running') return;
  var t = this.T.now() + 0.01, s = this.sets;
  try {
    if (DRUM_ROWS.indexOf(kind) >= 0 && s.drums) {
      var S = s.drums;
      if (kind === 'kick') S.kick.triggerAttackRelease(S.kickNote, '8n', t, 0.9);
      else if (kind === 'snare') S.snare.triggerAttackRelease(0.15, t, 0.8);
      else if (kind === 'hat') S.hat.triggerAttackRelease(0.03, t, 0.7);
      else if (kind === 'clap') S.clap.triggerAttackRelease(0.12, t, 0.8);
      else S.perc.triggerAttackRelease(S.percNote, 0.08, t, 0.6);
    } else if (kind === 'bass' && s.bass) s.bass.syn.triggerAttackRelease(midiToFreq(midi), 0.25, t, 0.8);
    else if (kind === 'melody' && s.melody) s.melody.syn.triggerAttackRelease(midiToFreq(midi), 0.25, t, 0.8);
    else if (kind === 'chords' && s.chords) s.chords.syn.triggerAttackRelease(midi.map(midiToFreq), 0.6, t, 0.6);
  } catch (e) { /* overlapping trigger: ignore */ }
};
AP.levels = function () {
  if (!this.built) return null;
  var f = this.fft.getValue(), n = f.length, lo = 0, hi = 0, all = 0, i, v;
  var spec = this._spec || (this._spec = new Float32Array(n));
  for (i = 0; i < n; i++) {
    v = (f[i] + 100) / 70; v = v > 0 ? (v < 1 ? v : 1) : 0;
    spec[i] = v; all += v;
    if (i < 4) lo += v; else if (i > 18) hi += v;
  }
  return { level: all / n, bass: lo / 4, hi: hi / (n - 19), spectrum: spec, wave: this.wave.getValue() };
};
AP.makeBuffer = function (data, sr) {
  var ctx = this.T.getContext().rawContext;
  var ab = ctx.createBuffer(1, data.length, sr);
  ab.getChannelData(0).set(data);
  return new this.T.ToneAudioBuffer(ab);
};
AP.dispose = function () {
  this.disposed = true;
  if (!this.built) return;
  var T = this.T, self = this;
  try { T.Transport.stop(); if (this.loopId != null) T.Transport.clear(this.loopId); T.Transport.cancel(0); } catch (e) { /* ignore */ }
  Object.keys(this.sets).forEach(function (k) { disposeAll(self.sets[k].nodes); });
  this.sets = {};
  disposeAll(this.nodes);
  this.built = false; this.playing = false;
};

/* ===================== 03-singer: AI singer (Azure audio / Kokoro in-browser / SpeechSynthesis) ===================== */
var KOKORO_URL = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';
var KOKORO_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
var kokoro = { promise: null, tts: null, onProgress: null };   // shared across mounts (model download is cached)

function loadKokoro(onProgress) {
  kokoro.onProgress = onProgress;
  if (kokoro.tts) return Promise.resolve(kokoro.tts);
  if (!kokoro.promise) {
    var files = {};
    var prog = function (p) {
      if (!p || p.status !== 'progress' || !p.total) return;
      files[p.file] = [p.loaded || 0, p.total];
      var a = 0, b = 0;
      Object.keys(files).forEach(function (k) { a += files[k][0]; b += files[k][1]; });
      if (b > 1e6 && kokoro.onProgress) kokoro.onProgress(Math.round(a / b * 100));
    };
    if (typeof WebAssembly !== 'object') return Promise.reject(new Error('WebAssembly not available'));
    kokoro.promise = import(KOKORO_URL).then(function (mod) {
      return mod.KokoroTTS.from_pretrained(KOKORO_MODEL, { dtype: 'q8', device: 'wasm', progress_callback: prog });
    }).then(function (tts) { kokoro.tts = tts; return tts; }, function (e) { kokoro.promise = null; throw e; });
  }
  return kokoro.promise;
}

/* ---------- DSP: pitch analysis + TD-PSOLA auto-tune ---------- */
function trimSilence(x, sr) {
  var peak = 0, i;
  for (i = 0; i < x.length; i++) { var a = Math.abs(x[i]); if (a > peak) peak = a; }
  if (peak < 1e-4) return null;
  var thr = peak * 0.02, a0 = 0, z = x.length - 1;
  while (a0 < z && Math.abs(x[a0]) < thr) a0++;
  while (z > a0 && Math.abs(x[z]) < thr) z--;
  a0 = Math.max(0, a0 - Math.round(sr * 0.01)); z = Math.min(x.length, z + Math.round(sr * 0.08));
  var out = new Float32Array(z - a0), g = 0.9 / peak;
  for (i = 0; i < out.length; i++) out[i] = x[a0 + i] * g;
  return out;
}
function analyzePitch(x, sr) {
  var dec = Math.max(1, Math.round(sr / 12000)), srd = sr / dec, n = Math.floor(x.length / dec), y = new Float32Array(n), i, j;
  for (i = 0; i < n; i++) { var s = 0; for (j = 0; j < dec; j++) s += x[i * dec + j]; y[i] = s / dec; }
  var hop = Math.round(srd * 0.01), win = Math.round(srd * 0.03), minL = Math.floor(srd / 450), maxL = Math.ceil(srd / 75);
  var nf = Math.ceil(n / hop) + 1, f0 = new Float32Array(nf), r = new Float32Array(maxL + 1), voiced = [];
  for (var fi = 0, pos = 0; pos + win + maxL < n; fi++, pos += hop) {
    var e0 = 0;
    for (j = 0; j < win; j++) e0 += y[pos + j] * y[pos + j];
    if (e0 / win < 4e-4) continue;
    var best = 0, L;
    for (L = minL; L <= maxL; L++) {
      var c = 0, e1 = 0;
      for (j = 0; j < win; j++) { var v = y[pos + j + L]; c += y[pos + j] * v; e1 += v * v; }
      r[L] = c / Math.sqrt(e0 * e1 + 1e-12);
      if (r[L] > best) best = r[L];
    }
    if (best < 0.6) continue;
    for (L = minL + 1; L < maxL; L++) {           // first strong local max (avoids octave-down errors)
      if (r[L] >= best * 0.88 && r[L] >= r[L - 1] && r[L] >= r[L + 1]) break;
    }
    f0[fi] = srd / L; voiced.push(f0[fi]);
  }
  voiced.sort(function (a, b) { return a - b; });
  var med = voiced.length ? voiced[Math.floor(voiced.length / 2)] : 200;
  return { f0: f0, hop: hop * dec, med: med };
}
function pitchMarks(x, sr, an) {
  var marks = [], per = [], t = 0, n = x.length, last = -1, prevV = false;
  while (t < n) {
    var f = an.f0[Math.min(an.f0.length - 1, Math.floor(t / an.hop))];
    if (f > 0) {
      var Pd = sr / f, rr = Math.round(prevV ? Pd * 0.15 : Pd * 0.5), best = Math.round(t), bv = -2;
      var lo = Math.max(last + 1, Math.round(t - rr)), hi = Math.min(n - 1, Math.round(t + rr));
      for (var j = lo; j <= hi; j++) if (x[j] > bv) { bv = x[j]; best = j; }
      marks.push(best); per.push(Pd); last = best; t = best + Pd; prevV = true;
    } else {
      marks.push(Math.round(t)); per.push(0); last = Math.round(t); t += an.hop; prevV = false;
    }
  }
  return { marks: marks, per: per, hop: an.hop };
}
/* Re-synthesize x so voiced parts follow target pitch (Hz per output sample), time-scaled to outLen. */
function psola(x, sr, mk, outLen, targetHz) {
  var y = new Float32Array(outLen + 4096), w = new Float32Array(outLen + 4096);
  var n = x.length, M = mk.marks.length, ratio = n / outLen, k = 0, ts = 0, curF = 0;
  while (ts < outLen && M) {
    var ta = ts * ratio;
    while (k + 1 < M && Math.abs(mk.marks[k + 1] - ta) <= Math.abs(mk.marks[k] - ta)) k++;
    var Pa = mk.per[k], c = mk.marks[k], half, Ps;
    if (Pa > 0) {
      var tf = targetHz(ts);
      curF = curF > 0 ? curF + (tf - curF) * 0.4 : tf;    // fast retune glide = pop auto-tune
      Ps = sr / curF; half = Math.round(Pa);
    } else { Ps = mk.hop; half = mk.hop; }
    var t0 = Math.round(ts);
    for (var j = -half; j <= half; j++) {
      var xi = c + j, yi = t0 + j;
      if (xi < 0 || xi >= n || yi < 0) continue;
      var wv = 0.5 + 0.5 * Math.cos(Math.PI * j / half);
      y[yi] += x[xi] * wv; w[yi] += wv;
    }
    ts += Math.max(8, Ps);
  }
  var out = new Float32Array(outLen), peak = 0, i;
  for (i = 0; i < outLen; i++) { out[i] = y[i] / Math.max(w[i], 0.6); var a = Math.abs(out[i]); if (a > peak) peak = a; }
  var g = peak > 0 ? 0.85 / peak : 1, fade = Math.round(sr * 0.012);
  for (i = 0; i < outLen; i++) {
    var e = i < fade ? i / fade : (i > outLen - fade ? (outLen - i) / fade : 1);
    out[i] *= g * e;
  }
  return out;
}

function Singer(inst) {
  this.inst = inst; this.key = ''; this.musicKey = ''; this.lines = []; this.raw = [];
  this.tuned = {}; this.fail = {}; this.gen = 0; this.engine = null; this.voice = '';
  this.status = 'off'; this.statusText = ''; this.reqTimer = null; this.azTimer = null; this.dead = false;
}
var SP = Singer.prototype;
SP.resolve = function (sp) {
  var e = sp.voice.engine, vn = sp.voice.voiceName, isK = /^[ab][fm]_[a-z]+$/.test(vn);
  var hasAz = typeof this.inst.opts.onVoiceRequest === 'function', eng;
  if (e === 'browser') eng = 'browser';
  else if (e === 'kokoro') eng = 'kokoro';
  else if (e === 'azure') eng = hasAz ? 'azure' : 'kokoro';
  else eng = isK ? 'kokoro' : (hasAz ? 'azure' : 'kokoro');
  if (eng === 'azure' && this.fail.azure) eng = 'kokoro';
  if (eng === 'kokoro' && this.fail.kokoro) eng = 'browser';
  var voice = vn;
  if (eng === 'kokoro' && !isK) voice = 'af_heart';
  if (eng === 'azure' && isK) voice = DEFAULT_VOICE_NAME;
  return { engine: eng, voice: voice };
};
SP.setStatus = function (st, text) { this.status = st; this.statusText = text || ''; this.inst.onSingerStatus(); };
SP.update = function (sp) {
  var self = this;
  if (sp.voice.mode !== 'singer') { if (this.status !== 'off') this.setStatus('off', ''); this.key = ''; this.gen++; return; }
  var r = this.resolve(sp), lines = singerLines(sp);
  var mkey = [sp.key, sp.scale, sp.bpm, sp.chords.progression.join(), sp.melody.on, sp.melody.notes.join()].join('|');
  if (mkey !== this.musicKey) { this.musicKey = mkey; this.tuned = {}; }
  var key = r.engine + '|' + r.voice + '|' + lines.join('\n');
  if (key === this.key) return;
  this.key = key; this.lines = lines; this.raw = []; this.tuned = {};
  this.engine = r.engine; this.voice = r.voice;
  var gen = ++this.gen;
  this.inst.clearLater(this.reqTimer); this.inst.clearLater(this.azTimer);
  if (r.engine === 'browser') { this.setStatus('ready', 'Browser voice (instant)'); return; }
  this.setStatus('loading', r.engine === 'azure' ? 'Asking the premium singer\u2026' : 'Warming up the singer\u2026');
  this.reqTimer = this.inst.later(function () { self.request(gen); }, 700);   // debounce typing
};
SP.request = function (gen) {
  var self = this;
  if (gen !== this.gen || this.dead) return;
  if (this.engine === 'azure') {
    try { this.inst.opts.onVoiceRequest(JSON.stringify(this.lines), this.voice); }
    catch (e) { this.failover('azure', 'Premium voice is unavailable'); return; }
    this.azTimer = this.inst.later(function () {
      if (gen === self.gen && !self.raw.some(Boolean)) self.failover('azure', 'Premium voice took too long');
    }, 30000);
    return;
  }
  loadKokoro(function (pct) {
    if (gen === self.gen && !self.dead) self.setStatus('loading', 'Downloading the free AI singer\u2026 ' + pct + '%');
  }).then(function (tts) {
    if (gen !== self.gen || self.dead) return;
    var voice = tts.voices && !Object.prototype.hasOwnProperty.call(tts.voices, self.voice) ? 'af_heart' : self.voice;
    var i = 0;
    (function next() {
      if (gen !== self.gen || self.dead) return;
      if (i >= self.lines.length) { self.setStatus('ready', 'AI singer ready'); return; }
      self.setStatus('loading', 'Singer is recording line ' + (i + 1) + ' of ' + self.lines.length + '\u2026');
      tts.generate(self.lines[i], { voice: voice }).then(function (a) {
        if (gen !== self.gen || self.dead) return;
        self.setRaw(i, a.audio, a.sampling_rate);
        i++; next();
      }, function (e) { console.warn('BeatForge: Kokoro generate failed', e); self.failover('kokoro', 'The free AI singer failed'); });
    })();
  }, function (e) {
    console.warn('BeatForge: Kokoro load failed', e);
    if (gen === self.gen) self.failover('kokoro', 'The free AI singer could not load');
  });
};
SP.failover = function (which, msg) {
  if (this.dead) return;
  this.fail[which] = true;
  var next = which === 'azure' ? 'the free in-browser singer' : 'the browser voice';
  this.inst.notify(msg + ' \u2014 switching to ' + next + '.', 'info');
  this.key = '';
  this.update(this.inst.spec);
};
SP.setRaw = function (i, data, sr) {
  var x = trimSilence(data instanceof Float32Array ? data : new Float32Array(data), sr);
  if (!x) return;
  var an = analyzePitch(x, sr);
  this.raw[i] = { x: x, sr: sr, mk: pitchMarks(x, sr, an), medMidi: 69 + 12 * Math.log(an.med / 440) / Math.LN2 };
  this.tuned = {};
  if (this.status === 'loading' && this.engine === 'azure') {
    var have = this.raw.filter(Boolean).length;
    this.setStatus(have >= this.lines.length ? 'ready' : 'loading', have >= this.lines.length ? 'Premium singer ready' : 'Premium singer: ' + have + ' of ' + this.lines.length + ' lines');
  }
};
/* Azure (host-supplied) audio for line `index`. */
SP.setVocalAudio = function (index, b64, mime) {
  var self = this, gen = this.gen;
  if (this.engine !== 'azure') return false;
  var i = int(index, 0, 7, -1);
  if (i < 0 || i >= this.lines.length || typeof b64 !== 'string' || b64.length > 8000000) return false;
  if (mime != null && !/^audio\/[a-z0-9.+-]+$/i.test(String(mime))) return false;
  var bytes;
  try {
    var bin = atob(b64.replace(/^data:[^,]*,/, '').replace(/\s+/g, ''));
    bytes = new Uint8Array(bin.length);
    for (var k = 0; k < bin.length; k++) bytes[k] = bin.charCodeAt(k);
  } catch (e) { this.inst.notify('Vocal audio could not be read', 'error'); return false; }
  var ctx = window.Tone.getContext().rawContext;
  ctx.decodeAudioData(bytes.buffer).then(function (ab) {
    if (gen !== self.gen || self.dead) return;
    var n = ab.length, mono = new Float32Array(n), ch = ab.numberOfChannels;
    for (var c = 0; c < ch; c++) { var d = ab.getChannelData(c); for (var j = 0; j < n; j++) mono[j] += d[j] / ch; }
    self.setRaw(i, mono, ab.sampleRate);
  }, function () { if (gen === self.gen) self.failover('azure', 'Vocal audio could not be decoded'); });
  return true;
};
/* Tuned buffer for a global bar (line = gbar % lines) in loop bar `bar`. */
SP.bufferFor = function (gbar, bar) {
  if (this.status === 'off' || !this.lines.length) return null;
  var li = gbar % this.lines.length;
  if (this.engine === 'browser') return { line: li, speak: true };
  var raw = this.raw[li];
  if (!raw) return { line: li };
  var key = li + '_' + bar;
  if (!this.tuned[key]) {
    try { this.tuned[key] = this.render(raw, bar); } catch (e) { console.warn('BeatForge: tune failed', e); return { line: li }; }
  }
  return { line: li, buffer: this.tuned[key] };
};
SP.prefetch = function (gbar, bar) { if (this.engine && this.engine !== 'browser') this.bufferFor(gbar, bar); };
SP.render = function (raw, bar) {
  var sp = this.inst.spec, audio = this.inst.audio;
  if (!audio || !audio.built) throw new Error('audio not ready');
  var targets = voiceTargets(sp, bar), mean = 0;
  targets.forEach(function (m) { mean += m; }); mean /= 16;
  var off = 12 * Math.round((raw.medMidi - mean) / 12), sr = raw.sr;
  var six = 60 / sp.bpm / 4, barLen = 16 * six * sr, len = raw.x.length;
  var speed = Math.min(1.5, Math.max(1, len / (barLen * 0.97)));
  var outLen = Math.round(len / speed);
  var data = psola(raw.x, sr, raw.mk, outLen, function (ts) {
    var s = Math.min(15, Math.floor(ts / sr / six));
    return midiToFreq(targets[s] + off);
  });
  return audio.makeBuffer(data, sr);
};
SP.dispose = function () { this.dead = true; this.gen++; this.raw = []; this.tuned = {}; };

/* ===================== 04-visual: three.js scene, festival light show, VR ===================== */
var THEMES = {
  neon: { bg: 0x07021a, a1: '#ff2bd6', a2: '#00f0ff', ring: 0x00f0ff, ring2: 0xff2bd6, grid: 0xff2bd6, star: 0xbfe8ff, laser: 0x39ff88,
    lights: [0xff2bd6, 0x00f0ff, 0x7a5cff, 0x39ff88],
    c: { kick: 0xff2bd6, snare: 0x00f0ff, hat: 0xc9fff6, clap: 0xffe600, perc: 0x7cff4d, bass: 0x9b4dff, chords: 0x2b8cff, melody: 0xff9d00, voice: 0xff5fa8 } },
  sunset: { bg: 0x1a0612, a1: '#ff7a3d', a2: '#ff2e88', ring: 0xffb347, ring2: 0xff2e88, grid: 0xff2e88, star: 0xffe1c4, laser: 0xffc857,
    lights: [0xff7a3d, 0xff2e88, 0xffc857, 0xb84dff],
    c: { kick: 0xff5e3a, snare: 0xffb347, hat: 0xffe1a8, clap: 0xff2e88, perc: 0xffd166, bass: 0xc4307a, chords: 0xff8c42, melody: 0xffe066, voice: 0xff9ecd } },
  ocean: { bg: 0x01131d, a1: '#00e5ff', a2: '#4dffc3', ring: 0x4dffc3, ring2: 0x00a2ff, grid: 0x00a2ff, star: 0xc8fff4, laser: 0x4dffc3,
    lights: [0x00e5ff, 0x4dffc3, 0x3d7bff, 0xa0e9ff],
    c: { kick: 0x00e5ff, snare: 0x4dffc3, hat: 0xc8fff4, clap: 0x6ea8ff, perc: 0x9bffd9, bass: 0x0077ff, chords: 0x00c2a8, melody: 0xa0e9ff, voice: 0x7f7fff } },
  galaxy: { bg: 0x06031a, a1: '#b388ff', a2: '#ff80ab', ring: 0xea80fc, ring2: 0x536dfe, grid: 0x7c4dff, star: 0xffffff, laser: 0xff80ab,
    lights: [0xb388ff, 0xff80ab, 0x82b1ff, 0xffd740],
    c: { kick: 0xb388ff, snare: 0xff80ab, hat: 0xffffff, clap: 0x82b1ff, perc: 0xea80fc, bass: 0x7c4dff, chords: 0x536dfe, melody: 0xffd740, voice: 0xff80ff } }
};
var NRINGS = 18, RING_GAP = 6, NORBS = 320, NBEAMS = 8, NLASERS = 24, LED_W = 48, LED_H = 16;

function glowTexture(T3) {
  var c = document.createElement('canvas'); c.width = c.height = 128;
  var g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  gr.addColorStop(0.45, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  var t = new T3.CanvasTexture(c);
  return t;
}

function Visualizer(container) {
  var T3 = window.THREE;
  this.T3 = T3;
  var r = this.renderer = new T3.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  r.domElement.className = 'bf-canvas';
  container.insertBefore(r.domElement, container.firstChild);
  this.scene = new T3.Scene();
  this.bgBase = new T3.Color(); this.bg = new T3.Color(); this.scene.background = this.bg;
  this.scene.fog = new T3.FogExp2(0x000000, 0.022);
  this.camera = new T3.PerspectiveCamera(65, 1, 0.05, 400);
  this.camera.position.set(0, 0, 6);
  this.scene.add(this.camera);
  this.world = new T3.Group(); this.scene.add(this.world);
  this.tex = glowTexture(T3);
  this.disposables = [this.tex];
  this.t = 0; this.kick = 0; this.snap = 0; this.speed = 1.5; this.flash = 0; this.lastFlash = -1; this.fan = 0;
  this.wash = new T3.Color(0xffffff); this.washTarget = new T3.Color(0xffffff);
  this.pattern = 0; this.barIdx = 0; this.vr = false; this.idleAcc = 0;
  this.tmpV = new T3.Vector3(); this.tmpV2 = new T3.Vector3(); this.tmpQ = new T3.Quaternion(); this.tmpM = new T3.Matrix4();
  this.tmpC = new T3.Color(); this.up = new T3.Vector3(0, 1, 0); this.down = new T3.Vector3(0, -1, 0); this.one = new T3.Vector3(1, 1, 1);
  this.theme = THEMES.neon;
  this._stars(); this._rings(); this._floor(); this._waves(); this._core(); this._orbs(); this._shock();
  this._beams(); this._lasers(); this._led(); this._haze(); this._strobe();
  this.setTheme('neon');
}
var VP = Visualizer.prototype;
VP.keep = function (x) { this.disposables.push(x); return x; };
VP.addMat = function (m) { return this.keep(m); };

VP._stars = function () {
  var T3 = this.T3, N = 1400, pos = new Float32Array(N * 3);
  for (var i = 0; i < N; i++) {
    var a = Math.random() * Math.PI * 2, rr = 6 + Math.random() * 50;
    pos[i * 3] = Math.cos(a) * rr; pos[i * 3 + 1] = Math.sin(a) * rr * 0.7; pos[i * 3 + 2] = 10 - Math.random() * 170;
  }
  var g = this.keep(new T3.BufferGeometry()); g.setAttribute('position', new T3.BufferAttribute(pos, 3));
  this.starMat = this.keep(new T3.PointsMaterial({ size: 0.35, map: this.tex, transparent: true, depthWrite: false, blending: T3.AdditiveBlending, opacity: 0.8 }));
  this.stars = new T3.Points(g, this.starMat); this.stars.frustumCulled = false; this.world.add(this.stars);
};
VP._rings = function () {
  var T3 = this.T3, g = this.keep(new T3.RingGeometry(0.96, 1, 6, 1));
  this.ringMats = [0, 1].map(function () { return this.keep(new T3.MeshBasicMaterial({ transparent: true, opacity: 0.75, blending: T3.AdditiveBlending, depthWrite: false, side: T3.DoubleSide })); }, this);
  this.rings = [];
  for (var i = 0; i < NRINGS; i++) {
    var m = new T3.Mesh(g, this.ringMats[i % 2]);
    m.position.z = 4 - i * RING_GAP; m.rotation.z = i * 0.12; m.scale.setScalar(4.2);
    this.world.add(m); this.rings.push(m);
  }
};
VP._floor = function () {
  var T3 = this.T3;
  this.floorY = -3.2;
  this.gridHolder = new T3.Group(); this.gridHolder.position.y = this.floorY; this.world.add(this.gridHolder);
  this.grid = null;
  var pg = this.keep(new T3.PlaneGeometry(90, 0.7));
  this.pulses = [];
  for (var i = 0; i < 6; i++) {
    var mat = this.keep(new T3.MeshBasicMaterial({ transparent: true, opacity: 0, blending: T3.AdditiveBlending, depthWrite: false, side: T3.DoubleSide }));
    var m = new T3.Mesh(pg, mat); m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.visible = false; m.userData.life = 0;
    this.gridHolder.add(m); this.pulses.push(m);
  }
};
VP._waves = function () {
  var T3 = this.T3, n = 128, p = new Float32Array(n * 3), h = new Float32Array(n * 3);
  var g = this.keep(new T3.BufferGeometry()); g.setAttribute('position', new T3.BufferAttribute(p, 3));
  this.waveMat = this.keep(new T3.LineBasicMaterial({ transparent: true, opacity: 0.9, blending: T3.AdditiveBlending, depthWrite: false }));
  this.waveRing = new T3.LineLoop(g, this.waveMat); this.waveRing.position.z = -14; this.waveRing.frustumCulled = false; this.world.add(this.waveRing);
  var g2 = this.keep(new T3.BufferGeometry()); g2.setAttribute('position', new T3.BufferAttribute(h, 3));
  this.horizon = new T3.Line(g2, this.waveMat); this.horizon.position.set(0, -1.6, -30); this.horizon.frustumCulled = false; this.world.add(this.horizon);
};
VP._core = function () {
  var T3 = this.T3;
  this.coreMat = this.keep(new T3.SpriteMaterial({ map: this.tex, transparent: true, blending: T3.AdditiveBlending, depthWrite: false, opacity: 0.9, fog: false }));
  this.core = new T3.Sprite(this.coreMat); this.core.position.set(0, 0, -42); this.world.add(this.core);
  this.core2Mat = this.keep(new T3.SpriteMaterial({ map: this.tex, color: 0xffffff, transparent: true, blending: T3.AdditiveBlending, depthWrite: false, opacity: 0.35, fog: false }));
  this.core2 = new T3.Sprite(this.core2Mat); this.core2.position.set(0, 0, -41); this.world.add(this.core2);
};
VP._orbs = function () {
  var T3 = this.T3, N = NORBS;
  this.oPos = new Float32Array(N * 3); this.oCol = new Float32Array(N * 3); this.oSize = new Float32Array(N); this.oAlpha = new Float32Array(N);
  this.oVel = new Float32Array(N * 3); this.oLife = new Float32Array(N); this.oMax = new Float32Array(N); this.oBase = new Float32Array(N); this.oDim = new Float32Array(N);
  this.oNext = 0;
  var g = this.keep(new T3.BufferGeometry());
  g.setAttribute('position', new T3.BufferAttribute(this.oPos, 3));
  g.setAttribute('aColor', new T3.BufferAttribute(this.oCol, 3));
  g.setAttribute('aSize', new T3.BufferAttribute(this.oSize, 1));
  g.setAttribute('aAlpha', new T3.BufferAttribute(this.oAlpha, 1));
  this.orbGeo = g;
  this.orbMat = this.keep(new T3.ShaderMaterial({
    uniforms: { map: { value: this.tex }, uScale: { value: 400 } },
    vertexShader: 'attribute vec3 aColor; attribute float aSize; attribute float aAlpha; varying vec3 vC; varying float vA; uniform float uScale;' +
      'void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform sampler2D map; varying vec3 vC; varying float vA;' +
      'void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb * t.a * vA, 1.0); }',
    transparent: true, depthWrite: false, blending: T3.AdditiveBlending
  }));
  this.orbs = new T3.Points(g, this.orbMat); this.orbs.frustumCulled = false; this.world.add(this.orbs);
};
VP._shock = function () {
  var T3 = this.T3, g = this.keep(new T3.RingGeometry(0.9, 1, 48));
  this.shocks = [];
  for (var i = 0; i < 6; i++) {
    var mat = this.keep(new T3.MeshBasicMaterial({ transparent: true, opacity: 0, blending: T3.AdditiveBlending, depthWrite: false, side: T3.DoubleSide }));
    var m = new T3.Mesh(g, mat); m.rotation.x = -Math.PI / 2; m.position.set(0, 0.05, -8); m.visible = false; m.userData.life = 0;
    this.gridHolder.add(m); this.shocks.push(m);
  }
};
VP._beams = function () {
  var T3 = this.T3, len = 42;
  var g = this.keep(new T3.ConeGeometry(3.2, len, 28, 1, true)); g.translate(0, -len / 2, 0);
  this.beams = []; this.beamDir = [];
  var vs = 'varying float vV; varying vec3 vN; varying vec3 vView;' +
    'void main(){ vV = uv.y; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vView = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
  var fs = 'uniform vec3 color; uniform float opacity; varying float vV; varying vec3 vN; varying vec3 vView;' +
    'void main(){ float f = abs(dot(normalize(vN), normalize(vView))); float a = pow(f, 2.2) * pow(vV, 1.7) * opacity; gl_FragColor = vec4(color * a, 1.0); }';
  this.rig = new T3.Group(); this.world.add(this.rig);
  var fix = new Float32Array(NBEAMS * 3);
  for (var i = 0; i < NBEAMS; i++) {
    var mat = this.keep(new T3.ShaderMaterial({ uniforms: { color: { value: new T3.Color(0xffffff) }, opacity: { value: 0 } }, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending: T3.AdditiveBlending, side: T3.DoubleSide }));
    var m = new T3.Mesh(g, mat); m.frustumCulled = false;
    this.rig.add(m); this.beams.push(m); this.beamDir.push(new T3.Vector3(0, -1, 0.3).normalize());
  }
  var fg = this.keep(new T3.BufferGeometry()); fg.setAttribute('position', new T3.BufferAttribute(fix, 3));
  this.fixMat = this.keep(new T3.PointsMaterial({ size: 3.2, map: this.tex, transparent: true, depthWrite: false, blending: T3.AdditiveBlending, opacity: 0, color: 0xffffff }));
  this.fixtures = new T3.Points(fg, this.fixMat); this.fixtures.frustumCulled = false; this.rig.add(this.fixtures);
  this.placeRig();
};
VP.placeRig = function () {
  var pos = this.fixtures.geometry.attributes.position;
  for (var i = 0; i < NBEAMS; i++) {
    var b = this.beams[i];
    if (this.vr) { var a = i / NBEAMS * Math.PI * 2; b.position.set(Math.cos(a) * 10, 5.5, Math.sin(a) * 10); }
    else b.position.set(-21 + i * 6, 9, -26);
    pos.setXYZ(i, b.position.x, b.position.y, b.position.z);
  }
  pos.needsUpdate = true;
};
VP._lasers = function () {
  var T3 = this.T3, g = this.keep(new T3.CylinderGeometry(0.035, 0.035, 1, 5, 1, true)); g.translate(0, 0.5, 0);
  this.laserMat = this.keep(new T3.MeshBasicMaterial({ transparent: true, blending: T3.AdditiveBlending, depthWrite: false, fog: false }));
  this.lasers = new T3.InstancedMesh(g, this.laserMat, NLASERS);
  this.lasers.frustumCulled = false; this.lasers.visible = false;
  for (var i = 0; i < NLASERS; i++) this.lasers.setColorAt(i, new T3.Color(0xffffff));
  this.world.add(this.lasers);
};
VP._led = function () {
  var T3 = this.T3, W = LED_W * 4, H = LED_H * 4;
  this.ledData = new Uint8Array(W * H * 4);
  this.ledTex = this.keep(new T3.DataTexture(this.ledData, W, H, T3.RGBAFormat));
  this.ledTex.magFilter = T3.LinearFilter; this.ledTex.minFilter = T3.LinearFilter; this.ledTex.needsUpdate = true;
  this.ledMat = this.keep(new T3.MeshBasicMaterial({ map: this.ledTex, transparent: true, blending: T3.AdditiveBlending, depthWrite: false, fog: false }));
  this.led = new T3.Mesh(this.keep(new T3.PlaneGeometry(76, 25)), this.ledMat);
  this.led.position.set(0, 4, -66); this.world.add(this.led);
  this.ledCols = [new T3.Color(), new T3.Color()];
};
VP._haze = function () {
  var T3 = this.T3;
  this.hazeMat = this.keep(new T3.SpriteMaterial({ map: this.tex, transparent: true, blending: T3.AdditiveBlending, depthWrite: false, opacity: 0.05 }));
  this.haze = [];
  for (var i = 0; i < 10; i++) {
    var s = new T3.Sprite(this.hazeMat);
    s.position.set((Math.random() - 0.5) * 40, -1 + Math.random() * 7, -6 - Math.random() * 30);
    s.scale.setScalar(18 + Math.random() * 16); s.userData.ph = Math.random() * 6.28;
    this.world.add(s); this.haze.push(s);
  }
};
VP._strobe = function () {
  var T3 = this.T3;
  this.strobeMat = this.keep(new T3.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: T3.AdditiveBlending, depthTest: false, depthWrite: false, fog: false }));
  this.strobe = new T3.Mesh(this.keep(new T3.PlaneGeometry(2, 2)), this.strobeMat);
  this.strobe.position.z = -0.2; this.strobe.renderOrder = 999; this.strobe.frustumCulled = false; this.strobe.visible = false;
  this.camera.add(this.strobe);
};

VP.setTheme = function (name) {
  var T3 = this.T3, th = THEMES[name] || THEMES.neon;
  this.theme = th; this.themeName = name;
  this.bgBase.setHex(th.bg); this.bg.copy(this.bgBase); this.scene.fog.color.setHex(th.bg);
  this.ringMats[0].color.setHex(th.ring); this.ringMats[1].color.setHex(th.ring2);
  this.starMat.color.setHex(th.star);
  this.waveMat.color.setHex(th.c.bass);
  this.coreMat.color.setHex(th.c.chords);
  this.laserMat.color.setHex(th.laser);
  this.washTarget.setHex(th.lights[0]); this.wash.copy(this.washTarget);
  if (this.grid) { this.gridHolder.remove(this.grid); this.grid.geometry.dispose(); this.grid.material.dispose(); }
  this.grid = new T3.GridHelper(220, 110, th.grid, th.grid);
  this.grid.material.transparent = true; this.grid.material.opacity = 0.3; this.grid.material.depthWrite = false;
  this.gridHolder.add(this.grid);
  this.ledCols[0].setHex(th.lights[0]); this.ledCols[1].setHex(th.lights[1]);
  this.setBar(this.barIdx, 1);
};
VP.setBar = function (bar, deg) {
  var L = this.theme.lights;
  this.barIdx = bar;
  this.pattern = (this.pattern + 1 + (bar === 0 ? 1 : 0)) % 4;
  this.washTarget.setHex(L[((deg || 1) - 1) % L.length]);
  this.beamA = L[(bar + (deg || 1)) % L.length];
  this.beamB = L[(bar + (deg || 1) + 1) % L.length];
  for (var i = 0; i < NBEAMS; i++) this.beams[i].material.uniforms.color.value.setHex(i % 2 ? this.beamB : this.beamA);
  this.laserMat.color.setHex(bar % 2 ? this.theme.laser : L[(deg || 1) % L.length]);
};
VP.hit = function (inst, midi) {
  if (inst === 'kick') { this.kick = 1; this.spawnShock(); this.spawnPulse(); this.kickFlash = true; }
  else if (inst === 'snare' || inst === 'clap') { this.snap = 1; this.fan = 1; }
  this.spawn(inst, midi, 1);
};
VP.spawnShock = function () {
  for (var i = 0; i < this.shocks.length; i++) {
    var s = this.shocks[i];
    if (!s.visible) { s.visible = true; s.userData.life = 0; s.material.color.copy(this.wash); s.position.z = this.vr ? 0 : -8; return; }
  }
};
VP.spawnPulse = function () {
  for (var i = 0; i < this.pulses.length; i++) {
    var p = this.pulses[i];
    if (!p.visible) { p.visible = true; p.userData.life = 0; p.position.z = -60; p.material.color.copy(this.wash); return; }
  }
};
VP.spawn = function (inst, midi, vel, dim) {
  var th = this.theme, col = th.c[inst] != null ? th.c[inst] : 0xffffff;
  var i = this.oNext; this.oNext = (this.oNext + 1) % NORBS;
  var a, rad, size, life = 2.4, x, y, z, vx, vy, vz, pitched = midi != null;
  var pc = pitched ? ((midi % 12) + 12) % 12 : 0;
  if (this.vr && pitched) {
    a = pc / 12 * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
    rad = inst === 'voice' ? 1.4 : 1.8 + Math.random() * 1.8;
    var h = Math.max(-1.1, Math.min(1.4, (midi - 60) / 20));
    x = Math.cos(a) * rad; z = Math.sin(a) * rad; y = h;
    vx = -Math.sin(a) * 0.35; vz = Math.cos(a) * 0.35; vy = 0.22;
    size = (inst === 'bass' ? 0.9 : inst === 'chords' ? 0.55 : 0.5) * (dim ? 0.6 : 1); life = 5;
  } else {
    var D = { kick: [-Math.PI / 2, 0.15, 2.4, 2.6], snare: [Math.PI / 2, 0.4, 2.4, 1.6], clap: [Math.PI / 2, 1.2, 2.8, 1.4], hat: [0, Math.PI, 3.2, 0.6], perc: [0, Math.PI, 3.0, 0.9] }[inst];
    if (D) { a = D[0] + (Math.random() - 0.5) * 2 * D[1]; rad = D[2]; size = D[3]; }
    else {
      a = pc / 12 * Math.PI * 2 + Math.PI / 2;
      rad = inst === 'bass' ? 1.5 : inst === 'chords' ? 2.1 : inst === 'voice' ? 0.75 : Math.max(0.6, Math.min(2.4, 1 + (midi - 60) / 25));
      size = inst === 'bass' ? 1.8 : inst === 'chords' ? 1.1 : inst === 'voice' ? 1.5 : 1.0;
      if (inst === 'voice') life = 3.2;
    }
    if (dim) size *= 0.7;
    x = Math.cos(a) * rad; y = Math.sin(a) * rad; z = -14 - Math.random() * 4;
    var sp = this.speed * 1.6 + 3;
    vx = Math.cos(a) * 0.7; vy = Math.sin(a) * 0.7; vz = sp;
    if (this.vr) size *= 0.8;
  }
  this.oPos[i * 3] = x; this.oPos[i * 3 + 1] = y; this.oPos[i * 3 + 2] = z;
  this.oVel[i * 3] = vx; this.oVel[i * 3 + 1] = vy; this.oVel[i * 3 + 2] = vz;
  this.tmpC.setHex(col);
  this.oCol[i * 3] = this.tmpC.r; this.oCol[i * 3 + 1] = this.tmpC.g; this.oCol[i * 3 + 2] = this.tmpC.b;
  this.oLife[i] = 0; this.oMax[i] = life; this.oBase[i] = size * (vel || 1); this.oDim[i] = dim ? 0.45 : 1;
};

/* st: { playing, bpm, level, bass, hi, spectrum, wave, energy, lights (0..1), reduceFlash } */
VP.update = function (dt, st) {
  var T3 = this.T3, t = (this.t += dt), i;
  var I = st.lights * (0.45 + 0.55 * st.energy);           // light-show intensity
  var festival = st.lights > 0.75;
  this.speed += ((st.playing ? 2.5 + st.bpm / 28 : 1.2) - this.speed) * Math.min(1, dt * 2);
  this.kick *= Math.pow(0.015, dt); this.snap *= Math.pow(0.02, dt); this.fan *= Math.pow(0.12, dt);
  this.wash.lerp(this.washTarget, Math.min(1, dt * 2.5));
  var lvl = st.level || 0, bassL = st.bass || 0;
  // idle ambience: keep it moving
  if (!st.playing) {
    this.idleAcc += dt;
    if (this.idleAcc > 0.3) { this.idleAcc = 0; this.spawn(Math.random() < 0.5 ? 'chords' : 'melody', 55 + Math.floor(Math.random() * 24), 0.8, true); }
    if (Math.random() < dt * 0.6) this.spawnPulse();
  }
  // background colour wash + strobe (rate-limited <= 3 Hz)
  this.bg.copy(this.bgBase).lerp(this.wash, 0.05 * I + this.kick * 0.04 * I);
  this.scene.fog.color.copy(this.bg);
  if (this.kickFlash) {
    this.kickFlash = false;
    if (I > 0.05 && festival && t - this.lastFlash >= 0.34) {
      var strong = !st.reduceFlash && !this.vr;
      this.flash = strong ? (st.energy > 0.6 ? 0.55 : 0.35) : 0.12;
      this.strobeMat.color.copy(strong ? this.tmpC.setHex(0xffffff) : this.wash);
      this.lastFlash = t;
    }
  }
  this.flash *= Math.pow(st.reduceFlash ? 0.0005 : 0.00005, dt);
  this.strobeMat.opacity = this.flash * Math.min(1, I * 1.4);
  this.strobe.visible = this.strobeMat.opacity > 0.004;
  // stars
  var sp = this.stars.geometry.attributes.position, arr = sp.array, mv = this.speed * 1.5 * dt;
  for (i = 2; i < arr.length; i += 3) { arr[i] += mv; if (arr[i] > 10) arr[i] -= 170; }
  sp.needsUpdate = true;
  this.starMat.size = 0.3 + lvl * 0.4;
  // tunnel rings
  for (i = 0; i < NRINGS; i++) {
    var rg = this.rings[i];
    rg.position.z += this.speed * dt;
    if (rg.position.z > 5) rg.position.z -= NRINGS * RING_GAP;
    rg.rotation.z += dt * 0.08 * (i % 2 ? 1 : -1);
    rg.scale.setScalar(4.2 * (1 + this.kick * 0.14 + bassL * 0.08));
  }
  this.ringMats[0].opacity = 0.45 + this.kick * 0.5 + lvl * 0.3;
  this.ringMats[1].opacity = 0.35 + this.snap * 0.5 + lvl * 0.3;
  // floor
  if (this.grid) { this.grid.position.z = (t * this.speed) % 2; this.grid.material.opacity = 0.22 + this.kick * 0.25; }
  for (i = 0; i < this.pulses.length; i++) {
    var p = this.pulses[i];
    if (!p.visible) continue;
    p.userData.life += dt; p.position.z += (30 + this.speed * 4) * dt;
    p.material.opacity = Math.max(0, 0.85 - p.userData.life * 0.4) * (0.4 + 0.6 * Math.max(I, 0.3));
    if (p.position.z > 8 || p.material.opacity <= 0) p.visible = false;
  }
  for (i = 0; i < this.shocks.length; i++) {
    var s = this.shocks[i];
    if (!s.visible) continue;
    var L = (s.userData.life += dt);
    s.scale.setScalar(1 + L * 14); s.material.opacity = Math.max(0, 0.7 - L * 0.6);
    if (L > 1.2) s.visible = false;
  }
  // waveforms
  var w = st.wave, wp = this.waveRing.geometry.attributes.position, hp = this.horizon.geometry.attributes.position, n = 128;
  for (i = 0; i < n; i++) {
    var v = w ? w[i] || 0 : Math.sin(t * 2 + i * 0.3) * 0.05;
    var ang = i / n * Math.PI * 2, rr = 2.6 + v * (1.2 + bassL * 3);
    wp.setXYZ(i, Math.cos(ang) * rr, Math.sin(ang) * rr, 0);
    hp.setXYZ(i, -30 + i / (n - 1) * 60, v * (2 + bassL * 5), 0);
  }
  wp.needsUpdate = true; hp.needsUpdate = true;
  this.waveRing.rotation.z += dt * 0.2;
  this.waveMat.opacity = 0.5 + bassL * 0.5;
  // core glow follows the colour wash
  this.coreMat.color.copy(this.wash);
  this.core.scale.setScalar(16 + lvl * 18 + this.kick * 8);
  this.core2.scale.setScalar(3 + lvl * 4 + this.kick * 2);
  // orbs
  var N = NORBS, pa = this.oPos, va = this.oVel;
  for (i = 0; i < N; i++) {
    if (this.oMax[i] <= 0) { this.oAlpha[i] = 0; continue; }
    var life = (this.oLife[i] += dt), k = life / this.oMax[i];
    if (k >= 1) { this.oMax[i] = 0; this.oAlpha[i] = 0; continue; }
    pa[i * 3] += va[i * 3] * dt; pa[i * 3 + 1] += va[i * 3 + 1] * dt; pa[i * 3 + 2] += va[i * 3 + 2] * dt;
    if (!this.vr && pa[i * 3 + 2] > 5.5) { this.oMax[i] = 0; this.oAlpha[i] = 0; continue; }
    this.oSize[i] = this.oBase[i] * (1 + 0.7 * Math.exp(-life * 9));
    this.oAlpha[i] = Math.pow(1 - k, 1.3) * Math.min(1, life * 25) * this.oDim[i];
  }
  var ga = this.orbGeo.attributes;
  ga.position.needsUpdate = true; ga.aSize.needsUpdate = true; ga.aAlpha.needsUpdate = true; ga.aColor.needsUpdate = true;
  // haze lit by the beams
  this.hazeMat.color.copy(this.wash);
  this.hazeMat.opacity = 0.025 + 0.07 * I + this.kick * 0.03 * I;
  for (i = 0; i < this.haze.length; i++) { var hz = this.haze[i]; hz.position.x += Math.sin(t * 0.1 + hz.userData.ph) * dt * 0.6; }
  this.updateBeams(dt, st, I, festival);
  this.updateLasers(dt, st, I, festival);
  this.updateLED(st, I);
  // camera drift (desktop)
  if (!this.vr) {
    var c = this.camera;
    c.position.x = Math.sin(t * 0.23) * 0.5; c.position.y = Math.cos(t * 0.19) * 0.3 + 0.2;
    c.lookAt(0, 0, -30);
    c.fov = 64 + this.kick * 2.5 + lvl * 2; c.updateProjectionMatrix();
  }
  this.orbMat.uniforms.uScale.value = this.renderer.getDrawingBufferSize(this.tmpV2).y * 0.5;
};
VP.updateBeams = function (dt, st, I, festival) {
  var t = this.t, show = I > 0.02, bp = st.bpm / 120, i;
  this.rig.visible = show;
  this.fixMat.opacity = show ? Math.min(1, 0.4 + I * 0.6) : 0;
  if (!show) return;
  var speed = (festival ? 1 : 0.45) * bp, pat = st.playing ? this.pattern : 0;
  for (i = 0; i < NBEAMS; i++) {
    var b = this.beams[i], pan, tilt, tt = t * speed;
    if (pat === 0) { pan = Math.sin(tt * 1.2 + i * 0.5) * 0.55; tilt = 0.7; }
    else if (pat === 1) { pan = (i - 3.5) / 3.5 * 0.6 * (0.6 + 0.4 * Math.sin(tt * 1.3)); tilt = 0.5 + 0.2 * Math.sin(tt * 0.8); }
    else if (pat === 2) { pan = (i < 4 ? 1 : -1) * (0.3 + 0.25 * Math.sin(tt * 1.6)); tilt = 0.65; }
    else { pan = Math.sin(tt * 1.1 + i) * 0.4; tilt = 0.5 + 0.35 * Math.sin(tt * 2 + i * 0.7); }
    var d = this.tmpV;
    if (this.vr) {
      // aim from the ring of fixtures towards points around the listener
      var a = i / NBEAMS * Math.PI * 2 + Math.sin(tt + i) * 0.6;
      d.set(Math.cos(a) * 3 - b.position.x, -1.6 + Math.sin(tt * 1.3 + i) * 1.5 - b.position.y, Math.sin(a) * 3 - b.position.z).normalize();
    } else d.set(Math.sin(pan), -Math.cos(pan) * Math.cos(tilt), Math.cos(pan) * Math.sin(tilt)).normalize();
    this.beamDir[i].lerp(d, Math.min(1, dt * 5)).normalize();
    b.quaternion.setFromUnitVectors(this.down, this.beamDir[i]);
    var chase = pat === 3 ? 0.5 + 0.5 * Math.sin(t * 6 * bp - i * 0.8) : 1;
    b.material.uniforms.opacity.value = I * (0.22 + this.kick * 0.35 + st.hi * 0.15) * chase;
  }
};
VP.updateLasers = function (dt, st, I, festival) {
  var on = festival && st.playing && I > 0.05 && this.fan > 0.03;
  this.lasers.visible = on;
  if (!on) return;
  var spread = 0.12 + 0.9 * this.fan, t = this.t, i, o = this.tmpV2;
  if (this.vr) o.set(0, 0.5, -16); else o.set(0, 0.5, -36);
  var tilt = 0.06 + 0.08 * Math.sin(t * 0.9), brightness = Math.min(1, this.fan * 1.4) * I;
  for (i = 0; i < NLASERS; i++) {
    var a = (i / (NLASERS - 1) - 0.5) * spread * 2.2 + Math.sin(t * 0.7) * 0.15;
    this.tmpV.set(Math.sin(a), tilt + (i % 2) * 0.03, Math.cos(a)).normalize();
    this.tmpQ.setFromUnitVectors(this.up, this.tmpV);
    this.tmpM.compose(o, this.tmpQ, this.tmpV.set(1, 70, 1));
    this.lasers.setMatrixAt(i, this.tmpM);
    this.lasers.setColorAt(i, this.tmpC.setScalar(brightness * (0.75 + 0.25 * Math.sin(t * 9 + i))));
  }
  this.lasers.instanceMatrix.needsUpdate = true;
  if (this.lasers.instanceColor) this.lasers.instanceColor.needsUpdate = true;
};
VP.updateLED = function (st, I) {
  var show = st.lights > 0.02;
  this.led.visible = show;
  if (!show) return;
  this.ledFrame = (this.ledFrame || 0) + 1;
  if (this.ledFrame % 2) return;                      // 30 Hz is plenty
  var spec = st.spectrum, t = this.t, W = LED_W * 4, data = this.ledData, A = this.ledCols[0], B = this.ledCols[1];
  var bright = 255 * Math.min(0.85, 0.3 + I * 0.6), kick = this.kick;
  for (var cx = 0; cx < LED_W; cx++) {
    var dist = Math.abs(cx - (LED_W - 1) / 2) / ((LED_W - 1) / 2);   // mirror around centre
    var val;
    if (spec && st.playing) val = Math.min(1, (spec[Math.min(spec.length - 1, Math.floor(dist * 34))] || 0) * 1.25 + kick * 0.15);
    else val = 0.3 + 0.25 * Math.sin(t * 1.5 + cx * 0.35) + 0.1 * Math.sin(t * 0.7 - cx * 0.2);
    for (var cy = 0; cy < LED_H; cy++) {
      var h = cy / (LED_H - 1), lit = h <= val ? 1 : (h - val < 0.08 ? 0.25 : 0.03);
      var mix = h, r = (A.r * (1 - mix) + B.r * mix) * lit * bright, g = (A.g * (1 - mix) + B.g * mix) * lit * bright, b = (A.b * (1 - mix) + B.b * mix) * lit * bright;
      for (var py = 0; py < 3; py++) {
        var row = (cy * 4 + py) * W;
        for (var px = 0; px < 3; px++) {
          var o = (row + cx * 4 + px) * 4;
          data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = 255;
        }
      }
    }
  }
  this.ledTex.needsUpdate = true;
};
VP.setVR = function (on) {
  this.vr = on;
  this.world.position.set(0, on ? 1.6 : 0, 0);
  this.gridHolder.position.y = on ? -1.6 : this.floorY;
  this.led.position.set(0, on ? 3 : 4, on ? -40 : -66);
  this.placeRig();
  for (var i = 0; i < NORBS; i++) this.oMax[i] = 0;
};
VP.resize = function (w, h) {
  if (!w || !h || this.renderer.xr.isPresenting) return;
  this.renderer.setSize(w, h, false);
  this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
};
VP.render = function () { this.renderer.render(this.scene, this.camera); };
VP.startXR = function (session) {
  var r = this.renderer, self = this;
  r.xr.enabled = true;
  r.xr.setReferenceSpaceType('local-floor');
  this.setVR(true);
  return Promise.resolve(r.xr.setSession(session)).catch(function () {
    r.xr.setReferenceSpaceType('local');
    self.world.position.y = 0;
    return r.xr.setSession(session);
  });
};
VP.dispose = function () {
  var r = this.renderer;
  try { r.setAnimationLoop(null); } catch (e) { /* ignore */ }
  if (this.grid) { this.grid.geometry.dispose(); this.grid.material.dispose(); }
  this.disposables.forEach(function (d) { try { d.dispose(); } catch (e) { /* ignore */ } });
  try { this.lasers.dispose && this.lasers.dispose(); } catch (e) { /* ignore */ }
  try { r.dispose(); r.forceContextLoss(); } catch (e) { /* ignore */ }
  if (r.domElement.parentNode) r.domElement.parentNode.removeChild(r.domElement);
};

/* ===================== 05-css: scoped styles ===================== */
var BF_CSS = [
  '.bf-root{--a1:#ff2bd6;--a2:#00f0ff;--bg:#07021a;--panel:rgba(255,255,255,.045);--line:rgba(255,255,255,.09);--text:#eef0ff;--dim:#9ea3c8;',
  'position:relative;box-sizing:border-box;color:var(--text);background:var(--bg);font:14px/1.4 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;',
  'border-radius:18px;overflow:hidden;isolation:isolate;-webkit-tap-highlight-color:transparent;min-width:0}',
  '.bf-root *,.bf-root *::before,.bf-root *::after{box-sizing:border-box}',
  '.bf-root button,.bf-root select,.bf-root input,.bf-root textarea{font:inherit;color:inherit}',
  ':where(.bf-root) :where(button){cursor:pointer;border:0;background:none;padding:0;margin:0}',
  '.bf-root button:focus-visible,.bf-root select:focus-visible,.bf-root input:focus-visible,.bf-root textarea:focus-visible{outline:2px solid var(--a2);outline-offset:2px}',
  /* stage */
  '.bf-stage{position:relative;height:clamp(300px,46vh,460px);overflow:hidden;background:radial-gradient(120% 90% at 50% 40%,color-mix(in srgb,var(--a1) 22%,var(--bg)),var(--bg))}',
  '.bf-root[data-mode=listen] .bf-stage{height:clamp(380px,74vh,820px)}',
  '.bf-canvas{position:absolute;inset:0;width:100%!important;height:100%!important;display:block}',
  '.bf-vignette{position:absolute;inset:0;pointer-events:none;background:radial-gradient(130% 100% at 50% 45%,transparent 55%,rgba(0,0,0,.55)),linear-gradient(to bottom,transparent 70%,var(--bg))}',
  '.bf-nogl .bf-stage{animation:bf-hue 8s linear infinite}',
  '@keyframes bf-hue{to{filter:hue-rotate(360deg)}}',
  '.bf-top{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:10px;padding:14px 16px;z-index:2}',
  '.bf-logo{font-weight:900;letter-spacing:.18em;font-size:13px;text-transform:uppercase;white-space:nowrap}',
  '.bf-logo b{background:linear-gradient(90deg,var(--a1),var(--a2));-webkit-background-clip:text;background-clip:text;color:transparent}',
  '.bf-title{flex:1;min-width:0;font-weight:700;font-size:15px;opacity:.92;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;text-shadow:0 0 12px rgba(0,0,0,.6)}',
  '.bf-vr{padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.25)!important;font-weight:700;backdrop-filter:blur(8px);white-space:nowrap}',
  '.bf-vr:hover{background:rgba(255,255,255,.2)}',
  '.bf-center{position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:12px;z-index:2}',
  '.bf-play{width:92px;height:92px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 35% 30%,#fff3,transparent 60%),linear-gradient(135deg,var(--a1),var(--a2));',
  'box-shadow:0 0 0 6px rgba(255,255,255,.08),0 0 40px var(--a1),0 0 90px color-mix(in srgb,var(--a2) 60%,transparent);transition:box-shadow .2s;will-change:transform}',
  '.bf-play svg{width:36px;height:36px;fill:#fff;filter:drop-shadow(0 2px 6px rgba(0,0,0,.35))}',
  '.bf-play:hover{box-shadow:0 0 0 8px rgba(255,255,255,.12),0 0 60px var(--a1),0 0 120px var(--a2)}',
  '.bf-meta{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;padding:5px 12px;border-radius:999px;background:rgba(0,0,0,.35);backdrop-filter:blur(6px);white-space:nowrap}',
  '.bf-karaoke{position:absolute;left:12px;right:12px;bottom:18px;text-align:center;z-index:2;pointer-events:none}',
  '.bf-k-cur{font-size:clamp(18px,3.2vw,28px);font-weight:800;text-shadow:0 0 18px var(--a1),0 2px 8px rgba(0,0,0,.6);transition:opacity .25s}',
  '.bf-k-next{font-size:13px;opacity:.55;margin-top:2px}',
  '.bf-k-pop{animation:bf-pop .35s ease-out}',
  '@keyframes bf-pop{from{transform:scale(.92);opacity:.2}to{transform:none;opacity:1}}',
  '.bf-pill{position:absolute;left:50%;transform:translateX(-50%);top:54px;z-index:3;font-size:12px;padding:5px 12px;border-radius:999px;background:rgba(0,0,0,.5);border:1px solid var(--line);white-space:nowrap;max-width:92%;overflow:hidden;text-overflow:ellipsis}',
  '.bf-pill::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:7px;background:var(--a2);box-shadow:0 0 8px var(--a2);animation:bf-blink 1s infinite}',
  '@keyframes bf-blink{50%{opacity:.25}}',
  /* panel */
  '.bf-panel{padding:14px 16px 20px;display:flex;flex-direction:column;gap:14px;background:linear-gradient(to bottom,var(--bg),color-mix(in srgb,var(--bg) 85%,#000))}',
  '.bf-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px}',
  '.bf-field{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--dim);font-weight:600}',
  '.bf-field b{color:var(--text);font-weight:700;min-width:28px;text-align:right;font-variant-numeric:tabular-nums}',
  '.bf-root select,.bf-input{background:rgba(255,255,255,.07);border:1px solid var(--line);border-radius:10px;padding:7px 10px;outline:none}',
  '.bf-root select option,.bf-root select optgroup{background:#15122a;color:#eef0ff}',
  '.bf-input{min-width:0}',
  '.bf-root input[type=range]{-webkit-appearance:none;appearance:none;width:92px;height:4px;border-radius:4px;background:linear-gradient(90deg,var(--a1),var(--a2));outline:none}',
  '.bf-root input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 0 10px var(--a2)}',
  '.bf-root input[type=range]::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#fff;border:0}',
  '.bf-btn{padding:8px 14px;border-radius:12px;background:rgba(255,255,255,.08);border:1px solid var(--line)!important;font-weight:700;white-space:nowrap;transition:background .15s,transform .1s}',
  '.bf-btn:hover{background:rgba(255,255,255,.14)}.bf-btn:active{transform:scale(.97)}',
  '.bf-btn:disabled{opacity:.4;cursor:default}',
  '.bf-btn.bf-hot{background:linear-gradient(135deg,var(--a1),var(--a2));border-color:transparent!important;color:#fff;box-shadow:0 0 18px color-mix(in srgb,var(--a1) 55%,transparent)}',
  '.bf-head{display:flex;gap:8px;align-items:center;flex-wrap:wrap}',
  '.bf-head .bf-input{flex:1;min-width:140px;font-weight:700}',
  '.bf-h{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin:0 0 8px}',
  '.bf-chips{display:flex;flex-wrap:wrap;gap:8px}',
  '.bf-chip{padding:8px 13px;border-radius:999px;background:var(--panel);border:1px solid var(--line)!important;font-weight:700;font-size:13px;white-space:nowrap;transition:all .15s}',
  '.bf-chip:hover{border-color:var(--a2)!important;box-shadow:0 0 14px color-mix(in srgb,var(--a2) 35%,transparent)}',
  '.bf-chip.bf-on{background:linear-gradient(135deg,color-mix(in srgb,var(--a1) 70%,transparent),color-mix(in srgb,var(--a2) 60%,transparent));border-color:transparent!important;color:#fff;box-shadow:0 0 16px color-mix(in srgb,var(--a1) 45%,transparent)}',
  '.bf-chip.bf-big{font-size:14px;padding:11px 16px}',
  '.bf-seg{display:inline-flex;flex-wrap:wrap;gap:3px;padding:3px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid var(--line)}',
  '.bf-seg button{padding:6px 10px;border-radius:9px;font-weight:700;font-size:12px;color:var(--dim)}',
  '.bf-seg button.bf-on{background:rgba(255,255,255,.14);color:#fff;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--a2) 50%,transparent)}',
  '.bf-ai{display:flex;flex-direction:column;gap:8px;padding:12px;border-radius:16px;background:linear-gradient(135deg,color-mix(in srgb,var(--a1) 14%,transparent),color-mix(in srgb,var(--a2) 10%,transparent));border:1px solid var(--line)}',
  '.bf-ai textarea{width:100%;resize:vertical;min-height:52px;background:rgba(0,0,0,.25);border:1px solid var(--line);border-radius:12px;padding:10px 12px;outline:none}',
  '.bf-ex{font-size:12px;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.06);color:var(--dim)}',
  '.bf-ex:hover{color:#fff}',
  '.bf-tracks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}',
  '.bf-narrow .bf-tracks{grid-template-columns:minmax(0,1fr)}',
  '.bf-card{min-width:0;padding:12px;border-radius:16px;background:var(--panel);border:1px solid var(--line);backdrop-filter:blur(10px);display:flex;flex-direction:column;gap:9px;transition:opacity .2s}',
  '.bf-card.bf-wide{grid-column:1/-1}',
  '.bf-card.bf-off .bf-body{opacity:.35}',
  '.bf-ch{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
  '.bf-ch .bf-ct{font-weight:800;flex:1;min-width:60px}',
  '.bf-pow{width:30px;height:18px;border-radius:999px;background:rgba(255,255,255,.15);position:relative;flex:none;transition:background .15s}',
  '.bf-pow::after{content:"";position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;transition:left .15s}',
  '.bf-pow.bf-on{background:linear-gradient(90deg,var(--a1),var(--a2));box-shadow:0 0 10px color-mix(in srgb,var(--a1) 50%,transparent)}',
  '.bf-pow.bf-on::after{left:14px}',
  '.bf-dice{width:32px;height:32px;border-radius:10px;background:rgba(255,255,255,.07);font-size:16px;line-height:32px;text-align:center}',
  '.bf-dice:hover{background:rgba(255,255,255,.16);transform:rotate(-12deg)}',
  '.bf-body{display:flex;flex-direction:column;gap:5px}',
  '.bf-row{display:grid;grid-template-columns:48px minmax(0,1fr);gap:8px;align-items:center}',
  '.bf-narrow .bf-row{grid-template-columns:36px minmax(0,1fr)}',
  '.bf-rl{font-size:11px;font-weight:700;color:var(--dim);text-transform:uppercase;letter-spacing:.04em;overflow:hidden;text-overflow:ellipsis}',
  '.bf-steps{display:grid;grid-template-columns:repeat(16,minmax(0,1fr));gap:3px;touch-action:none}',
  '.bf-cell{height:26px;border-radius:6px;background:rgba(255,255,255,.075);box-shadow:inset 0 0 0 1px rgba(255,255,255,.05);transition:background .08s,box-shadow .08s;position:relative;overflow:hidden}',
  '.bf-cell:nth-child(4n+1){background:rgba(255,255,255,.14)}',
  '.bf-cell:hover{background:rgba(255,255,255,.2)}',
  '.bf-cell.bf-on{background:var(--rc);box-shadow:0 0 10px var(--rc)}',
  '.bf-cell.bf-now{outline:2px solid rgba(255,255,255,.75);outline-offset:-2px}',
  '.bf-cell.bf-on.bf-now{filter:brightness(1.5)}',
  '.bf-lane .bf-cell{height:48px}',
  '.bf-fill{position:absolute;left:0;right:0;bottom:0;background:var(--rc);opacity:.85;box-shadow:0 0 12px var(--rc);border-radius:5px 5px 0 0}',
  '.bf-nl{position:absolute;left:0;right:0;top:3px;font-size:9px;font-weight:800;text-align:center;color:#fff;text-shadow:0 1px 3px #000;pointer-events:none}',
  '.bf-narrow .bf-nl{display:none}',
  '.bf-chords{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}',
  '.bf-chord{height:58px;border-radius:12px;background:rgba(255,255,255,.07);display:flex;flex-direction:column;align-items:center;justify-content:center;font-weight:800;font-size:17px;border:1px solid transparent!important}',
  '.bf-chord small{font-size:10px;color:var(--dim);font-weight:700}',
  '.bf-chord:hover{background:rgba(255,255,255,.14)}',
  '.bf-chord.bf-now{border-color:var(--rc)!important;box-shadow:0 0 16px var(--rc);background:color-mix(in srgb,var(--rc) 25%,transparent)}',
  '.bf-lyr{width:100%;min-height:84px;resize:vertical;background:rgba(0,0,0,.25);border:1px solid var(--line);border-radius:12px;padding:9px 11px;outline:none}',
  '.bf-klist{display:flex;flex-direction:column;gap:2px;font-size:13px;color:var(--dim);max-height:120px;overflow:auto}',
  '.bf-klist div{padding:2px 8px;border-radius:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
  '.bf-klist div.bf-on{color:#fff;background:color-mix(in srgb,var(--a1) 30%,transparent);font-weight:700}',
  '.bf-status{font-size:12px;color:var(--a2);min-height:16px}',
  '.bf-sliders{display:flex;flex-wrap:wrap;gap:12px}',
  '.bf-swatch{width:24px;height:24px;border-radius:50%;border:2px solid transparent!important}',
  '.bf-swatch.bf-on{border-color:#fff!important;box-shadow:0 0 12px rgba(255,255,255,.6)}',
  '.bf-listen{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:center;padding:12px 16px 16px}',
  '.bf-small-play{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,var(--a1),var(--a2));display:grid;place-items:center}',
  '.bf-small-play svg{width:18px;height:18px;fill:#fff}',
  /* toasts + busy */
  '.bf-toasts{position:fixed;right:16px;bottom:16px;z-index:2147483000;display:flex;flex-direction:column;gap:8px;max-width:min(360px,calc(100vw - 32px));pointer-events:none}',
  '.bf-toast{padding:11px 14px;border-radius:12px;background:rgba(18,14,40,.92);border:1px solid var(--line);border-left:4px solid var(--a2);box-shadow:0 10px 30px rgba(0,0,0,.4);font-weight:600;animation:bf-pop .25s ease-out;color:#eef0ff;font:600 14px/1.4 Inter,ui-sans-serif,system-ui,sans-serif}',
  '.bf-toast.bf-error{border-left-color:#ff4d6d}.bf-toast.bf-success{border-left-color:#39ff88}',
  '.bf-busy{position:absolute;inset:0;z-index:20;background:rgba(5,3,15,.62);backdrop-filter:blur(6px);display:none}',
  '.bf-busy.bf-show{display:block}',
  '.bf-busy-in{position:sticky;top:30%;margin:120px auto 0;display:flex;flex-direction:column;align-items:center;gap:14px;font-weight:800;font-size:16px;text-align:center;padding:0 20px}',
  '.bf-spin{width:64px;height:64px;border-radius:50%;border:4px solid rgba(255,255,255,.12);border-top-color:var(--a1);border-right-color:var(--a2);animation:bf-rot 0.9s linear infinite;box-shadow:0 0 30px var(--a1)}',
  '@keyframes bf-rot{to{transform:rotate(360deg)}}',
  '.bf-err{padding:24px;border-radius:16px;background:#1a1030;color:#ffd6e0;font:600 14px/1.5 system-ui,sans-serif}',
  '@media (prefers-reduced-motion:reduce){.bf-root *{animation-duration:.01s!important;transition:none!important}}'
].join('\n');

/* ===================== 06-instance: studio / listen UI, state, render loop, XR ===================== */
var SVG_NS = 'http://www.w3.org/2000/svg';
var LIGHT_LEVELS = { off: 0, chill: 0.5, festival: 1 };
function h(tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  if (tag === 'button') e.type = 'button';
  return e;
}
function icon(kind) {
  var s = document.createElementNS(SVG_NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
  var p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', kind === 'stop' ? 'M6 6h12v12H6z' : 'M8 5.5v13l11-6.5z');
  s.appendChild(p);
  return s;
}
function hex(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

function Instance(host, opts) {
  this.host = host; this.opts = opts || {};
  this.mode = this.opts.mode === 'listen' ? 'listen' : 'studio';
  this.listeners = []; this.timers = []; this.undoStack = []; this.queue = [];
  this.frames = 0; this.playing = false; this.dead = false; this.lastStep = -1; this.curBar = -1;
  this.beat = 0; this.last = performance.now(); this.busyAuto = false; this.dragUndo = false; this.paint = null;
  this.prefs = { lights: 'festival', reduceFlash: true };
  this.el = {}; this.cells = {}; this.activeVibe = null; this.xrSession = null;
  var pending = null;
  var init = parseSpecInput(this.opts.spec);
  this.spec = init.ok ? sanitizeSpec(init.obj, defaultSpec()) : defaultSpec();
  if (!init.ok && !init.empty) pending = init.err;
  this.root = h('div', 'bf-root');
  this.root.setAttribute('data-mode', this.mode);
  var st = h('style'); st.textContent = BF_CSS; this.root.appendChild(st);
  host.appendChild(this.root);
  if (!window.Tone) {
    var err = h('div', 'bf-err', 'BeatForge could not start: Tone.js (audio library) is not loaded. Load Tone.js 14.8.49 before the BeatForge script.');
    this.root.appendChild(err);
    this.broken = true;
    return;
  }
  var self = this;
  this.audio = new AudioEngine({
    getSpec: function () { return self.spec; },
    onTick: function (time, step, bar, ev, gbar) { self.onTick(time, step, bar, ev, gbar); },
    lineFor: function (gbar, bar) { return self.lineFor(gbar, bar); }
  });
  this.singer = new Singer(this);
  this.build();
  if (window.THREE) {
    try { this.vis = new Visualizer(this.el.stage); this.vis.setTheme(this.spec.visual); }
    catch (e) { console.warn('BeatForge: WebGL visualizer unavailable', e); this.vis = null; }
  }
  if (!this.vis) this.root.classList.add('bf-nogl');
  if (!window.THREE) pending = pending || 'three.js is not loaded: the 3D visualizer is off.';
  this.applyTheme();
  this.render();
  this.singer.update(this.spec);
  this.startLoop();
  this.observe();
  this.checkXR();
  if (pending) this.notify(pending, 'error');
}
var IP = Instance.prototype;

/* ---------- small infra ---------- */
IP.on = function (el, ev, fn, o) { el.addEventListener(ev, fn, o || false); this.listeners.push([el, ev, fn, o || false]); };
IP.later = function (fn, ms) { var self = this, id = setTimeout(function () { self.timers = self.timers.filter(function (x) { return x !== id; }); if (!self.dead) fn(); }, ms); this.timers.push(id); return id; };
IP.clearLater = function (id) { if (id != null) { clearTimeout(id); this.timers = this.timers.filter(function (x) { return x !== id; }); } };
IP.getSpecJson = function () { return JSON.stringify(this.spec); };

/* ---------- state changes ---------- */
IP.pushUndo = function () {
  this.undoStack.push(JSON.stringify(this.spec));
  if (this.undoStack.length > 60) this.undoStack.shift();
};
IP.change = function (mut, o) {
  o = o || {};
  if (!o.noUndo) this.pushUndo();
  var d = JSON.parse(JSON.stringify(this.spec));
  mut(d);
  if (!o.keepVibe) this.activeVibe = o.vibe || null;
  this.setSpec(sanitizeSpec(d, this.spec), o);
};
IP.setSpec = function (sp, o) {
  o = o || {};
  var prevVisual = this.spec.visual;
  this.spec = sp;
  if (this.audio) this.audio.sync(sp);
  if (this.singer) this.singer.update(sp);
  if (this.vis && prevVisual !== sp.visual) this.vis.setTheme(sp.visual);
  this.applyTheme();
  this.render();
  if (!o.silent) this.queueChange();
};
IP.queueChange = function () {
  var self = this;
  if (typeof this.opts.onChange !== 'function') return;
  this.clearLater(this.changeTimer);
  this.changeTimer = this.later(function () { try { self.opts.onChange(self.getSpecJson()); } catch (e) { console.warn(e); } }, 1000);
};
IP.undo = function () {
  if (!this.undoStack.length) return;
  var prev = JSON.parse(this.undoStack.pop());
  this.activeVibe = null;
  this.setSpec(sanitizeSpec(prev, this.spec));
};
IP.applySpec = function (json) {
  var r = parseSpecInput(json);
  this.endAutoBusy();
  if (!r.ok) { this.notify(r.err, 'error'); return false; }
  this.pushUndo();
  this.activeVibe = null;
  this.setSpec(sanitizeSpec(r.obj, this.spec));
  return true;
};
IP.setLyrics = function (text) {
  var t = cleanText(typeof text === 'string' ? text : String(text == null ? '' : text), 600, true);
  this.endAutoBusy();
  this.change(function (d) {
    d.lyrics = t;
    if (t.trim() && d.voice.mode !== 'lyrics' && d.voice.mode !== 'singer') d.voice.mode = 'lyrics';
  }, { keepVibe: true });
};

/* ---------- busy / toasts ---------- */
IP.setBusy = function (b, msg, auto) {
  if (!this.el.busy) return;
  this.el.busy.classList.toggle('bf-show', !!b);
  this.el.busyMsg.textContent = cleanText(typeof msg === 'string' && msg ? msg : 'AI is composing\u2026', 120, false);
  this.busyAuto = !!(b && auto);
  this.clearLater(this.busyTimer);
  if (b && auto) {
    var self = this;
    this.busyTimer = this.later(function () { if (self.busyAuto) { self.setBusy(false); self.notify('The AI is taking too long. Please try again.', 'error'); } }, 60000);
  }
  (this.el.aiBtns || []).forEach(function (x) { x.disabled = !!b; });
};
IP.endAutoBusy = function () { if (this.busyAuto) this.setBusy(false); };
IP.notify = function (msg, kind) {
  kind = oneOf(kind, ['info', 'error', 'success'], 'info');
  if (kind === 'error') this.endAutoBusy();
  if (!this.el.toasts) { console.log('BeatForge:', msg); return; }
  var t = h('div', 'bf-toast bf-' + kind, cleanText(String(msg == null ? '' : msg), 200, false));
  t.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  this.el.toasts.appendChild(t);
  while (this.el.toasts.childNodes.length > 4) this.el.toasts.removeChild(this.el.toasts.firstChild);
  this.later(function () { if (t.parentNode) t.parentNode.removeChild(t); }, kind === 'error' ? 6000 : 3500);
};

/* ---------- UI construction ---------- */
IP.build = function () {
  var self = this, el = this.el, root = this.root;
  // stage
  var stage = el.stage = h('div', 'bf-stage');
  stage.appendChild(h('div', 'bf-vignette'));
  var top = h('div', 'bf-top');
  var logo = h('div', 'bf-logo'); logo.appendChild(document.createTextNode('Beat')); logo.appendChild(h('b', null, 'Forge'));
  el.title = h('div', 'bf-title');
  el.vr = h('button', 'bf-vr', 'Enter VR'); el.vr.hidden = true;
  this.on(el.vr, 'click', function () { self.toggleVR(); });
  top.appendChild(logo); top.appendChild(el.title); top.appendChild(el.vr);
  stage.appendChild(top);
  el.pill = h('div', 'bf-pill'); el.pill.hidden = true; stage.appendChild(el.pill);
  var center = h('div', 'bf-center');
  el.play = h('button', 'bf-play'); el.play.setAttribute('aria-label', 'Play');
  el.play.appendChild(icon('play'));
  this.on(el.play, 'click', function () { self.togglePlay(); });
  el.meta = h('div', 'bf-meta');
  center.appendChild(el.play); center.appendChild(el.meta);
  stage.appendChild(center);
  var kar = h('div', 'bf-karaoke');
  el.kCur = h('div', 'bf-k-cur'); el.kNext = h('div', 'bf-k-next');
  kar.appendChild(el.kCur); kar.appendChild(el.kNext);
  stage.appendChild(kar);
  root.appendChild(stage);
  if (this.mode === 'listen') this.buildListen(); else this.buildStudio();
  el.toasts = h('div', 'bf-toasts'); el.toasts.setAttribute('aria-live', 'polite');
  root.appendChild(el.toasts);
  el.busy = h('div', 'bf-busy');
  var bi = h('div', 'bf-busy-in'); bi.appendChild(h('div', 'bf-spin')); el.busyMsg = h('div', null, 'AI is composing\u2026');
  bi.appendChild(el.busyMsg); el.busy.appendChild(bi); root.appendChild(el.busy);
  this.on(document, 'keydown', function (e) { self.onKey(e); });
  this.on(window, 'pointerup', function () { self.paint = null; });
  this.on(window, 'pointercancel', function () { self.paint = null; });
};
IP.lightControls = function (parent) {
  var self = this;
  var f = h('div', 'bf-field'); f.appendChild(document.createTextNode('Light show'));
  this.el.lightSeg = this.seg([['off', 'Off'], ['chill', 'Chill'], ['festival', 'Festival']], function (v) { self.prefs.lights = v; self.renderPrefs(); });
  f.appendChild(this.el.lightSeg); parent.appendChild(f);
  this.el.flashBtn = h('button', 'bf-chip', 'Reduce flashing');
  this.el.flashBtn.setAttribute('aria-pressed', 'true');
  this.on(this.el.flashBtn, 'click', function () { self.prefs.reduceFlash = !self.prefs.reduceFlash; self.renderPrefs(); });
  parent.appendChild(this.el.flashBtn);
};
IP.buildListen = function () {
  var self = this, bar = h('div', 'bf-listen');
  var sp = h('button', 'bf-small-play'); sp.setAttribute('aria-label', 'Play'); sp.appendChild(icon('play'));
  this.on(sp, 'click', function () { self.togglePlay(); });
  this.el.play2 = sp;
  bar.appendChild(sp);
  this.lightControls(bar);
  this.root.appendChild(bar);
};
IP.seg = function (options, onPick) {
  var self = this, s = h('div', 'bf-seg');
  s.setAttribute('role', 'group');
  options.forEach(function (o) {
    var b = h('button', null, o[1]); b.setAttribute('data-v', o[0]);
    self.on(b, 'click', function () { onPick(o[0]); });
    s.appendChild(b);
  });
  return s;
};
function setSeg(s, v) {
  for (var i = 0; i < s.childNodes.length; i++) {
    var b = s.childNodes[i], on = b.getAttribute('data-v') === String(v);
    b.classList.toggle('bf-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}
IP.select = function (options, onPick, label) {
  var s = h('select');
  if (label) s.setAttribute('aria-label', label);
  options.forEach(function (o) { var op = h('option', null, o[1]); op.value = o[0]; s.appendChild(op); });
  this.on(s, 'change', function () { onPick(s.value); });
  return s;
};
IP.range = function (min, max, step, get, set, label) {
  var self = this, r = h('input');
  r.type = 'range'; r.min = min; r.max = max; r.step = step;
  if (label) r.setAttribute('aria-label', label);
  this.on(r, 'input', function () {
    if (!self.dragUndo) { self.pushUndo(); self.dragUndo = true; }
    var v = Number(r.value);
    self.change(function (d) { set(d, v); }, { noUndo: true, keepVibe: true });
  });
  this.on(r, 'change', function () { self.dragUndo = false; });
  r._get = get;
  (this.ranges = this.ranges || []).push(r);
  return r;
};
IP.field = function (label, ctl, valEl) {
  var f = h('label', 'bf-field'); f.appendChild(document.createTextNode(label)); f.appendChild(ctl);
  if (valEl) f.appendChild(valEl);
  return f;
};
IP.buildStudio = function () {
  var self = this, el = this.el, panel = h('div', 'bf-panel');
  // header: name, save, undo
  var head = h('div', 'bf-head');
  el.name = h('input', 'bf-input'); el.name.maxLength = 40; el.name.placeholder = 'Name your song'; el.name.setAttribute('aria-label', 'Song name');
  this.on(el.name, 'focus', function () { self.pushUndo(); });
  this.on(el.name, 'input', function () { var v = el.name.value; self.change(function (d) { d.name = v; }, { noUndo: true, keepVibe: true }); });
  el.undo = h('button', 'bf-btn', '\u21b6 Undo');
  this.on(el.undo, 'click', function () { self.undo(); });
  el.save = h('button', 'bf-btn bf-hot', '\ud83d\udcbe Save');
  this.on(el.save, 'click', function () { self.save(); });
  head.appendChild(el.name); head.appendChild(el.undo); head.appendChild(el.save);
  panel.appendChild(head);
  // transport bar
  var bar = h('div', 'bf-bar');
  el.bpmVal = h('b');
  bar.appendChild(this.field('Tempo', this.range(60, 180, 1, function (s) { return s.bpm; }, function (d, v) { d.bpm = v; }, 'Tempo'), el.bpmVal));
  el.key = this.select(KEYS.map(function (k) { return [k, k]; }), function (v) { self.change(function (d) { d.key = v; }, { keepVibe: true }); }, 'Key');
  bar.appendChild(this.field('Key', el.key));
  el.scale = this.select(SCALE_NAMES.map(function (k) { return [k, k.charAt(0).toUpperCase() + k.slice(1)]; }), function (v) { self.change(function (d) { d.scale = v; }, { keepVibe: true }); }, 'Scale');
  bar.appendChild(this.field('Scale', el.scale));
  el.swingVal = h('b');
  bar.appendChild(this.field('Swing', this.range(0, 0.5, 0.01, function (s) { return s.swing; }, function (d, v) { d.swing = v; }, 'Swing'), el.swingVal));
  var sw = h('div', 'bf-field'); sw.appendChild(document.createTextNode('Look'));
  el.swatches = VISUALS.map(function (v) {
    var b = h('button', 'bf-swatch'); b.setAttribute('aria-label', v + ' theme'); b.title = v;
    b.style.background = 'linear-gradient(135deg,' + THEMES[v].a1 + ',' + THEMES[v].a2 + ')';
    b.setAttribute('data-v', v);
    self.on(b, 'click', function () { self.change(function (d) { d.visual = v; }, { keepVibe: true }); });
    sw.appendChild(b); return b;
  });
  bar.appendChild(sw);
  this.lightControls(bar);
  panel.appendChild(bar);
  // vibes
  var vs = h('div'); vs.appendChild(h('div', 'bf-h', 'Pick a vibe'));
  var vc = h('div', 'bf-chips');
  el.vibes = VIBES.map(function (v) {
    var b = h('button', 'bf-chip bf-big', v.icon + ' ' + v.label); b.setAttribute('data-v', v.id);
    self.on(b, 'click', function () { self.pickVibe(v.id); });
    vc.appendChild(b); return b;
  });
  vs.appendChild(vc); panel.appendChild(vs);
  // layers
  var ls = h('div'); ls.appendChild(h('div', 'bf-h', 'Layers'));
  var lc = h('div', 'bf-chips');
  el.layers = [['drums', '\ud83e\udd41 Drums'], ['bass', '\ud83c\udfb8 Bass'], ['chords', '\ud83c\udfb9 Chords'], ['melody', '\ud83c\udfb6 Melody']].map(function (l) {
    var b = h('button', 'bf-chip', l[1]); b.setAttribute('data-v', l[0]);
    self.on(b, 'click', function () { self.change(function (d) { d[l[0]].on = !d[l[0]].on; }, { keepVibe: true }); });
    lc.appendChild(b); return b;
  });
  var vl = h('div', 'bf-field'); vl.appendChild(document.createTextNode('\ud83c\udfa4 Voice'));
  el.voiceSeg1 = this.voiceSeg(); vl.appendChild(el.voiceSeg1); lc.appendChild(vl);
  ls.appendChild(lc); panel.appendChild(ls);
  // AI
  var ai = h('div', 'bf-ai');
  ai.appendChild(h('div', 'bf-h', '\u2728 AI composer'));
  el.prompt = h('textarea'); el.prompt.maxLength = 300; el.prompt.rows = 2;
  el.prompt.placeholder = 'Describe your vibe\u2026 e.g. rainy night, soft drums, someone humming';
  el.prompt.setAttribute('aria-label', 'Describe your vibe');
  ai.appendChild(el.prompt);
  var ex = h('div', 'bf-chips');
  ['Rainy night lo-fi with humming', 'Sunny beach house party', 'Epic space trap with a choir', 'Chill drums, no words'].forEach(function (t) {
    var b = h('button', 'bf-ex', t);
    self.on(b, 'click', function () { el.prompt.value = t; el.prompt.focus(); });
    ex.appendChild(b);
  });
  ai.appendChild(ex);
  var ab = h('div', 'bf-chips');
  el.aiBtns = [['song', '\u2728 Compose with AI', true], ['lyrics', '\u270d\ufe0f Write lyrics'], ['enhance', '\ud83e\ude84 Enhance']].map(function (a) {
    var b = h('button', 'bf-btn' + (a[2] ? ' bf-hot' : ''), a[1]);
    self.on(b, 'click', function () { self.requestAI(a[0]); });
    ab.appendChild(b); return b;
  });
  ai.appendChild(ab);
  panel.appendChild(ai);
  // tracks
  var tracks = h('div', 'bf-tracks');
  tracks.appendChild(this.drumCard());
  tracks.appendChild(this.laneCard('bass', 'Bass', BASS_SOUNDS, 7));
  tracks.appendChild(this.laneCard('melody', 'Melody', MELODY_SOUNDS, 14));
  tracks.appendChild(this.chordCard());
  tracks.appendChild(this.voiceCard());
  tracks.appendChild(this.fxCard());
  panel.appendChild(tracks);
  this.root.appendChild(panel);
};
IP.voiceSeg = function () {
  var self = this;
  return this.seg([['none', 'None'], ['hum', 'Hum'], ['ooh', 'Ooh'], ['aah', 'Aah'], ['lyrics', 'Lyrics'], ['singer', 'AI singer']], function (v) {
    self.change(function (d) { d.voice.mode = v; }, { keepVibe: true });
  });
};
IP.cardHead = function (card, key, title, sounds, dice) {
  var self = this, ch = h('div', 'bf-ch');
  var pow = h('button', 'bf-pow'); pow.setAttribute('aria-label', 'Toggle ' + title);
  if (key !== 'voice' && key !== 'fx') {
    this.on(pow, 'click', function () { self.change(function (d) { d[key].on = !d[key].on; }, { keepVibe: true }); });
    ch.appendChild(pow);
  }
  ch.appendChild(h('div', 'bf-ct', title));
  var sel = null;
  if (sounds) {
    sel = this.select(sounds.map(function (s) { return [s, s === '808' ? '808' : s.charAt(0).toUpperCase() + s.slice(1)]; }), function (v) {
      self.change(function (d) { if (key === 'drums') d.drums.kit = v; else d[key].sound = v; }, { keepVibe: true });
    }, title + ' sound');
    ch.appendChild(sel);
  }
  if (key !== 'fx') ch.appendChild(this.range(0, 1, 0.01, function (s) { return s[key].vol; }, function (d, v) { d[key].vol = v; }, title + ' volume'));
  if (dice) {
    var dz = h('button', 'bf-dice', '\ud83c\udfb2'); dz.title = 'Regenerate ' + title.toLowerCase(); dz.setAttribute('aria-label', 'Regenerate ' + title);
    this.on(dz, 'click', function () { dice(); });
    ch.appendChild(dz);
  }
  card.appendChild(ch);
  this.el['card_' + key] = { card: card, pow: pow, sel: sel };
};
IP.drumCard = function () {
  var self = this, card = h('div', 'bf-card bf-wide');
  this.cardHead(card, 'drums', 'Drums', KITS, function () {
    var g = genDrums(styleFor(self.spec));
    self.change(function (d) { DRUM_ROWS.forEach(function (r) { d.drums[r] = g[r]; }); d.drums.on = true; }, { keepVibe: true });
  });
  var body = h('div', 'bf-body');
  this.cells.drums = {}; this.rowEls = [];
  DRUM_ROWS.forEach(function (r) {
    var row = h('div', 'bf-row'); row.appendChild(h('div', 'bf-rl', r));
    var steps = h('div', 'bf-steps'), arr = [];
    for (var i = 0; i < 16; i++) (function (i) {
      var c = h('button', 'bf-cell'); c.setAttribute('aria-label', r + ' step ' + (i + 1));
      self.on(c, 'pointerdown', function (e) {
        if (e.button !== 0) return;
        e.preventDefault();
        var val = self.spec.drums[r][i] ? 0 : 1;
        self.paint = { row: r, val: val };
        self.change(function (d) { d.drums[r][i] = val; }, { keepVibe: true });
        if (val) self.audio.preview(r);
      });
      self.on(c, 'pointerenter', function () {
        if (!self.paint || self.paint.row !== r || self.spec.drums[r][i] === self.paint.val) return;
        var val = self.paint.val;
        self.change(function (d) { d.drums[r][i] = val; }, { noUndo: true, keepVibe: true });
      });
      self.on(c, 'keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self.change(function (d) { d.drums[r][i] = d.drums[r][i] ? 0 : 1; }, { keepVibe: true }); } });
      steps.appendChild(c); arr.push(c);
    })(i);
    self.cells.drums[r] = arr; self.rowEls.push([row, r]);
    row.appendChild(steps); body.appendChild(row);
  });
  card.appendChild(body);
  return card;
};
IP.laneCard = function (key, title, sounds, max) {
  var self = this, card = h('div', 'bf-card');
  this.cardHead(card, key, title, sounds, function () {
    self.change(function (d) {
      if (key === 'bass') d.bass.notes = genBass(styleFor(self.spec), self.spec.drums.kick);
      else d.melody.notes = genMelody(0.3 + Math.random() * 0.25);
      d[key].on = true;
    }, { keepVibe: true });
  });
  var body = h('div', 'bf-body'), row = h('div', 'bf-steps bf-lane'), arr = [];
  for (var i = 0; i < 16; i++) (function (i) {
    var c = h('button', 'bf-cell'); c.setAttribute('aria-label', title + ' step ' + (i + 1));
    var fill = h('div', 'bf-fill'), nl = h('div', 'bf-nl');
    c.appendChild(fill); c.appendChild(nl); c._fill = fill; c._nl = nl;
    function bump(dir) {
      self.change(function (d) { var v = d[key].notes[i] + dir; d[key].notes[i] = v > max ? 0 : (v < 0 ? max : v); }, { keepVibe: true });
      var nv = self.spec[key].notes[i];
      if (nv) self.audio.preview(key, key === 'bass' ? bassMidi(self.spec, self.spec.chords.progression[0], nv) : melodyMidi(self.spec, nv));
    }
    self.on(c, 'pointerdown', function (e) { if (e.button !== 0) return; e.preventDefault(); bump(e.shiftKey ? -1 : 1); });
    self.on(c, 'contextmenu', function (e) { e.preventDefault(); bump(-1); });
    self.on(c, 'keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowUp') { e.preventDefault(); bump(1); }
      else if (e.key === 'ArrowDown' || e.key === 'Backspace') { e.preventDefault(); bump(-1); }
    });
    row.appendChild(c); arr.push(c);
  })(i);
  this.cells[key] = arr;
  body.appendChild(row);
  body.appendChild(h('div', 'bf-status', 'Click = higher note \u00b7 right-click / shift-click = lower \u00b7 top = rest'));
  body.lastChild.style.color = 'var(--dim)';
  card.appendChild(body);
  return card;
};
IP.chordCard = function () {
  var self = this, card = h('div', 'bf-card');
  this.cardHead(card, 'chords', 'Chords', CHORD_SOUNDS, function () {
    self.change(function (d) { d.chords.progression = genChords(d.scale); d.chords.on = true; }, { keepVibe: true });
  });
  var body = h('div', 'bf-body'), row = h('div', 'bf-chords'), arr = [];
  for (var i = 0; i < 4; i++) (function (i) {
    var c = h('button', 'bf-chord'); c.setAttribute('aria-label', 'Chord bar ' + (i + 1));
    c._name = h('span'); c._deg = h('small'); c.appendChild(c._name); c.appendChild(c._deg);
    function bump(dir) {
      self.change(function (d) { var v = d.chords.progression[i] + dir; d.chords.progression[i] = v > 7 ? 1 : (v < 1 ? 7 : v); }, { keepVibe: true });
      self.audio.preview('chords', chordMidis(self.spec, self.spec.chords.progression[i], true));
    }
    self.on(c, 'click', function (e) { bump(e.shiftKey ? -1 : 1); });
    self.on(c, 'contextmenu', function (e) { e.preventDefault(); bump(-1); });
    row.appendChild(c); arr.push(c);
  })(i);
  this.cells.chords = arr;
  body.appendChild(row);
  card.appendChild(body);
  return card;
};
IP.voiceCard = function () {
  var self = this, el = this.el, card = h('div', 'bf-card');
  this.cardHead(card, 'voice', 'Voice', null, function () {
    self.change(function (d) { d.voice.mode = pick(['hum', 'ooh', 'aah'].filter(function (m) { return m !== d.voice.mode; })); }, { keepVibe: true });
  });
  var body = h('div', 'bf-body');
  el.voiceSeg2 = this.voiceSeg(); body.appendChild(el.voiceSeg2);
  var sr = h('div', 'bf-ch');
  el.voicePick = h('select'); el.voicePick.setAttribute('aria-label', 'Singer voice');
  var hasAz = typeof this.opts.onVoiceRequest === 'function';
  if (hasAz) {
    var g1 = h('optgroup'); g1.label = 'Premium (Azure neural)';
    AZURE_VOICES.forEach(function (v) { var o = h('option', null, v[1]); o.value = 'azure:' + v[0]; g1.appendChild(o); });
    el.voicePick.appendChild(g1);
  }
  var g2 = h('optgroup'); g2.label = 'Free in-browser AI (Kokoro)';
  KOKORO_VOICES.forEach(function (v) { var o = h('option', null, v[1]); o.value = 'kokoro:' + v[0]; g2.appendChild(o); });
  el.voicePick.appendChild(g2);
  var g3 = h('optgroup'); g3.label = 'Instant'; var ob = h('option', null, 'Browser voice'); ob.value = 'browser:'; g3.appendChild(ob);
  el.voicePick.appendChild(g3);
  this.on(el.voicePick, 'change', function () {
    var p = el.voicePick.value.split(':');
    self.change(function (d) { d.voice.engine = p[0]; if (p[1]) d.voice.voiceName = p[1]; }, { keepVibe: true });
  });
  sr.appendChild(h('div', 'bf-ct', 'Singer'));
  sr.appendChild(el.voicePick);
  el.singerRow = sr;
  body.appendChild(sr);
  el.singerStatus = h('div', 'bf-status'); body.appendChild(el.singerStatus);
  el.lyrics = h('textarea', 'bf-lyr'); el.lyrics.maxLength = 600; el.lyrics.rows = 4;
  el.lyrics.placeholder = 'Lyrics: one line per bar (optional)';
  el.lyrics.setAttribute('aria-label', 'Lyrics');
  this.on(el.lyrics, 'focus', function () { self.pushUndo(); });
  this.on(el.lyrics, 'input', function () { var v = el.lyrics.value; self.change(function (d) { d.lyrics = v; }, { noUndo: true, keepVibe: true }); });
  body.appendChild(el.lyrics);
  var wl = h('button', 'bf-btn', '\u270d\ufe0f Write lyrics with AI');
  this.on(wl, 'click', function () { self.requestAI('lyrics'); });
  el.aiBtns.push(wl);
  body.appendChild(wl);
  el.klist = h('div', 'bf-klist'); body.appendChild(el.klist);
  card.appendChild(body);
  return card;
};
IP.fxCard = function () {
  var self = this, el = this.el, card = h('div', 'bf-card');
  this.cardHead(card, 'fx', 'Space & texture', null, null);
  var body = h('div', 'bf-sliders');
  el.fxVals = {};
  [['reverb', 'Reverb'], ['delay', 'Echo'], ['lofi', 'Lo-fi']].forEach(function (f) {
    var v = h('b'); el.fxVals[f[0]] = v;
    body.appendChild(self.field(f[1], self.range(0, 1, 0.01, function (s) { return s.fx[f[0]]; }, function (d, x) { d.fx[f[0]] = x; }, f[1]), v));
  });
  card.appendChild(body);
  return card;
};

/* ---------- render (spec -> DOM) ---------- */
IP.applyTheme = function () {
  var th = THEMES[this.spec.visual] || THEMES.neon, s = this.root.style;
  s.setProperty('--a1', th.a1); s.setProperty('--a2', th.a2); s.setProperty('--bg', hex(th.bg));
  this.root.setAttribute('data-theme', this.spec.visual);
  var C = th.c;
  (this.rowEls || []).forEach(function (x) { x[0].style.setProperty('--rc', hex(C[x[1]])); });
  var self = this;
  ['bass', 'melody', 'chords'].forEach(function (k) {
    var c = self.el['card_' + k]; if (c) c.card.style.setProperty('--rc', hex(C[k]));
  });
};
IP.render = function () {
  var sp = this.spec, el = this.el, self = this;
  el.title.textContent = sp.name;
  el.meta.textContent = sp.bpm + ' BPM \u00b7 ' + sp.key + ' ' + sp.scale;
  this.renderPrefs();
  this.renderKaraokeIdle();
  if (this.mode !== 'studio' || !el.name) return;
  if (document.activeElement !== el.name) el.name.value = sp.name;
  el.undo.disabled = !this.undoStack.length;
  el.bpmVal.textContent = String(sp.bpm);
  el.swingVal.textContent = Math.round(sp.swing * 100) + '%';
  el.key.value = sp.key; el.scale.value = sp.scale;
  (this.ranges || []).forEach(function (r) { if (document.activeElement !== r) r.value = String(r._get(sp)); });
  el.swatches.forEach(function (b) { b.classList.toggle('bf-on', b.getAttribute('data-v') === sp.visual); });
  el.vibes.forEach(function (b) { b.classList.toggle('bf-on', b.getAttribute('data-v') === self.activeVibe); });
  el.layers.forEach(function (b) { var k = b.getAttribute('data-v'); b.classList.toggle('bf-on', sp[k].on); b.setAttribute('aria-pressed', sp[k].on ? 'true' : 'false'); });
  setSeg(el.voiceSeg1, sp.voice.mode); setSeg(el.voiceSeg2, sp.voice.mode);
  ['drums', 'bass', 'chords', 'melody'].forEach(function (k) {
    var c = el['card_' + k];
    c.pow.classList.toggle('bf-on', sp[k].on); c.pow.setAttribute('aria-pressed', sp[k].on ? 'true' : 'false');
    c.card.classList.toggle('bf-off', !sp[k].on);
    c.sel.value = k === 'drums' ? sp.drums.kit : sp[k].sound;
  });
  DRUM_ROWS.forEach(function (r) {
    var a = self.cells.drums[r];
    for (var i = 0; i < 16; i++) a[i].classList.toggle('bf-on', !!sp.drums[r][i]);
  });
  [['bass', 7], ['melody', 14]].forEach(function (x) {
    var k = x[0], a = self.cells[k];
    for (var i = 0; i < 16; i++) {
      var v = sp[k].notes[i], c = a[i];
      c._fill.style.height = v ? (18 + v / x[1] * 82) + '%' : '0';
      c._nl.textContent = v ? pcName(k === 'bass' ? bassMidi(sp, sp.chords.progression[0], v) : melodyMidi(sp, v)) : '';
    }
  });
  var roman = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  this.cells.chords.forEach(function (c, i) {
    var d = sp.chords.progression[i];
    c._name.textContent = chordName(sp, d); c._deg.textContent = 'bar ' + (i + 1) + ' \u00b7 ' + roman[d - 1];
  });
  if (document.activeElement !== el.lyrics) el.lyrics.value = sp.lyrics;
  var singer = sp.voice.mode === 'singer';
  el.singerRow.style.display = singer ? '' : 'none';
  el.singerStatus.style.display = singer ? '' : 'none';
  if (singer) {
    var r = this.singer.resolve(sp);
    var want = r.engine === 'browser' ? 'browser:' : r.engine + ':' + r.voice;
    var opt = null;
    for (var i = 0; i < el.voicePick.options.length; i++) if (el.voicePick.options[i].value === want) opt = want;
    el.voicePick.value = opt || (r.engine === 'kokoro' ? 'kokoro:af_heart' : el.voicePick.options[0].value);
  }
  el.lyrics.style.display = (sp.voice.mode === 'lyrics' || singer || sp.lyrics) ? '' : 'none';
  Object.keys(el.fxVals).forEach(function (k) { el.fxVals[k].textContent = Math.round(sp.fx[k] * 100); });
  this.renderKList();
  this.onSingerStatus();
};
IP.renderPrefs = function () {
  if (this.el.lightSeg) setSeg(this.el.lightSeg, this.prefs.lights);
  if (this.el.flashBtn) { this.el.flashBtn.classList.toggle('bf-on', this.prefs.reduceFlash); this.el.flashBtn.setAttribute('aria-pressed', this.prefs.reduceFlash ? 'true' : 'false'); }
};
IP.currentLines = function () {
  var m = this.spec.voice.mode;
  if (m === 'singer') return this.singer.lines.length ? this.singer.lines : singerLines(this.spec);
  if (m === 'lyrics') return lyricLines(this.spec);
  return [];
};
IP.renderKList = function () {
  var k = this.el.klist; if (!k) return;
  while (k.firstChild) k.removeChild(k.firstChild);
  this.currentLines().forEach(function (l, i) { var d = h('div', null, l); d.setAttribute('data-i', i); k.appendChild(d); });
  this.highlightLine(this.curLine);
};
IP.renderKaraokeIdle = function () {
  if (this.playing) return;
  var lines = this.currentLines();
  this.el.kCur.textContent = lines.length ? lines[0] : '';
  this.el.kNext.textContent = lines.length > 1 ? lines[1] : '';
  this.el.kCur.style.opacity = lines.length ? '0.5' : '1';
};
IP.highlightLine = function (idx) {
  var k = this.el.klist; if (!k) return;
  for (var i = 0; i < k.childNodes.length; i++) k.childNodes[i].classList.toggle('bf-on', i === idx);
};
IP.onSingerStatus = function () {
  var s = this.singer, sp = this.spec, el = this.el;
  if (!s) return;
  var on = sp.voice.mode === 'singer';
  if (el.singerStatus) el.singerStatus.textContent = on ? s.statusText : '';
  if (el.pill) { el.pill.hidden = !(on && s.status === 'loading'); el.pill.textContent = s.statusText; }
  if (on && s.lines.length && el.klist && el.klist.childNodes.length !== s.lines.length) this.renderKList();
};

/* ---------- actions ---------- */
IP.pickVibe = function (id) {
  var p = presetSpec(id), self = this;
  this.change(function (d) {
    var keep = { lyrics: d.lyrics, engine: d.voice.engine, voiceName: d.voice.voiceName };
    Object.keys(p).forEach(function (k) { d[k] = p[k]; });
    d.lyrics = id === 'drumshum' ? '' : keep.lyrics;
    d.voice.engine = keep.engine; d.voice.voiceName = keep.voiceName;
  }, { vibe: id });
  var v = VIBES.filter(function (x) { return x.id === id; })[0];
  this.notify((v ? v.label : 'Vibe') + ' \u2014 ' + this.spec.name, 'success');
  if (!this.playing) self.play();
};
IP.requestAI = function (kind) {
  var fn = this.opts.onAIRequest;
  if (typeof fn !== 'function') { this.notify('AI is not connected in this app', 'error'); return; }
  var prompt = cleanText(this.el.prompt ? this.el.prompt.value : '', 300, false).trim();
  var msg = kind === 'lyrics' ? 'AI is writing lyrics\u2026' : (kind === 'enhance' ? 'AI is enhancing your song\u2026' : 'AI is composing\u2026');
  this.setBusy(true, msg, true);
  try { fn(kind, prompt, this.getSpecJson()); } catch (e) { this.setBusy(false); this.notify('AI request failed', 'error'); console.warn(e); }
};
IP.save = function () {
  var fn = this.opts.onSave;
  var name = cleanText(this.el.name.value, 40, false).trim() || 'Untitled beat';
  if (name !== this.spec.name) this.change(function (d) { d.name = name; }, { keepVibe: true });
  if (typeof fn !== 'function') { this.notify('Saving is not connected in this app', 'error'); return; }
  try { fn(this.spec.name, this.getSpecJson()); } catch (e) { this.notify('Save failed', 'error'); console.warn(e); }
};
IP.togglePlay = function () { if (this.playing) this.stop(); else this.play(); };
IP.play = function () {
  var self = this;
  if (!this.audio) return;
  this.playing = true; this.renderPlay();
  this.audio.ensure().then(function () {
    if (!self.playing || self.dead) return;
    self.audio.play();
  }).catch(function (e) {
    self.playing = false; self.renderPlay();
    self.notify('Could not start audio: ' + (e && e.message ? e.message : 'blocked by the browser'), 'error');
  });
};
IP.stop = function () {
  this.playing = false;
  if (this.audio) this.audio.stop();
  this.queue.length = 0;
  try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  this.setPlayhead(-1, -1);
  this.curLine = -1; this.highlightLine(-1);
  this.renderPlay();
  this.renderKaraokeIdle();
};
IP.renderPlay = function () {
  var self = this;
  [this.el.play, this.el.play2].forEach(function (b) {
    if (!b) return;
    b.removeChild(b.firstChild); b.appendChild(icon(self.playing ? 'stop' : 'play'));
    b.setAttribute('aria-label', self.playing ? 'Stop' : 'Play');
  });
};
IP.onKey = function (e) {
  if (this.dead || e.defaultPrevented) return;
  var t = e.target, tag = t && t.tagName;
  if (t !== document.body && !this.root.contains(t)) return;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || (t && t.isContentEditable)) return;
  if (e.code === 'Space' || e.key === ' ') { e.preventDefault(); this.togglePlay(); }
  else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && this.mode === 'studio') { e.preventDefault(); this.undo(); }
};

/* ---------- sequencer callbacks (audio thread time -> UI) ---------- */
IP.onTick = function (time, step, bar, ev, gbar) {
  this.queue.push({ t: time, step: step, bar: bar, ev: ev });
  if (this.queue.length > 400) this.queue.splice(0, this.queue.length - 64);
  if (step === 8 && this.spec.voice.mode === 'singer') {
    var self = this, nb = (bar + 1) % 4;
    this.later(function () { self.singer.prefetch(gbar + 1, nb); }, 0);
  }
};
IP.lineFor = function (gbar, bar) {
  var m = this.spec.voice.mode;
  if (m === 'lyrics') { var l = lyricLines(this.spec); return l.length ? { line: gbar % l.length, speak: true } : { line: -1 }; }
  if (m === 'singer') return this.singer.bufferFor(gbar, bar);
  return null;
};
IP.handleTick = function (e, late) {
  this.setPlayhead(e.step, e.bar);
  for (var i = 0; i < e.ev.length; i++) {
    var x = e.ev[i];
    if (x.i === 'bar') { if (this.vis) this.vis.setBar(x.bar, x.deg); continue; }
    if (x.i === 'lyric') { this.showLine(x.line, x.speak && !late); continue; }
    if (late) continue;
    if (x.i === 'kick') this.beat = 1;
    if (this.vis) this.vis.hit(x.i, x.m);
  }
};
IP.setPlayhead = function (step, bar) {
  var self = this;
  if (this.mode !== 'studio' || !this.cells.drums) { this.lastStep = step; return; }
  if (step !== this.lastStep) {
    var cols = function (s, on) {
      if (s < 0) return;
      DRUM_ROWS.forEach(function (r) { self.cells.drums[r][s].classList.toggle('bf-now', on); });
      self.cells.bass[s].classList.toggle('bf-now', on); self.cells.melody[s].classList.toggle('bf-now', on);
    };
    cols(this.lastStep, false); cols(step, true);
    this.lastStep = step;
  }
  if (bar !== this.curBar) {
    this.cells.chords.forEach(function (c, i) { c.classList.toggle('bf-now', i === bar); });
    this.curBar = bar;
  }
};
IP.showLine = function (idx, speak) {
  var lines = this.currentLines();
  if (idx < 0 || !lines.length) { this.el.kCur.textContent = ''; this.el.kNext.textContent = ''; return; }
  idx = idx % lines.length;
  this.curLine = idx;
  var k = this.el.kCur;
  k.textContent = lines[idx]; k.style.opacity = '1';
  k.classList.remove('bf-k-pop'); void k.offsetWidth; k.classList.add('bf-k-pop');
  this.el.kNext.textContent = lines.length > 1 ? lines[(idx + 1) % lines.length] : '';
  this.highlightLine(idx);
  if (speak) this.speak(lines[idx]);
};
IP.speak = function (text) {
  var ss = window.speechSynthesis;
  if (!ss || !window.SpeechSynthesisUtterance || !text) return;
  try {
    ss.cancel();
    var u = new SpeechSynthesisUtterance(text), barSec = 240 / this.spec.bpm, words = text.split(/\s+/).length;
    u.rate = Math.max(0.8, Math.min(1.6, words / (barSec * 2.4)));
    u.pitch = 1.15; u.volume = clamp01(this.spec.voice.vol * 1.3);
    var v = this.pickVoice(); if (v) u.voice = v;
    ss.speak(u);
  } catch (e) { /* TTS unavailable */ }
};
IP.pickVoice = function () {
  if (this._voice !== undefined && this._voice) return this._voice;
  var vs = [];
  try { vs = window.speechSynthesis.getVoices() || []; } catch (e) { /* ignore */ }
  var en = vs.filter(function (v) { return /^en/i.test(v.lang); });
  var pref = en.filter(function (v) { return /natural|neural|aria|jenny|google us|samantha/i.test(v.name); });
  this._voice = pref[0] || en[0] || vs[0] || null;
  return this._voice;
};

/* ---------- render loop ---------- */
IP.energy = function () {
  var sp = this.spec, d = sp.drums, hits = 0;
  if (d.on) DRUM_ROWS.forEach(function (r) { for (var i = 0; i < 16; i++) hits += d[r][i]; });
  var parts = (d.on ? 1 : 0) + (sp.bass.on ? 1 : 0) + (sp.chords.on ? 1 : 0) + (sp.melody.on ? 1 : 0) + (sp.voice.mode !== 'none' ? 1 : 0);
  return clamp01(0.1 + parts * 0.09 + Math.min(1, hits / 28) * 0.3 + (sp.bpm - 60) / 120 * 0.15);
};
IP.startLoop = function () {
  var self = this;
  this.frameFn = function () { self.frame(); };
  if (this.vis) this.vis.renderer.setAnimationLoop(this.frameFn);
  else { var loop = function () { if (self.dead) return; self.frame(); self.raf = requestAnimationFrame(loop); }; this.raf = requestAnimationFrame(loop); }
};
IP.frame = function () {
  if (this.dead) return;
  var now = performance.now(), dt = Math.min(0.1, (now - this.last) / 1000);
  this.last = now; this.frames++;
  var lv = null, A = this.audio;
  if (A && A.built) {
    var ct = window.Tone.getContext().currentTime, q = this.queue;
    while (q.length && q[0].t <= ct) { var e = q.shift(); this.handleTick(e, ct - e.t > 0.35); }
    if (this.playing) lv = A.levels();
  }
  this.beat *= Math.pow(0.02, dt);
  var s = 1 + this.beat * 0.09 + (lv ? lv.level * 0.08 : 0);
  if (this.el.play) this.el.play.style.transform = 'scale(' + s.toFixed(3) + ')';
  if (this.vis) {
    this.vis.update(dt, {
      playing: this.playing && !!lv, bpm: this.spec.bpm, level: lv ? lv.level : 0, bass: lv ? lv.bass : 0, hi: lv ? lv.hi : 0,
      spectrum: lv ? lv.spectrum : null, wave: lv ? lv.wave : null, energy: this.energy(),
      lights: LIGHT_LEVELS[this.prefs.lights], reduceFlash: this.prefs.reduceFlash
    });
    this.vis.render();
  }
};
IP.observe = function () {
  var self = this, stage = this.el.stage;
  var fit = function () {
    var w = stage.clientWidth, hgt = stage.clientHeight;
    if (self.vis) self.vis.resize(w, hgt);
    self.root.classList.toggle('bf-narrow', self.root.clientWidth < 620);
  };
  if (window.ResizeObserver) { this.ro = new ResizeObserver(fit); this.ro.observe(stage); this.ro.observe(this.root); }
  else this.on(window, 'resize', fit);
  fit();
};

/* ---------- WebXR ---------- */
IP.checkXR = function () {
  var self = this, xr = navigator.xr;
  if (!xr || !this.vis || !xr.isSessionSupported) return;
  xr.isSessionSupported('immersive-vr').then(function (ok) { if (ok && !self.dead) self.el.vr.hidden = false; }, function () { /* unsupported */ });
};
IP.toggleVR = function () {
  var self = this;
  if (this.xrSession) { try { this.xrSession.end(); } catch (e) { /* ignore */ } return; }
  if (!navigator.xr || !this.vis) return;
  if (!this.playing) this.play();                 // same user gesture also unlocks audio
  navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor'] }).then(function (session) {
    if (self.dead) { session.end(); return; }
    self.xrSession = session;
    self.xrEnd = function () {
      session.removeEventListener('end', self.xrEnd); session.removeEventListener('select', self.xrSelect);
      self.xrSession = null;
      if (self.vis) { self.vis.setVR(false); self.observeFit(); }
      if (self.el.vr) self.el.vr.textContent = 'Enter VR';
    };
    self.xrSelect = function () { self.togglePlay(); };
    session.addEventListener('end', self.xrEnd);
    session.addEventListener('select', self.xrSelect);
    self.el.vr.textContent = 'Exit VR';
    return self.vis.startXR(session);
  }).catch(function (e) { self.notify('Could not start VR: ' + (e && e.message ? e.message : 'not available'), 'error'); });
};
IP.observeFit = function () { if (this.vis) this.vis.resize(this.el.stage.clientWidth, this.el.stage.clientHeight); };

/* ---------- teardown ---------- */
IP.destroy = function () {
  if (this.dead) return;
  this.dead = true;
  this.timers.forEach(function (id) { clearTimeout(id); }); this.timers = [];
  this.listeners.forEach(function (l) { try { l[0].removeEventListener(l[1], l[2], l[3]); } catch (e) { /* ignore */ } });
  this.listeners = [];
  if (this.xrSession) { try { this.xrSession.end(); } catch (e) { /* ignore */ } this.xrSession = null; }
  if (this.raf) cancelAnimationFrame(this.raf);
  if (this.ro) this.ro.disconnect();
  try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  if (this.singer) this.singer.dispose();
  if (this.audio) this.audio.dispose();
  if (this.vis) this.vis.dispose();
  this.vis = null; this.audio = null; this.queue = [];
  if (this.root.parentNode) this.root.parentNode.removeChild(this.root);
};

/* ===================== 07-api: window.BeatForge ===================== */
var current = null, pendingSpec = null;
function warnNoMount(fn) { console.warn('BeatForge.' + fn + ': call BeatForge.mount() first'); }
var BeatForge = {
  version: BF_VERSION,
  mount: function (host, opts) {
    var el = typeof host === 'string' ? document.getElementById(host) : host;
    if (!el || typeof el.appendChild !== 'function') { console.error('BeatForge.mount: host element not found'); return null; }
    if (current) BeatForge.unmount();
    opts = opts && typeof opts === 'object' ? opts : {};
    current = new Instance(el, opts);
    if (pendingSpec != null && !current.broken) { var p = pendingSpec; pendingSpec = null; current.applySpec(p); }
    return {
      applySpec: BeatForge.applySpec, getSpec: BeatForge.getSpec, setLyrics: BeatForge.setLyrics, setBusy: BeatForge.setBusy,
      notify: BeatForge.notify, setVocalAudio: BeatForge.setVocalAudio, vocalAudioFailed: BeatForge.vocalAudioFailed, unmount: BeatForge.unmount
    };
  },
  unmount: function () { if (current) { current.destroy(); current = null; } },
  applySpec: function (json) {
    if (!current || current.broken) { pendingSpec = json; return false; }
    return current.applySpec(json);
  },
  getSpec: function () {
    if (current && !current.broken) return current.getSpecJson();
    var r = parseSpecInput(pendingSpec);
    return JSON.stringify(r.ok ? sanitizeSpec(r.obj) : defaultSpec());
  },
  setLyrics: function (text) { if (!current || current.broken) return warnNoMount('setLyrics'); current.setLyrics(text); },
  setBusy: function (isBusy, message) { if (!current || current.broken) return warnNoMount('setBusy'); current.setBusy(!!isBusy, message, false); },
  notify: function (message, kind) { if (!current || current.broken) return warnNoMount('notify'); current.notify(message, kind); },
  setVocalAudio: function (index, base64Audio, mimeType) {
    if (!current || current.broken) { warnNoMount('setVocalAudio'); return false; }
    return current.singer.setVocalAudio(index, base64Audio, mimeType);
  },
  vocalAudioFailed: function (message) {
    if (!current || current.broken) return warnNoMount('vocalAudioFailed');
    current.singer.failover('azure', cleanText(String(message || 'Premium voice failed'), 120, false));
  },
  _debug: function () {
    var c = current;
    if (!c || c.broken) return { mounted: false };
    var alive = 0;
    if (c.vis) for (var i = 0; i < NORBS; i++) if (c.vis.oMax[i] > 0) alive++;
    return {
      mounted: true, mode: c.mode, frames: c.frames, playing: c.playing, step: c.lastStep,
      transport: window.Tone ? window.Tone.Transport.state : null, audioBuilt: !!(c.audio && c.audio.built),
      orbs: alive, visual: !!c.vis, singer: c.singer ? { status: c.singer.status, engine: c.singer.engine, text: c.singer.statusText, lines: c.singer.raw.filter(Boolean).length } : null,
      undo: c.undoStack.length, lights: c.prefs.lights, reduceFlash: c.prefs.reduceFlash
    };
  }
};
window.BeatForge = BeatForge;

})();
