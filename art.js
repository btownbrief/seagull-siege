/* Seagull Siege — art. Every sprite lives in the ASSETS map with a code-drawn fallback.
   To use painted art later: set `src: 'assets/<key>.png'` on an entry (see IMAGE-PROMPTS.md).
   If the PNG loads it replaces the code-drawn version automatically. */
(function () {
  'use strict';

  const PAL = {
    plum: '#2b1442', outline: '#3a1d52', cream: '#fff4d6', sun: '#ffb347', coral: '#ff6b5e',
    white: '#ffffff', wing: '#d6deec', wing2: '#a9b7cf', tip: '#2a2f45', beak: '#ffb62e', red: '#e5483f',
    fry1: '#ffe27a', fry2: '#f5b82e', fry3: '#c98512',
  };

  // ---------- helpers ----------
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); }
  function ell(ctx, x, y, rx, ry, rot) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); }
  function poly(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function fillStroke(ctx, fill, lw) { ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = lw; ctx.strokeStyle = PAL.outline; ctx.stroke(); }
  function srand(seed) { let s = seed * 9301 + 49297; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

  // ---------- gull ----------
  // Drawn facing DOWN (+y) so a formation gull looks at the player. frame 0..2 = wings up / mid / down.
  const GULLS = {
    gull:    { sc: 0.78, box: [58, 50], span: 25, body: '#ffffff', head: '#ffffff', wing: '#d9e2ef', tip: '#2a2f45', beak: '#ffb62e', spot: '#e5483f', tail: 'fan' },
    herring: { sc: 0.98, box: [58, 50], span: 25, body: '#f4f6fa', head: '#f4f6fa', wing: '#8d9cb4', tip: '#222a3d', beak: '#ffd23a', spot: '#e5483f', tail: 'fan', brow: 2.2, ring: true },
    ruffled: { sc: 0.98, box: [58, 50], span: 25, body: '#e9edf4', head: '#e9edf4', wing: '#7b8aa3', tip: '#222a3d', beak: '#ffd23a', spot: '#e5483f', tail: 'fan', brow: 2.6, ring: true, ruffle: true },
    tern:    { sc: 0.8, box: [64, 54], span: 30, body: '#ffffff', head: '#232a3c', wing: '#cfd9e8', tip: '#3a4560', beak: '#ff6a3a', spot: null, tail: 'fork', slim: true, cap: true },
    boss:    { sc: 1.95, box: [58, 50], span: 25, body: '#f6f8fc', head: '#f6f8fc', wing: '#8d9cb4', tip: '#222a3d', beak: '#ffd23a', spot: '#e5483f', tail: 'fan', brow: 2.6, ring: true, hat: true },
  };

  function drawGull(ctx, kind, f, dazed) {
    const o = GULLS[kind];
    ctx.save();
    ctx.scale(o.sc, o.sc);
    const lw = 1.5 / o.sc * (kind === 'boss' ? 1.1 : 1);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const span = o.span * [0.8, 1, 0.82][f] * (dazed ? 0.9 : 1);
    const tipY = dazed ? -12 : [7, -2, -10][f];
    const bw = o.slim ? 5.4 : 7.6, bh = o.slim ? 11 : 12.5;

    // tail
    if (o.tail === 'fork') {
      poly(ctx, [[-4, -8], [4, -8], [8, -24], [1.2, -17], [-1.2, -17], [-8, -24]]); fillStroke(ctx, '#e9eef6', lw);
      poly(ctx, [[-3, -12], [3, -12], [4, -17], [-4, -17]]); ctx.fillStyle = o.tip; ctx.fill();
    } else {
      poly(ctx, [[-4.8, -9], [4.8, -9], [6.5, -19], [3, -22], [-3, -22], [-6.5, -19]]); fillStroke(ctx, '#e5ebf4', lw);
      poly(ctx, [[-5.4, -14.5], [5.4, -14.5], [6, -18], [-6, -18]]); ctx.fillStyle = o.tip; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
    }
    // wings (right then mirrored)
    for (let side = -1; side <= 1; side += 2) {
      ctx.save(); ctx.scale(side, 1);
      ctx.beginPath();
      ctx.moveTo(4, 6);
      ctx.bezierCurveTo(4 + span * 0.45, 7 + tipY * 0.35, span * 0.88, tipY + 5, span, tipY);
      ctx.bezierCurveTo(span * 0.82, tipY - 8, span * 0.5, -8, 5, -10);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, span, 0);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, o.wing); g.addColorStop(1, o.wing);
      fillStroke(ctx, g, lw);
      // feather lines
      ctx.strokeStyle = 'rgba(40,50,80,.28)'; ctx.lineWidth = lw * 0.7;
      ctx.beginPath(); ctx.moveTo(9, -1); ctx.lineTo(span * 0.82, tipY - 2); ctx.moveTo(9, -5); ctx.lineTo(span * 0.7, tipY - 6); ctx.stroke();
      // dark wingtip
      ctx.beginPath();
      ctx.moveTo(span * 0.74, tipY + 2.4); ctx.lineTo(span, tipY); ctx.lineTo(span * 0.8, tipY - 8.4); ctx.quadraticCurveTo(span * 0.72, tipY - 4, span * 0.74, tipY + 2.4);
      ctx.closePath(); ctx.fillStyle = o.tip; ctx.fill();
      ctx.fillStyle = '#fff'; circle(ctx, span * 0.84, tipY - 2.8, 1.1); ctx.fill();
      ctx.restore();
    }
    // body
    ell(ctx, 0, 0, bw, bh);
    const bg = ctx.createLinearGradient(-bw, 0, bw, 0);
    bg.addColorStop(0, '#dfe6f1'); bg.addColorStop(0.45, o.body); bg.addColorStop(1, '#cfd8e6');
    fillStroke(ctx, bg, lw);
    // head
    circle(ctx, 0, 10.5, o.slim ? 5.2 : 6.2); fillStroke(ctx, o.head, lw);
    if (o.cap) { // tern: black cap, white cheek
      ctx.beginPath(); ctx.arc(0, 10.5, 5.2, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(0, 10.5); ctx.closePath(); ctx.fillStyle = o.head; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 10.5, 5.2, 0.2, Math.PI - 0.2); ctx.closePath(); ctx.fillStyle = '#ffffff'; ctx.fill();
      circle(ctx, 0, 10.5, 5.2); ctx.lineWidth = lw; ctx.strokeStyle = PAL.outline; ctx.stroke();
    }
    // beak
    const bl = o.slim ? 8.4 : 6.8;
    poly(ctx, [[-2.5, 14.6], [2.5, 14.6], [0, 14.6 + bl]]); fillStroke(ctx, o.beak, lw * 0.9);
    if (dazed) { ell(ctx, 0, 17, 1.4, 1.9); ctx.fillStyle = '#7a1b2a'; ctx.fill(); }
    if (o.spot) { circle(ctx, 1.4, 14.6 + bl - 1.6, 1.15); ctx.fillStyle = o.spot; ctx.fill(); }
    // eyes
    const ey = 11.4;
    for (let side = -1; side <= 1; side += 2) {
      const ex = side * 2.7;
      if (dazed) {
        ctx.strokeStyle = PAL.plum; ctx.lineWidth = lw * 0.95;
        ctx.beginPath(); ctx.moveTo(ex - 1.5, ey - 1.5); ctx.lineTo(ex + 1.5, ey + 1.5); ctx.moveTo(ex + 1.5, ey - 1.5); ctx.lineTo(ex - 1.5, ey + 1.5); ctx.stroke();
      } else {
        if (o.ring) { circle(ctx, ex, ey, 2.2); ctx.fillStyle = '#ffe14a'; ctx.fill(); }
        circle(ctx, ex, ey, o.ring ? 1.5 : 1.7); ctx.fillStyle = PAL.plum; ctx.fill();
        circle(ctx, ex - 0.4, ey - 0.5, 0.5); ctx.fillStyle = '#fff'; ctx.fill();
      }
    }
    if (!dazed) { // angry brows
      const bwid = o.brow || 1.5;
      ctx.strokeStyle = PAL.plum; ctx.lineWidth = bwid * 0.55; ctx.beginPath();
      ctx.moveTo(-5.3, ey - 3.3); ctx.lineTo(-1.2, ey - 1.6); ctx.moveTo(5.3, ey - 3.3); ctx.lineTo(1.2, ey - 1.6); ctx.stroke();
    }
    if (o.ruffle) { // head tufts
      ctx.fillStyle = o.head; ctx.strokeStyle = PAL.outline; ctx.lineWidth = lw;
      [[-3, 5.5, -1, 1.2], [0, 4.6, 0, -4], [3, 5.5, 1, 1.2]].forEach(a => {
        ctx.beginPath(); ctx.moveTo(a[0] - 1.8, 6.4); ctx.lineTo(a[0] + a[2] * 1.5, 1.4 + a[3]); ctx.lineTo(a[0] + 1.8, 6.4); ctx.closePath(); ctx.fill(); ctx.stroke();
      });
    }
    if (o.hat) { // little captain's tricorn + scarf
      ctx.beginPath(); ctx.moveTo(-8, 3.6); ctx.quadraticCurveTo(0, 9.4, 8, 3.6); ctx.lineWidth = 2.1; ctx.strokeStyle = '#e5483f'; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-9.2, 7.2); ctx.quadraticCurveTo(0, -3, 9.2, 7.2); ctx.quadraticCurveTo(0, 2.8, -9.2, 7.2);
      fillStroke(ctx, '#2b2f66', lw);
      ctx.beginPath(); ctx.moveTo(-6.2, 5.8); ctx.quadraticCurveTo(0, 1.4, 6.2, 5.8); ctx.strokeStyle = '#ffd23a'; ctx.lineWidth = 0.9; ctx.stroke();
      circle(ctx, 0, 3.4, 0.95); ctx.fillStyle = '#ffd23a'; ctx.fill();
    }
    ctx.restore();
  }

  // ---------- kid with water blaster (seen from behind, aiming up) ----------
  function drawKid(ctx, dbl) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const lw = 1.5;
    // nozzles (behind hat)
    const nozzle = (x) => {
      ctx.strokeStyle = PAL.outline; ctx.lineWidth = 6.8; ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x, -37); ctx.stroke();
      ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 4.4; ctx.beginPath(); ctx.moveTo(x, -10); ctx.lineTo(x, -36); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x - 1.2, -14); ctx.lineTo(x - 1.2, -34); ctx.stroke();
      rr(ctx, x - 3, -41, 6, 6, 2); fillStroke(ctx, '#ff5a4a', lw);
    };
    // legs + sandals
    [-5, 5].forEach(x => { rr(ctx, x - 2.6, 14, 5.2, 11, 2); fillStroke(ctx, '#f0be94', lw); ell(ctx, x, 26.2, 4.6, 2.8); fillStroke(ctx, '#2f8fd6', lw); });
    // shorts
    rr(ctx, -10.5, 7, 21, 11, 4); fillStroke(ctx, '#3d6fc4', lw);
    // tee
    rr(ctx, -11.5, -9, 23, 20, 7); fillStroke(ctx, '#ff8a2b', lw);
    // arms reaching forward/up (seen from behind)
    [-1, 1].forEach(s => { ctx.strokeStyle = PAL.outline; ctx.lineWidth = 6.2; ctx.beginPath(); ctx.moveTo(s * 10.5, -4); ctx.lineTo(s * (dbl ? 11 : 8), -14); ctx.stroke(); ctx.strokeStyle = '#f0be94'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(s * 10.5, -4); ctx.lineTo(s * (dbl ? 11 : 8), -14); ctx.stroke(); });
    // nozzles drawn after arms, before head/hat
    if (dbl) { nozzle(-11); nozzle(11); } else nozzle(0);
    // water tank backpack
    rr(ctx, -7.6, -6, 15.2, 16, 5); fillStroke(ctx, 'rgba(160,228,255,.95)', lw);
    rr(ctx, -6.2, 1.4, 12.4, 7.2, 3); ctx.fillStyle = '#3aa6ea'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-4.6, -3); ctx.lineTo(-4.6, 3); ctx.stroke();
    rr(ctx, -2.6, -8.6, 5.2, 3.2, 1.2); fillStroke(ctx, '#ffd23f', lw * 0.8);
    // back print: little maple leaf
    poly(ctx, [[0, 11.6], [-1.8, 9.6], [-1, 8.4], [-2.2, 7.4], [0, 6.6], [2.2, 7.4], [1, 8.4], [1.8, 9.6]]); ctx.fillStyle = '#c93a2b'; ctx.globalAlpha = 0; ctx.fill(); ctx.globalAlpha = 1;
    // head (back of head, brown hair)
    circle(ctx, 0, -15, 8.2); fillStroke(ctx, '#7a4a2a', lw);
    // hat
    ell(ctx, 0, -19, 17.5, 6.2); fillStroke(ctx, '#f2cd70', lw);
    ctx.strokeStyle = 'rgba(160,110,30,.5)'; ctx.lineWidth = 0.8;
    for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 4.5, -23.4); ctx.lineTo(i * 5.2, -14.6); ctx.stroke(); }
    ell(ctx, 0, -22.4, 9.4, 6); fillStroke(ctx, '#f9dc8c', lw);
    ctx.beginPath(); ctx.moveTo(-9.2, -21.6); ctx.quadraticCurveTo(0, -17.6, 9.2, -21.6); ctx.lineWidth = 3.4; ctx.strokeStyle = '#e5483f'; ctx.stroke();
    // ribbon tails
    ctx.fillStyle = '#e5483f'; poly(ctx, [[7, -19.6], [14, -15], [10.5, -13.6], [8, -17]]); ctx.fill(); ctx.lineWidth = lw * 0.7; ctx.strokeStyle = PAL.outline; ctx.stroke();
  }

  // ---------- basket of fries (lives) ----------
  const FRY_X = { 0: [], 1: [0], 2: [-6, 6], 3: [-11, 0, 11], 4: [-14, -5, 5, 14], 5: [-16, -8, 0, 8, 16] };
  function drawBasket(ctx, n) {
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const xs = FRY_X[Math.max(0, Math.min(5, n))];
    xs.forEach((x, i) => {
      const lean = x * 0.018, h = 18 + (i % 2) * 3.6 + (n === 1 ? 4 : 0);
      ctx.save(); ctx.translate(x, -4); ctx.rotate(lean);
      rr(ctx, -2.6, -h, 5.2, h + 3, 1.6);
      const g = ctx.createLinearGradient(-2.6, 0, 2.6, 0); g.addColorStop(0, PAL.fry1); g.addColorStop(1, PAL.fry2);
      fillStroke(ctx, g, 1.2);
      ctx.restore();
    });
    // paper-lined red basket
    ctx.beginPath(); ctx.moveTo(-24, -6); ctx.lineTo(24, -6); ctx.lineTo(19, 17); ctx.quadraticCurveTo(0, 20.5, -19, 17); ctx.closePath();
    const g2 = ctx.createLinearGradient(0, -6, 0, 18); g2.addColorStop(0, '#f0584c'); g2.addColorStop(1, '#bf2b2b');
    fillStroke(ctx, g2, 1.7);
    // gingham paper band
    ctx.save(); ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,.88)';
    for (let i = -6; i < 6; i++) { if (i % 2 === 0) ctx.fillRect(i * 5, -3, 5, 8); else ctx.fillRect(i * 5, 5, 5, 8); }
    ctx.restore();
    ctx.beginPath(); ctx.moveTo(-24, -6); ctx.lineTo(24, -6); ctx.lineWidth = 3.2; ctx.strokeStyle = '#ffd7d0'; ctx.stroke();
    ctx.lineWidth = 1.2; ctx.strokeStyle = PAL.outline; ctx.beginPath(); ctx.moveTo(-24.8, -6); ctx.lineTo(24.8, -6); ctx.stroke();
  }

  // ---------- smaller bits ----------
  function drawBullet(ctx) {
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.bezierCurveTo(5, -2, 4.4, 6, 0, 7); ctx.bezierCurveTo(-4.4, 6, -5, -2, 0, -9); ctx.closePath();
    const g = ctx.createLinearGradient(-4, 0, 4, 0); g.addColorStop(0, '#79d2ff'); g.addColorStop(0.5, '#e6f8ff'); g.addColorStop(1, '#3aa6ea');
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.1; ctx.strokeStyle = '#1b5f9e'; ctx.stroke();
    circle(ctx, -1.2, -1.5, 1.3); ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fill();
  }
  function drawSplat(ctx) {
    ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.bezierCurveTo(7.5, 1, 6, -5.5, 0, -6.5); ctx.bezierCurveTo(-6, -5.5, -7.5, 1, 0, 8); ctx.closePath();
    const g = ctx.createRadialGradient(-2, -1, 1, 0, 0, 8); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#dfe6d6');
    ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 1.3; ctx.strokeStyle = '#6e6a4a'; ctx.stroke();
    circle(ctx, 1.6, 2.6, 1.7); ctx.fillStyle = '#9ca77e'; ctx.fill();
    circle(ctx, -2.4, -1.5, 1.3); ctx.fillStyle = '#9ca77e'; ctx.fill();
  }
  function drawFry(ctx) { // single fry icon for HUD
    ctx.lineJoin = 'round'; rr(ctx, -2.3, -8, 4.6, 14, 1.6);
    const g = ctx.createLinearGradient(-2.3, 0, 2.3, 0); g.addColorStop(0, PAL.fry1); g.addColorStop(1, PAL.fry2);
    fillStroke(ctx, g, 1.1);
  }
  function drawStar(ctx) {
    ctx.lineJoin = 'round'; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const r = i % 2 ? 2.6 : 6, a = -Math.PI / 2 + i * Math.PI / 5; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); fillStroke(ctx, '#ffe14a', 1);
  }
  function drawFeather(ctx) {
    ctx.beginPath(); ctx.moveTo(0, -6); ctx.bezierCurveTo(4, -3, 4, 3, 0, 6); ctx.bezierCurveTo(-4, 3, -4, -3, 0, -6); ctx.closePath();
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 0.9; ctx.strokeStyle = 'rgba(58,29,82,.7)'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 6); ctx.strokeStyle = 'rgba(58,29,82,.45)'; ctx.stroke();
  }
  function drawCrust(ctx) { // bread crust (shown in title art / IMAGE-PROMPTS)
    rr(ctx, -6, -4, 12, 8, 3.5); fillStroke(ctx, '#d99a4e', 1.1);
  }

  // ---------- ASSETS ----------
  // key -> { w, h, frames, draw(ctx, frame), src? }   (w,h in world units; origin at centre)
  const ASSETS = {
    gull:     { w: 60, h: 52, frames: 3, draw: (c, f) => drawGull(c, 'gull', f) },
    herring:  { w: 80, h: 68, frames: 3, draw: (c, f) => drawGull(c, 'herring', f) },
    ruffled:  { w: 80, h: 68, frames: 3, draw: (c, f) => drawGull(c, 'ruffled', f) },
    tern:     { w: 68, h: 58, frames: 3, draw: (c, f) => drawGull(c, 'tern', f) },
    boss:     { w: 120, h: 108, frames: 3, draw: (c, f) => drawGull(c, 'boss', f) },
    gullD:    { w: 60, h: 52, frames: 1, draw: (c) => drawGull(c, 'gull', 2, true) },
    herringD: { w: 80, h: 68, frames: 1, draw: (c) => drawGull(c, 'herring', 2, true) },
    ternD:    { w: 68, h: 58, frames: 1, draw: (c) => drawGull(c, 'tern', 2, true) },
    bossD:    { w: 120, h: 108, frames: 1, draw: (c) => drawGull(c, 'boss', 2, true) },
    kid:      { w: 56, h: 76, frames: 1, draw: (c) => drawKid(c, false) },
    kid2:     { w: 56, h: 76, frames: 1, draw: (c) => drawKid(c, true) },
    bullet:   { w: 14, h: 22, frames: 1, draw: drawBullet },
    splat:    { w: 20, h: 22, frames: 1, draw: drawSplat },
    fry:      { w: 12, h: 22, frames: 1, draw: drawFry },
    star:     { w: 16, h: 16, frames: 1, draw: drawStar },
    feather:  { w: 14, h: 16, frames: 1, draw: drawFeather },
    crust:    { w: 16, h: 12, frames: 1, draw: drawCrust },
  };
  for (let n = 0; n <= 5; n++) ASSETS['basket' + n] = { w: 64, h: 56, frames: 1, draw: ((k) => (c) => drawBasket(c, k))(n), oy: 8 };

  const baked = {};
  let scale = 1;
  function bakeOne(key, frame) {
    const a = ASSETS[key];
    const c = document.createElement('canvas');
    c.width = Math.ceil(a.w * scale); c.height = Math.ceil(a.h * scale);
    const x = c.getContext('2d');
    x.scale(c.width / a.w, c.height / a.h);
    x.translate(a.w / 2, a.h / 2 + (a.oy || 0) * 0);
    a.draw(x, frame);
    return c;
  }
  function setScale(s) {
    const ns = Math.max(1, Math.min(3, s));
    if (Math.abs(ns - scale) < 0.01 && Object.keys(baked).length) return;
    scale = ns;
    Object.keys(ASSETS).forEach(k => { const a = ASSETS[k]; baked[k] = []; for (let f = 0; f < a.frames; f++) baked[k][f] = bakeOne(k, f); });
    Object.keys(ASSETS).forEach(k => { const a = ASSETS[k]; if (a.src && !a.img) { const im = new Image(); im.onload = () => { a.img = im; for (let f = 0; f < a.frames; f++) { baked[k][f] = im; } }; im.src = a.src; } });
  }
  // draw sprite centred at current origin (caller handles translate/rotate)
  function blit(ctx, key, frame, w, h) {
    const a = ASSETS[key]; const img = baked[key] && baked[key][frame | 0];
    if (!img) return;
    const ww = w || a.w, hh = h || a.h;
    ctx.drawImage(img, -ww / 2, -hh / 2, ww, hh);
  }

  // ---------- background: sunset at the Burlington waterfront ----------
  // tod: 0 = sunset, 1 = dusk, 2 = night (the picnic runs into the evening as the stages go on)
  function bakeBG(W, H, PY, scl, tod) {
    tod = tod || 0; const dusk = tod === 1, night = tod === 2;
    const c = document.createElement('canvas');
    c.width = Math.round(W * scl); c.height = Math.round(H * scl);
    const x = c.getContext('2d'); x.scale(scl, scl);
    const hz = Math.round(H * 0.5);       // horizon
    const shore = Math.round(H * 0.7);    // where lake meets park
    // sky
    let g = x.createLinearGradient(0, 0, 0, hz);
    if (night) { g.addColorStop(0, '#0c0a24'); g.addColorStop(0.45, '#1c1648'); g.addColorStop(0.8, '#33256a'); g.addColorStop(1, '#5a3a7e'); }
    else if (dusk) { g.addColorStop(0, '#120c33'); g.addColorStop(0.42, '#2f2066'); g.addColorStop(0.72, '#6e3277'); g.addColorStop(0.9, '#c4505c'); g.addColorStop(1, '#f07a4e'); }
    else { g.addColorStop(0, '#2c1b5e'); g.addColorStop(0.35, '#7a3a8c'); g.addColorStop(0.62, '#e0577a'); g.addColorStop(0.86, '#ff9a5c'); g.addColorStop(1, '#ffd27e'); }
    x.fillStyle = g; x.fillRect(0, 0, W, hz + 1);
    // stars at the top
    const r = srand(7); x.fillStyle = 'rgba(255,240,220,.7)';
    const nStars = night ? 90 : dusk ? 50 : 26, sDepth = night ? 0.85 : dusk ? 0.6 : 0.4;
    for (let i = 0; i < nStars; i++) { const sy = r() * hz * sDepth, sz = r() < 0.12 ? 2 : 1.4; x.globalAlpha = (0.25 + r() * 0.6) * (1 - sy / (hz * sDepth) * 0.7); x.fillRect(r() * W, sy, sz, sz); }
    x.globalAlpha = 1;
    // sun + glow
    const sx = night ? W * 0.3 : W * 0.64, sy = night ? hz * 0.42 : dusk ? hz + 30 : hz - 4;
    if (night) { // moon + soft halo
      g = x.createRadialGradient(sx, sy, 4, sx, sy, W * 0.45); g.addColorStop(0, 'rgba(220,225,255,.55)'); g.addColorStop(0.3, 'rgba(150,150,230,.18)'); g.addColorStop(1, 'rgba(90,80,180,0)');
      x.fillStyle = g; x.fillRect(0, 0, W, hz + 1);
      g = x.createRadialGradient(sx - 5, sy - 5, 2, sx, sy, 20); g.addColorStop(0, '#fffdf0'); g.addColorStop(1, '#d8dcf5');
      x.fillStyle = g; x.beginPath(); x.arc(sx, sy, 19, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(160,165,210,.45)'; [[-6, -4, 4], [5, 3, 3], [-2, 8, 2.5], [7, -7, 2]].forEach(c => { x.beginPath(); x.arc(sx + c[0], sy + c[1], c[2], 0, Math.PI * 2); x.fill(); });
    } else {
      g = x.createRadialGradient(sx, sy, 4, sx, sy, W * (dusk ? 0.75 : 0.62));
      g.addColorStop(0, dusk ? 'rgba(255,190,130,.85)' : 'rgba(255,236,170,.95)'); g.addColorStop(0.25, dusk ? 'rgba(240,110,100,.45)' : 'rgba(255,170,100,.55)'); g.addColorStop(1, 'rgba(255,120,110,0)');
      x.fillStyle = g; x.fillRect(0, 0, W, hz + 1);
      x.save(); x.beginPath(); x.rect(0, 0, W, hz); x.clip();
      g = x.createLinearGradient(0, sy - 34, 0, sy + 34); g.addColorStop(0, dusk ? '#ffd9a0' : '#fff6c8'); g.addColorStop(1, dusk ? '#ff7a4a' : '#ffb347');
      x.fillStyle = g; x.beginPath(); x.arc(sx, sy, 34, 0, Math.PI * 2); x.fill(); x.restore();
    }
    // Adirondack ridges across the lake
    const ridge = (base, amp, col, seed, step) => {
      const rr2 = srand(seed); x.fillStyle = col; x.beginPath(); x.moveTo(0, hz);
      let y = base;
      for (let px = 0; px <= W + step; px += step) { y = base - amp * (0.35 + 0.65 * rr2()) * (0.6 + 0.4 * Math.sin(px * 0.021 + seed)); x.lineTo(px, y); }
      x.lineTo(W, hz); x.closePath(); x.fill();
    };
    ridge(hz - 20, 34, night ? '#2a2058' : dusk ? '#55306e' : '#7a3f78', 3, 18);
    ridge(hz - 8, 22, night ? '#1d1745' : dusk ? '#3f2259' : '#5b2c66', 5, 14);
    // Burlington skyline bump on the left shore with a steeple
    x.fillStyle = night ? '#140f33' : dusk ? '#2c1747' : '#3d1f55';
    x.fillRect(0, hz - 7, W, 8);
    [[18, 12, 9], [34, 16, 8], [50, 10, 10], [74, 14, 8], [296, 11, 10], [314, 15, 9], [338, 10, 9]].forEach(b => x.fillRect(b[0], hz - 7 - b[1], b[2], b[1] + 2));
    x.beginPath(); x.moveTo(58, hz - 8); x.lineTo(60.5, hz - 36); x.lineTo(63, hz - 8); x.closePath(); x.fill();
    x.fillRect(59.8, hz - 41, 1.4, 7);
    if (tod) { // lit windows come on as it gets dark
      const rw = srand(11); x.fillStyle = night ? 'rgba(255,214,120,.95)' : 'rgba(255,214,120,.7)';
      [[18, 12, 9], [34, 16, 8], [50, 10, 10], [74, 14, 8], [296, 11, 10], [314, 15, 9], [338, 10, 9]].forEach(b => { for (let k = 0; k < 3; k++) if (rw() < (night ? 0.75 : 0.45)) x.fillRect(b[0] + 1.5 + rw() * (b[2] - 4), hz - 7 - b[1] + 2 + rw() * (b[1] - 4), 1.6, 1.6); });
    }
    // lake
    g = x.createLinearGradient(0, hz, 0, shore);
    if (night) { g.addColorStop(0, '#3a2c70'); g.addColorStop(0.25, '#241c55'); g.addColorStop(0.7, '#171340'); g.addColorStop(1, '#0f0c2c'); }
    else if (dusk) { g.addColorStop(0, '#c4585a'); g.addColorStop(0.2, '#7a3272'); g.addColorStop(0.6, '#33215e'); g.addColorStop(1, '#1a1442'); }
    else { g.addColorStop(0, '#ffb273'); g.addColorStop(0.18, '#e0678a'); g.addColorStop(0.6, '#6a3b8f'); g.addColorStop(1, '#2d2160'); }
    x.fillStyle = g; x.fillRect(0, hz, W, shore - hz + 1);
    // sun reflection
    for (let i = 0; i < 26; i++) {
      const t = i / 26, ry = hz + 3 + t * (shore - hz) * 0.85, rw = (22 + t * 70) * (0.5 + 0.5 * Math.sin(i * 2.7 + 1));
      x.fillStyle = night ? 'rgba(210,215,255,' + (0.42 - t * 0.34) * (t < 0.7 ? 1 : 0.6) + ')' : 'rgba(255,228,160,' + (0.5 - t * 0.38) * (dusk ? 0.75 : 1) + ')'; x.fillRect(sx - rw / 2 * (night ? 0.6 : 1) + Math.sin(i * 1.9) * 6, ry, rw * (night ? 0.6 : 1), 1.8);
    }
    // little sailboat + breakwater light
    x.fillStyle = '#2b1442'; x.beginPath(); x.moveTo(250, hz + 10); x.lineTo(268, hz + 10); x.lineTo(264, hz + 14); x.lineTo(254, hz + 14); x.closePath(); x.fill();
    x.beginPath(); x.moveTo(259, hz + 9.5); x.lineTo(259, hz - 6); x.lineTo(267, hz + 9.5); x.closePath(); x.fill();
    x.fillRect(96, hz + 6, 26, 3); x.fillRect(107, hz - 3, 4, 9); x.fillStyle = '#ffd27e'; x.fillRect(108, hz - 2, 2, 2);
    // park lawn
    g = x.createLinearGradient(0, shore - 4, 0, H);
    if (night) { g.addColorStop(0, '#1b3b33'); g.addColorStop(0.5, '#142b28'); g.addColorStop(1, '#0d1d1e'); }
    else if (dusk) { g.addColorStop(0, '#264f3f'); g.addColorStop(0.5, '#1d3f33'); g.addColorStop(1, '#152e29'); }
    else { g.addColorStop(0, '#2f6a49'); g.addColorStop(0.5, '#244f3a'); g.addColorStop(1, '#193a30'); }
    x.fillStyle = g; x.beginPath(); x.moveTo(0, shore + 6);
    for (let px = 0; px <= W; px += 12) x.lineTo(px, shore + Math.sin(px * 0.03) * 4 - 2);
    x.lineTo(W, H); x.lineTo(0, H); x.closePath(); x.fill();
    // shoreline rim light
    x.strokeStyle = night ? 'rgba(170,170,255,.3)' : dusk ? 'rgba(255,140,120,.35)' : 'rgba(255,170,120,.45)'; x.lineWidth = 2; x.beginPath();
    for (let px = 0; px <= W; px += 12) { const yy = shore + Math.sin(px * 0.03) * 4 - 2; if (px === 0) x.moveTo(px, yy); else x.lineTo(px, yy); }
    x.stroke();
    // maple trees on both edges (autumn!)
    const tree = (tx, ty, sz, hue) => {
      x.fillStyle = '#2a1a2e'; x.fillRect(tx - 2.5 * sz, ty, 5 * sz, 30 * sz);
      [[0, -16, 22], [-16, -4, 17], [16, -4, 17], [-7, -24, 15], [9, -22, 14]].forEach((b, i) => {
        const gg = x.createRadialGradient(tx + b[0] * sz - 3, ty + b[1] * sz - 4, 1, tx + b[0] * sz, ty + b[1] * sz, b[2] * sz);
        gg.addColorStop(0, hue[0]); gg.addColorStop(1, hue[1]);
        x.fillStyle = gg; x.beginPath(); x.arc(tx + b[0] * sz, ty + b[1] * sz, b[2] * sz, 0, Math.PI * 2); x.fill();
      });
    };
    const T1 = night ? ['#a05a3a', '#4a1f2a'] : dusk ? ['#e0783a', '#8a2a26'] : ['#ff9a3d', '#c0392b'];
    const T2 = night ? ['#a86a3a', '#45202a'] : dusk ? ['#f08a40', '#86281e'] : ['#ffb347', '#b8321f'];
    tree(18, shore - 22, 1.15, T1);
    tree(W - 20, shore - 30, 1.3, T2);
    tree(62, shore - 6, 0.7, T1);
    // string lights between the trees
    x.strokeStyle = 'rgba(40,20,50,.8)'; x.lineWidth = 1; x.beginPath(); x.moveTo(20, shore - 8); x.quadraticCurveTo(W / 2, shore + 34, W - 20, shore - 16); x.stroke();
    for (let i = 1; i < 11; i++) {
      const t = i / 11, px = (1 - t) * (1 - t) * 20 + 2 * t * (1 - t) * (W / 2) + t * t * (W - 20), py = (1 - t) * (1 - t) * (shore - 8) + 2 * t * (1 - t) * (shore + 34) + t * t * (shore - 16);
      const gr = night ? 16 : dusk ? 11 : 8, gl = x.createRadialGradient(px, py + 2, 0, px, py + 2, gr); gl.addColorStop(0, night ? 'rgba(255,225,140,.85)' : 'rgba(255,230,150,.7)'); gl.addColorStop(1, 'rgba(255,200,100,0)');
      x.fillStyle = gl; x.fillRect(px - gr, py + 2 - gr, gr * 2, gr * 2);
      x.fillStyle = i % 2 ? '#ffe39a' : '#ffb27a'; x.beginPath(); x.arc(px, py + 2, 2, 0, Math.PI * 2); x.fill();
    }
    // picnic blanket (gingham) under the player
    const by0 = PY - 2;
    x.save();
    x.beginPath(); x.moveTo(26, by0 + 2); x.lineTo(W - 26, by0 + 2); x.lineTo(W + 6, H); x.lineTo(-6, H); x.closePath();
    x.fillStyle = '#c93a45'; x.fill(); x.clip();
    x.fillStyle = 'rgba(255,255,255,.78)';
    const cs = 22;
    for (let yy = by0, j = 0; yy < H + cs; yy += cs, j++) { if (j % 2 === 0) x.fillRect(0, yy, W, cs * 0.5); }
    for (let xx = -6, i = 0; xx < W + cs; xx += cs, i++) { if (i % 2 === 0) { x.globalAlpha = 0.5; x.fillRect(xx, by0, cs * 0.5, H); x.globalAlpha = 1; } }
    g = x.createLinearGradient(0, by0, 0, H); g.addColorStop(0, night ? 'rgba(255,210,130,.18)' : 'rgba(255,170,100,.28)'); g.addColorStop(0.35, night ? 'rgba(10,8,40,.35)' : dusk ? 'rgba(20,6,40,.15)' : 'rgba(0,0,0,0)'); g.addColorStop(1, night ? 'rgba(8,4,24,.6)' : 'rgba(20,6,30,.35)');
    x.fillStyle = g; x.fillRect(0, by0, W, H);
    if (tod) { x.fillStyle = night ? 'rgba(22,14,60,.38)' : 'rgba(40,16,60,.16)'; x.fillRect(0, by0, W, H); }
    x.restore();
    x.strokeStyle = 'rgba(40,10,40,.5)'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(26, by0 + 2); x.lineTo(W - 26, by0 + 2); x.stroke();
    // cooler + watermelon at the corners (decorative, never in the way)
    const cool = (cx, cy) => { x.fillStyle = '#2f86d6'; x.beginPath(); x.roundRect ? x.roundRect(cx, cy, 34, 22, 4) : x.rect(cx, cy, 34, 22); x.fill(); x.strokeStyle = PAL.outline; x.lineWidth = 1.4; x.stroke(); x.fillStyle = '#f5f1e6'; x.fillRect(cx - 1, cy - 4, 36, 6); x.strokeRect(cx - 1, cy - 4, 36, 6); };
    cool(8, H - 64);
    x.fillStyle = '#3f9d4f'; x.beginPath(); x.arc(W - 30, H - 46, 15, Math.PI, 0); x.closePath(); x.fill(); x.strokeStyle = PAL.outline; x.stroke();
    x.fillStyle = '#ff5a6a'; x.beginPath(); x.arc(W - 30, H - 46, 11.5, Math.PI, 0); x.closePath(); x.fill();
    x.fillStyle = '#2a1a2e'; [[-5, -4], [1, -7], [5, -3]].forEach(s => x.fillRect(W - 30 + s[0], H - 46 + s[1], 1.6, 2.6));
    return c;
  }

  window.Art = { PAL, ASSETS, setScale, blit, bakeBG, srand, rr, circle };
})();
