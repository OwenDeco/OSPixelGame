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
  this.setStatus('loading', r.engine === 'azure' ? 'Asking the premium singer…' : 'Warming up the singer…');
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
    if (gen === self.gen && !self.dead) self.setStatus('loading', 'Downloading the free AI singer… ' + pct + '%');
  }).then(function (tts) {
    if (gen !== self.gen || self.dead) return;
    var voice = tts.voices && !Object.prototype.hasOwnProperty.call(tts.voices, self.voice) ? 'af_heart' : self.voice;
    var i = 0;
    (function next() {
      if (gen !== self.gen || self.dead) return;
      if (i >= self.lines.length) { self.setStatus('ready', 'AI singer ready'); return; }
      self.setStatus('loading', 'Singer is recording line ' + (i + 1) + ' of ' + self.lines.length + '…');
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
  this.inst.notify(msg + ' — switching to ' + next + '.', 'info');
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
