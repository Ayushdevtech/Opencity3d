/* Open City - input, game loop, start/pause. Made by Ayushdev */
(function (G) {
  'use strict';
  var S = G.S, I = G.input;
  var canvas = document.getElementById('game');
  var intro = document.getElementById('intro');
  var hud = document.getElementById('hud');
  var touchUI = document.getElementById('touch');
  var startBtn = document.getElementById('start-btn');
  var lastT = 0, lastTouch = 0, runToggle = false;

  I.touch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  if (I.touch && window.matchMedia && !window.matchMedia('(pointer: coarse)').matches) I.touch = false;
  if (I.touch) document.body.classList.add('is-touch');

  var loadBar = document.getElementById('load-fill'), loadTxt = document.getElementById('load-text'), ready = false;
  function setLoad(f, msg) {
    if (loadBar) loadBar.style.width = Math.round(f * 100) + '%';
    if (loadTxt) loadTxt.textContent = msg;
    if (!ready) startBtn.textContent = 'LOADING ' + Math.round(f * 100) + '%';
  }
  startBtn.disabled = true;
  G.ui.init();
  setLoad(0.02, 'Loading 3D models');
  G.models.load(function (f) { setLoad(0.05 + f * 0.7, 'Loading 3D models'); }).then(function () {
    setLoad(0.78, 'Building the city');
    return new Promise(function (res) { setTimeout(res, 30); });
  }).then(function () {
    G.initRender(canvas);
    setLoad(0.92, 'Placing people and traffic');
    return new Promise(function (res) { setTimeout(res, 30); });
  }).then(function () {
    G.initWorld();
    G.updateCamera(0, true);
    ready = true;
    setLoad(1, 'Ready');
    startBtn.disabled = false; startBtn.textContent = S.started ? 'RESUME' : 'START GAME';
    document.getElementById('loadbox').classList.add('done');
    G.render();
    requestAnimationFrame(frame);
  }).catch(function (e) {
    if (window.__fatal) window.__fatal('Game failed to start: ' + (e && e.message ? e.message : e));
    console.error(e);
  });

  /* ---------- start / pause ---------- */
  function goFullscreenLandscape() {
    try {
      var d = document.documentElement;
      var req = d.requestFullscreen || d.webkitRequestFullscreen;
      if (req && I.touch && !document.fullscreenElement) {
        var pr = req.call(d);
        if (pr && pr.then) pr.then(lockLandscape, function () {}); else lockLandscape();
      } else lockLandscape();
    } catch (e) {}
  }
  function lockLandscape() {
    try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); } catch (e) {}
  }

  G.setPaused = function (p) {
    S.paused = p;
    if (p) {
      intro.classList.remove('hidden');
      startBtn.textContent = ready ? (S.started ? 'RESUME' : 'START GAME') : startBtn.textContent;
      clearInput();
      try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) {}
      G.audio.engine(false, 0);
    } else intro.classList.add('hidden');
  };

  function closeIntro() {
    G.audio.init();
    if (!S.started) {
      S.started = true;
      hud.classList.remove('hidden');
      if (I.touch) touchUI.classList.remove('hidden');
      G.toast('Find the red gang. Enter any vehicle and drive.', 'info');
    }
    goFullscreenLandscape();
    G.setPaused(false);
    if (!I.touch) lockMouse();
  }
  function lockMouse() { try { if (canvas.requestPointerLock) { var r = canvas.requestPointerLock(); if (r && r.catch) r.catch(function () {}); } } catch (e) {} }
  startBtn.addEventListener('click', function () { if (ready) closeIntro(); });
  document.getElementById('btn-pause').addEventListener('click', function () { if (S.started && !S.over) G.setPaused(!S.paused); });
  document.getElementById('btn-help').addEventListener('click', function () { if (S.started) G.setPaused(true); });
  document.getElementById('btn-sound').addEventListener('click', function () {
    G.audio.init(); G.audio.setOn(!G.audio.on);
    this.classList.toggle('off', !G.audio.on);
  });
  document.getElementById('respawn-btn').addEventListener('click', function () { G.respawnPlayer(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && S.started && !S.over && !S.paused) G.setPaused(true); });

  function clearInput() {
    I.up = I.down = I.left = I.right = I.run = I.fire = false; I.jx = I.jy = 0; I.horn = false; I.taim = null;
  }

  /* ---------- keyboard ---------- */
  var KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'run', ShiftRight: 'run', Space: 'fire', KeyJ: 'fire', KeyH: 'horn' };
  window.addEventListener('keydown', function (e) {
    if (e.repeat) { if (KEYMAP[e.code]) e.preventDefault(); return; }
    var k = KEYMAP[e.code];
    if (k) { I[k] = true; e.preventDefault(); }
    if (S.paused) { if ((e.code === 'Enter' || e.code === 'Escape') && S.started) { if (e.code === 'Escape') closeIntro(); } return; }
    if (e.code === 'KeyE' || e.code === 'KeyF' || e.code === 'Enter') I.act = true;
    else if (e.code === 'KeyQ') I.next = true;
    else if (e.code === 'KeyM') { G.audio.setOn(!G.audio.on); document.getElementById('btn-sound').classList.toggle('off', !G.audio.on); }
    else if (e.code === 'Escape' || e.code === 'KeyP') G.setPaused(true);
    else if (e.code.indexOf('Digit') === 0) { var n = parseInt(e.code.slice(5), 10); if (n >= 1 && n <= 5) I.slot = n - 1; }
  });
  window.addEventListener('keyup', function (e) { var k = KEYMAP[e.code]; if (k) I[k] = false; });
  window.addEventListener('blur', clearInput);

  /* ---------- mouse (pointer lock look + click to fire) ---------- */
  var rdrag = false;
  function locked() { return document.pointerLockElement === canvas; }
  document.addEventListener('pointerlockchange', function () {
    if (!locked() && S.started && !S.over && !S.paused && !I.touch) G.setPaused(true);
  });
  window.addEventListener('mousemove', function (e) {
    if (S.paused || I.touch) return;
    if (locked()) G.rotateCam(e.movementX * 0.0024, e.movementY * 0.0019);
    else if (rdrag) G.rotateCam(e.movementX * 0.0035, e.movementY * 0.003);
  });
  canvas.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse' || S.paused) return;
    I.mouse = true; I.touch = false; G.audio.init();
    if (e.button === 2) { rdrag = true; return; }
    if (!locked()) lockMouse();
    if (e.button === 0) I.fire = true;
  });
  window.addEventListener('pointerup', function (e) { if (e.pointerType === 'mouse') { if (e.button === 0) I.fire = false; if (e.button === 2) rdrag = false; } });
  canvas.addEventListener('wheel', function (e) { if (!S.paused) I.next = true; e.preventDefault(); }, { passive: false });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ---------- touch controls (Free Fire style) ---------- */
  var joyZone = document.getElementById('joy-zone'), joyBase = document.getElementById('joy-base'), joyKnob = document.getElementById('joy-knob');
  var aimZone = document.getElementById('aim-zone');
  var JR = 62, joyId = null, jox = 0, joy = 0;

  function joyMove(e) {
    var dx = e.clientX - jox, dy = e.clientY - joy, d = Math.sqrt(dx * dx + dy * dy);
    if (d > JR) { dx = dx / d * JR; dy = dy / d * JR; d = JR; }
    joyKnob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    var m = d / JR;
    if (m < 0.12) { I.jx = 0; I.jy = 0; } else { I.jx = dx / JR; I.jy = dy / JR; }
  }
  joyZone.addEventListener('pointerdown', function (e) {
    if (joyId !== null) return;
    joyId = e.pointerId; joyZone.setPointerCapture(e.pointerId);
    jox = e.clientX; joy = e.clientY;
    joyBase.style.left = jox + 'px'; joyBase.style.top = joy + 'px'; joyBase.classList.remove('hidden');
    joyKnob.style.transform = 'translate(0,0)';
    I.touch = true; lastTouch = performance.now(); G.audio.init();
    e.preventDefault();
  });
  joyZone.addEventListener('pointermove', function (e) { if (e.pointerId === joyId) { joyMove(e); e.preventDefault(); } });
  function joyEnd(e) {
    if (e.pointerId !== joyId) return;
    joyId = null; I.jx = 0; I.jy = 0; joyBase.classList.add('hidden');
  }
  joyZone.addEventListener('pointerup', joyEnd);
  joyZone.addEventListener('pointercancel', joyEnd);

  /* camera look: drag anywhere on the right side, or drag from the fire button */
  var aimId = null, aimX0 = 0, aimY0 = 0;
  function look(dx, dy) { G.rotateCam(dx * 0.0062, dy * 0.0042); }
  aimZone.addEventListener('pointerdown', function (e) {
    if (aimId !== null) return;
    aimId = e.pointerId; aimZone.setPointerCapture(e.pointerId); aimX0 = e.clientX; aimY0 = e.clientY;
    I.touch = true; lastTouch = performance.now(); e.preventDefault();
  });
  aimZone.addEventListener('pointermove', function (e) { if (e.pointerId === aimId) { look(e.clientX - aimX0, e.clientY - aimY0); aimX0 = e.clientX; aimY0 = e.clientY; e.preventDefault(); } });
  function aimEnd(e) { if (e.pointerId === aimId) aimId = null; }
  aimZone.addEventListener('pointerup', aimEnd);
  aimZone.addEventListener('pointercancel', aimEnd);

  function bindBtn(id, down, up) {
    var b = document.getElementById(id), pid = null;
    b.addEventListener('pointerdown', function (e) {
      if (pid !== null) return;
      pid = e.pointerId; b.setPointerCapture(e.pointerId); b.classList.add('down');
      I.touch = true; lastTouch = performance.now(); G.audio.init();
      down(e, b); e.preventDefault(); e.stopPropagation();
    });
    var lx = 0, ly = 0;
    b.addEventListener('pointerdown', function (e) { lx = e.clientX; ly = e.clientY; });
    b.addEventListener('pointermove', function (e) { if (e.pointerId === pid && id === 't-fire') { look(e.clientX - lx, e.clientY - ly); lx = e.clientX; ly = e.clientY; } });
    function end(e) { if (e.pointerId !== pid) return; pid = null; b.classList.remove('down'); if (up) up(e, b); }
    b.addEventListener('pointerup', end); b.addEventListener('pointercancel', end);
  }
  bindBtn('t-fire', function () { I.fire = true; }, function () { I.fire = false; });
  bindBtn('t-act', function () { I.act = true; });
  bindBtn('t-wpn', function () { I.next = true; });
  bindBtn('t-run', function (e, b) { runToggle = !runToggle; I.run = runToggle; b.classList.toggle('on', runToggle); });
  bindBtn('t-horn', function () { I.horn = true; }, function () { I.horn = false; });

  /* ---------- loop ---------- */
  function actions() {
    if (I.act) { I.act = false; G.interact(); }
    if (I.next) { I.next = false; G.nextWeapon(); }
    if (I.slot >= 0) { G.switchWeapon(I.slot); I.slot = -1; }
  }

  function update(dt) {
    S.clock += dt; S.time += dt * 1.25;
    actions();
    G.updatePlayer(dt);
    G.updateVehicles(dt);
    G.updatePeds(dt);
    G.updateBullets(dt);
    G.updateParts(dt);
    G.updatePickups(dt);
    G.updateSpawner(dt);
    G.updateCamera(dt, false);
  }

  function frame(ts) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (ts - lastT) / 1000 || 0);
    lastT = ts;
    if (!ready) return;
    var portrait = I.touch && window.innerHeight > window.innerWidth;
    if (!S.paused && !portrait) update(dt);
    G.render();
    G.ui.update(dt);
  }
})(window.G = window.G || {});
