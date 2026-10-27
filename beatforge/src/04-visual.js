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
