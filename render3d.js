/* Open City - 3D renderer (three.js): scene, sky, light, camera, entities, effects. Made by Ayushdev */
(function (G) {
  'use strict';
  var T = THREE, S = G.S, W = G.world, M = G.models, clamp = G.clamp, TAU = Math.PI * 2;
  var renderer, scene, camera, canvas, VW = 800, VH = 450, dpr = 1, city, sky, clouds, sun, hemi, moonFill;
  var cam = G.cam = { x: W.START.x, y: W.START.y, yaw: 0, pitch: 0.3, dist: 140, manualT: 0, h: 34 };
  G.view = { w: 800, h: 450 };
  G.night = 0;
  var tmpV = new T.Vector3(), tmpC = new T.Color();

  /* ---------------------------------------------------------------- init */
  G.initRender = function (c) {
    canvas = c;
    var mobile = G.input.touch;
    renderer = new T.WebGLRenderer({ canvas: c, antialias: !mobile, powerPreference: 'high-performance', alpha: false });
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    scene = new T.Scene();
    scene.fog = new T.Fog(0xbcd8ee, 900, 6500);
    camera = new T.PerspectiveCamera(62, 16 / 9, 3, 16000);
    resize();
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function () { setTimeout(resize, 250); });

    hemi = new T.HemisphereLight(0xcfe6ff, 0x6b7a5a, 0.62); scene.add(hemi);
    sun = new T.DirectionalLight(0xffffff, 1.0);
    var sm = mobile ? 1024 : 2048, R = 520;
    sun.castShadow = true; sun.shadow.mapSize.set(sm, sm);
    var sc = sun.shadow.camera; sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = 50; sc.far = 4200;
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
    scene.add(sun); scene.add(sun.target);

    buildSky();
    city = G.buildCity(scene, renderer);
    buildFx();
    return city;
  };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, G.input.touch ? 1.5 : 1.75);
    VW = window.innerWidth; VH = window.innerHeight;
    renderer.setPixelRatio(dpr); renderer.setSize(VW, VH, false);
    canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
    camera.aspect = VW / VH; camera.fov = VW / VH < 1.3 ? 70 : 62; camera.updateProjectionMatrix();
    G.view.w = VW; G.view.h = VH;
    if (partMat) partMat.uniforms.uScale.value = VH * dpr / (2 * Math.tan(camera.fov * Math.PI / 360));
  }

  G.onScreen = function (x, y, m) {
    var dx = x - cam.x, dy = y - cam.y;
    return dx * dx + dy * dy < (520 + m) * (520 + m);
  };

  /* ---------------------------------------------------------------- sky */
  var skyU;
  function buildSky() {
    skyU = {
      uZenith: { value: new T.Color(0x3a7bd5) }, uHorizon: { value: new T.Color(0xbcd8ee) },
      uSunDir: { value: new T.Vector3(0, 1, 0) }, uSunCol: { value: new T.Color(0xfff2c8) }, uNight: { value: 0 }
    };
    var mat = new T.ShaderMaterial({
      uniforms: skyU, side: T.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: [
        'uniform vec3 uZenith, uHorizon, uSunDir, uSunCol; uniform float uNight; varying vec3 vD;',
        'float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }',
        'void main(){',
        '  vec3 d = normalize(vD); float h = clamp(d.y, 0.0, 1.0);',
        '  vec3 col = mix(uHorizon, uZenith, pow(h, 0.5));',
        '  float s = max(dot(d, uSunDir), 0.0);',
        '  col += uSunCol * (pow(s, 1400.0) * 3.0 + pow(s, 40.0) * 0.35 + pow(s, 6.0) * 0.12) * (1.0 - uNight * 0.9);',
        '  float m = dot(d, -uSunDir); col += vec3(0.88, 0.93, 1.0) * smoothstep(0.99935, 0.99965, m) * uNight;',
        '  float st = step(0.9972, hash(floor(d * 260.0))); col += vec3(st) * uNight * smoothstep(0.02, 0.25, d.y) * 0.9;',
        '  if (d.y < 0.0) col = mix(col, uHorizon * 0.92, clamp(-d.y * 6.0, 0.0, 1.0));',
        '  gl_FragColor = vec4(col, 1.0);',
        '}'
      ].join('\n')
    });
    sky = new T.Mesh(new T.SphereGeometry(13000, 32, 16), mat); sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);

    /* soft clouds */
    var c = document.createElement('canvas'); c.width = 256; c.height = 128;
    var x = c.getContext('2d');
    for (var i = 0; i < 16; i++) {
      var cx = 40 + Math.random() * 176, cy = 52 + Math.random() * 28, r = 22 + Math.random() * 30;
      var g = x.createRadialGradient(cx, cy, 2, cx, cy, r); g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 256, 128);
    }
    var tex = new T.CanvasTexture(c);
    clouds = new T.Group();
    var cm = new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0.85 });
    clouds.userData.mat = cm;
    for (var k = 0; k < 18; k++) {
      var sp = new T.Sprite(cm), a = Math.random() * TAU, rr = 5000 + Math.random() * 4500;
      sp.position.set(Math.cos(a) * rr, 1500 + Math.random() * 900, Math.sin(a) * rr);
      var sz = 2600 + Math.random() * 2600; sp.scale.set(sz, sz * 0.5, 1); clouds.add(sp);
    }
    scene.add(clouds);
  }

  /* ---------------------------------------------------------------- time of day */
  var C_DAY_Z = new T.Color(0x2f78d6), C_DAY_H = new T.Color(0xbfdcf2), C_NIGHT_Z = new T.Color(0x050914), C_NIGHT_H = new T.Color(0x16203c), C_WARM = new T.Color(0xff9a5c);
  var C_HS_D = new T.Color(0xd2e6ff), C_HS_N = new T.Color(0x2a3558), C_HG_D = new T.Color(0x7a8a62), C_HG_N = new T.Color(0x151a26);
  G.hourOfDay = function () { return (S.time / 60) % 24; };
  var sunDir = new T.Vector3();
  function dayCycle() {
    var h = G.hourOfDay(), el = (h - 6) / 12 * Math.PI, sE = Math.sin(el);
    var dayF = clamp(sE * 3 + 0.25, 0, 1), night = 1 - clamp((sE + 0.14) * 4.5, 0, 1);
    var warm = clamp(1 - Math.abs(sE) * 3.2, 0, 1) * (sE > -0.25 ? 1 : 0);
    G.night = night;
    sunDir.set(Math.cos(el) * 0.8, sE, 0.6).normalize();
    skyU.uSunDir.value.copy(sunDir); skyU.uNight.value = night;
    skyU.uZenith.value.copy(C_NIGHT_Z).lerp(C_DAY_Z, dayF);
    skyU.uHorizon.value.copy(C_NIGHT_H).lerp(C_DAY_H, dayF).lerp(C_WARM, warm * 0.75);
    skyU.uSunCol.value.set(0xfff2c8).lerp(C_WARM, warm);
    scene.fog.color.copy(skyU.uHorizon.value);
    scene.fog.near = 700 + 500 * dayF; scene.fog.far = 5200 + 1800 * dayF;
    hemi.color.copy(C_HS_N).lerp(C_HS_D, dayF).lerp(C_WARM, warm * 0.25);
    hemi.groundColor.copy(C_HG_N).lerp(C_HG_D, dayF);
    hemi.intensity = 0.34 + 0.34 * dayF;
    var useSun = sE > 0.03;
    tmpV.copy(sunDir); if (!useSun) tmpV.negate(); if (tmpV.y < 0.12) tmpV.y = 0.12; tmpV.normalize();
    sun.position.copy(sun.target.position).addScaledVector(tmpV, 2400);
    sun.color.set(useSun ? 0xfff4dc : 0x8fa8e8).lerp(C_WARM, useSun ? warm * 0.6 : 0);
    sun.intensity = useSun ? 0.35 + 0.8 * clamp(sE * 2.2, 0, 1) : 0.2 + 0.1 * night;
    clouds.userData.mat.opacity = 0.9 - night * 0.8; clouds.userData.mat.color.setScalar(1 - night * 0.7).lerp(C_WARM, warm * 0.25);
  }

  /* ---------------------------------------------------------------- camera */
  G.rotateCam = function (dx, dy) { cam.yaw += dx; cam.pitch = clamp(cam.pitch + dy, 0.04, 1.1); cam.manualT = 2.5; };
  G.updateCamera = function (dt, snap) {
    var p = S.player, v = p.vehicle, tx = p.x, ty = p.y, dist = 135, hh = 34, pitchT = 0.3;
    cam.manualT -= dt;
    if (v) {
      var k = v.t.kind;
      dist = v.type === 'bus' ? 330 : (k === 'car' ? 235 : (k === 'bike' ? 185 : 160)); hh = v.type === 'bus' ? 70 : (k === 'car' ? 38 : 40);
      tx = v.x + Math.cos(v.angle) * v.speed * 0.12; ty = v.y + Math.sin(v.angle) * v.speed * 0.12;
      if (cam.manualT <= 0 && Math.abs(v.speed) > 22 || snap) {
        var tgt = v.speed >= 0 ? v.angle : v.angle + Math.PI, d = Math.atan2(Math.sin(tgt - cam.yaw), Math.cos(tgt - cam.yaw));
        cam.yaw += d * (snap ? 1 : 1 - Math.exp(-dt * 2.6));
      }
      pitchT = 0.27;
      if (cam.manualT <= 0) cam.pitch += (pitchT - cam.pitch) * Math.min(1, dt * 2);
    } else if (snap) { cam.yaw = p.angle; cam.pitch = 0.3; }
    var kk = snap ? 1 : Math.min(1, dt * (v ? 9 : 12));
    cam.x += (tx - cam.x) * kk; cam.y += (ty - cam.y) * kk;
    cam.dist += (dist - cam.dist) * Math.min(1, snap ? 1 : dt * 3); cam.h += (hh - cam.h) * Math.min(1, snap ? 1 : dt * 3);
  };

  function placeCamera() {
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), dx = Math.cos(cam.yaw), dz = Math.sin(cam.yaw);
    var d = cam.dist, ex, ez;
    for (var i = 0; i < 8; i++) {                       /* pull the camera in front of walls */
      ex = cam.x - dx * d * cp; ez = cam.y - dz * d * cp;
      if (!W.blocked(ex, ez, 10)) break;
      d *= 0.78;
    }
    var shk = S.shake > 0.1 ? S.shake : 0;
    camera.position.set(ex + (shk ? (Math.random() - 0.5) * shk * 0.5 : 0), cam.h + d * sp + 6 + (shk ? (Math.random() - 0.5) * shk * 0.4 : 0), ez);
    camera.lookAt(cam.x + dx * 40, cam.h * 0.9, cam.y + dz * 40);
  }

  /* ---------------------------------------------------------------- effects: particles, bullets, decals, pickups */
  var partMat, partGeo, partPts, bulletGeo, bulletLines, decalBlood, decalSkid, bloodGeo, skidGeo, pickGroup;
  var MAXP = 460, MAXB = 90, MAXD = 210, pickCache = {};
  function buildFx() {
    partGeo = new T.BufferGeometry();
    partGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(MAXP * 3), 3));
    partGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(MAXP * 4), 4));
    partGeo.setAttribute('size', new T.BufferAttribute(new Float32Array(MAXP), 1));
    partMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uScale: { value: 600 } },
      vertexShader: 'attribute float size; attribute vec4 color; varying vec4 vC; uniform float uScale; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = clamp(size * uScale / -mv.z, 0.0, 200.0); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'varying vec4 vC; void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q) * 2.0; float a = smoothstep(1.0, 0.25, d); gl_FragColor = vec4(vC.rgb, vC.a * a); }'
    });
    partPts = new T.Points(partGeo, partMat); partPts.frustumCulled = false; scene.add(partPts);
    resize();

    bulletGeo = new T.BufferGeometry();
    bulletGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(MAXB * 6), 3));
    bulletGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(MAXB * 6), 3));
    bulletLines = new T.LineSegments(bulletGeo, new T.LineBasicMaterial({ vertexColors: true, fog: false })); bulletLines.frustumCulled = false; scene.add(bulletLines);

    function blob() {
      var c = document.createElement('canvas'); c.width = c.height = 64; var x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 3, 32, 32, 31);
      g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.7, 'rgba(255,255,255,0.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c);
    }
    function decalMesh(tex, y) {
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(MAXD * 18), 3));
      g.setAttribute('uv', new T.BufferAttribute(new Float32Array(MAXD * 12), 2));
      g.setAttribute('color', new T.BufferAttribute(new Float32Array(MAXD * 24), 4));
      g.setDrawRange(0, 0);
      var m = new T.Mesh(g, new T.MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, fog: false }));
      m.frustumCulled = false; m.position.y = y; m.renderOrder = 2; scene.add(m); return m;
    }
    decalBlood = decalMesh(blob(), 0.5); decalSkid = decalMesh(null, 0.6);
    pickGroup = new T.Group(); scene.add(pickGroup);
  }

  var QUV = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
  function writeDecals() {
    var D = S.decals, bm = decalBlood.geometry, sm = decalSkid.geometry, bp = bm.attributes.position.array, sp = sm.attributes.position.array;
    var bc = bm.attributes.color.array, sc = sm.attributes.color.array, bu = bm.attributes.uv.array, su = sm.attributes.uv.array, nb = 0, ns = 0;
    for (var i = 0; i < D.length; i++) {
      var d = D[i];
      if (d.t === 'blood') {
        if (nb >= MAXD || !G.onScreen(d.x, d.y, 500)) continue;
        var r = d.r * 1.15, a = Math.min(1, d.life / 8) * 0.75, cs = Math.cos(d.rot), sn = Math.sin(d.rot);
        var cx = [-r, r, r, -r], cz = [-r * 0.75, -r * 0.75, r * 0.75, r * 0.75], px = [], pz = [];
        for (var q = 0; q < 4; q++) { px[q] = d.x + cx[q] * cs - cz[q] * sn; pz[q] = d.y + cx[q] * sn + cz[q] * cs; }
        var ord = [0, 1, 2, 0, 2, 3], o = nb * 18, oc = nb * 24, ou = nb * 12;
        for (var t = 0; t < 6; t++) {
          bp[o + t * 3] = px[ord[t]]; bp[o + t * 3 + 1] = 0; bp[o + t * 3 + 2] = pz[ord[t]];
          bc[oc + t * 4] = 0.47; bc[oc + t * 4 + 1] = 0.04; bc[oc + t * 4 + 2] = 0.06; bc[oc + t * 4 + 3] = a;
          bu[ou + t * 2] = (ord[t] === 0 || ord[t] === 3) ? 0 : 1; bu[ou + t * 2 + 1] = (ord[t] < 2) ? 0 : 1;
        }
        nb++;
      } else {
        if (ns >= MAXD || !G.onScreen(d.x, d.y, 500)) continue;
        var dx = d.x2 - d.x, dz = d.y2 - d.y, L = Math.sqrt(dx * dx + dz * dz) || 1, nx = -dz / L * 1.4, nz = dx / L * 1.4, al = 0.4 * Math.min(1, d.life / 6);
        var xs = [d.x - nx, d.x + nx, d.x2 + nx, d.x2 - nx], zs = [d.y - nz, d.y + nz, d.y2 + nz, d.y2 - nz], ord2 = [0, 1, 2, 0, 2, 3], o2 = ns * 18, oc2 = ns * 24, ou2 = ns * 12;
        for (var t2 = 0; t2 < 6; t2++) {
          sp[o2 + t2 * 3] = xs[ord2[t2]]; sp[o2 + t2 * 3 + 1] = 0; sp[o2 + t2 * 3 + 2] = zs[ord2[t2]];
          sc[oc2 + t2 * 4] = 0.04; sc[oc2 + t2 * 4 + 1] = 0.04; sc[oc2 + t2 * 4 + 2] = 0.05; sc[oc2 + t2 * 4 + 3] = al;
          su[ou2 + t2 * 2] = QUV[t2 * 2]; su[ou2 + t2 * 2 + 1] = QUV[t2 * 2 + 1];
        }
        ns++;
      }
    }
    bm.setDrawRange(0, nb * 6); sm.setDrawRange(0, ns * 6);
    bm.attributes.position.needsUpdate = bm.attributes.color.needsUpdate = bm.attributes.uv.needsUpdate = true;
    sm.attributes.position.needsUpdate = sm.attributes.color.needsUpdate = sm.attributes.uv.needsUpdate = true;
    /* skid quads use the "no map" path: give them a white 1px map so the shared shader works */
    if (!decalSkid.material.map) { var c = document.createElement('canvas'); c.width = c.height = 2; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 2, 2); decalSkid.material.map = new T.CanvasTexture(c); decalSkid.material.needsUpdate = true; }
  }

  function writeParts() {
    var P = S.parts, pos = partGeo.attributes.position.array, col = partGeo.attributes.color.array, siz = partGeo.attributes.size.array, n = 0;
    for (var i = 0; i < P.length && n < MAXP; i++) {
      var p = P[i], a = clamp(p.life / p.max, 0, 1), age = 1 - a, y = 6, r = 1, g = 1, b = 1, al = a, s = p.size * 1.7;
      switch (p.type) {
        case 'blood': r = 0.6; g = 0.05; b = 0.08; y = 8 + Math.sin(age * 3.1) * 12; s = p.size * 1.1; al = a; break;
        case 'spark': r = 1; g = 0.85; b = 0.4; y = 14 - age * 10; s = 1.6; break;
        case 'smoke': r = g = 0.28; b = 0.3; y = 14 + age * 60; al = a * 0.5; s = p.size * (1.6 + age * 1.5); break;
        case 'fire': r = 1; g = 0.35 + a * 0.5; b = 0.08; y = 10 + age * 36; al = a * 0.9; s = p.size * 1.7; break;
        case 'flash': r = 1; g = 0.93; b = 0.65; y = 22; al = 0.95; s = p.size * 1.8; break;
        case 'ring': r = 1; g = 0.78; b = 0.47; y = 18; al = a * 0.35; s = p.size * 1.1; break;
        default: break;
      }
      pos[n * 3] = p.x; pos[n * 3 + 1] = y; pos[n * 3 + 2] = p.y;
      col[n * 4] = r; col[n * 4 + 1] = g; col[n * 4 + 2] = b; col[n * 4 + 3] = al; siz[n] = s;
      n++;
    }
    partGeo.setDrawRange(0, n);
    partGeo.attributes.position.needsUpdate = partGeo.attributes.color.needsUpdate = partGeo.attributes.size.needsUpdate = true;
  }

  function writeBullets() {
    var B = S.bullets, pos = bulletGeo.attributes.position.array, col = bulletGeo.attributes.color.array, n = 0;
    for (var i = 0; i < B.length && n < MAXB; i++) {
      var b = B[i], pl = b.by === 'player';
      pos[n * 6] = b.x; pos[n * 6 + 1] = 24; pos[n * 6 + 2] = b.y; pos[n * 6 + 3] = b.x - b.vx * 0.03; pos[n * 6 + 4] = 24; pos[n * 6 + 5] = b.y - b.vy * 0.03;
      col[n * 6] = 1; col[n * 6 + 1] = pl ? 0.95 : 0.6; col[n * 6 + 2] = pl ? 0.65 : 0.3; col[n * 6 + 3] = 1; col[n * 6 + 4] = pl ? 0.95 : 0.6; col[n * 6 + 5] = pl ? 0.65 : 0.3;
      n++;
    }
    bulletGeo.setDrawRange(0, n * 2);
    bulletGeo.attributes.position.needsUpdate = bulletGeo.attributes.color.needsUpdate = true;
  }

  var PK_COL = { health: 0xef4444, armor: 0x3b82f6, ammo: 0xf59e0b, cash: 0x22c55e, smg: 0xa855f7, shotgun: 0xa855f7 };
  function pickupView(pk) {
    if (pk._m) return pk._m;
    var col = PK_COL[pk.type] || 0xa855f7, g = new T.Group();
    var core = new T.Mesh(pk.type === 'cash' ? new T.CylinderGeometry(9, 9, 3, 16) : new T.BoxGeometry(14, 14, 14), new T.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.35 }));
    core.position.y = 20; core.castShadow = true; g.add(core);
    if (pk.type === 'health') { var m2 = new T.MeshBasicMaterial({ color: 0xffffff }); var a = new T.Mesh(new T.BoxGeometry(5, 15.5, 15.5), m2), b = new T.Mesh(new T.BoxGeometry(15.5, 5, 15.5), m2); a.position.y = b.position.y = 20; g.add(a); g.add(b); }
    var beam = new T.Mesh(new T.CylinderGeometry(7, 11, 90, 12, 1, true), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.22, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: false }));
    beam.position.y = 45; g.add(beam);
    var ring = new T.Mesh(new T.RingGeometry(14, 18, 24), new T.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.55, depthWrite: false, side: T.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.8; g.add(ring);
    g.userData.core = core; pickGroup.add(g); pk._m = g; return g;
  }
  function syncPickups() {
    var L = S.pickups, i;
    for (i = 0; i < L.length; i++) {
      var pk = L[i], near = G.onScreen(pk.x, pk.y, 700);
      if (!near) { if (pk._m) pk._m.visible = false; continue; }
      var g = pickupView(pk); g.visible = true; g.position.set(pk.x, 0, pk.y);
      var c = g.userData.core; c.position.y = 20 + Math.sin(pk.t * 3) * 3; c.rotation.y = pk.t * 2;
    }
    /* drop views of collected pickups */
    var live = pickGroup.userData.live || (pickGroup.userData.live = []);
    live.length = 0; for (i = 0; i < L.length; i++) if (L[i]._m) live.push(L[i]._m);
    for (i = pickGroup.children.length - 1; i >= 0; i--) if (live.indexOf(pickGroup.children[i]) < 0) pickGroup.remove(pickGroup.children[i]);
  }

  /* ---------------------------------------------------------------- people */
  var RING = {
    gang: new T.MeshBasicMaterial({ color: 0xff2a2a, transparent: true, opacity: 0.7, depthWrite: false, side: T.DoubleSide }),
    cop: new T.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.7, depthWrite: false, side: T.DoubleSide }),
    player: new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, side: T.DoubleSide })
  };
  var ringGeo = new T.RingGeometry(16, 20, 28), flashMat = null;
  var budget = 0, DEAD_FALL = 0.22;
  function newPersonView(p) {
    var kind = p.kind === 'player' ? 'player' : p.kind, pv = M.makePerson(kind, p.look);
    pv.root.rotation.order = 'YXZ'; pv.aimW = 0;
    if (RING[kind]) { var r = new T.Mesh(ringGeo, RING[kind]); r.rotation.x = -Math.PI / 2; r.position.y = 0.9; pv.root.add(r); pv.ring = r; r.renderOrder = 3; }
    if (!flashMat) flashMat = new T.SpriteMaterial({ map: M.glowTex, color: 0xffe6a0, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false });
    var fl = new T.Sprite(flashMat); fl.scale.set(30, 30, 1); fl.visible = false; pv.root.add(fl); pv.flash = fl;
    pv.mats = []; pv.model.traverse(function (o) { if (o.isMesh && o.material && o.material.emissive) pv.mats.push(o.material); });
    pv.hitOn = false;
    return pv;
  }
  var _fv = new T.Vector3();
  function poseAndAnimate(p, pv, dt, ride, speed) {
    var w = G.WEAPONS[p.weapon] || G.WEAPONS.fist, ranged = !w.melee;
    if (ride) { M.animate(pv, dt, 0); M.applyPose(pv, { ride: ride, phase: p.phase, swing: -1 }); M.setItem(pv, 'fist'); pv.flash.visible = false; return; }
    M.animate(pv, dt, speed);
    var want = (ranged && (p.attackT < 1.6 || (p.kind !== 'civ' && p.aggro > 0))) ? 1 : 0;
    pv.aimW += (want - pv.aimW) * Math.min(1, dt * 10);
    var pun = (p.weapon === 'fist' && p.attackT < 0.28) ? Math.sin(p.attackT / 0.28 * Math.PI) : 0;
    var sw = (p.weapon === 'bat' && p.attackT < 0.28) ? p.attackT / 0.28 : -1;
    M.setItem(pv, p.weapon);
    M.applyPose(pv, { aim: ranged ? pv.aimW : 0, gun: p.weapon, punch: pun, swing: sw });
    if (p.flash > 0 && pv.item) { _fv.set(0, 0, p.weapon === 'shotgun' ? 36 : 22).applyQuaternion(pv.item.quaternion).add(pv.item.position); pv.flash.position.copy(_fv); pv.flash.visible = true; pv.flash.material.rotation = Math.random() * 6; }
    else pv.flash.visible = false;
  }
  function setHit(pv, on) {
    if (pv.hitOn === on) return; pv.hitOn = on;
    for (var i = 0; i < pv.mats.length; i++) pv.mats[i].emissive.setScalar(on ? 0.55 : 0);
  }
  function dropPerson(p) { var pv = p._pv; if (!pv) return; if (pv.root.parent) pv.root.parent.remove(pv.root); pv.mats.forEach(function (m) { m.dispose(); }); p._pv = null; }

  function syncPerson(p, dt, t) {
    var dx = p.x - cam.x, dy = p.y - cam.y, d2 = dx * dx + dy * dy, pv = p._pv, inVeh = p.kind === 'player' && p.vehicle;
    if (p.remove || (p.far && p.kind !== 'player') || d2 > 1250 * 1250) { if (pv) dropPerson(p); return; }
    if (inVeh) { var vk = p.vehicle.t.kind; if (pv && vk !== 'bike' && vk !== 'cycle') pv.root.visible = false; return; }
    if (!pv) { if (budget <= 0 || d2 > 1000 * 1000) return; budget--; pv = p._pv = newPersonView(p); }
    if (pv.root.parent !== scene) scene.add(pv.root);
    pv.root.visible = true; pv.wrap.visible = true;
    pv.root.position.set(p.x, 0, p.y);
    if (p.dead) {
      var f = clamp(p.deadT / DEAD_FALL, 0, 1);
      pv.root.rotation.set(f * Math.PI / 2 * 0.98, Math.PI / 2 - p.angle, 0);
      pv.root.position.y = f * 4;
      var sc = p.deadT > 15 ? clamp((18 - p.deadT) / 3, 0.01, 1) : 1; pv.root.scale.setScalar(sc);
      if (pv.item) pv.item.visible = false; if (pv.flash) pv.flash.visible = false; if (pv.ring) pv.ring.visible = false;
      if (f < 1 && p.deadT >= 0) { pv.mixer.update(dt * 0.3); }
      return;
    }
    pv.root.scale.setScalar(1); if (pv.item) pv.item.visible = true;
    pv.root.rotation.set(0, Math.PI / 2 - p.angle, 0);
    if (pv.ring) { pv.ring.visible = true; pv.ring.material.opacity = (p.kind === 'gang' ? 0.5 + (p.aggro > 0 ? 0.3 : 0) : (p.kind === 'player' ? 0.35 : 0.55)) + Math.sin(t * 4) * 0.1; }
    setHit(pv, p.hitFlash > 0);
    if (d2 < 750 * 750 || p.kind === 'player') poseAndAnimate(p, pv, dt, null, p.curSpeed || 0);
    else { pv.root.updateMatrixWorld(true); }
  }

  /* ---------------------------------------------------------------- vehicles */
  var wreckMat = new T.MeshLambertMaterial({ color: 0x1a1a1d });
  var SEAT = { bike: { y: -1, z: -3 }, cycle: { y: 3, z: -4 } };
  function makeWreck(rv) {
    rv.root.traverse(function (o) { if (o.isMesh && o.material !== M.beamMat) { if (!o.userData.orig) o.userData.orig = o.material; o.material = wreckMat; } });
    if (rv.bar) { rv.bar.l1.visible = rv.bar.l2.visible = false; }
    rv.wrecked = true;
  }
  function syncVehicle(v, dt, t) {
    var dx = v.x - cam.x, dy = v.y - cam.y, d2 = dx * dx + dy * dy, rv = v._rv;
    if (v.sleep || v.remove || d2 > 1700 * 1700) { if (rv) { if (rv.root.parent) rv.root.parent.remove(rv.root); detachRider(v); v._rv = null; } return; }
    if (!rv) { if (budget <= 0 || d2 > 1450 * 1450) return; budget--; rv = v._rv = M.makeVehicle(v); scene.add(rv.root); }
    var r = rv.root; r.position.set(v.x, 0, v.y); r.rotation.y = Math.PI / 2 - v.angle;
    var lean = v.t.kind === 'bike' ? -v.steer * clamp(Math.abs(v.speed) / 200, 0, 1) * 0.9 : 0;
    r.rotation.z += (lean - r.rotation.z) * Math.min(1, dt * 8);
    var spin = v.wheel;
    for (var i = 0; i < rv.wheels.length; i++) {
      var w = rv.wheels[i]; w.node.rotation.x = spin; if (w.front) w.node.rotation.y = -v.steer;
    }
    if (v.wreck && !rv.wrecked) makeWreck(rv);
    if (rv.bar && !v.wreck) { var fl = Math.floor(t * 6) % 2 === 0 && (S.wanted > 0 || v.ai); rv.bar.mr.color.set(fl ? 0xff2020 : 0x551010); rv.bar.mb.color.set(fl ? 0x1a2a55 : 0x2d6bff); }
    var occ = v.driver || v.rider;
    rv.beam.visible = G.night > 0.3 && !v.wreck && !!occ && v.t.kind !== 'cycle';
    rv.beam.material.opacity = 0.6;
    /* rider on bikes and bicycles */
    var kind = v.t.kind, show = occ && !v.wreck && (kind === 'bike' || kind === 'cycle') && d2 < 800 * 800;
    if (show) {
      var pv = occ._pv;
      if (!pv && budget > 0) { budget--; pv = occ._pv = newPersonView(occ); }
      if (pv) {
        if (pv.root.parent !== r) r.add(pv.root);
        var st = SEAT[kind]; pv.root.visible = true; pv.root.rotation.set(0, 0, 0); pv.root.scale.setScalar(1); pv.root.position.set(0, st.y, st.z);
        if (pv.ring) pv.ring.visible = false; if (pv.item) pv.item.visible = false; pv.flash.visible = false;
        r.updateMatrixWorld(true);
        poseAndAnimate(occ, pv, dt, kind, 0); occ.phase = occ.phase || 0;
        pv.rideOn = true;
      }
    } else detachRider(v);
  }
  function detachRider(v) {
    var occ = v.driver || v.rider;
    if (occ && occ._pv && occ !== S.player) dropPerson(occ);
  }

  /* ---------------------------------------------------------------- shadow follow + render */
  var _snap = new T.Vector3();
  function followShadow() {
    var R = 1040 / 2048, tx = Math.round(cam.x / 4) * 4, tz = Math.round(cam.y / 4) * 4;
    sun.target.position.set(tx, 0, tz); void R;
  }

  var tClock = 0;
  G.render = function () {
    var dt = Math.min(0.05, (performance.now() - (G._lastR || performance.now())) / 1000 || 0.016); G._lastR = performance.now();
    tClock += dt;
    followShadow(); dayCycle();
    budget = 1;
    var i;
    syncPerson(S.player, dt, tClock);
    budget = 2;
    for (i = 0; i < S.cars.length; i++) syncVehicle(S.cars[i], dt, tClock);
    for (i = 0; i < S.peds.length; i++) syncPerson(S.peds[i], dt, tClock);
    syncPickups(); writeParts(); writeBullets(); writeDecals();
    placeCamera();
    sky.position.copy(camera.position); clouds.position.set(camera.position.x, 0, camera.position.z);
    city.update(G.night, tClock);
    renderer.render(scene, camera);
  };
  G.renderer = function () { return renderer; };
})(window.G = window.G || {});
