/* Open City - builds the 3D city from the generated map (buildings, trees, lamps, sea, ground). Made by Ayushdev */
(function (G) {
  'use strict';
  var T = THREE, W = G.world, M = G.models, TAU = Math.PI * 2;
  var CH = 1080;                         /* merge chunk size (world units) for culling */
  var rnd = G.seeded(777);
  function rr(a, b) { return a + rnd() * (b - a); }
  function pk(a) { return a[Math.floor(rnd() * a.length)]; }

  G.buildCity = function (scene, renderer) {
    var out = { winMat: null, glow: null, sea: null, seaTex: null, foam: null }, batches = {};
    var _c = new T.Color();

    /* ---------- batching ---------- */
    function prep(g, m, col, keepUV) {
      g = g.index ? g.toNonIndexed() : g.clone();
      for (var k in g.attributes) if (k !== 'position' && k !== 'normal' && !(keepUV && k === 'uv')) g.deleteAttribute(k);
      if (m) g.applyMatrix4(m);
      if (col !== undefined) {
        _c.set(col);
        var n = g.attributes.position.count, c = new Float32Array(n * 3);
        for (var i = 0; i < n; i++) { c[i * 3] = _c.r; c[i * 3 + 1] = _c.g; c[i * 3 + 2] = _c.b; }
        g.setAttribute('color', new T.BufferAttribute(c, 3));
      }
      return g;
    }
    function add(matKey, mat, g, x, z) {
      var key = matKey + '@' + Math.floor(x / CH) + '_' + Math.floor(z / CH);
      var b = batches[key] || (batches[key] = { mat: mat, geoms: [], shadow: true });
      b.geoms.push(g);
    }
    function flush() {
      for (var k in batches) {
        var b = batches[k];
        var g = b.geoms.length === 1 ? b.geoms[0] : T.BufferGeometryUtils.mergeBufferGeometries(b.geoms, false);
        var m = new T.Mesh(g, b.mat); m.castShadow = true; m.receiveShadow = true; m.matrixAutoUpdate = false; m.updateMatrix();
        scene.add(m);
      }
      batches = {};
    }
    var VC = new T.MeshLambertMaterial({ vertexColors: true });
    var BULB = new T.MeshBasicMaterial({ color: 0xfff1b8 });
    function boxG(cx, cy, cz, sx, sy, sz, col, ry) {
      var m = new T.Matrix4().compose(new T.Vector3(cx, cy, cz), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), ry || 0), new T.Vector3(1, 1, 1));
      return prep(new T.BoxGeometry(sx, sy, sz), m, col);
    }
    function addVC(g, x, z) { add('vc', VC, g, x, z); }

    /* ---------- ground ---------- */
    var maxTex = Math.min(renderer.capabilities.maxTextureSize, 4096);
    var cv = G.paintGround(maxTex);
    var gtex = new T.CanvasTexture(cv);
    gtex.encoding = T.sRGBEncoding; gtex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    gtex.minFilter = T.LinearMipmapLinearFilter; gtex.generateMipmaps = true;
    var ground = new T.Mesh(new T.PlaneGeometry(W.WIDTH, W.SEA_Y), new T.MeshLambertMaterial({ map: gtex }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(W.WIDTH / 2, 0, W.SEA_Y / 2); ground.receiveShadow = true;
    scene.add(ground);

    var wild = new T.Mesh(new T.PlaneGeometry(40000, 40000), new T.MeshLambertMaterial({ color: 0x2f7a3e }));
    wild.rotation.x = -Math.PI / 2; wild.position.set(W.WIDTH / 2, -1.5, W.SEA_Y / 2 - 6000); scene.add(wild);

    /* ---------- sea ---------- */
    (function () {
      var c = document.createElement('canvas'); c.width = c.height = 256;
      var x = c.getContext('2d'); x.fillStyle = '#2da6d8'; x.fillRect(0, 0, 256, 256);
      for (var i = 0; i < 90; i++) {
        var px = Math.random() * 256, py = Math.random() * 256, w = 20 + Math.random() * 50;
        var gr = x.createLinearGradient(px, py, px + w, py); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = gr; x.fillRect(px, py, w, 2.5);
      }
      var t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(60, 40); t.encoding = T.sRGBEncoding; t.anisotropy = 4;
      out.seaTex = t;
      var sea = new T.Mesh(new T.PlaneGeometry(40000, 14000), new T.MeshPhongMaterial({ map: t, color: 0xbfe8ff, shininess: 90, specular: 0x99ccee }));
      sea.rotation.x = -Math.PI / 2; sea.position.set(W.WIDTH / 2, -2.5, W.SEA_Y + 7000); sea.receiveShadow = false;
      scene.add(sea); out.sea = sea;
      /* shoreline foam */
      var fc = document.createElement('canvas'); fc.width = 64; fc.height = 64;
      var fx = fc.getContext('2d'), fg = fx.createLinearGradient(0, 0, 0, 64); fg.addColorStop(0, 'rgba(255,255,255,0)'); fg.addColorStop(0.55, 'rgba(255,255,255,0.85)'); fg.addColorStop(1, 'rgba(255,255,255,0)');
      fx.fillStyle = fg; fx.fillRect(0, 0, 64, 64);
      var ft = new T.CanvasTexture(fc); ft.wrapS = T.RepeatWrapping; ft.repeat.set(40, 1);
      var foam = new T.Mesh(new T.PlaneGeometry(W.WIDTH + 4000, 40), new T.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false }));
      foam.rotation.x = -Math.PI / 2; foam.position.set(W.WIDTH / 2, -1.2, W.SEA_Y + 14); scene.add(foam); out.foam = foam;
    })();

    /* ---------- window texture for towers ---------- */
    var PW = 34, PH = 62, TILE = 8;
    (function () {
      var S = 256, cell = S / TILE, c = document.createElement('canvas'), e = document.createElement('canvas');
      c.width = c.height = e.width = e.height = S;
      var x = c.getContext('2d'), y = e.getContext('2d');
      x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S); y.fillStyle = '#000'; y.fillRect(0, 0, S, S);
      for (var r = 0; r < TILE; r++) for (var q = 0; q < TILE; q++) {
        var px = q * cell + cell * 0.2, py = r * cell + cell * 0.18, w = cell * 0.6, h = cell * 0.58;
        var gr = x.createLinearGradient(px, py, px, py + h); gr.addColorStop(0, '#7fa6c6'); gr.addColorStop(1, '#3d5a78');
        x.fillStyle = gr; x.fillRect(px, py, w, h);
        x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(px, py, w * 0.35, h * 0.25);
        x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(q * cell, r * cell + cell - 3, cell, 3);
        if (Math.random() < 0.42) { y.fillStyle = Math.random() < 0.7 ? '#ffd88a' : '#bfe3ff'; y.fillRect(px, py, w, h); }
      }
      var t = new T.CanvasTexture(c), et = new T.CanvasTexture(e);
      [t, et].forEach(function (k) { k.wrapS = k.wrapT = T.RepeatWrapping; k.anisotropy = 4; k.encoding = T.sRGBEncoding; });
      out.winMat = new T.MeshLambertMaterial({ map: t, vertexColors: true, emissive: 0xffffff, emissiveMap: et, emissiveIntensity: 0 });
    })();

    function wallGeo(x0, z0, x1, z1, y0, y1, col, uo, vo) {
      var P = [], N = [], U = [], C = [];
      _c.set(col);
      function quad(ax, az, bx, bz, nx, nz) {
        var len = Math.sqrt((bx - ax) * (bx - ax) + (bz - az) * (bz - az));
        var u1 = len / (PW * TILE), v0 = y0 / (PH * TILE), v1 = y1 / (PH * TILE);
        var pts = [[ax, y0, az, uo, v0 + vo], [bx, y0, bz, uo + u1, v0 + vo], [bx, y1, bz, uo + u1, v1 + vo], [ax, y0, az, uo, v0 + vo], [bx, y1, bz, uo + u1, v1 + vo], [ax, y1, az, uo, v1 + vo]];
        for (var i = 0; i < 6; i++) { P.push(pts[i][0], pts[i][1], pts[i][2]); N.push(nx, 0, nz); U.push(pts[i][3], pts[i][4]); C.push(_c.r, _c.g, _c.b); }
      }
      quad(x0, z1, x1, z1, 0, 1); quad(x1, z0, x0, z0, 0, -1); quad(x1, z1, x1, z0, 1, 0); quad(x0, z0, x0, z1, -1, 0);
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(N, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(U, 2)); g.setAttribute('color', new T.Float32BufferAttribute(C, 3));
      return g;
    }
    function roofGeo(x0, z0, x1, z1, y, col) {
      _c.set(col);
      var P = [x0, y, z0, x0, y, z1, x1, y, z1, x0, y, z0, x1, y, z1, x1, y, z0], N = [], C = [];
      for (var i = 0; i < 6; i++) { N.push(0, 1, 0); C.push(_c.r, _c.g, _c.b); }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(N, 3)); g.setAttribute('color', new T.Float32BufferAttribute(C, 3));
      return g;
    }

    /* ---------- buildings ---------- */
    var cityMap = M.cityMap, HUES = [0, 40, 80, 150, 200, 260, 300, 340], bMats = {};
    function cityMat(hue) {
      var key = 'city' + hue;
      if (!bMats[key]) bMats[key] = M.lambert(hue === 0 ? cityMap : M.tint(cityMap, key, 0, 360, hue, 0, 1), key);
      return { key: key, mat: bMats[key] };
    }
    var KMODEL = { shop: ['building-small-a', 'building-small-d', 'building-small-b', 'building-small-a'], apt: ['building-small-c', 'building-small-b', 'building-small-c'], house: ['building-small-a', 'building-small-d', 'building-small-b'], hut: ['building-garage'] };
    var KH = { 'building-small-a': 0.95, 'building-small-b': 1.63, 'building-small-c': 1.75, 'building-small-d': 1.0, 'building-garage': 0.55 };

    function kenneyBuilding(b, o) {
      var names = KMODEL[o.kind] || KMODEL.shop, name = pk(names), geo = M.bld[name];
      var cx = o.x + o.w / 2, cz = o.y + o.h / 2;
      var dT = cz - b.y0, dB = b.y0 + 400 - cz, dL = cx - b.x0, dR = b.x0 + 400 - cx, m = Math.min(dT, dB, dL, dR), ori;
      ori = m === dB ? 0 : (m === dR ? 1 : (m === dT ? 2 : 3));
      var rot = [0, Math.PI / 2, Math.PI, -Math.PI / 2][ori], odd = ori % 2 === 1;
      var sx = odd ? o.h : o.w, sz = odd ? o.w : o.h;
      var kH = o.kind === 'house' ? 1.9 : (o.kind === 'hut' ? 1.5 : 1.35);
      var hh = o.H * kH, sy = hh / KH[name];
      sy = Math.min(sy, (sx + sz) * 1.45);
      var mat4 = new T.Matrix4().compose(new T.Vector3(cx, 0, cz), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), rot), new T.Vector3(sx, sy, sz));
      var hue = pk(HUES), cm = cityMat(hue);
      add(cm.key, cm.mat, prep(geo, mat4, undefined, true), cx, cz);
    }

    function tower(b, o) {
      var Hr = o.H * 3.0, x0 = o.x, z0 = o.y, x1 = o.x + o.w, z1 = o.y + o.h, uo = Math.floor(rnd() * 8) / 8, vo = Math.floor(rnd() * 8) / 8;
      var wall = new T.Color(o.wall).lerp(new T.Color(0xffffff), 0.28).getStyle();
      if (o.win === false) {
        addVC(boxG((x0 + x1) / 2, Hr / 2, (z0 + z1) / 2, o.w, Hr, o.h, o.wall), x0, z0);
        addVC(boxG((x0 + x1) / 2, Hr + 3, (z0 + z1) / 2, o.w + 5, 6, o.h + 5, 0xf8fafc), x0, z0); return;
      }
      var steps = o.tier ? 2 : 1, top = Hr, ins = 0;
      add('tw', out.winMat, wallGeo(x0, z0, x1, z1, 0, top, wall, uo, vo), x0, z0);
      addVC(roofGeo(x0, z0, x1, z1, top, o.roof), x0, z0);
      addVC(boxG((x0 + x1) / 2, top + 4, (z0 + z1) / 2, o.w + 6, 8, o.h + 6, 0xaab1bb), x0, z0);       /* cornice */
      if (steps === 2) {
        ins = Math.min(o.w, o.h) * 0.2;
        var t0 = top, t1 = top + Hr * 0.22;
        add('tw', out.winMat, wallGeo(x0 + ins, z0 + ins, x1 - ins, z1 - ins, t0, t1, wall, uo, vo + 0.3), x0, z0);
        addVC(roofGeo(x0 + ins, z0 + ins, x1 - ins, z1 - ins, t1, o.roof), x0, z0);
        top = t1;
      }
      /* roof details: AC units + antenna */
      var cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      addVC(boxG(cx - o.w * 0.22, top + 9, cz + o.h * 0.15, o.w * 0.2, 18, o.h * 0.14, 0x8a929e), x0, z0);
      addVC(boxG(cx + o.w * 0.2, top + 7, cz - o.h * 0.18, o.w * 0.14, 14, o.h * 0.14, 0x9aa1ab), x0, z0);
      if (Hr > 700) {
        addVC(boxG(cx, top + 45, cz, 3, 90, 3, 0xaaaaaa), x0, z0);
        add('bulb', BULB, boxG(cx, top + 92, cz, 7, 7, 7, 0xff3030), x0, z0);
        out.redLights.push(cx, top + 94, cz);
      }
    }

    out.redLights = [];

    /* ---------- trees ---------- */
    var treeHues = { pine: [100, 135, 160, 120], blossom: [330, 345, 315], autumn: [25, 40, 55, 12], purple: [275, 290, 260] };
    function kenneyTree(t, x, z, sc) {
      var p = M.trees[Math.floor(rnd() * M.trees.length)], hues = treeHues[t.kind] || treeHues.pine, hue = pk(hues);
      var key = 'tree' + hue, tex = M.tint(M.treeMap, key, 90, 200, hue, 143, 1.05), mat = M.lambert(tex, key);
      var h = (t.h * 1.9) * sc, s = h / p.h;
      var mat4 = new T.Matrix4().compose(new T.Vector3(x, 0, z), new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), rnd() * TAU), new T.Vector3(s, s * rr(0.92, 1.12), s));
      add(key, mat, prep(p.geo, mat4, undefined, true), x, z);
    }
    var ico = new T.IcosahedronGeometry(1, 1), cyl = new T.CylinderGeometry(1, 1, 1, 6);
    function roundTree(t, x, z) {
      var h = t.h * 1.7, R = t.r * 1.45;
      var trunk = prep(cyl, new T.Matrix4().compose(new T.Vector3(x, h * 0.3, z), new T.Quaternion(), new T.Vector3(t.trunk * 1.3, h * 0.6, t.trunk * 1.3)), 0x7a5230);
      addVC(trunk, x, z);
      var cols = [t.c1, t.c2, t.c3];
      for (var i = 0; i < 4; i++) {
        var a = i * 1.7 + t.seed, rr2 = R * (i === 0 ? 0.8 : 0.55), px = x + (i ? Math.cos(a) * R * 0.5 : 0), pz = z + (i ? Math.sin(a) * R * 0.5 : 0), py = h * 0.75 + (i ? R * 0.15 * (i % 2) : R * 0.35);
        addVC(prep(ico, new T.Matrix4().compose(new T.Vector3(px, py, pz), new T.Quaternion(), new T.Vector3(rr2, rr2 * 0.85, rr2)), cols[i % 3]), x, z);
      }
    }
    function palm(t, x, z) {
      var h = t.h * 1.8, lean = rr(-0.3, 0.3), segs = 5, px = x, py = 0, pz = z;
      for (var i = 0; i < segs; i++) {
        var seg = h / segs, nx = px + lean * seg * 0.35, nz = pz + lean * seg * 0.15, ny = py + seg;
        var r0 = t.trunk * (1.5 - i * 0.12);
        addVC(prep(cyl, new T.Matrix4().compose(new T.Vector3((px + nx) / 2, (py + ny) / 2, (pz + nz) / 2), new T.Quaternion(), new T.Vector3(r0, seg * 1.02, r0)), i % 2 ? 0x8a6a42 : 0x9b7a4e), x, z);
        px = nx; py = ny; pz = nz;
      }
      for (var f = 0; f < 9; f++) {
        var an = f * TAU / 9 + t.seed, L = t.r * 2.0;
        var q = new T.Quaternion().setFromEuler(new T.Euler(0.55, -an, 0, 'YXZ'));
        var g = new T.BoxGeometry(L * 0.28, 1.4, L); g.translate(0, 0, L / 2);
        addVC(prep(g, new T.Matrix4().compose(new T.Vector3(px, py, pz), q, new T.Vector3(1, 1, 1)), f % 2 ? t.c1 : t.c3), x, z);
      }
      addVC(prep(ico, new T.Matrix4().compose(new T.Vector3(px, py - 2, pz), new T.Quaternion(), new T.Vector3(5, 5, 5)), 0x6b4423), x, z);
    }

    function placeTree(t) {
      if (t.kind === 'palm') palm(t, t.x, t.y);
      else if ((t.kind === 'round' || t.kind === 'lime') && rnd() < 0.7) roundTree(t, t.x, t.y);
      else kenneyTree(t, t.x, t.y, 1);
    }

    /* ---------- lamps, benches, fences, umbrellas, fountains ---------- */
    var lampPts = [];
    function lamp(l) {
      var x = l.x, z = l.y, h = 118;
      addVC(prep(cyl, new T.Matrix4().compose(new T.Vector3(x, h / 2, z), new T.Quaternion(), new T.Vector3(1.8, h, 1.8)), 0x3b3f48), x, z);
      addVC(boxG(x, h + 2, z, 14, 2.4, 3, 0x3b3f48, 0), x, z);
      add('bulb', BULB, boxG(x + 5, h - 1.5, z, 7, 3, 5, 0xfff1b8), x, z);
      lampPts.push(x + 5, h - 2, z);
    }
    function decorate(b) {
      b.decor.forEach(function (d) {
        if (d.t === 'fence') {
          var th = 1.6, hh = 10, x0 = d.x, z0 = d.y, x1 = d.x + d.w, z1 = d.y + d.h, c = 0xf6f2e8;
          addVC(boxG((x0 + x1) / 2, hh / 2, z0, d.w, hh, th, c), x0, z0); addVC(boxG((x0 + x1) / 2, hh / 2, z1, d.w, hh, th, c), x0, z0);
          addVC(boxG(x0, hh / 2, (z0 + z1) / 2, th, hh, d.h, c), x0, z0); addVC(boxG(x1, hh / 2, (z0 + z1) / 2, th, hh, d.h, c), x0, z0);
        } else if (d.t === 'bench') {
          var ry = -d.a;
          addVC(boxG(d.x, 8, d.y, 30, 3, 9, 0x8a5a2b, ry), d.x, d.y);
          var bx = Math.sin(ry) * 0, bz = -4.5;
          addVC(boxG(d.x + Math.sin(ry) * bz * -1 * 0 + (-Math.sin(ry)) * 0, 14, d.y, 30, 9, 2, 0x6e4620, ry), d.x, d.y);
          void bx;
        } else if (d.t === 'umbrella') {
          addVC(prep(cyl, new T.Matrix4().compose(new T.Vector3(d.x, 22, d.y), new T.Quaternion(), new T.Vector3(1.2, 44, 1.2)), 0xeeeeee), d.x, d.y);
          var cone = new T.ConeGeometry(26, 14, 8);
          addVC(prep(cone, new T.Matrix4().compose(new T.Vector3(d.x, 47, d.y), new T.Quaternion(), new T.Vector3(1, 1, 1)), d.c), d.x, d.y);
        } else if (d.t === 'net') {
          addVC(boxG(d.x, 20, d.y, 3, 40, 3, 0x555555), d.x, d.y); addVC(boxG(d.x + d.w, 20, d.y, 3, 40, 3, 0x555555), d.x, d.y);
          addVC(boxG(d.x + d.w / 2, 32, d.y, d.w, 14, 0.8, 0xffffff), d.x, d.y);
        } else if (d.t === 'fountain') {
          var s = d.r * 2.15, mat4 = new T.Matrix4().compose(new T.Vector3(d.x, 0.5, d.y), new T.Quaternion(), new T.Vector3(s, s * 0.9, s));
          var cm = cityMat(0); add(cm.key, cm.mat, prep(M.fountain, mat4, undefined, true), d.x, d.y);
        }
      });
    }

    W.blocks.forEach(function (b) {
      b.bld.forEach(function (o) {
        if (o.kind === 'tower') tower(b, o); else kenneyBuilding(b, o);
      });
      b.trees.forEach(placeTree);
      b.lamps.forEach(lamp);
      decorate(b);
    });

    /* wild forest around the map */
    for (var i = 0; i < 520; i++) {
      var side = Math.floor(rnd() * 4), x, z, m = 1100;
      if (side === 0) { x = rr(-m, W.WIDTH + m); z = rr(-m, -90); }
      else if (side === 1) { x = rr(-m, -90); z = rr(-m, W.SEA_Y); }
      else if (side === 2) { x = rr(W.WIDTH + 90, W.WIDTH + m); z = rr(-m, W.SEA_Y); }
      else { x = rr(-m, W.WIDTH + m); z = rr(-m, -90); }
      kenneyTree({ kind: pk(['pine', 'pine', 'pine', 'autumn', 'blossom']), h: rr(80, 120) }, x, z, 1.3);
    }
    flush();

    /* ---------- lamp glow + red tower beacons ---------- */
    var gp = new Float32Array(lampPts);
    var gg = new T.BufferGeometry(); gg.setAttribute('position', new T.BufferAttribute(gp, 3));
    out.glow = new T.Points(gg, new T.PointsMaterial({ size: 120, map: M.glowTex, color: 0xffe3a0, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true }));
    out.glow.frustumCulled = false; scene.add(out.glow);
    var rg = new T.BufferGeometry(); rg.setAttribute('position', new T.BufferAttribute(new Float32Array(out.redLights), 3));
    out.beacons = new T.Points(rg, new T.PointsMaterial({ size: 60, map: M.glowTex, color: 0xff3030, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
    out.beacons.frustumCulled = false; scene.add(out.beacons);

    out.update = function (night, t) {
      out.winMat.emissiveIntensity = night * 1.15;
      out.glow.material.opacity = night * 0.85;
      out.beacons.material.opacity = night * (0.5 + 0.5 * Math.sin(t * 3));
      out.seaTex.offset.x = t * 0.004; out.seaTex.offset.y = t * 0.0025;
      out.foam.material.map.offset.x = t * 0.01; out.foam.position.z = W.SEA_Y + 14 + Math.sin(t * 0.9) * 8;
    };
    return out;
  };
})(window.G = window.G || {});
