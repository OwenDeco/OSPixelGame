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
