/* Open City - 3D model library: loads packed GLB assets, builds people, vehicles, buildings, trees. Made by Ayushdev */
(function (G) {
  'use strict';
  var T = THREE;
  var M = G.models = { ready: false };
  var gl = {};          /* parsed gltf by asset name */
  var texCache = {};
  var SC_PERSON = 22;   /* metres -> world units */

  function b64ToBuf(b64) {
    var s = atob(b64), n = s.length, u = new Uint8Array(n);
    for (var i = 0; i < n; i++) u[i] = s.charCodeAt(i);
    return u.buffer;
  }

  /* ---------------- loading ---------------- */
  M.load = function (onProgress) {
    var names = Object.keys(G.assets), i = 0;
    return new Promise(function (resolve, reject) {
      function next() {
        if (i >= names.length) {
          try { build(); M.ready = true; resolve(); } catch (e) { reject(e); }
          return;
        }
        var k = names[i];
        if (onProgress) onProgress(i / names.length, k);
        var buf = b64ToBuf(G.assets[k]);
        delete G.assets[k];                       /* free the big string */
        new T.GLTFLoader().parse(buf, '', function (g) { gl[k] = g; i++; setTimeout(next, 0); }, function (e) { reject(new Error('Model ' + k + ' failed: ' + (e && e.message || e))); });
      }
      next();
    });
  };

  /* ---------------- colour helpers ---------------- */
  function rgb2hsv(r, g, b) {
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, h = 0;
    if (d > 0) {
      if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    return [h, mx === 0 ? 0 : d / mx, mx];
  }
  function hsv2rgb(h, s, v) {
    var c = v * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = v - c, r, g, b;
    if (h < 60) { r = c; g = x; b = 0; } else if (h < 120) { r = x; g = c; b = 0; } else if (h < 180) { r = 0; g = c; b = x; }
    else if (h < 240) { r = 0; g = x; b = c; } else if (h < 300) { r = x; g = 0; b = c; } else { r = c; g = 0; b = x; }
    return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
  }
  M.hexHue = function (hex) {
    var n = parseInt(hex.slice(1), 16);
    return rgb2hsv(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)[0];
  };
  function inRange(h, lo, hi) { return ((h - lo + 720) % 360) <= ((hi - lo + 720) % 360); }

  /* recolour only the palette cells whose hue is in [lo,hi] so lights, glass and tyres stay untouched */
  M.tint = function (baseTex, key, lo, hi, targetHue, centerHue, satMul) {
    if (texCache[key]) return texCache[key];
    var img = baseTex.image, w = img.width, h = img.height;
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'); x.drawImage(img, 0, 0);
    var id = x.getImageData(0, 0, w, h), d = id.data, shift = targetHue - centerHue;
    for (var i = 0; i < d.length; i += 4) {
      if (d[i] + d[i + 1] + d[i + 2] === 0) continue;
      var hsv = rgb2hsv(d[i] / 255, d[i + 1] / 255, d[i + 2] / 255);
      if (hsv[1] < 0.28 || !inRange(hsv[0], lo, hi)) continue;
      var rgb = hsv2rgb((hsv[0] + shift + 360) % 360, Math.min(1, hsv[1] * (satMul || 1)), hsv[2]);
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2];
    }
    x.putImageData(id, 0, 0);
    /* a brand-new texture (clone() would share the source image with the original) */
    var t = new T.CanvasTexture(c);
    t.flipY = baseTex.flipY; t.encoding = baseTex.encoding; t.wrapS = baseTex.wrapS; t.wrapT = baseTex.wrapT;
    t.offset.copy(baseTex.offset); t.repeat.copy(baseTex.repeat); t.rotation = baseTex.rotation; t.center.copy(baseTex.center);
    t.anisotropy = 4;
    texCache[key] = t;
    return t;
  };

  var lamberts = {};
  M.lambert = function (tex, key) {
    if (!lamberts[key]) lamberts[key] = new T.MeshLambertMaterial({ map: tex });
    return lamberts[key];
  };

  function firstMap(name) {
    var m = null;
    gl[name].scene.traverse(function (o) { if (o.isMesh && !m) m = o.material.map; });
    return m;
  }

  /* flatten a static model into one geometry (node transforms baked in) */
  function flatGeo(name) {
    var gs = [];
    gl[name].scene.updateMatrixWorld(true);
    gl[name].scene.traverse(function (o) {
      if (!o.isMesh) return;
      var g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      if (g.index) g = g.toNonIndexed();
      for (var k in g.attributes) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
      gs.push(g);
    });
    return gs.length === 1 ? gs[0] : T.BufferGeometryUtils.mergeBufferGeometries(gs, false);
  }

  /* split a merged geometry into separate trees: weld vertices, find connected pieces, cluster by footprint */
  function splitTrees(geo) {
    var pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv, nT = pos.count / 3;
    var q = 10000, key = {}, id = new Int32Array(pos.count), uniq = 0, i, j;
    for (i = 0; i < pos.count; i++) {
      var k = Math.round(pos.getX(i) * q) + '_' + Math.round(pos.getY(i) * q) + '_' + Math.round(pos.getZ(i) * q);
      if (key[k] === undefined) key[k] = uniq++;
      id[i] = key[k];
    }
    var par = new Int32Array(uniq); for (i = 0; i < uniq; i++) par[i] = i;
    function find(a) { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; }
    function uni(a, b) { a = find(a); b = find(b); if (a !== b) par[a] = b; }
    for (i = 0; i < nT; i++) { uni(id[i * 3], id[i * 3 + 1]); uni(id[i * 3], id[i * 3 + 2]); }
    var comps = {};
    for (i = 0; i < nT; i++) {
      var c = find(id[i * 3]);
      var o = comps[c] || (comps[c] = { tris: [], x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, z0: 1e9, z1: -1e9 });
      o.tris.push(i);
      for (j = 0; j < 3; j++) {
        var x = pos.getX(i * 3 + j), y = pos.getY(i * 3 + j), z = pos.getZ(i * 3 + j);
        if (x < o.x0) o.x0 = x; if (x > o.x1) o.x1 = x; if (y < o.y0) o.y0 = y; if (y > o.y1) o.y1 = y; if (z < o.z0) o.z0 = z; if (z > o.z1) o.z1 = z;
      }
    }
    var list = [];
    for (var kk in comps) { var cc = comps[kk]; if (cc.y1 - cc.y0 > 0.06 || (cc.x1 - cc.x0) < 0.4) list.push(cc); }
    list = list.filter(function (cc) { return (cc.y1 - cc.y0) > 0.06; });
    /* cluster by overlapping xz centre */
    var cl = [];
    list.forEach(function (cc) {
      var cx = (cc.x0 + cc.x1) / 2, cz = (cc.z0 + cc.z1) / 2, hit = null;
      for (var a = 0; a < cl.length; a++) {
        var t = cl[a];
        if (Math.abs(t.cx - cx) < 0.06 && Math.abs(t.cz - cz) < 0.06) { hit = t; break; }
      }
      if (!hit) { hit = { cx: cx, cz: cz, parts: [], y0: 1e9, y1: -1e9 }; cl.push(hit); }
      hit.parts.push(cc); hit.y0 = Math.min(hit.y0, cc.y0); hit.y1 = Math.max(hit.y1, cc.y1);
    });
    return cl.map(function (t) {
      var tris = []; t.parts.forEach(function (p) { tris = tris.concat(p.tris); });
      var P = new Float32Array(tris.length * 9), N = new Float32Array(tris.length * 9), U = new Float32Array(tris.length * 6), n = 0;
      tris.forEach(function (ti) {
        for (var v = 0; v < 3; v++) {
          var vi = ti * 3 + v;
          P[n * 9 + v * 3] = pos.getX(vi) - t.cx; P[n * 9 + v * 3 + 1] = pos.getY(vi) - t.y0; P[n * 9 + v * 3 + 2] = pos.getZ(vi) - t.cz;
          N[n * 9 + v * 3] = nor.getX(vi); N[n * 9 + v * 3 + 1] = nor.getY(vi); N[n * 9 + v * 3 + 2] = nor.getZ(vi);
          U[n * 6 + v * 2] = uv.getX(vi); U[n * 6 + v * 2 + 1] = uv.getY(vi);
        }
        n++;
      });
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('normal', new T.BufferAttribute(N, 3)); g.setAttribute('uv', new T.BufferAttribute(U, 2));
      return { geo: g, h: t.y1 - t.y0 };
    });
  }

  /* ---------------- build prototypes ---------------- */
  function build() {
    M.bld = {};
    ['building-small-a', 'building-small-b', 'building-small-c', 'building-small-d', 'building-garage'].forEach(function (n) { M.bld[n] = flatGeo(n); });
    M.cityMap = firstMap('building-small-a');
    M.fountain = flatGeo('pavement-fountain');
    M.trees = [];
    ['grass-trees', 'grass-trees-tall'].forEach(function (n) {
      var parts = splitTrees(flatGeo(n));
      parts.forEach(function (p) { if (p.h > 0.2) M.trees.push(p); });
    });
    M.treeMap = firstMap('grass-trees');
    M.raceMap = firstMap('vehicle-truck-red');
    /* animation clips from the Soldier file, retargeted by bone name */
    M.clips = {};
    gl['Soldier'].animations.forEach(function (c) { M.clips[c.name] = c; });
  }

  /* =========================================================
     PEOPLE
     ========================================================= */
  var RPM_SHIRT = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#f97316', '#14b8a6', '#eab308', '#e5e7eb', '#06b6d4', '#84cc16', '#a855f7', '#ef4444', '#64748b'];
  var RPM_PANTS = ['#1f2937', '#374151', '#4b5563', '#78350f', '#1e3a8a', '#111827', '#6b7280', '#0f766e', '#44403c'];
  function pickc(a) { return a[Math.floor(Math.random() * a.length)]; }

  function retarget(clip, prefix, keepPos) {
    var tracks = [];
    clip.tracks.forEach(function (tr) {
      if (!keepPos && /\.(position|scale)$/.test(tr.name)) return;
      if (!keepPos && /^mixamorigHips\.quaternion$/.test(tr.name)) return;   /* rest orientation differs between rigs */
      var nt = tr.clone();
      nt.name = tr.name.replace(/^mixamorig/, prefix);
      tracks.push(nt);
    });
    return new T.AnimationClip(clip.name, clip.duration, tracks);
  }
  var clipCache = {};
  function clipsFor(skin) {
    if (clipCache[skin]) return clipCache[skin];
    var pre = skin === 'rpm' ? '' : 'mixamorig', keep = skin === 'soldier', o = {};
    o.idle = retarget(M.clips.Idle, pre, keep); o.walk = retarget(M.clips.Walk, pre, keep); o.run = retarget(M.clips.Run, pre, keep);
    return (clipCache[skin] = o);
  }

  function skinOf(kind, look) {
    if (kind === 'cop') return 'soldier';
    if (kind === 'civ' && look && look.female) return 'michelle';
    return 'rpm';
  }

  /* simple held items, built along +z */
  function box(w, h, d, x, y, z, col) {
    var g = new T.BoxGeometry(w, h, d); g.translate(x, y, z);
    var m = new T.Mesh(g, new T.MeshLambertMaterial({ color: col })); m.castShadow = true; return m;
  }
  function makeItem(name) {
    var g = new T.Group();
    if (name === 'pistol') { g.add(box(2.2, 3, 9, 0, 0, 5, 0x20242b)); g.add(box(2.4, 5, 2.6, 0, -3.5, 1.5, 0x2e333c)); }
    else if (name === 'smg') { g.add(box(2.6, 4, 16, 0, 0, 8, 0x1d2128)); g.add(box(2, 8, 2.4, 0, -5, 6, 0x2b3038)); g.add(box(2, 4, 8, 0, -1, 17, 0x111418)); }
    else if (name === 'shotgun') { g.add(box(2.6, 3.4, 12, 0, 0, 4, 0x6b4423)); g.add(box(1.8, 2, 22, 0, 1, 18, 0x23272e)); g.add(box(2.4, 3, 8, 0, -0.5, 14, 0x5a3719)); }
    else if (name === 'bat') { g.add(box(2.2, 2.2, 22, 0, 0, 10, 0xc8923f)); g.add(box(3.4, 3.4, 12, 0, 0, 22, 0xb07f30)); g.rotation.x = 0; }
    return g;
  }

  M.makePerson = function (kind, look) {
    var skin = skinOf(kind, look), src = skin === 'soldier' ? gl['Soldier'] : (skin === 'michelle' ? gl['Michelle'] : gl['readyplayer.me']);
    var model = T.SkeletonUtils.clone(src.scene);
    var wrap = new T.Group();
    wrap.add(model);
    var sc = SC_PERSON * (skin === 'michelle' ? 1.08 : (kind === 'civ' ? 0.94 + Math.random() * 0.1 : 1));
    wrap.scale.setScalar(sc);
    var root = new T.Group(); root.add(wrap);
    var v = { root: root, wrap: wrap, model: model, kind: kind, skin: skin, hat: null, item: null, itemName: '', w: { idle: 1, walk: 0, run: 0 }, pose: null, aimW: 0, rideW: 0 };

    model.traverse(function (o) {
      if (!o.isMesh) return;
      o.castShadow = true; o.frustumCulled = false;
      o.material = o.material.clone();
      var mt = o.material, nm = (mt.name || '') + '|' + o.name;
      if (skin === 'rpm') {
        if (/Outfit_Top/.test(nm)) { mt.map = null; mt.color.set(kind === 'gang' ? '#d11a1a' : (kind === 'player' ? '#232a35' : pickc(RPM_SHIRT))); mt.metalness = 0; mt.roughness = 0.8; }
        else if (/Outfit_Bottom/.test(nm)) { mt.map = null; mt.color.set(kind === 'gang' ? '#17171b' : (kind === 'player' ? '#3b4252' : pickc(RPM_PANTS))); mt.metalness = 0; mt.roughness = 0.85; }
        else if (/Footwear/.test(nm)) { mt.map = null; mt.color.set(kind === 'gang' ? '#f2f2f2' : '#1b1b1f'); }
        else if (/Headwear/.test(nm)) {
          v.hat = o;
          mt.map = null; mt.color.set(kind === 'gang' ? '#b01010' : (kind === 'player' ? '#232a35' : pickc(['#3a3a40', '#6b4a2b', '#2a4a7a', '#7a2a2a'])));
          if (kind === 'civ' && Math.random() < 0.45) o.visible = false;
        } else if (/Skin|Body/.test(nm)) {
          if (!v.tone) v.tone = 0.55 + Math.random() * 0.45;
          if (kind !== 'player') mt.color.setScalar(v.tone);
        }
      } else if (skin === 'soldier') {
        mt.color.setRGB(0.42, 0.62, 1.35);               /* police blue */
      }
    });

    /* skeleton + animation */
    var clips = clipsFor(skin);
    v.mixer = new T.AnimationMixer(model);
    v.act = { idle: v.mixer.clipAction(clips.idle), walk: v.mixer.clipAction(clips.walk), run: v.mixer.clipAction(clips.run) };
    for (var k in v.act) { v.act[k].play(); v.act[k].setEffectiveWeight(k === 'idle' ? 1 : 0); }
    v.mixer.update(Math.random() * 2);

    var pre = skin === 'rpm' ? '' : 'mixamorig';
    function B(n) { return model.getObjectByName(pre + n); }
    v.b = { rArm: B('RightArm'), rFore: B('RightForeArm'), rHand: B('RightHand'), lArm: B('LeftArm'), lFore: B('LeftForeArm'), lHand: B('LeftHand'),
      rUp: B('RightUpLeg'), rLeg: B('RightLeg'), rFoot: B('RightFoot'), lUp: B('LeftUpLeg'), lLeg: B('LeftLeg'), lFoot: B('LeftFoot'), hips: B('Hips'), spine: B('Spine') };
    root.updateMatrixWorld(true);
    var ra = new T.Vector3(), la = new T.Vector3();
    if (v.b.rArm && v.b.lArm) { v.b.rArm.getWorldPosition(ra); v.b.lArm.getWorldPosition(la); root.worldToLocal(ra); root.worldToLocal(la); v.rSide = ra.x >= la.x ? 1 : -1; } else v.rSide = 1;
    return v;
  };

  /* ---- pose overrides: point a bone chain at a direction (character space: +z forward, +y up, +x = side) ---- */
  var _a = new T.Vector3(), _b = new T.Vector3(), _d = new T.Vector3(), _q = new T.Quaternion(), _p = new T.Quaternion(), _id = new T.Quaternion(), _rq = new T.Quaternion();
  function point(bone, child, dx, dy, dz, w, rootQ) {
    if (!bone || !child || w <= 0.001) return;
    bone.updateWorldMatrix(true, false); child.updateWorldMatrix(true, false);
    bone.getWorldPosition(_a); child.getWorldPosition(_b); _b.sub(_a).normalize();
    _d.set(dx, dy, dz).normalize().applyQuaternion(rootQ);
    _q.setFromUnitVectors(_b, _d);
    if (w < 1) _q.slerp(_id, 1 - w);
    bone.parent.getWorldQuaternion(_p);
    bone.quaternion.premultiply(_p).premultiply(_q).premultiply(_p.invert());
    bone.updateWorldMatrix(false, true);
  }

  var _hp = new T.Vector3(), _fp = new T.Vector3(), _dir = new T.Vector3();
  /* pose: {aim:0..1, gun:name|null, punch:0..1, swing:-1|0..1, ride:'bike'|'cycle'|null, phase} */
  M.applyPose = function (v, o) {
    var b = v.b, side = v.rSide;
    v.root.updateMatrixWorld(true);
    v.root.getWorldQuaternion(_rq);
    var rq = _rq;
    if (o.ride) {
      var bike = o.ride === 'bike', ph = o.phase || 0;
      var tl = bike ? 0 : Math.sin(ph) * 0.5, tr = bike ? 0 : -Math.sin(ph) * 0.5;
      point(b.rUp, b.rLeg, side * 0.32, -0.42 + tr * 0.5, 0.85 + tr * 0.1, 1, rq); point(b.rLeg, b.rFoot, side * 0.14, -1, -0.18 + tr * 0.3, 1, rq);
      point(b.lUp, b.lLeg, -side * 0.32, -0.42 + tl * 0.5, 0.85 + tl * 0.1, 1, rq); point(b.lLeg, b.lFoot, -side * 0.14, -1, -0.18 + tl * 0.3, 1, rq);
      point(b.rArm, b.rFore, side * 0.55, -0.35, 0.65, 1, rq); point(b.rFore, b.rHand, side * 0.3, -0.3, 0.9, 1, rq);
      point(b.lArm, b.lFore, -side * 0.55, -0.35, 0.65, 1, rq); point(b.lFore, b.lHand, -side * 0.3, -0.3, 0.9, 1, rq);
    } else {
      var aim = o.aim || 0, pun = o.punch || 0, sw = o.swing;
      if (aim > 0.01) {
        var two = o.gun === 'smg' || o.gun === 'shotgun';
        point(b.rArm, b.rFore, -side * 0.12, 0.1, 1, aim, rq); point(b.rFore, b.rHand, -side * 0.1, 0.08, 1, aim, rq);
        if (two) { point(b.lArm, b.lFore, side * 0.42, 0.04, 1, aim, rq); point(b.lFore, b.lHand, side * 0.3, 0.06, 1, aim, rq); }
      } else if (pun > 0.01) {
        point(b.rArm, b.rFore, -side * 0.1, 0.05, 1, pun, rq); point(b.rFore, b.rHand, -side * 0.1, 0.05, 1, pun, rq);
      } else if (sw >= 0) {
        var s = sw, up = Math.sin(s * Math.PI);
        point(b.rArm, b.rFore, -side * (0.4 - s * 0.6), 0.9 - s * 1.2, 0.2 + s * 0.9, 1, rq); point(b.rFore, b.rHand, -side * (0.3 - s * 0.4), 0.7 - s * 1.0, 0.5 + s * 0.6, 1, rq);
        void up;
      }
    }
    /* held item follows the right hand */
    if (v.item && v.item.visible && b.rHand) {
      b.rHand.updateWorldMatrix(true, false);
      b.rHand.getWorldPosition(_hp); v.root.worldToLocal(_hp);
      if (b.rFore) { b.rFore.getWorldPosition(_fp); v.root.worldToLocal(_fp); _dir.copy(_hp).sub(_fp).normalize(); } else _dir.set(0, 0, 1);
      v.item.position.copy(_hp);
      v.item.quaternion.setFromUnitVectors(_id0, _dir);
    }
  };
  var _id0 = new T.Vector3(0, 0, 1);

  M.setItem = function (v, name) {
    if (v.itemName === name) return;
    if (v.item) { v.root.remove(v.item); v.item = null; }
    v.itemName = name;
    if (name && name !== 'fist') { v.item = makeItem(name); v.root.add(v.item); }
  };

  /* blend idle/walk/run from the real movement speed */
  M.animate = function (v, dt, speed) {
    var tgt = speed < 8 ? 'idle' : (speed < 100 ? 'walk' : 'run'), k;
    for (k in v.w) { var t = k === tgt ? 1 : 0; v.w[k] += (t - v.w[k]) * Math.min(1, dt * 9); v.act[k].setEffectiveWeight(v.w[k]); }
    v.act.walk.setEffectiveTimeScale(Math.max(0.5, speed / 46));
    v.act.run.setEffectiveTimeScale(Math.max(0.6, speed / 150));
    v.mixer.update(dt);
  };

  /* =========================================================
     VEHICLES
     ========================================================= */
  function labelTex(text, bg, fg) {
    var c = document.createElement('canvas'); c.width = 128; c.height = 48;
    var x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, 128, 48); x.fillStyle = fg; x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 64, 26);
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
  }

  var VSPEC = {
    sedan:  { model: 'vehicle-truck-green',  lo: 135, hi: 165, c: 150, ys: 1.0,  pal: 'race' },
    suv:    { model: 'vehicle-truck-red',    lo: -25, hi: 35,  c: 10,  ys: 1.0,  pal: 'race' },
    sports: { model: 'vehicle-truck-yellow', lo: 30,  hi: 62,  c: 41,  ys: 0.82, pal: 'race' },
    taxi:   { model: 'vehicle-truck-yellow', lo: 30,  hi: 62,  c: 41,  ys: 1.0,  pal: 'race', keep: true },
    van:    { model: 'vehicle-truck-purple', lo: 250, hi: 285, c: 266, ys: 1.18, pal: 'race' },
    police: { model: 'vehicle-truck-green',  lo: 135, hi: 165, c: 150, ys: 1.0,  pal: 'race', hue: 222 },
    bike:   { model: 'vehicle-motorcycle',   lo: 135, hi: 165, c: 150, ys: 1.0,  pal: 'race' }
  };

  function busBody(color) {
    var g = new T.Group();
    var L = 200, W = 54, H = 52;
    var c = document.createElement('canvas'); c.width = 512; c.height = 64;
    var x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 512, 64);
    x.fillStyle = '#7fb6e8'; for (var i = 0; i < 8; i++) x.fillRect(14 + i * 62, 12, 48, 26);
    x.fillStyle = 'rgba(255,255,255,0.9)'; x.fillRect(0, 46, 512, 6);
    var tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding;
    var side = new T.MeshLambertMaterial({ map: tex });
    var plain = new T.MeshLambertMaterial({ color: color });
    var body = new T.Mesh(new T.BoxGeometry(W, H, L), [plain, plain, plain, plain, plain, plain]);
    body.position.y = 12 + H / 2; body.castShadow = true; g.add(body);
    var sl = new T.Mesh(new T.PlaneGeometry(L, H), side); sl.rotation.y = Math.PI / 2; sl.position.set(W / 2 + 0.2, 12 + H / 2, 0); g.add(sl);
    var sr = sl.clone(); sr.rotation.y = -Math.PI / 2; sr.position.x = -W / 2 - 0.2; g.add(sr);
    var wind = new T.Mesh(new T.PlaneGeometry(W - 8, H * 0.5), new T.MeshLambertMaterial({ color: 0x8cc3ee })); wind.position.set(0, 12 + H * 0.62, L / 2 + 0.3); g.add(wind);
    var roof = box(W - 6, 2, L - 10, 0, 12 + H + 1, 0, 0xe8edf2); g.add(roof);
    var wheels = [];
    [[-1, 62], [1, 62], [-1, -60], [1, -60]].forEach(function (p, i) {
      var w = new T.Mesh(new T.CylinderGeometry(12, 12, 9, 14), new T.MeshLambertMaterial({ color: 0x1a1a1e })); w.rotation.z = Math.PI / 2;
      var h = new T.Group(); h.position.set(p[0] * (W / 2 - 3), 12, p[1]); h.add(w); h.rotation.order = 'YXZ'; g.add(h); wheels.push({ node: h, front: i < 2 });
    });
    return { group: g, wheels: wheels, top: 12 + H };
  }

  function bicycle(color) {
    var g = new T.Group(), mat = new T.MeshLambertMaterial({ color: color }), dark = new T.MeshLambertMaterial({ color: 0x1b1b1f });
    var wheels = [];
    [-15, 15].forEach(function (z, i) {
      var h = new T.Group(); h.position.set(0, 10, z);
      var tire = new T.Mesh(new T.TorusGeometry(9.5, 1.4, 6, 18), dark); tire.rotation.y = Math.PI / 2; h.add(tire);
      for (var s = 0; s < 4; s++) { var sp = new T.Mesh(new T.BoxGeometry(0.4, 19, 0.4), new T.MeshLambertMaterial({ color: 0xb8bcc4 })); sp.rotation.x = s * Math.PI / 4; h.add(sp); }
      h.rotation.order = 'YXZ'; g.add(h); wheels.push({ node: h, front: i === 1 });
    });
    function tube(x1, y1, z1, x2, y2, z2, r, m) {
      var d = new T.Vector3(x2 - x1, y2 - y1, z2 - z1), len = d.length();
      var t = new T.Mesh(new T.CylinderGeometry(r, r, len, 5), m || mat);
      t.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2); t.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), d.normalize()); t.castShadow = true; return t;
    }
    g.add(tube(0, 10, -15, 0, 20, -3, 1.1)); g.add(tube(0, 20, -3, 0, 10, 15, 1.1)); g.add(tube(0, 20, -3, 0, 25, -12, 1.1)); g.add(tube(0, 25, -12, 0, 10, -15, 1.1));
    g.add(tube(0, 20, -3, 0, 22, 12, 1.1)); g.add(tube(0, 22, 12, 0, 10, 15, 1.1));
    g.add(tube(-7, 24, 12, 7, 24, 12, 0.9, dark)); g.add(box(4, 1.4, 10, 0, 26, -12, 0x222226));
    return { group: g, wheels: wheels, top: 28 };
  }

  M.makeVehicle = function (veh) {
    var type = veh.type, T0 = veh.t, v = { root: new T.Group(), wheels: [], type: type, bar: null, beam: null, rider: null, top: 40 };
    if (type === 'bus') {
      var b = busBody(veh.color); v.root.add(b.group); v.wheels = b.wheels; v.top = b.top;
    } else if (type === 'cycle') {
      var bc = bicycle(veh.color); v.root.add(bc.group); v.wheels = bc.wheels; v.top = bc.top;
    } else {
      var sp = VSPEC[type], src = gl[sp.model].scene.clone(true);
      var base = firstMap(sp.model), hue = sp.hue !== undefined ? sp.hue : M.hexHue(veh.color), key = sp.model + '_' + (sp.keep ? 'k' : Math.round(hue / 12) * 12);
      var tex = sp.keep ? base : M.tint(base, key, sp.lo, sp.hi, Math.round(hue / 12) * 12, sp.c, 1.1);
      var mat = M.lambert(tex, key), len = type === 'bike' ? 1.65 : 2.8;
      var s = T0.len / len, yz = sp.ys;
      var wrap = new T.Group(); wrap.add(src); wrap.scale.set(s, s * yz, s);
      src.traverse(function (o) {
        if (!o.isMesh) return;
        o.material = mat; o.castShadow = true;
        if (/wheel/.test(o.name) || /wheel/.test(o.parent && o.parent.name || '')) { /* handled below */ }
      });
      src.traverse(function (o) {
        if (/^wheel/.test(o.name)) { o.rotation.order = 'YXZ'; v.wheels.push({ node: o, front: /front/.test(o.name) }); }
      });
      if (type === 'bike') {
        v.wheels = []; src.traverse(function (o) { if (/^wheel/.test(o.name)) { o.rotation.order = 'YXZ'; v.wheels.push({ node: o, front: /front/.test(o.name), noSteer: false }); } });
      }
      if (type === 'bike') src.position.z = 0.295;          /* centre the motorcycle model */
      v.root.add(wrap);
      var bb = new T.Box3().setFromObject(wrap); v.top = bb.max.y;
      if (type === 'taxi') {
        var sign = new T.Mesh(new T.BoxGeometry(14, 6, 24), new T.MeshLambertMaterial({ map: labelTex('TAXI', '#fff6c8', '#111') }));
        sign.position.set(0, v.top + 2, -4); v.root.add(sign);
      }
      if (type === 'police') {
        var bar = new T.Group(), mr = new T.MeshBasicMaterial({ color: 0xff2222 }), mb = new T.MeshBasicMaterial({ color: 0x2255ff });
        var l1 = new T.Mesh(new T.BoxGeometry(10, 4, 8), mr), l2 = new T.Mesh(new T.BoxGeometry(10, 4, 8), mb);
        l1.position.set(-6, 0, 0); l2.position.set(6, 0, 0); bar.add(l1); bar.add(l2); bar.position.set(0, v.top + 2, -2); v.root.add(bar); v.bar = { l1: l1, l2: l2, mr: mr, mb: mb };
      }
    }
    /* headlight beam on the ground, visible at night */
    var bm = new T.Mesh(new T.PlaneGeometry(70, 150), M.beamMat);
    bm.rotation.x = -Math.PI / 2; bm.position.set(0, 1.2, T0.len / 2 + 70); bm.visible = false; v.root.add(bm); v.beam = bm;
    return v;
  };

  /* soft additive glow textures */
  M.glowTex = (function () {
    var c = document.createElement('canvas'); c.width = c.height = 128;
    var x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 2, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    var t = new T.CanvasTexture(c); return t;
  })();
  M.beamMat = (function () {
    var c = document.createElement('canvas'); c.width = 64; c.height = 128;
    var x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,240,190,0)'); g.addColorStop(1, 'rgba(255,240,190,0.75)');
    x.fillStyle = g; x.beginPath(); x.moveTo(32, 128); x.lineTo(0, 0); x.lineTo(64, 0); x.closePath(); x.fill();
    var t = new T.CanvasTexture(c);
    return new T.MeshBasicMaterial({ map: t, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.6 });
  })();
})(window.G = window.G || {});
