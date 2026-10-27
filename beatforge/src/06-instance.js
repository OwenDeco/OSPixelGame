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
  this.el.busyMsg.textContent = cleanText(typeof msg === 'string' && msg ? msg : 'AI is composing…', 120, false);
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
  var bi = h('div', 'bf-busy-in'); bi.appendChild(h('div', 'bf-spin')); el.busyMsg = h('div', null, 'AI is composing…');
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
  el.undo = h('button', 'bf-btn', '↶ Undo');
  this.on(el.undo, 'click', function () { self.undo(); });
  el.save = h('button', 'bf-btn bf-hot', '💾 Save');
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
  el.layers = [['drums', '🥁 Drums'], ['bass', '🎸 Bass'], ['chords', '🎹 Chords'], ['melody', '🎶 Melody']].map(function (l) {
    var b = h('button', 'bf-chip', l[1]); b.setAttribute('data-v', l[0]);
    self.on(b, 'click', function () { self.change(function (d) { d[l[0]].on = !d[l[0]].on; }, { keepVibe: true }); });
    lc.appendChild(b); return b;
  });
  var vl = h('div', 'bf-field'); vl.appendChild(document.createTextNode('🎤 Voice'));
  el.voiceSeg1 = this.voiceSeg(); vl.appendChild(el.voiceSeg1); lc.appendChild(vl);
  ls.appendChild(lc); panel.appendChild(ls);
  // AI
  var ai = h('div', 'bf-ai');
  ai.appendChild(h('div', 'bf-h', '✨ AI composer'));
  el.prompt = h('textarea'); el.prompt.maxLength = 300; el.prompt.rows = 2;
  el.prompt.placeholder = 'Describe your vibe… e.g. rainy night, soft drums, someone humming';
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
  el.aiBtns = [['song', '✨ Compose with AI', true], ['lyrics', '✍️ Write lyrics'], ['enhance', '🪄 Enhance']].map(function (a) {
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
    var dz = h('button', 'bf-dice', '🎲'); dz.title = 'Regenerate ' + title.toLowerCase(); dz.setAttribute('aria-label', 'Regenerate ' + title);
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
  body.appendChild(h('div', 'bf-status', 'Click = higher note · right-click / shift-click = lower · top = rest'));
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
  var wl = h('button', 'bf-btn', '✍️ Write lyrics with AI');
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
  el.meta.textContent = sp.bpm + ' BPM · ' + sp.key + ' ' + sp.scale;
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
    c._name.textContent = chordName(sp, d); c._deg.textContent = 'bar ' + (i + 1) + ' · ' + roman[d - 1];
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
  this.notify((v ? v.label : 'Vibe') + ' — ' + this.spec.name, 'success');
  if (!this.playing) self.play();
};
IP.requestAI = function (kind) {
  var fn = this.opts.onAIRequest;
  if (typeof fn !== 'function') { this.notify('AI is not connected in this app', 'error'); return; }
  var prompt = cleanText(this.el.prompt ? this.el.prompt.value : '', 300, false).trim();
  var msg = kind === 'lyrics' ? 'AI is writing lyrics…' : (kind === 'enhance' ? 'AI is enhancing your song…' : 'AI is composing…');
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
