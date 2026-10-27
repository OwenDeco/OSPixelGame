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
