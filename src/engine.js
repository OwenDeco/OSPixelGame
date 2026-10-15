/* PixelPlatformer engine - a small Mario-style platformer on <canvas>.
 * API:
 *   PixelPlatformer.mount(hostElementOrId, {
 *     level,            // level object, JSON string, or built-in key ("level1"): { name, theme, time, rows: [15 strings] }
 *     levelKey,         // built-in level used when `level` is empty

 *     lives,            // starting lives (default 3)
 *     autoStart,        // skip the "press start" overlay (default false)
 *     onComplete(r),    // r = { completed: true, score, coins, timeLeft, timeSeconds, level }
 *     onGameOver(r)     // same shape, completed: false
 *   });
 *   PixelPlatformer.destroy();
 */
(function (global) {
  'use strict';

  var TILE = 18, ROWS = 15, VIEW_W = 480, VIEW_H = ROWS * TILE, STEP = 1 / 60;
  var SOLID = 'GB?*uXI';

  var THEMES = {
    green: { bg: [[6, 7], [14, 15], [22, 23]], top: [0, 1, 2, 3], fill: 122, sky: '#b9f3c9' },
    desert: { bg: [[4, 5], [12, 13], [20, 21]], top: [60, 61, 62, 63], fill: 122, sky: '#fcd8a0' },
    snow: { bg: [[0, 1], [8, 9], [16, 17]], top: [80, 81, 82, 83], fill: 122, sky: '#e3f6f6' }
  };
  var TILE_ID = { B: 6, '?': 10, '*': 10, u: 9, X: 47, '=': 49, '^': 68, p: 124, q: 125, t: 126, c: 127, m: 128, s: 85 };
  var ENEMY = {
    E: { w: 16, h: 13, speed: 30, frames: [21, 22], stomp: true, gravity: true },
    S: { w: 14, h: 14, speed: 22, frames: [15, 16], stomp: false, gravity: true },
    F: { w: 14, h: 12, speed: 32, frames: [24, 25, 26], stomp: true, gravity: false }
  };

  // ---------- sound (generated with WebAudio, no files) ----------
  function Sfx() { this.ctx = null; this.muted = false; }
  Sfx.prototype.play = function (seq) {
    if (this.muted) return;
    try { if (!this.ctx) this.ctx = new (global.AudioContext || global.webkitAudioContext)(); } catch (e) { return; }
    var c = this.ctx, t = c.currentTime;
    if (c.state === 'suspended') c.resume();
    seq.forEach(function (n) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = n[2] || 'square';
      o.frequency.setValueAtTime(n[0], t);
      if (n[3]) o.frequency.exponentialRampToValueAtTime(n[3], t + n[1]);
      g.gain.setValueAtTime(0.06, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + n[1]);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + n[1] + 0.02);
      t += n[1] * 0.85;
    });
  };
  var SOUNDS = {
    jump: [[280, 0.16, 'square', 620]],
    coin: [[988, 0.07], [1319, 0.28]],
    stomp: [[220, 0.12, 'square', 70]],
    bump: [[140, 0.08, 'triangle']],
    brk: [[160, 0.18, 'sawtooth', 40]],
    up: [[523, 0.08], [659, 0.08], [784, 0.08], [1047, 0.22]],
    die: [[494, 0.15], [392, 0.15], [330, 0.15], [262, 0.45]],
    clear: [[523, 0.1], [659, 0.1], [784, 0.1], [1047, 0.12], [784, 0.1], [1047, 0.4]],
    tick: [[1400, 0.03, 'square']]
  };

  function loadImg(src) {
    return new Promise(function (res, rej) { var i = new Image(); i.onload = function () { res(i); }; i.onerror = rej; i.src = src; });
  }

  // level: object, JSON string, or a built-in key such as "level1" (see PixelPlatformer.levels)
  function normalizeLevel(level, levelKey) {
    if (typeof level === 'string' && level.trim().charAt(0) === '{') level = JSON.parse(level);
    else if (typeof level === 'string' && level.trim()) levelKey = level.trim();
    if (!level || typeof level !== 'object') level = global.PixelPlatformer.levels[levelKey || 'level1'];
    if (!level || !level.rows || !level.rows.length) throw new Error('PixelPlatformer: level.rows is required');
    var rows = level.rows.slice(-ROWS);
    while (rows.length < ROWS) rows.unshift('');
    var w = rows.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    rows = rows.map(function (r) { while (r.length < w) r += '.'; return r; });
    return { name: level.name || 'Level', theme: THEMES[level.theme] ? level.theme : 'green', time: level.time || 300, rows: rows, width: w };
  }

  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }

  // ---------- Game ----------
  function Game(host, opts) {
    var self = this;
    this.opts = opts || {};
    this.level = normalizeLevel(this.opts.level, this.opts.levelKey);
    this.theme = THEMES[this.level.theme];
    this.sfx = new Sfx();
    this.score = 0; this.coins = 0; this.lives = this.opts.lives || 3; this.elapsed = 0;
    this.keys = {}; this.pressed = {};
    this.state = 'loading'; this.stateT = 0; this.reported = false;

    this.wrap = document.createElement('div');
    this.wrap.style.cssText = 'position:relative;width:100%;max-width:1440px;margin:0 auto;aspect-ratio:16/9;background:#1b1b2f;border-radius:8px;overflow:hidden;';
    this.canvas = document.createElement('canvas');
    this.canvas.width = VIEW_W; this.canvas.height = VIEW_H;
    this.canvas.tabIndex = 0;
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;image-rendering:pixelated;image-rendering:crisp-edges;outline:none;cursor:pointer;';
    this.wrap.appendChild(this.canvas);
    host.appendChild(this.wrap);
    this.host = host;
    this.ctx = this.canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    var A = global.PixelPlatformerAssets;
    var imgsReady = Promise.all([loadImg(A.tiles), loadImg(A.chars), loadImg(A.bgs)]);
    if (this.opts.preview) { // static thumbnail: draw one frame, no loop or input
      imgsReady.then(function (imgs) {
        if (self.dead) return;
        self.img = { tiles: imgs[0], chars: imgs[1], bgs: imgs[2] };
        self.resetLevel(); self.state = 'preview'; self.render();
      });
      return;
    }

    this.onKeyDown = function (e) { self.key(e, true); };
    this.onKeyUp = function (e) { self.key(e, false); };
    this.onClick = function () { self.canvas.focus(); self.pressed.start = true; };
    global.addEventListener('keydown', this.onKeyDown);
    global.addEventListener('keyup', this.onKeyUp);
    this.canvas.addEventListener('pointerdown', this.onClick);
    this.addTouchControls();

    imgsReady.then(function (imgs) {
      if (self.dead) return;
      self.img = { tiles: imgs[0], chars: imgs[1], bgs: imgs[2] };
      self.resetLevel();
      self.setState(self.opts.autoStart ? 'ready' : 'title');
      self.last = performance.now(); self.acc = 0;
      self.raf = requestAnimationFrame(function f(now) { self.frame(now); if (!self.dead) self.raf = requestAnimationFrame(f); });
    });
  }

  var KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down',
    ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', KeyZ: 'jump', KeyK: 'jump',
    ShiftLeft: 'run', ShiftRight: 'run', KeyX: 'run', KeyJ: 'run',
    Enter: 'start', KeyP: 'pause', Escape: 'pause', KeyM: 'mute'
  };

  Game.prototype.key = function (e, down) {
    var t = e.target && e.target.tagName;
    if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || (e.target && e.target.isContentEditable)) return;
    var k = KEYMAP[e.code];
    if (!k) return;
    e.preventDefault();
    if (down && !this.keys[k]) this.pressed[k] = true;
    this.keys[k] = down;
    if (k === 'jump' && down) this.pressed.start = true;
  };

  Game.prototype.addTouchControls = function () {
    if (!('ontouchstart' in global) && !(navigator.maxTouchPoints > 0)) return;
    var self = this;
    var bar = document.createElement('div');
    bar.style.cssText = 'position:absolute;left:0;right:0;bottom:8px;display:flex;justify-content:space-between;padding:0 12px;pointer-events:none;user-select:none;';
    function btn(label, key) {
      var b = document.createElement('div');
      b.textContent = label;
      b.style.cssText = 'pointer-events:auto;width:56px;height:56px;margin:0 4px;border-radius:50%;background:rgba(255,255,255,.28);color:#fff;font:bold 22px sans-serif;display:flex;align-items:center;justify-content:center;touch-action:none;';
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); if (!self.keys[key]) self.pressed[key] = true; self.keys[key] = true; if (key === 'jump') self.pressed.start = true; });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { b.addEventListener(ev, function () { self.keys[key] = false; }); });
      return b;
    }
    var l = document.createElement('div'), r = document.createElement('div');
    l.style.display = r.style.display = 'flex';
    l.appendChild(btn('◀', 'left')); l.appendChild(btn('▶', 'right'));
    r.appendChild(btn('B', 'run')); r.appendChild(btn('A', 'jump'));
    bar.appendChild(l); bar.appendChild(r);
    this.wrap.appendChild(bar);
  };

  Game.prototype.destroy = function () {
    this.dead = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    if (this.onKeyDown) {
      global.removeEventListener('keydown', this.onKeyDown);
      global.removeEventListener('keyup', this.onKeyUp);
    }
    if (this.wrap.parentNode) this.wrap.parentNode.removeChild(this.wrap);
    if (this.sfx.ctx) try { this.sfx.ctx.close(); } catch (e) { /* ignore */ }
  };

  Game.prototype.setState = function (s) { this.state = s; this.stateT = 0; };

  Game.prototype.resetLevel = function () {
    var L = this.level, self = this;
    this.map = L.rows.map(function (r) { return r.split(''); });
    this.enemies = []; this.particles = []; this.popups = []; this.bumps = {};
    this.flagX = -1; this.time = L.time; this.camX = 0;
    var start = { x: 2, y: 12 };
    for (var y = 0; y < ROWS; y++) for (var x = 0; x < L.width; x++) {
      var c = this.map[y][x];
      if (c === 'P') { start = { x: x, y: y }; this.map[y][x] = '.'; }
      else if (ENEMY[c]) {
        var d = ENEMY[c];
        self.enemies.push({ type: c, def: d, x: x * TILE + (TILE - d.w) / 2, y: (y + 1) * TILE - d.h, w: d.w, h: d.h,
          vx: -d.speed, vy: 0, baseY: (y + 1) * TILE - d.h, t: Math.random() * 6, active: false, dead: 0, flip: false });
        this.map[y][x] = '.';
      } else if (c === '|' && this.flagX < 0) this.flagX = x;
    }
    this.p = { x: start.x * TILE + 3, y: (start.y + 1) * TILE - 16, w: 12, h: 16, vx: 0, vy: 0, onGround: false, face: 1,
      anim: 0, coyote: 0, jumpBuf: 0, invuln: 0 };
    this.flagY = 3 * TILE;
  };

  // ---------- tile queries ----------
  Game.prototype.tile = function (tx, ty) {
    if (ty < 0 || ty >= ROWS || tx < 0 || tx >= this.level.width) return '.';
    return this.map[ty][tx];
  };
  Game.prototype.isSolid = function (tx, ty) {
    if (tx < 0 || tx >= this.level.width) return ty >= 0; // level walls
    return SOLID.indexOf(this.tile(tx, ty)) >= 0;
  };

  // Moves a body with tile collision. Returns {hitX, hitHead: [tx,ty]|null, landed}
  Game.prototype.moveBody = function (b, dt) {
    var res = { hitX: false, head: null, landed: false }, tx, ty, x0, x1, y0, y1;
    b.x += b.vx * dt;
    y0 = Math.floor(b.y / TILE); y1 = Math.floor((b.y + b.h - 0.01) / TILE);
    if (b.vx > 0) {
      tx = Math.floor((b.x + b.w) / TILE);
      for (ty = y0; ty <= y1; ty++) if (this.isSolid(tx, ty)) { b.x = tx * TILE - b.w; b.vx = 0; res.hitX = true; break; }
    } else if (b.vx < 0) {
      tx = Math.floor(b.x / TILE);
      for (ty = y0; ty <= y1; ty++) if (this.isSolid(tx, ty)) { b.x = (tx + 1) * TILE; b.vx = 0; res.hitX = true; break; }
    }
    var prevBottom = b.y + b.h;
    b.y += b.vy * dt;
    x0 = Math.floor(b.x / TILE); x1 = Math.floor((b.x + b.w - 0.01) / TILE);
    if (b.vy > 0) {
      ty = Math.floor((b.y + b.h) / TILE);
      for (tx = x0; tx <= x1; tx++) {
        var oneWay = this.tile(tx, ty) === '=' && prevBottom <= ty * TILE + 0.5;
        if (this.isSolid(tx, ty) || oneWay) { b.y = ty * TILE - b.h; b.vy = 0; res.landed = true; break; }
      }
    } else if (b.vy < 0) {
      ty = Math.floor(b.y / TILE);
      var best = null, bestD = 1e9, cx = b.x + b.w / 2;
      for (tx = x0; tx <= x1; tx++) if (this.isSolid(tx, ty)) {
        var d = Math.abs((tx + 0.5) * TILE - cx);
        if (d < bestD) { bestD = d; best = [tx, ty]; }
      }
      if (best) { b.y = (ty + 1) * TILE; b.vy = 0; res.head = best; }
    }
    return res;
  };

  // ---------- update ----------
  Game.prototype.frame = function (now) {
    this.acc += Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    while (this.acc >= STEP) { this.update(STEP); this.acc -= STEP; this.pressed = {}; }
    this.render();
  };

  Game.prototype.update = function (dt) {
    this.stateT += dt;
    if (this.pressed.mute) this.sfx.muted = !this.sfx.muted;
    this.updateParticles(dt);
    switch (this.state) {
      case 'title':
        if (this.pressed.start) { this.sfx.play(SOUNDS.coin); this.setState('ready'); }
        break;
      case 'ready':
        if (this.stateT > 1.6) this.setState('play');
        break;
      case 'paused':
        if (this.pressed.pause || this.pressed.start) this.setState('play');
        break;
      case 'play':
        if (this.pressed.pause) { this.setState('paused'); break; }
        this.updatePlay(dt);
        break;
      case 'dying':
        this.p.vy += 900 * dt; this.p.y += this.p.vy * dt;
        if (this.stateT > 2.2) {
          this.lives--;
          if (this.lives <= 0) { this.setState('over'); }
          else { this.resetLevel(); this.setState('ready'); }
        }
        break;
      case 'clear':
        this.updateClear(dt);
        break;
      case 'over':
        if (this.stateT > 2.5) this.report(false);
        break;
    }
  };

  Game.prototype.updatePlay = function (dt) {
    var p = this.p, k = this.keys;
    this.elapsed += dt;
    this.time -= dt;
    if (this.time <= 0) { this.time = 0; return this.die(); }

    var dir = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    var maxV = k.run ? 150 : 92;
    var accel = p.onGround ? (k.run ? 520 : 420) : 330;
    if (dir) {
      if (dir * p.vx < 0) accel *= 2.2; // skid/turn faster
      p.vx += dir * accel * dt;
      if (Math.abs(p.vx) > maxV) p.vx = Math.max(Math.abs(p.vx) - 500 * dt, maxV) * Math.sign(p.vx);
      p.face = dir;
    } else if (p.onGround) {
      var f = 600 * dt;
      p.vx = Math.abs(p.vx) <= f ? 0 : p.vx - f * Math.sign(p.vx);
    }

    p.coyote = p.onGround ? 0.09 : p.coyote - dt;
    p.jumpBuf = this.pressed.jump ? 0.12 : p.jumpBuf - dt;
    if (p.jumpBuf > 0 && p.coyote > 0) {
      p.vy = -(300 + Math.abs(p.vx) * 0.22);
      p.jumpBuf = 0; p.coyote = 0; p.onGround = false;
      this.sfx.play(SOUNDS.jump);
    }
    var g = (p.vy < 0 && k.jump) ? 620 : 1250;
    p.vy = Math.min(p.vy + g * dt, 430);

    var res = this.moveBody(p, dt);
    p.onGround = res.landed;
    if (res.head) this.bump(res.head[0], res.head[1]);

    if (p.x < this.camX) { p.x = this.camX; if (p.vx < 0) p.vx = 0; }
    if (p.onGround) p.anim += Math.abs(p.vx) * dt * 0.09;
    if (p.invuln > 0) p.invuln -= dt;

    this.collectTiles();
    if (this.state !== 'play') return;
    if (p.y > VIEW_H + 24) return this.die();

    if (this.flagX >= 0 && p.x + p.w >= this.flagX * TILE - 1) return this.startClear();

    this.updateEnemies(dt);

    var target = p.x - VIEW_W * 0.4;
    this.camX = Math.max(this.camX, Math.min(target, this.level.width * TILE - VIEW_W));
    if (this.camX < 0) this.camX = 0;
  };

  Game.prototype.collectTiles = function () {
    var p = this.p;
    for (var ty = Math.floor(p.y / TILE); ty <= Math.floor((p.y + p.h - 1) / TILE); ty++)
      for (var tx = Math.floor(p.x / TILE); tx <= Math.floor((p.x + p.w - 1) / TILE); tx++) {
        var c = this.tile(tx, ty);
        if (c === 'o') {
          this.map[ty][tx] = '.';
          this.addCoin(tx * TILE + 9, ty * TILE + 4);
        } else if (c === '^' && p.y + p.h > ty * TILE + 9) {
          return this.die();
        }
      }
  };

  Game.prototype.addCoin = function (x, y) {
    this.coins++; this.score += 100;
    this.sfx.play(SOUNDS.coin);
    if (this.coins % 50 === 0) this.oneUp(x, y - 10);
    this.popups.push({ x: x, y: y, text: '+100', t: 0 });
  };

  Game.prototype.oneUp = function (x, y) {
    this.lives++; this.score += 1000;
    this.sfx.play(SOUNDS.up);
    this.popups.push({ x: x, y: y, text: '1UP!', t: 0, big: true });
  };

  Game.prototype.bump = function (tx, ty) {
    var c = this.tile(tx, ty), cx = tx * TILE + 9, cy = ty * TILE;
    if (c === '?' || c === '*') {
      this.map[ty][tx] = 'u';
      this.bumps[tx + ',' + ty] = 0;
      if (c === '?') {
        this.particles.push({ kind: 'coin', x: cx - 9, y: cy - 18, vy: -260, t: 0, life: 0.45 });
        this.addCoin(cx, cy - 20);
      } else this.oneUp(cx, cy - 20);
    } else if (c === 'B') {
      this.map[ty][tx] = '.';
      this.score += 50;
      this.sfx.play(SOUNDS.brk);
      for (var i = 0; i < 4; i++)
        this.particles.push({ kind: 'debris', x: cx + (i % 2 ? 3 : -7), y: cy + (i < 2 ? 2 : 10), vx: (i % 2 ? 70 : -70), vy: (i < 2 ? -320 : -220), t: 0, life: 1.4 });
    } else {
      this.sfx.play(SOUNDS.bump);
      if (c === 'u') this.bumps[tx + ',' + ty] = 0;
    }
    // knock out enemies standing on the bumped block
    var box = { x: tx * TILE, y: ty * TILE - 4, w: TILE, h: 4 };
    var self = this;
    this.enemies.forEach(function (e) { if (!e.dead && overlap(e, box)) self.killEnemy(e, true); });
  };

  Game.prototype.killEnemy = function (e, flip) {
    e.dead = flip ? 2 : 1; e.t = 0;
    if (flip) { e.vy = -200; e.flip = true; }
    this.score += 100;
    this.popups.push({ x: e.x + e.w / 2, y: e.y - 4, text: '+100', t: 0 });
    this.sfx.play(SOUNDS.stomp);
  };

  Game.prototype.updateEnemies = function (dt) {
    var p = this.p, self = this;
    this.enemies.forEach(function (e) {
      if (!e.active) { if (e.x < self.camX + VIEW_W + 24) e.active = true; else return; }
      e.t += dt;
      if (e.dead) {
        if (e.dead === 2) { e.vy += 900 * dt; e.y += e.vy * dt; }
        return;
      }
      if (e.def.gravity) {
        e.vy = Math.min(e.vy + 1100 * dt, 430);
        var r = self.moveBody(e, dt);
        if (r.hitX) e.vx = (e.vx === 0 ? (e.lastVx > 0 ? -1 : 1) : -Math.sign(e.vx)) * e.def.speed;
        if (e.vx !== 0) e.lastVx = e.vx;
        if (e.y > VIEW_H + 40) e.dead = 3;
      } else {
        if (Math.floor(e.t / 3) % 2) e.vx = e.def.speed; else e.vx = -e.def.speed;
        e.x += e.vx * dt;
        e.y = e.baseY + Math.sin(e.t * 2.6) * 20;
      }
      if (!overlap(p, e)) return;
      var falling = p.vy > 40 && (p.y + p.h) - e.y < 10;
      if (falling && e.def.stomp) {
        self.killEnemy(e, false);
        p.vy = self.keys.jump ? -330 : -210;
      } else if (p.invuln <= 0) {
        self.die();
      }
    });
    this.enemies = this.enemies.filter(function (e) { return !(e.dead && (e.t > 0.5 && e.dead === 1 || e.y > VIEW_H + 60 || e.dead === 3)); });
  };

  Game.prototype.die = function () {
    if (this.state !== 'play') return;
    this.sfx.play(SOUNDS.die);
    this.p.vy = -330; this.p.vx = 0;
    this.setState('dying');
  };

  Game.prototype.startClear = function () {
    var p = this.p;
    p.x = this.flagX * TILE + 4 - p.w; p.vx = 0; p.vy = 0;
    this.score += Math.max(100, Math.round((ROWS * TILE - p.y) / 20) * 100);
    this.sfx.play(SOUNDS.clear);
    this.clearPhase = 0;
    this.setState('clear');
  };

  Game.prototype.updateClear = function (dt) {
    var p = this.p, groundY = (ROWS - 3) * TILE + TILE - p.h; // stand on the flag's base block
    if (this.clearPhase === 0) { // slide down
      p.y = Math.min(p.y + 140 * dt, groundY - TILE);
      this.flagY = Math.min(this.flagY + 140 * dt, (ROWS - 4) * TILE);
      if (p.y >= groundY - TILE && this.stateT > 0.6) { this.clearPhase = 1; p.face = 1; }
    } else if (this.clearPhase === 1) { // walk off to the right
      p.vx = 70; p.face = 1;
      p.vy = Math.min(p.vy + 1250 * dt, 430);
      this.moveBody(p, dt);
      p.anim += 70 * dt * 0.09;
      if (p.x > this.camX + VIEW_W + 10 || this.stateT > 6) { this.clearPhase = 2; this.stateT = 0; p.hidden = true; }
    } else if (this.clearPhase === 2) { // tally time bonus
      if (this.time > 0) {
        var step = Math.min(this.time, 120 * dt * 2);
        this.time -= step; this.score += Math.round(step * 50);
        if (Math.floor(this.stateT * 20) % 2 === 0) this.sfx.play(SOUNDS.tick);
      } else if (this.stateT > 1.5) {
        this.time = 0;
        this.report(true);
      }
    }
    var target = p.x - VIEW_W * 0.4;
    this.camX = Math.max(this.camX, Math.min(target, this.level.width * TILE - VIEW_W));
  };

  Game.prototype.report = function (completed) {
    if (this.reported) return;
    this.reported = true;
    var r = { completed: completed, score: this.score, coins: this.coins, timeLeft: Math.ceil(this.time),
      timeSeconds: Math.round(this.elapsed), level: this.level.name };
    var cb = completed ? this.opts.onComplete : this.opts.onGameOver;
    if (typeof cb === 'function') try { cb(r); } catch (e) { if (global.console) console.error(e); }
  };

  Game.prototype.updateParticles = function (dt) {
    this.particles = this.particles.filter(function (q) {
      q.t += dt;
      if (q.kind === 'debris') { q.vy += 1100 * dt; q.x += q.vx * dt; q.y += q.vy * dt; }
      if (q.kind === 'coin') { q.vy += 1100 * dt; q.y += q.vy * dt; }
      return q.t < q.life;
    });
    this.popups = this.popups.filter(function (q) { q.t += dt; q.y -= 30 * dt; return q.t < 0.9; });
    for (var k in this.bumps) { this.bumps[k] += dt; if (this.bumps[k] > 0.2) delete this.bumps[k]; }
  };

  // ---------- render ----------
  Game.prototype.drawTile = function (id, x, y) {
    this.ctx.drawImage(this.img.tiles, (id % 20) * 18, Math.floor(id / 20) * 18, 18, 18, Math.round(x), Math.round(y), 18, 18);
  };
  Game.prototype.drawChar = function (id, x, y, flipX, flipY) {
    var c = this.ctx, sx = (id % 9) * 24, sy = Math.floor(id / 9) * 24;
    x = Math.round(x); y = Math.round(y);
    if (!flipX && !flipY) return c.drawImage(this.img.chars, sx, sy, 24, 24, x, y, 24, 24);
    c.save();
    c.translate(x + 12, y + 12);
    c.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    c.drawImage(this.img.chars, sx, sy, 24, 24, -12, -12, 24, 24);
    c.restore();
  };

  Game.prototype.render = function () {
    var c = this.ctx, T = this.theme;
    if (!this.img) return;
    c.fillStyle = T.sky; c.fillRect(0, 0, VIEW_W, VIEW_H);
    this.drawBackground();
    this.drawMap();

    var self = this, now = performance.now() / 1000;
    this.enemies.forEach(function (e) {
      if (!e.active) return;
      var f = e.def.frames, id = f[Math.floor(e.t * 6) % f.length];
      var dx = e.x - self.camX + e.w / 2 - 12, dy = e.y + e.h - 24;
      if (e.dead === 1) { // squashed
        c.drawImage(self.img.chars, (f[0] % 9) * 24, Math.floor(f[0] / 9) * 24, 24, 24, Math.round(dx), Math.round(e.y + e.h - 8), 24, 8);
      } else self.drawChar(id, dx, dy, e.vx > 0, !!e.flip);
    });

    this.particles.forEach(function (q) {
      if (q.kind === 'coin') self.drawTile(151 + (Math.floor(q.t * 12) % 2), q.x - self.camX, q.y);
      else { c.fillStyle = '#8b4a2b'; c.fillRect(Math.round(q.x - self.camX), Math.round(q.y), 5, 5); c.fillStyle = '#c47a4f'; c.fillRect(Math.round(q.x - self.camX), Math.round(q.y), 3, 3); }
    });

    var p = this.p;
    if (!p.hidden && !(p.invuln > 0 && Math.floor(now * 20) % 2)) {
      var pid = (this.state === 'dying') ? 1 : (!p.onGround && this.state === 'play') ? 1 : (Math.abs(p.vx) > 5 ? Math.floor(p.anim) % 2 : 0);
      this.drawChar(pid, p.x - this.camX + p.w / 2 - 12, p.y + p.h - 24, p.face < 0, false);
    }

    c.textAlign = 'center';
    this.popups.forEach(function (q) { self.text(q.text, q.x - self.camX, q.y, q.big ? 12 : 9, q.big ? '#ffe066' : '#fff'); });

    this.drawHud();
    this.drawOverlay();
  };

  Game.prototype.drawBackground = function () {
    var c = this.ctx, T = this.theme, S = 72, par = this.camX * 0.25;
    var rows = [VIEW_H - S * 3, VIEW_H - S * 2, VIEW_H - S];
    var start = -((par % (S * 2)) + S * 2) % (S * 2);
    for (var r = 0; r < 3; r++) for (var x = start - S * 2, i = 0; x < VIEW_W + S; x += S, i++) {
      var id = T.bg[r][((i % 2) + 2) % 2];
      c.drawImage(this.img.bgs, (id % 8) * 24, Math.floor(id / 8) * 24, 24, 24, Math.floor(x), rows[r], S, S);
    }
    // fill any sky above the background strip
    if (rows[0] > 0) {
      var sid = T.bg[0][0];
      c.drawImage(this.img.bgs, (sid % 8) * 24, Math.floor(sid / 8) * 24, 2, 2, 0, 0, VIEW_W, rows[0] + 1);
    }
  };

  Game.prototype.drawMap = function () {
    var T = this.theme, t0 = Math.floor(this.camX / TILE), t1 = t0 + Math.ceil(VIEW_W / TILE) + 1, now = performance.now() / 1000;
    for (var ty = 0; ty < ROWS; ty++) for (var tx = t0; tx <= t1; tx++) {
      var c = this.tile(tx, ty);
      if (c === '.' || c === undefined) continue;
      var x = tx * TILE - this.camX, y = ty * TILE, b = this.bumps[tx + ',' + ty];
      if (b !== undefined) y -= Math.sin(b / 0.2 * Math.PI) * 6;
      switch (c) {
        case 'G': {
          var above = this.tile(tx, ty - 1);
          if (above === 'G') { this.drawTile(T.fill, x, y); break; }
          var l = this.tile(tx - 1, ty) === 'G' || tx === 0, r = this.tile(tx + 1, ty) === 'G' || tx === this.level.width - 1;
          this.drawTile(T.top[l && r ? 2 : l ? 3 : r ? 1 : 0], x, y);
          break;
        }
        case 'I': this.drawTile(this.tile(tx, ty - 1) === 'I' ? 115 : 95, x, y); break;
        case '=': {
          var lw = this.tile(tx - 1, ty) === '=', rw = this.tile(tx + 1, ty) === '=';
          this.drawTile(lw && rw ? 49 : lw ? 50 : rw ? 48 : 49, x, y);
          break;
        }
        case '?': case '*': this.drawTile(10, x, y + (Math.floor(now * 2) % 4 === 0 ? -1 : 0)); break;
        case 'o': this.drawTile(151 + (Math.floor(now * 4 + tx * 0.3) % 2), x, y); break;
        case '|':
          this.drawTile(131, x, y);
          if (tx === this.flagX && ty === 3) this.drawTile(111 + (Math.floor(now * 4) % 2), x, this.flagY);
          break;
        case 'D': this.drawTile(130, x, y - TILE); this.drawTile(150, x, y); break;
        default: if (TILE_ID[c] !== undefined) this.drawTile(TILE_ID[c], x, y);
      }
    }
  };

  Game.prototype.text = function (s, x, y, size, color) {
    var c = this.ctx;
    c.font = 'bold ' + size + 'px "Courier New", monospace';
    c.lineWidth = 3; c.strokeStyle = 'rgba(20,20,40,.9)';
    c.strokeText(s, x, y);
    c.fillStyle = color || '#fff';
    c.fillText(s, x, y);
  };

  Game.prototype.drawHud = function () {
    var c = this.ctx;
    c.textAlign = 'left'; c.textBaseline = 'top';
    this.text('SCORE', 10, 6, 9, '#ffe066'); this.text(('000000' + this.score).slice(-6), 10, 16, 11);
    this.drawTile(151, 104, 9); this.text('x' + ('0' + this.coins).slice(-2), 122, 13, 11);
    this.drawTile(44, 168, 9); this.text('x' + this.lives, 186, 13, 11);
    c.textAlign = 'center';
    this.text('WORLD', 300, 6, 9, '#ffe066'); this.text(this.level.name.toUpperCase(), 300, 16, 10);
    c.textAlign = 'right';
    this.text('TIME', VIEW_W - 10, 6, 9, '#ffe066'); this.text(String(Math.ceil(this.time)), VIEW_W - 10, 16, 11, this.time < 60 ? '#ff7b7b' : '#fff');
    if (this.sfx.muted) this.text('MUTED', VIEW_W - 10, 30, 8, '#ccc');
    c.textBaseline = 'alphabetic';
  };

  Game.prototype.drawOverlay = function () {
    var c = this.ctx, s = this.state, cx = VIEW_W / 2, blink = Math.floor(performance.now() / 450) % 2;
    function shade(a) { c.fillStyle = 'rgba(16,16,36,' + a + ')'; c.fillRect(0, 0, VIEW_W, VIEW_H); }
    c.textAlign = 'center';
    if (s === 'title') {
      shade(0.55);
      this.text('PIXEL PLATFORMER', cx, 92, 24, '#ffe066');
      this.text(this.level.name.toUpperCase(), cx, 118, 12, '#fff');
      if (blink) this.text('PRESS ENTER, SPACE OR CLICK TO START', cx, 158, 10, '#fff');
      this.text('ARROWS/WASD MOVE  -  SPACE JUMP  -  SHIFT RUN  -  P PAUSE  -  M MUTE', cx, 230, 8, '#cfd3ff');
    } else if (s === 'ready') {
      shade(0.75);
      this.text(this.level.name.toUpperCase(), cx, 118, 16, '#ffe066');
      this.drawChar(0, cx - 34, 130); this.text('x ' + this.lives, cx + 12, 148, 14, '#fff');
    } else if (s === 'paused') {
      shade(0.5); this.text('PAUSED', cx, 135, 20, '#fff');
    } else if (s === 'over') {
      shade(Math.min(0.8, this.stateT));
      this.text('GAME OVER', cx, 130, 24, '#ff7b7b');
      this.text('SCORE ' + this.score, cx, 156, 12, '#fff');
    } else if (s === 'clear' && this.clearPhase === 2) {
      this.text('COURSE CLEAR!', cx, 110, 22, '#ffe066');
      this.text('TIME BONUS', cx, 136, 10, '#fff');
    }
  };

  // ---------- public API ----------
  var current = null;
  global.PixelPlatformer = {
    version: '1.0.0',
    levels: global.PixelPlatformerLevels || {},
    mount: function (host, opts) {
      if (typeof host === 'string') host = document.getElementById(host);
      if (!host) throw new Error('PixelPlatformer: host element not found');
      if (current) current.destroy();
      current = new Game(host, opts);
      return current;
    },
    destroy: function () { if (current) { current.destroy(); current = null; } },
    // Draws a static thumbnail of a level's opening screen into host (replacing earlier previews there).
    preview: function (host, level, levelKey) {
      if (typeof host === 'string') host = document.getElementById(host);
      if (!host) return null;
      var old = host.querySelectorAll('[data-pp-preview]');
      for (var i = 0; i < old.length; i++) old[i].parentNode.removeChild(old[i]);
      var g = new Game(host, { level: level, levelKey: levelKey, preview: true });
      g.wrap.setAttribute('data-pp-preview', '1');
      g.canvas.style.cursor = 'default';
      return g;
    }
  };
})(window);
