/* Open City - paints the whole city ground (roads, lanes, crosswalks, lots, parks, beach) into one texture. Made by Ayushdev */
(function (G) {
  'use strict';
  var W = G.world, TAU = Math.PI * 2;
  var CELL = W.CELL, ROAD = W.ROAD, SW = W.SW, BS = W.BS, N = W.N;

  function decor(ctx, b) {
    var D = b.decor;
    for (var i = 0; i < D.length; i++) {
      var d = D[i];
      switch (d.t) {
        case 'rect': ctx.fillStyle = d.c; ctx.fillRect(d.x, d.y, d.w, d.h); break;
        case 'grid':
          ctx.strokeStyle = d.c; ctx.lineWidth = 1; ctx.beginPath();
          for (var gx = d.x; gx <= d.x + d.w; gx += 26) { ctx.moveTo(gx, d.y); ctx.lineTo(gx, d.y + d.h); }
          for (var gy = d.y; gy <= d.y + d.h; gy += 26) { ctx.moveTo(d.x, gy); ctx.lineTo(d.x + d.w, gy); }
          ctx.stroke(); break;
        case 'lines':
          ctx.strokeStyle = 'rgba(255,255,255,0.65)'; ctx.lineWidth = 2; ctx.beginPath();
          for (var ly = d.y + 54; ly < d.y + d.h; ly += 54) { ctx.moveTo(d.x + 6, ly - 27); ctx.lineTo(d.x + d.w - 6, ly - 27); }
          ctx.stroke(); break;
        case 'pool':
          ctx.fillStyle = '#e5e7eb'; ctx.fillRect(d.x - 4, d.y - 4, d.w + 8, d.h + 8);
          ctx.fillStyle = '#38bdf8'; ctx.fillRect(d.x, d.y, d.w, d.h);
          ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fillRect(d.x + 3, d.y + 3, d.w - 6, 4); break;
        case 'flower':
          ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc(d.x, d.y, 2.6, 0, TAU); ctx.fill();
          ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(d.x, d.y, 1, 0, TAU); ctx.fill(); break;
        case 'pond':
          ctx.fillStyle = '#b9a77a'; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.rx + 5, d.ry + 5, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#2fa9d8'; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.rx, d.ry, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(d.x - 14, d.y - 10, d.rx * 0.4, d.ry * 0.2, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = '#3f9d4e'; ctx.beginPath(); ctx.arc(d.x + 30, d.y + 12, 6, 0, TAU); ctx.arc(d.x - 40, d.y + 4, 5, 0, TAU); ctx.fill(); break;
        case 'towel': ctx.fillStyle = d.c; ctx.fillRect(d.x, d.y, 14, 30); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(d.x + 4, d.y, 2, 30); break;
        case 'net': ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.w, d.y); ctx.stroke(); break;
        case 'fountain': ctx.fillStyle = '#9fa6b0'; ctx.beginPath(); ctx.arc(d.x, d.y, d.r + 6, 0, TAU); ctx.fill(); break;
      }
    }
  }

  function marks(ctx) {
    var i, j, c;
    ctx.fillStyle = '#e8c547';
    for (j = 0; j < N; j++) {
      c = j * CELL + ROAD / 2;
      for (i = 0; i < N; i++) {
        var xa = i * CELL + ROAD + 44, xb = (i + 1) * CELL - 44;
        ctx.fillRect(xa, c - 3.5, xb - xa, 2); ctx.fillRect(xa, c + 1.5, xb - xa, 2);
      }
    }
    for (i = 0; i < N; i++) {
      c = i * CELL + ROAD / 2;
      for (j = 0; j < 7; j++) {
        var ya = j * CELL + ROAD + 44, yb = (j + 1) * CELL - 44;
        ctx.fillRect(c - 3.5, ya, 2, yb - ya); ctx.fillRect(c + 1.5, ya, 2, yb - ya);
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    for (j = 0; j < N; j++) {
      var cy = j * CELL;
      for (i = 0; i < N; i++) {
        var x0 = i * CELL, xs = [x0 + ROAD + 8, x0 + CELL - 38], q, yy, xx;
        for (q = 0; q < 2; q++) for (yy = cy + 10; yy < cy + ROAD - 8; yy += 12) ctx.fillRect(xs[q], yy, 30, 6);
        if (j < 7) {
          var ys = [cy + ROAD + 8, cy + CELL - 38];
          for (q = 0; q < 2; q++) for (xx = x0 + 10; xx < x0 + ROAD - 8; xx += 12) ctx.fillRect(xx, ys[q], 6, 30);
        }
      }
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (j = 0; j < N; j++) { ctx.fillRect(0, j * CELL + 4, W.WIDTH, 2); ctx.fillRect(0, j * CELL + ROAD - 6, W.WIDTH, 2); }
    for (i = 0; i < N; i++) { ctx.fillRect(i * CELL + 4, 0, 2, W.SAND_Y); ctx.fillRect(i * CELL + ROAD - 6, 0, 2, W.SAND_Y); }
  }

  /* returns a canvas covering x:[0,WIDTH] z:[0,SEA_Y] */
  G.paintGround = function (maxTex) {
    var sc = Math.min(0.72, maxTex / W.WIDTH, maxTex / W.SEA_Y);
    var cv = document.createElement('canvas');
    cv.width = Math.ceil(W.WIDTH * sc); cv.height = Math.ceil(W.SEA_Y * sc);
    var ctx = cv.getContext('2d');
    ctx.scale(sc, sc);
    ctx.fillStyle = '#383b43'; ctx.fillRect(0, 0, W.WIDTH, W.SAND_Y);
    ctx.fillStyle = '#f0dfaa'; ctx.fillRect(0, W.SAND_Y, W.WIDTH, W.SEA_Y - W.SAND_Y);
    ctx.fillStyle = '#e3cf92'; ctx.fillRect(0, W.SEA_Y - 18, W.WIDTH, 18);
    ctx.fillStyle = '#cdb77c'; ctx.fillRect(0, W.SEA_Y - 5, W.WIDTH, 5);
    marks(ctx);
    for (var k = 0; k < W.blocks.length; k++) {
      var b = W.blocks[k];
      if (b.type !== 'beach') {
        ctx.fillStyle = '#cfcabf'; ctx.fillRect(b.x0, b.y0, BS, BS);
        ctx.fillStyle = '#9d988c'; ctx.fillRect(b.x0, b.y0, BS, 2); ctx.fillRect(b.x0, b.y0 + BS - 2, BS, 2); ctx.fillRect(b.x0, b.y0, 2, BS); ctx.fillRect(b.x0 + BS - 2, b.y0, 2, BS);
        ctx.fillStyle = b.ground; ctx.fillRect(b.x0 + SW, b.y0 + SW, BS - 2 * SW, BS - 2 * SW);
      }
      decor(ctx, b);
    }
    return cv;
  };
})(window.G = window.G || {});
