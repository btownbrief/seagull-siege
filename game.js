/* Seagull Siege — a swooping formation shooter at a sunset lakeside picnic.
   Fixed-screen. World is 360 wide; height adapts to the screen (600..820). */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const W = 360, STEP = 1 / 60, COLS = 8, SP = 40, RP = 39;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const ease = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeBack = (t) => { t = clamp(t, 0, 1); const c = 2.2; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
  function mkRng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const stageEl = $('#stage'), cv = $('#cv'), ctx = cv.getContext('2d');
  let H = 780, TOP = 58, PY = 620, BY = 682, GROUND = 650, insetTopW = 0, insetBotW = 0, cssScale = 1, dpr = 1, F_Y0 = 124;
  let lastLayout = { w: 0, h: 0 }, bgs = [];
  const todOf = (n) => (n <= 4 ? 0 : n <= 8 ? 1 : 2); // sunset → dusk → night as the picnic goes on

  // ---------- save ----------
  const save = { best: 0, bestStage: 0, games: 0, tutDone: false, bossBeat: 0, start: 1, patches: {}, daily: { day: '', best: 0, plays: 0 }, streak: 0, lastDaily: '' };
  try { Object.assign(save, JSON.parse(localStorage.getItem('seagullsiege.save') || '{}')); } catch (e) { /* ignore */ }
  if (!save.patches || typeof save.patches !== 'object') save.patches = {};
  if (!save.daily || typeof save.daily !== 'object') save.daily = { day: '', best: 0, plays: 0 };
  function persist() { try { localStorage.setItem('seagullsiege.save', JSON.stringify(save)); } catch (e) { /* ignore */ } }

  // ---------- gull types ----------
  const TYPES = {
    g: { name: 'gull', r: 12, pts: 50, dive: 150, spr: 'gull', sq: 1.0 },
    h: { name: 'herring gull', r: 14, pts: 100, dive: 300, spr: 'herring', sq: 0.72 },
    t: { name: 'tern', r: 11, pts: 80, dive: 240, spr: 'tern', sq: 1.5 },
    b: { name: 'boss', r: 34, pts: 1000, dive: 1000, spr: 'boss', sq: 0.5 },
  };
  const SPR_D = { gull: 'gullD', herring: 'herringD', tern: 'ternD', boss: 'bossD' };
  const SPR_SZ = { gull: [60, 52], herring: [80, 68], tern: [68, 58], boss: [120, 108] };
  const BOSS_NAMES = ['Creemee Carl', 'Admiral Flapjack', 'Big Maple Mike', 'Sir Squawks-a-Lot', 'Captain Crumb'];

  // ---------- daily picnic: one date-seeded run a day with a small twist ----------
  const MODS = [
    { key: 'breeze', name: 'Breezy Day', desc: 'The wind blows splats sideways' },
    { key: 'terns', name: 'Tern Swarm', desc: 'Zig-zagging terns everywhere' },
    { key: 'heavy', name: 'Big Birds', desc: 'Tough herring gulls up front' },
    { key: 'feast', name: 'Fry Feast', desc: 'Start with 5 fries, no extras' },
  ];
  const dayStr = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  function dailyInfo() {
    const day = dayStr(new Date()); let h = 2166136261;
    for (let i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619); }
    h >>>= 0;
    return { day, seed: (h % 999983) + 1, mod: MODS[h % MODS.length] };
  }
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayStr(d); };

  // ---------- picnic patches (achievements) ----------
  const PATCHES = [
    ['flawless', 'Flawless', 'Clear Stage 5 or later without a hit'],
    ['sharp', 'Sharpshooter', 'Clear a stage at 85%+ accuracy (Stage 3+)'],
    ['combo8', 'Combo King', 'Reach a x8 combo'],
    ['hero', 'Basket Hero', 'Win back your stolen fries 3 times'],
    ['quick', 'Not Today!', 'Stage 8+: win the fries back before the thief gets home'],
    ['perfect', 'Perfect Picnic', 'Shoo all 30 in a bonus round'],
    ['boss1', 'Carl Shooed', 'Beat the Stage 4 boss'],
    ['boss2', 'Admiral Down', 'Beat the Stage 8 boss'],
    ['st12', 'Deep Water', 'Reach Stage 12'],
    ['full', 'Full Basket', 'Hold 5 fries at once'],
    ['daily', 'Daily Duty', 'Play the Daily Picnic on 3 different days'],
    ['k100', '100K Club', 'Score 100,000 in one game'],
    ['balloon4', 'Big Splash', 'Shoo 4 gulls with one water balloon'],
    ['gold', 'Gold Picnic', 'Win gold on a Daily Picnic'],
    ['st16', 'Night Owl', 'Reach Stage 16'],
  ];
  const MEDALS = [['Gold', 75000], ['Silver', 40000], ['Bronze', 15000]];
  const medalOf = (sc) => (MEDALS.find(m => sc >= m[1]) || [null])[0];

  // ---------- state ----------
  const S = {
    screen: 'title', phase: 'none', phaseT: 0, t: 0, stage: 1, kind: 'normal', rnd: mkRng(Date.now() % 100000),
    score: 0, shown: 0, lives: 3, combo: 1, comboT: 0, nextExtra: 20000,
    paused: false, god: false, ai: null, headless: false, noAutoPause: false, mode: 'classic', mod: null, day: '', wind: 0, newPatches: [], toast: null, stShots: 0, stHits: 0,
    shake: 0, hitstop: 0, flash: 0, stolen: false,
    dive: { cd: 2, pend: [] }, entry: { total: 0, done: true }, total: 0,
    banner: null, bonus: null, tutMoved: false, over: null, stats: null, dyingT: 0, urg: 0,
    stageHurts: 0, stageT: 0, frozen: false, debugPaths: false,
  };
  const P = { x: W / 2, tx: W / 2, cool: 0, inv: 0, recoil: 0, double: false, dead: false, grab: 0 };
  const basket = { state: 'home', x: W / 2, y: 0, vy: 0, bounced: false };
  const F = { ph: 0, ph2: 0, amp: 18, dx: 0, spread: 1, rows: 3 };
  let gulls = [], bullets = [], splats = [], parts = [], pops = [], decals = [], flyers = [], demo = [];
  let uid = 0, slots = [];
  const keys = { left: false, right: false, fire: false };
  const pointers = new Map();
  let primary = null;
  const rand = () => S.rnd();
  const rr = (a, b) => a + (b - a) * rand();
  // cosmetic randomness (particles, squawks) never touches the gameplay generator, so a seeded Daily stays the same picnic
  const vr = Math.random, vrr = (a, b) => a + (b - a) * Math.random();

  const sfx = (name, a, b) => { if (S.headless) return; if (Snd[name]) Snd[name](a, b); };
  const buzz = (ms) => { if (!S.headless && !S.ai) Snd.buzz(ms); };

  // ---------- layout (once per orientation / real size change) ----------
  function layout(force) {
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!(vw > 50 && vh > 50)) return;
    const prev = lastLayout;
    if (!force && prev.w === vw && prev.h && Math.abs(vh - prev.h) / prev.h < 0.2 && (vw > vh) === (prev.w > prev.h)) return;
    if (!force && prev.w && Math.abs(vw - prev.w) < 2 && Math.abs(vh - prev.h) / prev.h < 0.2) return;
    lastLayout = { w: vw, h: vh };
    const newH = clamp(W * vh / vw, 680, 820);
    const cw = Math.min(vw, vh * W / newH), ch = cw * newH / W;
    stageEl.style.width = cw + 'px'; stageEl.style.height = ch + 'px';
    stageEl.style.left = Math.round((vw - cw) / 2) + 'px'; stageEl.style.top = Math.round((vh - ch) / 2) + 'px';
    cssScale = cw / W;
    document.documentElement.style.setProperty('--u', cssScale + 'px');
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:1px;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const it = parseFloat(cs.paddingTop) || 0, ib = parseFloat(cs.paddingBottom) || 0;
    document.body.removeChild(probe);
    const touch = Math.abs(vh - ch) < 2, topPx = touch ? it : 0, botPx = touch ? ib : 0;
    document.documentElement.style.setProperty('--inset-top', topPx + 'px');
    document.documentElement.style.setProperty('--inset-bot', botPx + 'px');
    insetTopW = topPx / cssScale; insetBotW = botPx / cssScale;
    H = newH;
    TOP = 58 + insetTopW; F_Y0 = TOP + 66;
    PY = H - 160 - insetBotW; BY = PY + 62; GROUND = PY + 30;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
    stageEl.classList.toggle('short', H < 740);
    Art.setScale(cv.width / W);
    bgs = [0, 1, 2].map(t => Art.bakeBG(W, H, PY, cv.width / W, t));
    if (basket.state === 'home') { basket.y = BY; }
    if (!force && S.screen === 'play' && !S.paused) pause();
  }

  // ---------- smooth paths (Hermite through control points, constant-speed lookup) ----------
  function makePath(pts) {
    const n = pts.length, dirs = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
      dirs.push([dx / l, dy / l]);
    }
    const segs = [], table = []; let total = 0; const N = 12;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[i], p1 = pts[i + 1], L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      const sg = { p0, p1, m0: [dirs[i][0] * L, dirs[i][1] * L], m1: [dirs[i + 1][0] * L, dirs[i + 1][1] * L], start: total };
      segs.push(sg);
      table.push({ s: total, i, t: 0 });
      let prev = p0, acc = 0;
      for (let j = 1; j <= N; j++) {
        const t = j / N, q = herm(sg, t);
        acc += Math.hypot(q[0] - prev[0], q[1] - prev[1]); prev = q;
        table.push({ s: total + acc, i, t });
      }
      sg.len = acc; total += acc;
    }
    // Speed cap from curvature: a bird can only turn so fast, so it brakes into tight turns and
    // pivots instead of sliding sideways. Braking/re-acceleration limits make the slowdown smooth.
    const OMEGA = 10, VMIN = 14, ACC = 1600, vcap = new Array(table.length);
    const hdAt = (e) => { const d = hermD(segs[e.i], e.t); return Math.atan2(d[1], d[0]); };
    const hds = table.map(hdAt);
    for (let j = 0; j < table.length; j++) {
      const a = Math.max(0, j - 1), b = Math.min(table.length - 1, j + 1), ds = table[b].s - table[a].s;
      const k = ds > 0.01 ? Math.abs(angDiff(hds[b], hds[a])) / ds : 0;
      vcap[j] = k > 0 ? Math.max(VMIN, OMEGA / k) : 9999;
    }
    for (let j = table.length - 2; j >= 0; j--) vcap[j] = Math.min(vcap[j], Math.sqrt(vcap[j + 1] * vcap[j + 1] + 2 * ACC * Math.max(0, table[j + 1].s - table[j].s)));
    for (let j = 1; j < table.length; j++) vcap[j] = Math.min(vcap[j], Math.sqrt(vcap[j - 1] * vcap[j - 1] + 2 * ACC * Math.max(0, table[j].s - table[j - 1].s)));
    return { pts, segs, table, total, vcap };
  }
  function capAt(path, s) {
    const tb = path.table; let lo = 0, hi = tb.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tb[mid].s <= s) lo = mid; else hi = mid; }
    const f = tb[hi].s > tb[lo].s ? clamp((s - tb[lo].s) / (tb[hi].s - tb[lo].s), 0, 1) : 0;
    return lerp(path.vcap[lo], path.vcap[hi], f);
  }
  function herm(sg, t) {
    const t2 = t * t, t3 = t2 * t, a = 2 * t3 - 3 * t2 + 1, b = t3 - 2 * t2 + t, c = -2 * t3 + 3 * t2, d = t3 - t2;
    return [a * sg.p0[0] + b * sg.m0[0] + c * sg.p1[0] + d * sg.m1[0], a * sg.p0[1] + b * sg.m0[1] + c * sg.p1[1] + d * sg.m1[1]];
  }
  function hermD(sg, t) {
    const t2 = t * t, a = 6 * t2 - 6 * t, b = 3 * t2 - 4 * t + 1, c = -6 * t2 + 6 * t, d = 3 * t2 - 2 * t;
    return [a * sg.p0[0] + b * sg.m0[0] + c * sg.p1[0] + d * sg.m1[0], a * sg.p0[1] + b * sg.m0[1] + c * sg.p1[1] + d * sg.m1[1]];
  }
  function pathAt(path, s) {
    s = clamp(s, 0, path.total);
    const tb = path.table; let lo = 0, hi = tb.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (tb[mid].s <= s) lo = mid; else hi = mid; }
    const A = tb[lo], B = tb[hi];
    let i = B.i, t = B.t;
    if (A.i === B.i) { const f = B.s > A.s ? (s - A.s) / (B.s - A.s) : 0; t = lerp(A.t, B.t, f); i = A.i; }
    else { i = A.i; t = 1; }
    const sg = path.segs[i], p = herm(sg, t), d = hermD(sg, t), l = Math.hypot(d[0], d[1]) || 1;
    return { x: p[0], y: p[1], dx: d[0] / l, dy: d[1] / l };
  }
  function keyAt(u, kf) { // piecewise-linear keyframes [[u, v], ...]
    if (u <= kf[0][0]) return kf[0][1];
    for (let i = 1; i < kf.length; i++) if (u <= kf[i][0]) { const a = kf[i - 1], b = kf[i]; return lerp(a[1], b[1], (u - a[0]) / (b[0] - a[0] || 1)); }
    return kf[kf.length - 1][1];
  }

  // ---------- formation ----------
  const homeOf = (sl) => ({ x: W / 2 + (sl.c - (COLS - 1) / 2) * SP, y: F_Y0 + (S.kind === 'boss' ? 16 : 0) + sl.r * RP });
  function liveOf(sl) {
    const h = homeOf(sl);
    return { x: W / 2 + (h.x - W / 2) * F.spread + F.dx, y: h.y + Math.sin(F.ph2 * 0.7 + sl.c * 0.5) * 1.5 };
  }

  // ---------- stage design ----------
  const kindOf = (n) => (n % 4 === 3 ? 'bonus' : n % 4 === 0 ? 'boss' : 'normal');
  function params(n) {
    const d = Math.min(n, 26); // the ramp keeps going past stage 18 so long runs stay a chase
    return {
      maxDivers: Math.min(d >= 19 ? 5 : 4, 1 + Math.floor(d / 3.6)),
      diveCD: Math.max(0.8, 2.8 - 0.13 * d),
      diveSpd: 205 + 11 * d,
      splatSpd: 150 + 7 * d,
      drops: d < 3 ? 1 : d < 8 ? 2 : 3,
      pair: d < 3 ? 0 : Math.min(0.5, 0.09 * (d - 2)),
      aimErr: Math.max(8, 52 - 3.5 * d),
      loop: d < 2 ? 0.25 : 0.6,
      bossHp: 10 + 3 * (Math.floor(n / 4) - 1),
      bonusSpd: 200 + 8 * n,
    };
  }
  function genLayout(n, boss) {
    const rows = boss ? Math.min(4, 2 + Math.floor(n / 4)) : Math.min(5, 2 + Math.floor((n + 1) / 3));
    const shapes = ['full', 'pyramid', 'diamond', 'arch', 'vee', 'checker'];
    const shape = n <= 2 ? 'full' : shapes[(n + (boss ? 3 : 0)) % shapes.length];
    const out = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < COLS; c++) {
        const off = Math.abs(c - 3.5), mid = (rows - 1) / 2 || 1;
        let ok = true;
        if (shape === 'pyramid') ok = off <= 1.5 + r * (2 / Math.max(1, rows - 1));
        else if (shape === 'diamond') ok = off <= 1.5 + 2 * (1 - Math.abs(r - (rows - 1) / 2) / mid);
        else if (shape === 'arch') ok = c <= 1 || c >= 6 || r <= 1;
        else if (shape === 'vee') ok = off <= 3.5 - r * (1.5 / Math.max(1, rows - 1));
        else if (shape === 'checker') ok = (r + c) % 2 === 0 || r === 0;
        if (!ok) continue;
        let k = 'g';
        if (n >= 2 && r === 0 && (n >= 4 || (c >= 2 && c <= 5))) k = 'h';
        if (n >= 3 && ((r === 1 && (n >= 5 || c === 0 || c === 7)) || (n >= 8 && r === 3))) k = 't';
        if (n >= 9 && r === 2 && (c === 3 || c === 4)) k = 'h';
        if (S.mod === 'terns' && k === 'g' && (r + c) % 2 === 0) k = 't';
        if (S.mod === 'heavy' && r <= 1) k = 'h';
        out.push({ c, r, k });
      }
    }
    return { rows, slots: out };
  }
  // entry flight templates (left side; mirrored for the right). The final approach into the slot is added per gull.
  const ENTRY = [
    [[-30, 30], [70, 95], [170, 150], [240, 230], [205, 300], [135, 265], [120, 190]],
    [[-30, 330], [80, 310], [190, 255], [255, 175], [235, 95], [165, 70]],
    [[90, -30], [105, 70], [210, 140], [110, 215], [70, 160]],
    [[-30, 200], [80, 160], [165, 215], [130, 285], [70, 225], [130, 160]],
  ];

  function mkGull(k, sl) {
    const t = TYPES[k];
    return {
      id: ++uid, k, hp: k === 'h' ? 2 : 1, maxhp: k === 'h' ? 2 : 1, x: -100, y: -100, hd: Math.PI / 2, vx: 0, vy: 0, state: 'wait', t: 0, delay: 0,
      slot: sl, path: null, s: 0, total: 1, spd: 300, flap: rand() * 6, bob: rand() * 6, wob: 0, flash: 0, ruffled: false,
      zig: 0, zigWL: 70, drops: 0, dropCD: 0, prof: null, uA: 0.2, uB: 0.5, blend: 0.85, r: t.r, side: 1, started: false, cool: 0,
    };
  }

  function startStage(n) {
    S.stage = n; S.kind = kindOf(n);
    gulls = []; bullets = []; splats = []; parts = []; pops = []; decals = []; flyers = [];
    const pr = params(n);
    S.stageHurts = 0; S.stageT = 0; S.bonus = null; S.over = null; S.lastCalled = false; S.stShots = 0; S.stHits = 0;
    const nt = todOf(n); if (nt !== S.tod) { S.todFrom = S.tod === undefined ? nt : S.tod; S.tod = nt; S.todK = S.todFrom === nt ? 1 : 0; }
    S.wind = S.mod === 'breeze' ? (n % 2 ? 1 : -1) * (26 + Math.min(n, 12) * 3) : 0;
    if (n >= 12) award('st12'); if (n >= 16) award('st16');
    S.dive.cd = 3.2; S.dive.pend = [];
    P.inv = 0.6;
    basket.state = 'home'; basket.x = W / 2; basket.y = BY; S.stolen = false;
    if (S.kind === 'bonus') { spawnBonus(n, pr); Snd.setMode('bonus'); }
    else {
      const boss = S.kind === 'boss';
      const lay = genLayout(n, boss);
      F.rows = lay.rows; slots = lay.slots;
      F.ph = 0; F.ph2 = 0; F.dx = 0; F.spread = 1;
      spawnFormation(n, pr, boss);
      Snd.setMode(boss ? 'boss' : 'game');
    }
    S.total = gulls.length;
    S.phase = 'intro'; S.phaseT = 0;
    const label = S.kind === 'bonus' ? 'BONUS ROUND' : S.kind === 'boss' ? 'BOSS STAGE' : 'STAGE ' + n;
    const dm = S.mode === 'daily' && n === 1 ? MODS.find(m => m.key === S.mod) : null;
    const sub = dm ? 'Daily: ' + dm.desc : S.kind === 'bonus' ? 'Shoo them all — they won\'t fight back!' : S.kind === 'boss' ? BOSS_NAMES[(Math.floor(n / 4) - 1) % BOSS_NAMES.length] + ' is hungry…' : (n === 1 ? 'Shoo the gulls off the picnic!' : '');
    setBanner(S.kind === 'normal' ? 'STAGE ' + n : label, sub, 2.0, S.kind === 'bonus' ? '#9fffd0' : S.kind === 'boss' ? '#ff8f7d' : '#ffe08a');
    sfx('banner');
  }

  function spawnFormation(n, pr, boss) {
    const spd = 290 + Math.min(n, 16) * 6;
    const tplA = (n * 2) % ENTRY.length, tplB = (n * 2 + 1) % ENTRY.length;
    const half = F.rows / 2;
    const wave = (rowsSel, tpl, t0) => {
      let t = t0, longest = 0;
      [-1, 1].forEach(side => {
        const list = slots.filter(sl => rowsSel(sl) && (side < 0 ? sl.c < 4 : sl.c >= 4));
        list.sort((a, b) => Math.abs(b.c - 3.5) - Math.abs(a.c - 3.5) || b.r - a.r);
        list.forEach((sl, i) => {
          const g = mkGull(sl.k, sl); g.delay = t + i * 0.15 + (side > 0 ? 0.0 : 0); g.spd = spd; g.tpl = tpl; g.mirror = side > 0; gulls.push(g);
          longest = Math.max(longest, i);
        });
      });
      return longest;
    };
    const la = wave(sl => sl.r >= half, tplA, 1.1);
    wave(sl => sl.r < half, tplB, 1.1 + la * 0.15 + 1.5);
    if (boss) {
      const g = mkGull('b', { c: 3.5, r: F.rows }); g.hp = g.maxhp = pr.bossHp; g.delay = 1.4; g.state = 'wait'; g.spd = 300; g.snatchT = 1.2; g.didSnatch = false; g.ph = 0; g.dropT = 3; g.munchT = 0; g.carry = false; g.name = BOSS_NAMES[(Math.floor(n / 4) - 1) % BOSS_NAMES.length];
      gulls.push(g);
    }
  }

  function startEntry(g) {
    g.started = true;
    if (g.k === 'b') {
      const hold = bossHold(g);
      g.path = makePath([[W * 0.15, -90], [W * 0.82, 40], [W * 0.2, 150], [W * 0.75, 235], [hold.x, hold.y]]);
      g.s = 0; g.total = g.path.total; g.state = 'benter'; g.prof = [[0, 1], [0.85, 1], [1, 0.55]]; g.x = W * 0.15; g.y = -90; g.hd = Math.PI / 2;
      sfx('swoosh');
      return;
    }
    const home = homeOf(g.slot);
    let tpl = ENTRY[g.tpl].map(p => [g.mirror ? W - p[0] : p[0], p[1]]);
    const pre = [home.x + (g.mirror ? -1 : 1) * 4, home.y - 52];
    tpl.push(pre, [home.x, home.y]);
    g.path = makePath(tpl); g.s = 0; g.total = g.path.total; g.state = 'enter'; g.prof = [[0, 1], [0.82, 1], [1, 0.55]];
    const p0 = tpl[0]; g.x = p0[0]; g.y = p0[1]; const t0 = pathAt(g.path, 0); g.hd = Math.atan2(t0.dy, t0.dx);
  }

  function bossHold(g) { return { x: W / 2, y: F_Y0 + 16 + (F.rows - 1) * RP + 58 }; }

  // ---------- bonus stage ----------
  function circlePts(cx, cy, R, a0, steps, da, r2) {
    const out = []; for (let k = 0; k <= steps; k++) { const a = (a0 + k * da) * Math.PI / 180, r = r2 ? lerp(R, r2, k / steps) : R; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return out;
  }
  function bonusPattern(w) {
    const cx = W / 2, cy = Math.min(H * 0.34, 290);
    if (w === 0) return { pts: [[-30, cy - 40], [60, cy + 30], [150, cy - 50], [240, cy + 30], [330, cy - 50], [400, cy]], gap: 0.3, mirrorAlt: false };
    if (w === 1) return { pts: [[-30, 90]].concat(circlePts(cx, cy, 92, -135, 9, 45), [[400, 110]]), gap: 0.28, mirrorAlt: false };
    if (w === 2) { const p = [[cx, -30], [cx, 100]]; for (let k = 0; k <= 16; k++) { const t = k / 16 * Math.PI * 2; p.push([cx + 125 * Math.sin(t), cy + 70 * Math.sin(2 * t)]); } p.push([cx + 190, cy + 190], [cx + 260, cy + 300]); return { pts: p, gap: 0.26, mirrorAlt: false }; }
    if (w === 3) return { pts: [[-30, 70], [100, 110], [180, 200], [260, 295], [340, 330], [410, 300]], gap: 0.3, mirrorAlt: true };
    const sp = circlePts(cx, cy, 130, -90, 14, 55, 18); sp.unshift([-30, 40]); sp.push([cx, cy - 120], [cx, -50]); return { pts: sp, gap: 0.24, mirrorAlt: false };
  }
  function spawnBonus(n, pr) {
    slots = []; F.rows = 0;
    const per = 5; let tot = 0;
    for (let w = 0; w < 6; w++) {
      const pat = bonusPattern(w % 5);
      for (let i = 0; i < per; i++) {
        const mir = pat.mirrorAlt && (i % 2 === 1);
        const pts = pat.pts.map(p => [mir ? W - p[0] : p[0], p[1]]);
        const k = (w + i) % 4 === 3 ? 't' : 'g';
        const g = mkGull(k, null);
        g.hp = 1; g.state = 'wait'; g.bonus = true; g.delay = 1.0 + w * 2.9 + (pat.mirrorAlt ? Math.floor(i / 2) : i) * pat.gap;
        g.pts = pts; g.spd = pr.bonusSpd * (k === 't' ? 1.12 : 1); g.wave = w;
        gulls.push(g); tot++;
      }
    }
    S.bonus = { total: tot, hit: 0, gone: 0, streak: 0 };
  }

  // ---------- game flow ----------
  function startGame(stage, mode) {
    S.startStage = stage || 1;
    S.tod = undefined; S.meter = 0; S.balloons = []; S.balloonTip = false;
    S.mode = mode === 'daily' ? 'daily' : 'classic'; S.mod = null; S.newPatches = []; S.toast = null; S.toastQ = [];
    if (S.mode === 'daily') { const di = dailyInfo(); S.rnd = mkRng(di.seed); S.mod = S.forceMod || di.mod.key; S.day = di.day; } S.forceMod = null;
    S.score = S.shown = 0; S.lives = S.mod === 'feast' ? 5 : 3; S.combo = 1; S.comboT = 0; S.nextExtra = S.mod === 'feast' ? Infinity : 15000;
    S.stats = { shots: 0, hits: 0, shooed: 0, hurts: 0, maxCombo: 1, rescues: 0, stagesCleared: 0 };
    P.x = P.tx = W / 2; P.cool = 0; P.inv = 0; P.double = false; P.dead = false; P.recoil = 0;
    S.paused = false; S.dyingT = 0; S.frozen = false;
    S.prevBest = S.mode === 'daily' ? (save.daily.day === S.day ? save.daily.best : 0) : save.best;
    if (!S.headless && !S.ai) { save.games = (save.games || 0) + 1; persist(); }
    go('play');
    startStage(stage || 1);
    if ((stage || 1) > 1) S.meter = 1; // a head start: later checkpoints begin with a full balloon
  }
  function go(screen) {
    S.screen = screen; S.shake = 0; S.flash = 0; S.hitstop = 0; S.slowmo = 0;
    ['title', 'pause', 'over', 'patches'].forEach(id => $('#' + id).classList.toggle('show', id === screen));
    $('#hudbtns').style.display = (screen === 'play' || screen === 'pause') ? 'flex' : 'none';
    if (screen === 'title') { Snd.setMode('title'); S.phase = 'none'; $('#titleBest').textContent = fmt(save.best); refreshTitle(); initDemo(); }
    if (screen === 'patches') { S.phase = 'none'; buildPatchGrid(); }
    refreshSnd();
  }
  function pause() {
    if (S.screen !== 'play') return;
    commitBest();
    S.paused = true; pointers.clear(); primary = null; keys.left = keys.right = keys.fire = false;
    $('#pauseSub').textContent = 'Stage ' + S.stage + ' · ' + fmt(S.score) + ' pts';
    go('pause'); S.paused = true;
  }
  function resume() { S.paused = false; S.resumeT = 0.9; go('play'); }
  function commitBest() { if (S.headless || S.ai || S.mode === 'daily') return; if (S.score > save.best) { save.best = S.score; } if (S.stage > (save.bestStage || 0)) save.bestStage = S.stage; persist(); }
  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  function award(id) {
    if (S.headless || S.ai || save.patches[id]) return;
    const p = PATCHES.find(x => x[0] === id); if (!p) return;
    save.patches[id] = 1; persist();
    S.newPatches.push(p[1]); (S.toastQ = S.toastQ || []).push(p[1]); if (!S.toast) S.toast = { txt: S.toastQ.shift(), t: 0 };
    sfx('extra'); buzz(25);
  }
  const starts = () => { const o = [1]; for (let b = 4; b <= Math.min(12, save.bossBeat || 0); b += 4) o.push(b + 1); return o; };
  function refreshStart() {
    const st = starts(); if (st.indexOf(save.start) < 0) save.start = 1;
    const el = $('#btnStart'); el.style.display = st.length > 1 ? '' : 'none';
    el.innerHTML = 'START AT STAGE ' + st.map(n => '<button data-s="' + n + '" class="' + (n === save.start ? 'on' : '') + '">' + n + '</button>').join('');
  }
  // little stitched-badge icons (24×24 SVG); drawn in plum on the earned badges, faint on locked ones
  const PICON = {
    flawless: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/>',
    sharp: '<circle cx="12" cy="12" r="8" fill="none" stroke-width="2.4"/><circle cx="12" cy="12" r="4" fill="none" stroke-width="2.4"/><circle cx="12" cy="12" r="1.6"/>',
    combo8: '<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-4-1-6 1-9z"/>',
    hero: '<path d="M4 10h16l-2 10H6z"/><path d="M8 10l1-6M12 10V3M16 10l-1-6" fill="none" stroke-width="2.2" stroke-linecap="round"/>',
    quick: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
    perfect: '<path d="M12 2l3 7 7 .6-5.4 4.6L18 21l-6-3.8L6 21l1.4-6.8L2 9.6 9 9z"/>',
    boss1: '<path d="M2 14c3-6 7-9 10-9s7 3 10 9c-3-1-6-2-10-2S5 13 2 14z"/><circle cx="12" cy="9" r="1.6" fill="#fff4d6"/>',
    boss2: '<circle cx="12" cy="5" r="2.4" fill="none" stroke-width="2.2"/><path d="M12 7v13M5 13c0 4 3 7 7 7s7-3 7-7M8 11h8" fill="none" stroke-width="2.2" stroke-linecap="round"/>',
    st12: '<path d="M2 14c2-3 4-3 6 0s4 3 6 0 4-3 6 0v3c-2-3-4-3-6 0s-4 3-6 0-4-3-6 0z"/><path d="M2 8c2-3 4-3 6 0s4 3 6 0 4-3 6 0" fill="none" stroke-width="2"/>',
    full: '<path d="M5 11h14l-2 10H7z"/><path d="M7 11V4M10 11V2M13 11V3M16 11V5" fill="none" stroke-width="2.2" stroke-linecap="round"/>',
    daily: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4" stroke-width="2.4" stroke-linecap="round"/><path d="M7 12h3v3H7z" fill="#fff4d6"/>',
    k100: '<text x="12" y="16" font-size="10" font-family="Bangers, Impact, sans-serif" text-anchor="middle" stroke="none">100K</text>',
    balloon4: '<ellipse cx="12" cy="10" rx="7" ry="8"/><path d="M12 18l-2 3h4z"/><circle cx="9.5" cy="7.5" r="1.8" fill="#fff4d6"/>',
    gold: '<circle cx="12" cy="14" r="7"/><path d="M8 2l4 6 4-6" fill="none" stroke-width="2.4"/><circle cx="12" cy="14" r="3" fill="#fff4d6"/>',
    st16: '<path d="M15 3a9 9 0 1 0 6 13 7 7 0 0 1-6-13z"/>',
  };
  const patchCount = () => PATCHES.filter(p => save.patches[p[0]]).length;
  function refreshTitle() {
    $('#titleBest').textContent = fmt(save.best);
    const di = dailyInfo(), today = save.daily.day === di.day;
    $('#dailyMod').textContent = di.mod.name + ': ' + di.mod.desc.replace(/^The /, '');
    $('#dailyBest').textContent = today && save.daily.best ? 'Today ' + fmt(save.daily.best) + (medalOf(save.daily.best) ? ' · ' + medalOf(save.daily.best) : '') : 'Bronze 15K · Silver 40K · Gold 75K';
    const st = save.lastDaily === di.day || save.lastDaily === yesterday() ? (save.streak || 0) : 0;
    $('#dailyStreak').textContent = st > 1 ? st + '-day streak' : '';
    $('#patchCount').textContent = patchCount() + '/' + PATCHES.length;
    refreshStart();
  }
  function buildPatchGrid() {
    const g = $('#patchGrid'); g.innerHTML = '';
    PATCHES.forEach((p, i) => {
      const d = document.createElement('div'); d.className = 'patch' + (save.patches[p[0]] ? ' got' : '');
      d.innerHTML = '<div class="pbadge"><svg viewBox="0 0 24 24">' + (PICON[p[0]] || '') + '</svg></div><div class="pname">' + p[1] + '</div><div class="pdesc">' + p[2] + '</div>';
      g.appendChild(d);
    });
    $('#patchSub').textContent = patchCount() + ' of ' + PATCHES.length + ' sewn on';
  }

  function setBanner(txt, sub, dur, col) { S.banner = { txt, sub, t: 0, dur: dur || 2, col: col || '#ffe08a' }; }

  function addScore(n, x, y, col, big) {
    S.score += n;
    if (x !== undefined) pops.push({ x, y, txt: '+' + fmt(n), col: col || '#fff', sz: big ? 24 : 15, t: 0, max: big ? 1.2 : 0.85, vy: -46 });
    while (S.score >= S.nextExtra) {
      S.nextExtra = S.nextExtra < 50000 ? 50000 : S.nextExtra + 80000;
      if (S.lives < 5) { S.lives++; setBanner('EXTRA FRY!', 'Score bonus', 1.5, '#ffe08a'); sfx('extra'); if (S.lives >= 5) award('full'); }
    }
    if (S.score >= 100000) award('k100');
  }

  // ---------- input ----------
  function worldX(e) { const r = stageEl.getBoundingClientRect(); return (e.clientX - r.left) / r.width * W; }
  function onDown(e) {
    if (e.target.closest && e.target.closest('button')) return;
    Snd.unlock();
    if (S.screen !== 'play' || S.paused) return;
    const x = worldX(e);
    const other = pointers.size > 0, br = balloonBtn.getBoundingClientRect();
    const onCooler = balloonReady() && e.clientX > br.left - 10 && e.clientX < br.right + 10 && e.clientY > br.top - 10 && e.clientY < br.bottom + 10;
    // a quick tap on the cooler, or a quick tap with a second finger, throws the balloon; drags never do
    pointers.set(e.pointerId, { x, grab: P.x - x, cx: e.clientX, cy: e.clientY, t0: performance.now(), tap: onCooler || other });
    if (primary === null) { primary = e.pointerId; P.tx = clamp(x + pointers.get(primary).grab, 16, W - 16); }
    e.preventDefault();
  }
  function onMove(e) {
    if (S.screen !== 'play' || S.paused) return;
    const p = pointers.get(e.pointerId);
    if (!p) { if (e.pointerType === 'mouse' && !pointers.size) P.tx = clamp(worldX(e), 16, W - 16); return; }
    const x = worldX(e); p.x = x;
    if (p.tap && Math.hypot(e.clientX - p.cx, e.clientY - p.cy) > 16) p.tap = false;
    if (e.pointerId === primary) { // pure relative drag: the kid moves exactly as far as your finger; at a wall the anchor slides so reversing responds at once
      const want = x + p.grab; P.tx = clamp(want, 16, W - 16); if (want !== P.tx) p.grab = P.tx - x; if (Math.abs(P.tx - W / 2) > 40) S.tutMoved = true; }
    e.preventDefault();
  }
  function onUp(e) {
    const pu = pointers.get(e.pointerId);
    if (pu && pu.tap && e.type === 'pointerup' && performance.now() - pu.t0 < 400) throwBalloon();
    pointers.delete(e.pointerId);
    if (e.pointerId === primary) {
      primary = null;
      for (const [id, p] of pointers) { primary = id; p.grab = P.x - p.x; break; }
    }
  }
  // listen on the whole page so a thumb in the side margins (landscape, desktop) still steers
  document.addEventListener('pointerdown', onDown);
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);
  stageEl.addEventListener('contextmenu', (e) => e.preventDefault());
  ['gesturestart', 'gesturechange'].forEach(n => document.addEventListener(n, (e) => e.preventDefault()));
  document.addEventListener('pointerdown', () => Snd.unlock(), true);
  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = true;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = true;
    else if (k === ' ' || k === 'z' || k === 'Z' || k === 'ArrowUp' || k === 'w' || k === 'W') { keys.fire = true; Snd.unlock(); if (S.screen === 'play') e.preventDefault(); }
    else if (k === 'p' || k === 'P' || k === 'Escape') { if (S.screen === 'play') pause(); else if (S.screen === 'pause') resume(); else if (S.screen === 'patches') go('title'); }
    else if (k === 'm' || k === 'M') toggleAllSound();
    else if (k === 'x' || k === 'X' || k === 'Shift') throwBalloon();
    else if (k === 'Enter') { Snd.unlock(); if (S.screen === 'title' || S.screen === 'over') startGame(1); else if (S.screen === 'pause') resume(); }
    if (k === ' ' && S.screen === 'play') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') keys.left = false;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') keys.right = false;
    else if (k === ' ' || k === 'z' || k === 'Z' || k === 'ArrowUp' || k === 'w' || k === 'W') keys.fire = false;
  });
  window.addEventListener('blur', () => { keys.left = keys.right = keys.fire = false; });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (S.screen === 'play' && !S.noAutoPause) pause(); Snd.suspend(); } else Snd.resume();
  });
  window.addEventListener('pagehide', () => { if (S.screen === 'play') pause(); Snd.suspend(); });

  // ---------- particles & pops ----------
  function pt(o) { if (parts.length < 600) parts.push(Object.assign({ life: 0, max: 0.8, vx: 0, vy: 0, g: 0, drag: 0, rot: 0, vr: 0, sz: 1, type: 'dot', col: '#fff' }, o)); }
  function feathers(x, y, n, spread) {
    if (S.headless) return;
    for (let i = 0; i < n; i++) {
      const a = vr() * Math.PI * 2, sp = vrr(40, 150) * (spread || 1);
      pt({ type: 'feather', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, g: 55, drag: 1.7, rot: vr() * 6, vr: vrr(-6, 6), sz: vrr(0.8, 1.35), max: vrr(0.8, 1.4) });
    }
  }
  function burst(x, y, n, cols, sp0, sp1, g, sz) {
    if (S.headless) return;
    for (let i = 0; i < n; i++) { const a = vr() * Math.PI * 2, sp = vrr(sp0, sp1); pt({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: g || 0, drag: 1.2, sz: vrr(1.4, 3) * (sz || 1), col: cols[(vr() * cols.length) | 0], max: vrr(0.3, 0.7) }); }
  }
  function ring(x, y, col, r1, dur) { if (!S.headless) pt({ type: 'ring', x, y, col, sz: r1 || 30, max: dur || 0.4 }); }

  // ---------- shooing ----------
  function isDiving(g) { return g.state === 'dive' || g.state === 'bsnatch' || g.state === 'bwarn'; }

  function shoo(g, bump) { // bump: the gull flew into the kid — knock it away, but no points or combo
    const T = TYPES[g.k], diving = !bump && (g.state === 'dive' || g.state === 'bsnatch');
    const idx = gulls.indexOf(g); if (idx >= 0) gulls.splice(idx, 1);
    S.stats.shooed++;
    if (g.bonus) {
      S.bonus.hit++; S.bonus.streak++;
      const v = 100 * (1 + Math.floor(S.stage / 4));
      addScore(v, g.x, g.y - 10, '#9fffd0');
      sfx('bonusHit', S.bonus.streak); burst(g.x, g.y, 10, ['#9fffd0', '#fff', '#ffe08a'], 40, 150, 0, 1);
    } else {
      let pts = bump ? 0 : diving ? T.dive * S.combo : T.pts;
      if (g.k === 'b') pts = 2500 * (1 + Math.floor(S.stage / 8));
      if (diving && g.k !== 'b') { S.combo = Math.min(8, S.combo + 1); S.comboT = 3.4; S.stats.maxCombo = Math.max(S.stats.maxCombo, S.combo); if (S.combo >= 8) award('combo8'); pops.push({ x: g.x, y: g.y - 26, txt: 'x' + S.combo, col: '#ffe08a', sz: 13 + S.combo, t: 0, max: 0.9, vy: -34 }); }
      if (pts) addScore(pts, g.x, g.y - 8, diving ? '#ffe08a' : '#fff', g.k === 'b');
      if (g.k === 'b') sfx('bossShoo'); else sfx('shoo', S.combo, g.k);
    }
    if (!g.bonus && g.k !== 'b' && !S.splashing) addMeter(diving ? 0.055 + 0.006 * S.combo : 0.012);
    const sp = TYPES[g.k].spr;
    flyers.push({ x: g.x, y: g.y, vx: (vr() < 0.5 ? -1 : 1) * vrr(40, 90), vy: -vrr(70, 130), rot: g.hd - Math.PI / 2, vr: vrr(-5, 5) * (g.k === 'b' ? 0.4 : 1), spr: SPR_D[sp], sz: SPR_SZ[sp], t: 0, dur: g.k === 'b' ? 2.4 : 1.25, ph: vr() * 6, boss: g.k === 'b' });
    feathers(g.x, g.y, g.k === 'b' ? 26 : 10, g.k === 'b' ? 1.6 : 1);
    ring(g.x, g.y, 'rgba(255,255,255,.8)', g.k === 'b' ? 70 : 34, 0.4);
    if (!S.headless) for (let i = 0; i < 5; i++) { const a = vr() * 6.28; pt({ type: 'puff', x: g.x + Math.cos(a) * 6, y: g.y + Math.sin(a) * 6, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40 - 10, drag: 3, sz: vrr(7, 11) * (g.k === 'b' ? 1.8 : 1), max: vrr(0.35, 0.5) }); }
    if (diving && !g.bonus && g.k !== 'b') { // a shoo mid-dive is the big moment: freeze a beat, pop the bird, ring grows with the combo
      S.hitstop = Math.max(S.hitstop, (0.035 + Math.min(0.03, S.combo * 0.004)) * (S.slowmo > 0 ? 0.4 : 1));
      flyers[flyers.length - 1].pop = 1;
      ring(g.x, g.y, 'rgba(255,224,138,.95)', 26 + S.combo * 6, 0.35);
      if (S.combo >= 4) S.shake = Math.max(S.shake, 2 + S.combo * 0.3);
    }
    if (g.k === 'b') { if (!S.headless && !S.ai && S.stage > (save.bossBeat || 0)) { save.bossBeat = S.stage; persist(); } if (S.stage === 4) award('boss1'); if (S.stage === 8) award('boss2'); S.slowmo = 0.7; S.hitstop = 0.05; S.shake = 8; S.flash = 0.35; burst(g.x, g.y, 30, ['#ffe08a', '#fff', '#ff9a5c'], 80, 280, 80, 1.3); }
    else if (g.k === 'h') S.hitstop = 0.04;
    buzz(g.k === 'b' ? 60 : 12);
  }

  function damageGull(g) {
    S.stats.hits++; S.stHits++;
    if (g.bonus) { shoo(g); return; }
    if (g.k === 'b') { hitBoss(g); return; }
    g.hp--;
    if (g.hp <= 0) shoo(g);
    else { g.wob = 0.3; g.flash = 0.14; g.ruffled = true; feathers(g.x, g.y, 5, 0.8); sfx('hit', g.k); addScore(10); buzz(8); }
  }
  function hitBoss(g) {
    g.flash = 0.14; g.wob = 0.2; feathers(g.x, g.y, 4, 0.9); addScore(25);
    if (g.carry) { // while it carries your fries, hits loosen its grip instead of hurting it
      g.grip--; basket.jolt = 0.25; sfx('hit', 'b'); S.hitstop = 0.02;
      if (g.grip <= 0) rescue(g, false); return;
    }
    g.hp--; if (!g.didSnatch) g.hp = Math.max(g.hp, Math.ceil(g.maxhp * 0.45)); // can't be beaten before it has tried to snatch the fries
    if (g.hp <= 0) { if (g.carry) g.carry = false; shoo(g); return; }
    sfx('hit', 'b'); S.hitstop = 0.03; S.shake = Math.max(S.shake, 2);
  }
  function rescue(g, dead) {
    if (!S.headless && !S.ai) { save.rescues = (save.rescues || 0) + 1; persist(); }
    if (save.rescues >= 3) award('hero'); if (g.state === 'bcarry' && S.stage >= 8) award('quick');
    addMeter(0.25);
    g.carry = false; basket.state = 'falling'; basket.x = g.x; basket.y = g.y + 38; basket.vy = -140; basket.bounced = false;
    S.stolen = false; P.double = true; S.stats.rescues++;
    addScore(1500, g.x, g.y + 30, '#9fffd0', true);
    setBanner('BASKET SAVED!', 'DOUBLE BLASTER until you\'re hit', 1.9, '#9fffd0');
    sfx('rescue'); buzz(40); S.flash = 0.25; S.hitstop = 0.03; S.slowmo = 0.55; // hero beat: the basket tumbles free in slow motion
    ring(g.x, g.y + 30, 'rgba(159,255,208,.95)', 90, 0.5); ring(g.x, g.y + 30, 'rgba(255,255,255,.9)', 55, 0.35);
    burst(g.x, g.y + 38, 16, ['#ffe27a', '#fff', '#9fffd0'], 60, 220, 120, 1.2);
    if (!dead) { g.state = 'bpatrol'; g.snatchT = 7.5; g.munchT = 0; }
  }

  function hurtPlayer() {
    if (P.inv > 0 || P.dead || (S.phase !== 'fight' && S.phase !== 'intro') || S.kind === 'bonus') return;
    if (S.god) { S.stats.hurts++; S.stageHurts++; P.inv = 1.5; return; }
    if (S.lives === 1 && (S.meter || 0) >= 1) { // a full balloon bursts on its own to save your last fry
      S.meter = 0; P.inv = 1.6; splashAt(P.x, PY - 70); setBanner('SAVED!', 'The water balloon burst just in time', 1.6, '#9fe0ff'); return;
    }
    S.lives--; S.stats.hurts++; S.stageHurts++; P.double = false; P.inv = 2.3; S.combo = 1; S.comboT = 0;
    S.shake = 10; S.hitstop = 0.09; S.flash = 0.35;
    sfx('hurt'); buzz(120);
    burst(P.x, PY - 6, 18, ['#ff8a2b', '#fff', '#ffe27a'], 60, 240, 160, 1.2);
    for (let i = 0; i < 4; i++) pt({ type: 'fry', x: P.x + vrr(-8, 8), y: BY - 12, vx: vrr(-90, 90), vy: -vrr(160, 280), g: 520, rot: vr() * 6, vr: vrr(-8, 8), max: 1.3 });
    splats.forEach(s => { burst(s.x, s.y, 5, ['#fff', '#cfd6b8'], 30, 100, 0, 1); }); splats = [];
    if (S.lives <= 0) { P.dead = true; S.phase = 'dying'; S.dyingT = 0; commitBest(); }
  }

  // ---------- water balloon (the special): dive shoos fill the cooler, tap it to lob a balloon ----------
  function addMeter(v) {
    if (S.kind === 'bonus' || S.meter >= 1) return;
    S.meter = Math.min(1, (S.meter || 0) + v);
    if (S.meter >= 1) {
      sfx('ready'); buzz(20);
      if (!save.balloonUsed && !S.balloonTip) { S.balloonTip = true; setBanner('WATER BALLOON!', 'Tap the cooler (or tap with a 2nd finger)', 2.4, '#9fe0ff'); }
    }
  }
  const balloonReady = () => (S.meter || 0) >= 1 && !P.dead && S.screen === 'play' && !S.paused && (S.phase === 'fight' || S.phase === 'intro') && S.kind !== 'bonus';
  function throwBalloon() {
    if ((S.meter || 0) < 1 || P.dead || S.screen !== 'play' || S.paused || (S.phase !== 'fight' && S.phase !== 'intro') || S.kind === 'bonus') return false;
    S.meter = 0; S.balloons.push({ x: P.x, y: PY - 46, vy: -640, t: 0, rot: 0 });
    if (!S.headless && !S.ai && !save.balloonUsed) { save.balloonUsed = true; persist(); }
    sfx('lob'); buzz(15); P.recoil = 1.4;
    return true;
  }
  function updBalloons(dt) {
    for (let i = S.balloons.length - 1; i >= 0; i--) {
      const b = S.balloons[i]; b.t += dt; b.vy += 380 * dt; b.y += b.vy * dt; b.rot += dt * 7;
      let hit = b.y <= F_Y0 + RP * 1.6 || b.vy > -60;
      if (!hit) for (const g of gulls) { if (g.state !== 'wait' && Math.hypot(g.x - b.x, g.y - b.y) < g.r + 12) { hit = true; break; } }
      if (hit) { S.balloons.splice(i, 1); splashAt(b.x, b.y); }
    }
  }
  function splashAt(x, y) {
    const R = 100; let n = 0; S.splashing = true;
    gulls.slice().forEach(g => {
      if (g.state === 'wait' || Math.hypot(g.x - x, g.y - y) > R + g.r) return;
      if (g.k === 'b') { if (g.carry) { g.grip = 1; hitBoss(g); } else for (let k = 0; k < 3 && gulls.indexOf(g) >= 0; k++) hitBoss(g); }
      else { shoo(g); n++; }
    });
    S.splashing = false;
    splats.forEach(sp => { burst(sp.x, sp.y, 6, ['#9fe0ff', '#fff'], 30, 120, 60, 1); addScore(10); }); splats = [];
    if (n >= 2) pops.push({ x: clamp(x, 60, W - 60), y: y + 40, txt: 'SPLASH x' + n + '!', col: '#9fe0ff', sz: 24, t: 0, max: 1.2, vy: -30 });
    if (n >= 4) award('balloon4');
    sfx('balloon'); buzz(50); S.shake = Math.max(S.shake, 7); S.hitstop = Math.max(S.hitstop, 0.07); S.flash = Math.max(S.flash, 0.18);
    ring(x, y, 'rgba(159,224,255,.95)', R, 0.5); ring(x, y, 'rgba(255,255,255,.9)', R * 0.6, 0.35);
    burst(x, y, 40, ['#9fe0ff', '#5cc2ff', '#ffffff'], 80, 320, 260, 1.4);
    if (!S.headless) for (let i = 0; i < 10; i++) { const a = vr() * 6.28; pt({ type: 'puff', x: x + Math.cos(a) * 20, y: y + Math.sin(a) * 20, vx: Math.cos(a) * 90, vy: Math.sin(a) * 90, drag: 2.5, sz: vrr(10, 18), max: vrr(0.4, 0.7) }); }
  }

  // ---------- dives ----------
  function buildDive(g, side, tx, loop) {
    const pr = params(S.stage), sl = homeOf(g.slot), x0 = g.x, y0 = g.y, BOT = PY + 6;
    const pts = [[x0, y0]];
    let ax, ay;
    if (loop) {
      pts.push([x0 + side * 16, y0 - 26], [x0 + side * 42, y0 - 38], [x0 + side * 68, y0 - 22], [x0 + side * 70, y0 + 6], [x0 + side * 46, y0 + 24], [x0 + side * 22, y0 + 18]);
      ax = x0 + side * 12; ay = y0 + 44;
    } else { pts.push([x0 + side * 18, y0 - 18]); ax = x0 + side * 34; ay = y0 + 30; }
    pts.push([ax, ay]);
    const dy = BOT - ay, exitDir = tx < W / 2 ? 1 : -1;
    pts.push([lerp(ax, tx, 0.35) - side * 20, ay + dy * 0.3]);
    pts.push([lerp(ax, tx, 0.8) + side * 16, ay + dy * 0.62]);
    pts.push([tx, ay + dy * 0.88]);
    const iBottom = pts.length;
    pts.push([tx + exitDir * 30, BOT]);
    pts.push([clamp(tx + exitDir * 85, 22, W - 22), BOT - 40]);
    pts.push([clamp(tx + exitDir * 105, 22, W - 22), BOT - 150]);
    pts.push([clamp(lerp(tx + exitDir * 80, sl.x, 0.55), 20, W - 20), F_Y0 - 30]);
    pts.push([sl.x, sl.y - 60]);
    pts.push([sl.x, sl.y]);
    g.path = makePath(pts); g.s = 0; g.total = g.path.total;
    const sAt = (i) => g.path.segs[Math.min(i, g.path.segs.length - 1)].start / g.total;
    g.uA = sAt(loop ? 8 : 3); g.uB = sAt(iBottom);
    g.prof = [[0, 0.7], [g.uA, 0.8], [g.uA + 0.05, 1.0], [g.uB, 1.3], [g.uB + 0.1, 1.1], [0.9, 1.0], [1, 0.62]];
    g.state = 'dive'; g.skim = false; g.side = side; g.drops = pr.drops; g.dropCD = 0.1; g.blend = 0.86;
    g.zig = g.k === 't' ? 1 : 0; g.zigWL = 120;
    sfx('swoosh'); if (!S.headless && vr() < 0.5) sfx('squawk', TYPES[g.k].sq * 1.1, 0.22);
  }

  function startDive(g, delay, mirrorOf) {
    const pr = params(S.stage);
    const bold = isLast();
    let tx = P.x + rr(-pr.aimErr, pr.aimErr);
    if (bold) tx = P.x + rr(-pr.aimErr * 0.4, pr.aimErr * 0.4);
    tx = clamp(tx, 24, W - 24);
    let side = g.x < W / 2 ? -1 : 1; if (rand() < 0.22) side = -side;
    if (mirrorOf) side = -mirrorOf.side;
    const loop = rand() < pr.loop;
    g.pendingDive = null;
    if (delay > 0) { g.state = 'prep'; g.t = delay; g.prepArgs = { tx, side, loop }; g.cool = 0; return; }
    buildDive(g, side, tx, loop);
  }
  function isLast() { return gulls.filter(g => !g.bonus && g.k !== 'b').length === 1 && !gulls.some(g => g.k === 'b'); }

  function scheduleDives(dt) {
    if (S.phase !== 'fight' || S.kind !== 'normal' && S.kind !== 'boss') return;
    const pr = params(S.stage);
    const live = gulls.filter(g => g.k !== 'b' && !g.bonus);
    const inForm = live.filter(g => g.state === 'form');
    const entering = gulls.some(g => g.state === 'wait' || g.state === 'enter');
    const alive = live.length; const urg = 1 + (1 - alive / Math.max(1, S.total)) * 0.9; S.urg = urg;
    const bold = alive === 1 && S.kind === 'normal';
    const divers = live.filter(g => g.state === 'dive' || g.state === 'prep').length;
    let maxD = pr.maxDivers + (S.stolen ? 1 : 0);
    if (entering && S.stage <= 2) maxD = 0;
    if (bold) maxD = 1;
    S.dive.cd -= dt * urg * (S.stolen ? 1.3 : 1);
    if (S.dive.cd > 0 || divers >= maxD || !inForm.length) return;
    if (P.inv > 1.8) return; // mercy right after a hit
    // choose a diver, weighted toward the front rows
    let pool = inForm.filter(g => g.t > 0.8);
    if (!pool.length) return;
    let tot = 0; const wts = pool.map(g => { const w = 1 + g.slot.r * 0.6; tot += w; return w; });
    let pick = rand() * tot, g = pool[0];
    for (let i = 0; i < pool.length; i++) { pick -= wts[i]; if (pick <= 0) { g = pool[i]; break; } }
    startDive(g, 0, null);
    if (!bold && divers + 1 < maxD && rand() < pr.pair) {
      const mate = inForm.find(m => m !== g && m.state === 'form' && m.slot.r === g.slot.r && Math.abs(m.slot.c - g.slot.c) === 1) || inForm.find(m => m !== g && m.state === 'form');
      if (mate) startDive(mate, 0.2, g);
    }
    S.dive.cd = bold ? 0.35 : pr.diveCD * rr(0.75, 1.25);
  }

  function landX(s) { // where a wind-blown splat will land (falls with +120 u/s² gravity)
    const d = Math.max(0, GROUND - s.y), t = (-s.vy + Math.sqrt(s.vy * s.vy + 240 * d)) / 120;
    return clamp(s.x + (s.vx || 0) * t, 8, W - 8);
  }
  function nearMiss(x) { // brave play pays: a splat that only just misses you is worth points and balloon water
    S.stats.close = (S.stats.close || 0) + 1;
    const v = 50 * Math.max(1, S.combo); addScore(v); addMeter(0.08);
    pops.push({ x: clamp(x, 50, W - 50), y: PY - 70, txt: 'CLOSE! +' + v, col: '#9fe0ff', sz: 21, t: 0, max: 1.0, vy: -44 });
    ring(P.x, PY - 20, 'rgba(159,224,255,.9)', 40, 0.3);
    sfx('close');
  }
  function dropSplat(x, y, vyMul) {
    if (splats.length >= 7) return;
    const pr = params(S.stage);
    splats.push({ x, y, y0: y, vy: pr.splatSpd * (vyMul || 1), vx: S.wind, t: 0 });
    sfx('drop');
  }

  // ---------- gull updates ----------
  function placeFromPath(g, dt) {
    const u = g.s / g.total, p = pathAt(g.path, g.s);
    let x = p.x, y = p.y;
    if (g.zig) { const env = sstep(g.uA || 0.1, (g.uA || 0.1) + 0.12, u) * (1 - sstep(0.7, 0.9, u)); const off = Math.sin(g.s / g.zigWL * Math.PI * 2) * 19 * env; x += -p.dy * off; y += p.dx * off; }
    if (g.slot && g.slot.r !== undefined && g.k !== 'b') {
      const k = sstep(g.blend, 1, u), live = liveOf(g.slot), home = homeOf(g.slot);
      x += (live.x - home.x) * k; y += (live.y - home.y) * k;
    }
    const ox = g.x, oy = g.y; g.x = x; g.y = y;
    if (dt > 0) {
      g.vx = (x - ox) / dt; g.vy = (y - oy) / dt;
      if (Math.hypot(x - ox, y - oy) > 0.05) turnTo(g, Math.atan2(y - oy, x - ox), dt, 14);
      else turnTo(g, Math.atan2(p.dy, p.dx), dt, 14); // pivoting at a tight turn: face where the path goes
    }
  }
  function turnTo(g, target, dt, rate) { const d = angDiff(target, g.hd), mx = 13 * dt; g.hd += clamp(d * (1 - Math.exp(-dt * rate)), -mx, mx); }
  function followPath(g, dt, mul) {
    const u = g.s / g.total;
    const m = keyAt(u, g.prof || [[0, 1], [1, 1]]);
    // turn before you go: if the bird faces away from where the path heads, it eases off while it turns
    const pd = pathAt(g.path, g.s), mis = Math.abs(angDiff(Math.atan2(pd.dy, pd.dx), g.hd));
    const align = clamp(1.15 - mis / 1.9, 0.12, 1);
    g.s = Math.min(g.total, g.s + Math.min(g.cap || 9999, g.spd * m * (mul || 1), capAt(g.path, g.s)) * align * dt);
    placeFromPath(g, dt);
    return g.s >= g.total - 0.01;
  }

  function updGull(g, dt) {
    g.t += dt; g.flap += dt * (g.state === 'form' ? 8 : 13) * (g.k === 'b' ? 0.7 : 1);
    if (g.wob > 0) g.wob -= dt; if (g.flash > 0) g.flash -= dt;
    switch (g.state) {
      case 'wait': g.delay -= dt; if (g.delay <= 0) { g.bonus ? startBonusFlight(g) : startEntry(g); } break;
      case 'bonus': if (followPath(g, dt, 1)) { gulls.splice(gulls.indexOf(g), 1); S.bonus.gone++; S.bonus.streak = 0; } break;
      case 'enter': if (followPath(g, dt, 1)) { g.state = 'form'; g.t = 0.5; } break;
      case 'form': {
        const live = liveOf(g.slot);
        g.x = live.x + Math.sin(g.flap * 0.35 + g.bob) * 1.2; g.y = live.y + Math.sin(g.flap * 0.5 + g.bob) * 1.6;
        turnTo(g, Math.PI / 2, dt, 9); g.vx = g.vy = 0;
        break;
      }
      case 'prep': g.t -= dt * 2; if (g.t <= 0) { g.t = 0; buildDive(g, g.prepArgs.side, g.prepArgs.tx, g.prepArgs.loop); } else { const live = liveOf(g.slot); g.x = live.x + Math.sin(g.flap * 3) * 1.4; g.y = live.y; } break;
      case 'dive': {
        const pr = params(S.stage), urg = isLast() ? 1.45 : clamp(S.urg || 1, 1, 1.5);
        g.spd = pr.diveSpd * (g.k === 't' ? 1.06 : 1); g.cap = g.k === 't' ? 470 : 640;
        const done = followPath(g, dt, urg);
        const u = g.s / g.total;
        g.dropCD -= dt;
        if (g.drops > 0 && g.dropCD <= 0 && u > g.uA && u < g.uB && S.phase === 'fight' && g.y > 170 && g.y < PY - 150 && (Math.abs(g.x - P.x) < 46 || u > g.uB * 0.9)) {
          dropSplat(g.x, g.y + 10); g.drops--; g.dropCD = 0.55; g.wob = 0.15;
        }
        if (done) { g.state = 'form'; g.t = isLast() ? 0.9 : 0.6; g.zig = 0; }
        break;
      }
      case 'benter': if (followPath(g, dt, 1)) { g.state = 'bpatrol'; g.ph = 0; } break;
      case 'bpatrol': case 'bhold': case 'bwarn': updBossHover(g, dt); break;
      case 'bsnatch': {
        const done = followPath(g, dt, 1);
        if (done) grabBasket(g);
        break;
      }
      case 'bcarry': if (followPath(g, dt, 1)) { g.state = 'bhold'; g.ph = 0; } break;
    }
  }

  function startBonusFlight(g) {
    g.path = makePath(g.pts); g.s = 0; g.total = g.path.total; g.state = 'bonus'; g.prof = [[0, 1], [1, 1]];
    const p = g.pts[0]; g.x = p[0]; g.y = p[1]; g.started = true; g.slot = null; g.hd = Math.PI / 2;
    g.spdBase = g.spd;
  }

  function updBossHover(g, dt) {
    const hold = bossHold(g);
    const calm = g.state === 'bwarn' ? 0.2 : 1;
    g.ph += dt * 0.85 * calm;
    let tx = hold.x + Math.sin(g.ph) * 74, ty = hold.y + Math.sin(g.ph * 1.7) * 6;
    if (g.state === 'bwarn') { tx = g.x; ty = hold.y - 8; }
    const k = 1 - Math.exp(-dt * 3);
    const ox = g.x, oy = g.y;
    g.x += (tx - g.x) * k; g.y += (ty - g.y) * k;
    if (g.state === 'bwarn') g.x += Math.sin(g.t * 60) * 1.4;
    turnTo(g, Math.PI / 2, dt, 8);
    g.vx = (g.x - ox) / dt; g.vy = (g.y - oy) / dt;
    if (S.phase !== 'fight') return;
    // splats from above
    g.dropT -= dt;
    if (g.dropT <= 0 && g.state !== 'bwarn') {
      dropSplat(g.x + rr(-16, 16), g.y + 24, 0.95); g.dropT = g.state === 'bhold' ? rr(1.7, 2.3) : rr(2.6, 3.6);
    }
    if (g.state === 'bpatrol') {
      if (basket.state === 'home') g.snatchT -= dt * (g.hp <= g.maxhp / 3 ? 1.5 : 1) * (gulls.some(x => x.k !== 'b') ? 1 : 1.5);
      if (g.snatchT <= 0 && basket.state === 'home' && !P.dead) {
        g.state = 'bwarn'; g.t = 0; g.warnT = 1.3;
        setBanner('THIEF!', g.name + ' is after your fries!', 1.6, '#ff8f7d'); sfx('alarm'); buzz(30);
      }
    } else if (g.state === 'bwarn') {
      g.warnT -= dt;
      if (g.warnT <= 0) beginSnatch(g);
    } else if (g.state === 'bhold') {
      g.munchT += dt;
      if (g.munchT >= 9) {
        g.munchT = 0;
        if (S.lives > 1) {
          S.lives--; sfx('munch'); S.shake = 4;
          pops.push({ x: g.x, y: g.y + 30, txt: '-1 FRY!', col: '#ff8f7d', sz: 20, t: 0, max: 1.2, vy: -30 });
          pt({ type: 'fry', x: g.x, y: g.y + 50, vx: 0, vy: -90, g: 0, rot: 0, vr: 3, max: 0.5 });
        }
      }
    }
  }
  function beginSnatch(g) {
    const dir = g.x < W / 2 ? 1 : -1, bx = basket.x, by = basket.y;
    const pts = [[g.x, g.y], [g.x - dir * 50, g.y - 24], [W / 2 + dir * 100, g.y + 110], [W / 2 - dir * 90, PY - 330], [W / 2 + dir * 70, PY - 190], [bx + dir * 8, by - 70], [bx, by - 38]];
    g.path = makePath(pts); g.s = 0; g.total = g.path.total; g.spd = 470;
    g.prof = [[0, 0.45], [0.2, 0.8], [0.7, 1.15], [1, 0.8]];
    g.state = 'bsnatch'; sfx('swoosh');
  }
  function grabBasket(g) {
    basket.state = 'carried'; g.carry = true; g.didSnatch = true; S.stolen = true; g.munchT = 0; g.grip = g.gripMax = 5 + 2 * Math.min(2, Math.floor(S.stage / 4) - 1);
    sfx('snatch'); buzz(60); S.shake = 6; S.hitstop = 0.06;
    burst(basket.x, basket.y - 10, 14, ['#ffe27a', '#f5b82e', '#fff'], 50, 200, 100, 1.2);
    setBanner('FRIES STOLEN!', 'Shoo the thief to get them back!', 2.2, '#ff8f7d');
    const dir = g.x < W / 2 ? 1 : -1, hold = bossHold(g);
    const pts = [[g.x, g.y], [g.x + dir * 70, g.y - 110], [W / 2 - dir * 60, PY - 330], [W / 2 + dir * 24, hold.y + 70], [W / 2, hold.y]];
    g.path = makePath(pts); g.s = 0; g.total = g.path.total; g.spd = 340; g.prof = [[0, 0.8], [1, 0.7]];
    g.state = 'bcarry';
  }

  function updBasket(dt) {
    const g = gulls.find(x => x.carry);
    if (basket.jolt > 0) basket.jolt -= dt;
    if (basket.state === 'carried' && g) { basket.x = g.x + Math.sin(S.t * 5) * 3 + (basket.jolt > 0 ? Math.sin(basket.jolt * 80) * 4 : 0); basket.y = g.y + 58; }
    else if (basket.state === 'carried') basket.state = 'falling';
    if (basket.state === 'falling') {
      basket.vy += 1500 * dt; basket.y += basket.vy * dt;
      basket.x += (W / 2 - basket.x) * (1 - Math.exp(-dt * 5));
      if (basket.y >= BY) {
        basket.y = BY;
        if (!basket.bounced) { basket.bounced = true; basket.vy = -Math.min(260, basket.vy * 0.3); sfx('basketLand'); buzz(15); burst(basket.x, BY, 8, ['#ffe27a', '#fff'], 40, 140, 120, 1); }
        else { basket.state = 'home'; basket.vy = 0; }
      }
    } else if (basket.state === 'home') { basket.x += (W / 2 - basket.x) * (1 - Math.exp(-dt * 6)); basket.y = BY; }
  }

  // ---------- main logic ----------
  function logic(dt) {
    S.stageT += dt;
    if (S.shake > 0) S.shake = Math.max(0, S.shake - dt * 30);
    if (S.flash > 0) S.flash = Math.max(0, S.flash - dt * 2.4);
    if (S.shown < S.score) S.shown = Math.min(S.score, S.shown + Math.max(7, (S.score - S.shown) * 8 * dt));
    if (S.comboT > 0) { S.comboT -= dt; if (S.comboT <= 0) S.combo = 1; }
    if (S.banner) { S.banner.t += dt; if (S.banner.t > S.banner.dur) S.banner = null; }
    if (S.toast) { S.toast.t += dt; if (S.toast.t > 2.6) S.toast = S.toastQ && S.toastQ.length ? { txt: S.toastQ.shift(), t: 0 } : null; }
    if (S.todK < 1) S.todK = Math.min(1, S.todK + dt / 3);
    S.phaseT += dt;

    // formation motion — speeds up as it thins out
    const alive = gulls.filter(g => !g.bonus && g.k !== 'b').length;
    const urg = 1 + (1 - alive / Math.max(1, S.total)) * 0.9; const bold = alive === 1 && S.kind === 'normal';
    if (bold && !S.lastCalled && S.phase === 'fight' && S.total > 1) {
      const lg = gulls.find(g => !g.bonus && g.k !== 'b');
      if (lg && lg.state !== 'wait' && lg.state !== 'enter') { S.lastCalled = true; pops.push({ x: clamp(lg.x, 60, W - 60), y: lg.y - 30, txt: 'LAST ONE!', col: '#ff8f7d', sz: 22, t: 0, max: 1.3, vy: -22 }); sfx('squawk', TYPES[lg.k].sq * 0.9, 0.3); }
    }
    F.ph += dt * (0.8 + 0.9 * (urg - 1)) * (bold ? 1.4 : 1); F.ph2 += dt * 1.6;
    F.dx = Math.sin(F.ph) * F.amp; F.spread = 1 + Math.sin(F.ph2) * 0.045;
    Snd.energy = S.kind === 'bonus' ? 0.2 : clamp((urg - 1) / 0.9, 0, 1);
    Snd.key = [0, 3, 5][S.tod || 0]; Snd.lowLife = S.lives === 1 && S.kind !== 'bonus'; Snd.comboLvl = S.combo;

    // player
    updPlayer(dt);
    // gulls
    for (let i = gulls.length - 1; i >= 0; i--) if (gulls[i]) updGull(gulls[i], dt);
    updBasket(dt); updBalloons(dt);
    if (S.phase === 'fight' || S.phase === 'intro') scheduleDives(dt);

    // bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i]; b.y += b.vy * dt;
      if (b.y < -20) { bullets.splice(i, 1); continue; }
      let hit = null, hr = 1e9;
      for (const g of gulls) {
        if (g.state === 'wait') continue;
        const rad = g.r + 6, dx = g.x - b.x, dy = g.y - b.y; if (dx * dx + dy * dy < rad * rad && dx * dx + dy * dy < hr) { hit = g; hr = dx * dx + dy * dy; }
      }
      if (hit) { bullets.splice(i, 1); burst(b.x, b.y, 9, ['#9fe0ff', '#fff', '#5cc2ff'], 50, 170, 260, 1.1); ring(b.x, b.y, 'rgba(170,230,255,.9)', 16, 0.22); damageGull(hit); }
    }

    // splats
    for (let i = splats.length - 1; i >= 0; i--) {
      const s = splats[i]; s.t += dt; s.vy += 120 * dt; s.y += s.vy * dt; if (s.vx) s.x = clamp(s.x + s.vx * dt, 8, W - 8);
      if (s.y > PY - 22 && s.y < PY + 18 && Math.abs(s.x - P.x) < 12 && !P.dead) { splats.splice(i, 1); burst(s.x, s.y, 8, ['#fff', '#cfd6b8'], 40, 160, 80, 1); hurtPlayer(); break; }
      if (s.y >= GROUND) { if (!P.dead && P.inv <= 0 && S.phase === 'fight' && Math.abs(s.x - P.x) < 36) nearMiss(s.x); splats.splice(i, 1); decals.push({ x: s.x, t: 0, r: vrr(0.8, 1.2) }); burst(s.x, GROUND, 5, ['#fff', '#cfd6b8'], 30, 120, 40, 0.9); sfx('splatLand'); }
    }
    // gull body contact with the player
    if (!P.dead && P.inv <= 0 && S.kind !== 'bonus') {
      for (const g of gulls) {
        if (g.state === 'wait' || g.k === 'b') continue;
        if (g.state === 'form' || g.state === 'enter' || g.state === 'prep') continue;
        if (g.state === 'dive' && !g.skim && Math.abs(g.y - (PY - 4)) < 18 && Math.abs(g.x - P.x) < 40 && Math.abs(g.x - P.x) > g.r * 0.5 + 9) { g.skim = true; nearMiss(g.x); }
        if (Math.hypot(g.x - P.x, g.y - (PY - 4)) < g.r * 0.5 + 7) { g.wob = 0.3; hurtPlayer(); break; } // it bumps you and flies on
      }
    }
    for (let i = decals.length - 1; i >= 0; i--) { decals[i].t += dt; if (decals[i].t > 3.2) decals.splice(i, 1); }

    // shooed gulls flapping away
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i]; f.t += dt; f.vx *= Math.exp(-dt * 0.6); f.vy += (-35 - f.vy) * dt * 1.2; f.x += (f.vx + Math.sin(f.t * 8 + f.ph) * 22) * dt; f.y += f.vy * dt; f.rot += f.vr * dt * (1 - f.t / f.dur);
      if (f.t > f.dur) flyers.splice(i, 1);
    }
    // particles
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life += dt; if (p.life >= p.max) { parts.splice(i, 1); continue; }
      p.vy += p.g * dt; if (p.drag) { const d = Math.exp(-p.drag * dt); p.vx *= d; p.vy *= d; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
    for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; p.t += dt; p.y += p.vy * dt; p.vy *= Math.exp(-dt * 1.6); if (p.t > p.max) pops.splice(i, 1); }

    // phase flow
    if (S.phase === 'intro') { if (S.phaseT > 1.7) { S.phase = 'fight'; S.phaseT = 0; } }
    else if (S.phase === 'fight') checkClear();
    else if (S.phase === 'clear') { if (S.phaseT > (S.kind === 'bonus' ? 3.4 : 2.3)) startStage(S.stage + 1); }
    else if (S.phase === 'dying') { S.dyingT += dt; if (S.dyingT > 1.5) gameOver(); }
  }

  function checkClear() {
    if (gulls.length) return;
    S.phase = 'clear'; S.phaseT = 0; S.stats.stagesCleared++;
    if (!S.tutMoved) S.tutMoved = true;
    if (!S.headless && !S.ai) { save.tutDone = true; persist(); }
    if (S.kind === 'bonus') {
      const b = S.bonus, perfect = b.hit === b.total;
      if (perfect) {
        setBanner('PERFECT!', b.hit + '/' + b.total + ' · +7,500', 3.2, '#9fffd0'); addScore(7500, W / 2, H * 0.4, '#9fffd0', true); sfx('perfect');
        if (S.lives < 5) { S.lives++; if (S.lives >= 5) award('full'); }
        award('perfect');
        for (let i = 0; i < 70; i++) pt({ type: 'conf', x: vrr(0, W), y: -10 - vr() * 80, vx: vrr(-30, 30), vy: vrr(60, 170), g: 40, rot: vr() * 6, vr: vrr(-8, 8), col: ['#ffe08a', '#ff6b5e', '#9fffd0', '#fff', '#a64fb8'][(vr() * 5) | 0], max: 3 });
      } else { setBanner('BONUS: ' + b.hit + '/' + b.total, b.hit >= b.total * 0.75 ? 'Nice shooing!' : 'Good try!', 2.8, '#ffe08a'); sfx('stageClear'); }
    } else {
      const flawless = S.stageHurts === 0;
      if (flawless && S.stage >= 5) award('flawless');
      if (S.stage >= 3 && S.stShots >= 20 && S.stHits / S.stShots >= 0.85) award('sharp');
      let bonus = 500 + S.stage * 100 + (flawless ? 1000 : 0);
      addScore(bonus, W / 2, H * 0.42, '#ffe08a', true);
      setBanner('STAGE CLEAR!', flawless ? 'Flawless bonus!' : 'Clear bonus', 2.0, '#ffe08a'); sfx('stageClear');
    }
    commitBest();
  }

  function gameOver() {
    S.phase = 'over'; commitBest();
    let dailyNB = false;
    if (S.mode === 'daily' && !S.headless && !S.ai) {
      if (save.daily.day !== S.day) save.daily = { day: S.day, best: 0, plays: 0 };
      save.daily.plays++; dailyNB = S.score > save.daily.best; if (dailyNB) save.daily.best = S.score;
      if (medalOf(S.score) === 'Gold') award('gold');
      if (save.lastDaily !== S.day) { save.streak = save.lastDaily === yesterday() ? (save.streak || 0) + 1 : 1; save.lastDaily = S.day; save.dailyDays = (save.dailyDays || 0) + 1; }
      if (save.dailyDays >= 3) award('daily');
      persist();
    }
    const st = S.stats, acc = st.shots ? Math.round(st.hits / st.shots * 100) : 0;
    const nb = S.score > (S.prevBest || 0) && (S.mode !== 'daily' || (dailyNB && save.daily.plays > 1));
    S.over = { acc };
    { const tgt = S.score, t0 = performance.now(), el = $('#ovScore'); el.textContent = '0'; // score counts up
      const tick = () => { const k = Math.min(1, (performance.now() - t0) / 900), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(tgt * e); if (k < 1 && S.screen === 'over') requestAnimationFrame(tick); else el.textContent = fmt(tgt); };
      requestAnimationFrame(tick); } $('#ovBest').textContent = fmt(S.mode === 'daily' ? save.daily.best : save.best);
    $('#ovBestLbl').textContent = S.mode === 'daily' ? 'TODAY\'S BEST' : 'BEST'; $('#ovStage').textContent = S.stage;
    $('#ovAcc').textContent = acc + '%'; $('#ovShooed').textContent = st.shooed; $('#ovCombo').textContent = 'x' + st.maxCombo;
    $('#newBest').style.display = nb ? 'inline-block' : 'none';
    $('#overSub').textContent = acc >= 60 ? 'Sharp aim! The gulls got the fries anyway.' : 'The gulls ate your picnic.';
    // one more go: give the player a concrete next target
    const bossUp = S.kind === 'boss' && gulls.some(g => g.k === 'b'), nextBoss = Math.ceil((S.stage + (bossUp ? 0 : 1)) / 4) * 4, bname = BOSS_NAMES[(nextBoss / 4 - 1) % BOSS_NAMES.length];
    let goal;
    if (S.kind === 'boss' && gulls.some(g => g.k === 'b')) goal = 'So close! <b>' + bname + '</b> is still out there.';
    else if (!(save.bestStage >= nextBoss)) goal = 'Next up: <b>' + bname + '</b> at Stage ' + nextBoss + '.';
    else goal = 'Reach <b>Stage ' + (Math.max(save.bestStage || 0, S.stage) + 1) + '</b> for a new record.';
    if (nb && !S.prevBest) goal = 'First score on the board! ' + goal;
    else if (nb) goal = 'New best by <b>' + fmt(S.score - (S.prevBest || 0)) + '</b>! ' + goal;
    else if (save.best > S.score) goal = '<b>' + fmt(save.best - S.score) + '</b> more for a new best. ' + goal;
    if (S.mode === 'daily') {
      const mod = MODS.find(m => m.key === S.mod) || {};
      const md = medalOf(S.score), nx = MEDALS.slice().reverse().find(m => S.score < m[1]);
      goal = '<b>Daily Picnic · ' + mod.name + '</b><br>' + (md ? '<span class="medal m' + md + '">' + md.toUpperCase() + '</span> ' : '') + (nx ? fmt(nx[1] - S.score) + ' more for ' + nx[0] + '. ' : 'Top medal! ') + (save.streak > 1 ? save.streak + '-day streak. ' : '') + 'New picnic tomorrow.';
    }
    const NEXTP = ['hero', 'boss1', 'flawless', 'sharp', 'combo8', 'perfect', 'balloon4', 'quick', 'full', 'boss2', 'daily', 'st12', 'gold', 'k100', 'st16'];
    const np = !S.newPatches.length && PATCHES.find(p => p[0] === NEXTP.find(id => !save.patches[id]));
    if (np) goal += '<br><span class="newp">Next patch: ' + np[1] + ' — ' + np[2] + '</span>';
    if (S.newPatches.length) goal += '<br><span class="newp">New patch' + (S.newPatches.length > 1 ? 'es' : '') + ': ' + S.newPatches.join(', ') + '</span>';
    $('#ovGoal').innerHTML = goal;
    sfx('over'); if (nb) setTimeout(() => sfx('best'), 700);
    Snd.setMode('off');
    go('over');
  }

  // ---------- player ----------
  function updPlayer(dt) {
    if (S.ai) aiControl(dt);
    else if (!pointers.size) {
      const dir = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      if (dir) P.tx = clamp(P.tx + dir * 380 * dt, 16, W - 16);
    }
    // finger offset eases away so the player ends up exactly under the finger
    const dx = P.tx - P.x, mv = clamp(dx * (1 - Math.exp(-dt * 22)), -1100 * dt, 1100 * dt);
    const px0 = P.x; P.x = clamp(P.x + mv, 16, W - 16); P.vx = lerp(P.vx || 0, (P.x - px0) / dt, 1 - Math.exp(-dt * 14));
    if (P.inv > 0) P.inv -= dt;
    P.recoil = Math.max(0, P.recoil - dt * 8);
    P.cool -= dt;
    const firing = (pointers.size > 0 || keys.fire || (S.ai && S.ai.fire)) && !P.dead && (S.phase === 'fight' || S.phase === 'intro');
    if (firing && P.cool <= 0) {
      const lim = P.double ? 8 : 5;
      if (bullets.length < lim) {
        if (P.double) { bullets.push({ x: P.x - 11, y: PY - 40, vy: -780 }, { x: P.x + 11, y: PY - 40, vy: -780 }); S.stats.shots += 2; S.stShots += 2; }
        else { bullets.push({ x: P.x, y: PY - 42, vy: -780 }); S.stats.shots++; S.stShots++; }
        P.cool = 0.22; P.recoil = 1; sfx('shoot', P.double);
        if (!S.headless) { // muzzle splash: a little spray cone + puff ring at each nozzle
          (P.double ? [-11, 11] : [0]).forEach(ox => {
            for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + vrr(-0.7, 0.7), sp = vrr(50, 130); pt({ x: P.x + ox, y: PY - 40, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 260, drag: 2, sz: vrr(1, 1.8), col: i ? '#bfeaff' : '#ffffff', max: vrr(0.18, 0.3) }); }
            pt({ type: 'ring', x: P.x + ox, y: PY - 40, col: 'rgba(200,240,255,.8)', sz: 9, max: 0.16 });
          });
        }
      }
    }
  }

  // ---------- AI (testing only) ----------
  function aiControl(dt) {
    const a = S.ai; a.fire = true;
    if (S.meter >= 1 && gulls.some(g => (g.state === 'dive' || g.carry) && g.y > PY - 330 && Math.abs(g.x - P.x) < 70)) throwBalloon();
    a.cd = (a.cd || 0) - dt; if (a.cd > 0) return; a.cd = 0.1;
    // pick target
    let tgt = null, best = -1e9;
    const lead = (g) => g.x + (g.vx || 0) * clamp((PY - g.y) / 780, 0, 1);
    for (const g of gulls) {
      if (g.state === 'wait') continue;
      let sc = g.y;
      if (g.carry) sc += 2000; else if (g.k === 'b' && g.state === 'bsnatch') sc += 900; else if (isDiving(g) || g.state === 'dive') sc += 600;
      if (g.bonus) sc = g.y + (g.vy > 0 ? 100 : 0);
      if (sc > best) { best = sc; tgt = g; }
    }
    let tx = tgt ? lead(tgt) : W / 2;
    let bestX = P.x, bestSc = -1e9;
    for (let x = 20; x <= W - 20; x += 10) {
      let sc = -Math.abs(x - tx) * 0.05 - Math.abs(x - P.x) * 0.004;
      for (const s of splats) { const tl = (GROUND - s.y) / s.vy; if (tl < 1.4 && Math.abs(x - s.x) < 22 + (a.skill ? 0 : 6)) sc -= 6; }
      for (const g of gulls) {
        if (g.state !== 'dive' && g.state !== 'prep') continue;
        const ty = (PY - g.y) / Math.max(120, (g.vy || 150)); const px = g.x + (g.vx || 0) * clamp(ty, 0, 1.2);
        if (g.y > PY - 330 && (Math.abs(x - g.x) < 36 || Math.abs(x - px) < 36)) sc -= 4 * (1 + clamp((g.y - 300) / 300, 0, 1));
      }
      if (sc > bestSc) { bestSc = sc; bestX = x; }
    }
    const maxStep = (a.speed || 400) * 0.1;
    P.tx = clamp(P.x + clamp(bestX - P.x, -maxStep, maxStep), 16, W - 16);
  }

  // ---------- title demo ----------
  function initDemo() {
    demo = [];
    for (let i = 0; i < 9; i++) demo.push({ k: ['g', 'g', 'h', 't', 'g'][i % 5], a: i * 0.7, r: 60 + (i % 3) * 22, cx: 50 + i * 32, cy: 0, sp: 0.5 + (i % 3) * 0.12, ph: i });
  }

  // ---------- rendering ----------
  function text(str, x, y, size, col, align, stroke, font) {
    ctx.font = (font || '') + size + "px Bangers, 'Arial Black', Impact, sans-serif"; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    if (stroke) { ctx.lineWidth = stroke; ctx.strokeStyle = '#2b1442'; ctx.strokeText(str, x, y); }
    ctx.fillStyle = col || '#fff'; ctx.fillText(str, x, y);
  }
  function sprite(key, frame, x, y, rot, sx, sy, alpha, w, h) {
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); if (sx !== 1 || sy !== 1) ctx.scale(sx, sy); if (alpha !== undefined && alpha < 1) ctx.globalAlpha = alpha;
    Art.blit(ctx, key, frame, w, h); ctx.restore();
  }

  function drawGull(g) {
    const T = TYPES[g.k]; let key = T.spr; if (g.k === 'h' && g.ruffled) key = 'ruffled';
    const fr = Math.floor(((Math.sin(g.flap) + 1) * 0.5) * 2.999);
    const f = g.state === 'form' ? [1, 2, 1, 0][Math.floor(g.flap * 0.9) & 3] : fr;
    const diving = g.state === 'dive' || g.state === 'bsnatch' || g.state === 'bonus' || g.state === 'bcarry';
    const stretch = diving ? 1.08 : 1, squash = g.wob > 0 ? 1 + Math.sin(g.wob * 40) * 0.1 : 1;
    const rot = g.hd - Math.PI / 2;
    ctx.save(); ctx.translate(g.x, g.y); ctx.rotate(rot);
    ctx.scale(squash / stretch, squash * stretch);
    Art.blit(ctx, key, f);
    if (g.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (0.75 * g.flash / 0.14) + ')'; ctx.beginPath(); ctx.arc(0, 0, g.r + 3, 0, 7); ctx.fill(); }
    ctx.restore();
    if (g.k === 'h' && g.hp === 1 && g.maxhp === 2) { /* ruffled sprite shows the damage */ }
    if (g.state === 'dive' && g.s / g.total < 0.07) { text('!', g.x, g.y - 22, 20, '#ffd23a', 'center', 4); }
    if (g.state === 'prep') { ctx.fillStyle = 'rgba(255,90,70,.9)'; text('!', g.x, g.y - 20, 20, '#ffd23a', 'center', 4); }
  }

  function drawBG() {
    const tt = S.screen === 'title' ? 0 : S.tod || 0, tf = S.screen === 'title' ? 0 : S.todFrom || 0, tk = S.screen === 'title' ? 1 : clamp(S.todK === undefined ? 1 : S.todK, 0, 1);
    if (bgs[tf]) ctx.drawImage(bgs[tf], 0, 0, W, H);
    if (tk < 1 && bgs[tt]) { ctx.globalAlpha = tk; ctx.drawImage(bgs[tt], 0, 0, W, H); ctx.globalAlpha = 1; }
    else if (tt !== tf && bgs[tt]) ctx.drawImage(bgs[tt], 0, 0, W, H);
    const dark = S.screen === 'title' ? 0 : lerp(tf, tt, tk);
    if (dark > 0.2) { // fireflies over the lawn and twinkling string lights after sunset
      const shore = H * 0.7;
      for (let i = 0; i < 14; i++) {
        const fx = (i * 53 + Math.sin(S.t * 0.4 + i * 1.7) * 30 + S.t * (i % 2 ? 6 : -5)) % (W + 20), fy = shore + 10 + ((i * 37) % 60) + Math.sin(S.t * 0.9 + i) * 8;
        const a = Math.max(0, Math.sin(S.t * (1.3 + (i % 3) * 0.4) + i * 2.1)) * Math.min(1, dark - 0.2);
        if (a < 0.05) continue;
        const gx = (fx + W + 20) % (W + 20) - 10;
        ctx.fillStyle = 'rgba(220,255,140,' + (a * 0.25).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(gx, fy, 5, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(240,255,190,' + (a * 0.95).toFixed(3) + ')'; ctx.beginPath(); ctx.arc(gx, fy, 1.4, 0, 7); ctx.fill();
      }
    }
    // drifting clouds + sparkles on the lake
    const t = S.t;
    for (let i = 0; i < 4; i++) {
      const cx = ((i * 140 + t * (4 + i * 1.5)) % (W + 160)) - 80, cy = 40 + i * 52 + Math.sin(i * 3) * 10, w = 70 + i * 16;
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, w); g.addColorStop(0, 'rgba(255,200,190,.22)'); g.addColorStop(1, 'rgba(255,170,170,0)');
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.22); ctx.translate(-cx, -cy); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, w, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    if (S.wind && S.screen !== 'title') { // breezy day: drifting wind streaks
      ctx.lineCap = 'round';
      for (let i = 0; i < 11; i++) {
        const sp = Math.abs(S.wind) * 4, x = ((i * 97 + t * sp) % (W + 120)) - 60, xx = S.wind > 0 ? x : W - x, y = 140 + ((i * 71) % (H * 0.55)), dir = Math.sign(S.wind);
        const a = 0.55 * Math.sin(((i * 97 + t * sp) % (W + 120)) / (W + 120) * Math.PI);
        ctx.strokeStyle = 'rgba(255,245,230,' + a.toFixed(2) + ')'; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(xx, y); ctx.bezierCurveTo(xx - dir * 16, y - 5, xx - dir * 30, y + 4, xx - dir * 52, y - 1); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    { // a little ferry crosses the lake every ~45 s so the lower half isn't frozen
      const per = 45, k = ((t + 12) % per) / per, fx = -60 + k * (W + 120), fy = Math.round(H * 0.5) + 30 + Math.sin(t * 1.3) * 0.8;
      ctx.fillStyle = 'rgba(30,14,48,.9)';
      ctx.beginPath(); ctx.moveTo(fx - 26, fy); ctx.lineTo(fx + 28, fy); ctx.lineTo(fx + 22, fy + 6); ctx.lineTo(fx - 22, fy + 6); ctx.closePath(); ctx.fill();
      ctx.fillRect(fx - 16, fy - 7, 30, 7); ctx.fillRect(fx - 6, fy - 12, 12, 5); ctx.fillRect(fx + 2, fy - 18, 3, 6);
      ctx.fillStyle = dark > 0.3 ? 'rgba(255,220,130,.95)' : 'rgba(255,230,190,.5)';
      for (let w = 0; w < 5; w++) ctx.fillRect(fx - 13 + w * 6, fy - 5, 3, 2.4);
      ctx.strokeStyle = 'rgba(255,240,220,.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(fx - 28, fy + 7); ctx.lineTo(fx - 70, fy + 9); ctx.stroke();
    }
    const hz = Math.round(H * 0.5);
    ctx.fillStyle = dark > 1.5 ? 'rgba(220,225,255,.8)' : 'rgba(255,240,200,.7)';
    for (let i = 0; i < (dark > 0.5 ? 26 : 14); i++) { const sx = (i * 61 + Math.sin(t * 0.8 + i) * 8) % W, sy = hz + 8 + ((i * 37) % (H * 0.18)); if (Math.sin(t * 2.3 + i * 1.7) > 0.6) ctx.fillRect(sx, sy, 2.2, 1.2); }
  }

  function drawWarnings() {
    // splat shadows on the ground
    for (const s0 of splats) {
      const s = s0.vx ? { x: landX(s0), y: s0.y, y0: s0.y0 } : s0;
      const f = clamp((s.y - s.y0) / Math.max(40, GROUND - s.y0), 0, 1);
      const rx = 7 + 9 * f, a = 0.4 + 0.5 * f, pul = 1 + Math.sin(S.t * 18) * 0.08 * f;
      ctx.fillStyle = 'rgba(30,8,40,' + a * 0.8 + ')'; ctx.beginPath(); ctx.ellipse(s.x, GROUND, rx * pul, rx * 0.36 * pul, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,240,150,' + (0.7 + 0.3 * f) + ')'; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.ellipse(s.x, GROUND, (rx + 6 - 4 * f) * pul, (rx + 6 - 4 * f) * 0.36 * pul, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      if (f > 0.35) { ctx.strokeStyle = 'rgba(255,230,120,' + 0.35 * f + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(s.x, GROUND - 4); ctx.lineTo(s.x, s.y + 8); ctx.stroke(); }
    }
    for (const d of decals) {
      const a = Math.min(1, (3.2 - d.t) / 1.2);
      ctx.fillStyle = 'rgba(240,243,225,' + 0.8 * a + ')'; ctx.beginPath(); ctx.ellipse(d.x, GROUND, 9 * d.r, 3.4 * d.r, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(150,160,120,' + 0.7 * a + ')'; ctx.beginPath(); ctx.ellipse(d.x + 2, GROUND, 3.5 * d.r, 1.4 * d.r, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (basket.state === 'carried') { // empty spot where the fries belong
      ctx.strokeStyle = 'rgba(255,240,214,.55)'; ctx.lineWidth = 2; ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.ellipse(W / 2, BY + 10, 28, 9, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    }
    // thief warning: pulsing ring on the basket + dotted line from the boss
    const b = gulls.find(g => g.k === 'b' && (g.state === 'bwarn' || g.state === 'bsnatch'));
    if (b && basket.state === 'home') {
      const k = (Math.sin(S.t * 14) + 1) / 2;
      ctx.strokeStyle = 'rgba(255,90,70,' + (0.55 + 0.4 * k) + ')'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(basket.x, BY + 4, 38 + k * 5, 24 + k * 3, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([4, 6]); ctx.lineDashOffset = -S.t * 40; ctx.strokeStyle = 'rgba(255,220,200,.55)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(b.x, b.y + 28); ctx.lineTo(basket.x, BY - 22); ctx.stroke(); ctx.setLineDash([]);
      text('!', basket.x, BY - 30 - k * 4, 30, '#ffd23a', 'center', 6);
    }
  }

  function drawBasket(bx, by, n) {
    sprite('basket' + clamp(n, 0, 5), 0, bx, by, 0, 1, 1);
  }

  function drawPlayer() {
    const blink = P.inv > 0 && Math.floor(S.t * 18) % 2 === 0;
    // shadow
    ctx.fillStyle = 'rgba(20,6,30,.32)'; ctx.beginPath(); ctx.ellipse(P.x, PY + 30, 17, 5, 0, 0, Math.PI * 2); ctx.fill();
    if (P.dead) {
      const t = S.dyingT; ctx.save(); ctx.translate(P.x, PY + 4 + t * 4); ctx.rotate(Math.min(1.4, t * 3) * 0.7); Art.blit(ctx, 'kid', 0); ctx.restore();
      for (let i = 0; i < 3; i++) { const a = S.t * 6 + i * 2.1; sprite('star', 0, P.x + Math.cos(a) * 18, PY - 34 + Math.sin(a) * 6, a, 1, 1); }
      return;
    }
    if (blink) ctx.globalAlpha = 0.45;
    const sq = 1 - P.recoil * 0.07, sp = Math.min(1, Math.abs(P.vx || 0) / 220);
    const hop = Math.abs(Math.sin(S.t * 17)) * 2.4 * sp, breathe = 1 + Math.sin(S.t * 3) * 0.015 * (1 - sp), lean = clamp((P.vx || 0) / 1400, -0.16, 0.16);
    ctx.save(); ctx.translate(P.x, PY + 26 - hop); ctx.rotate(lean); ctx.scale(1.1 * (1 + P.recoil * 0.05), 1.1 * sq * breathe); ctx.translate(0, -26); Art.blit(ctx, P.double ? 'kid2' : 'kid', 0); ctx.restore();
    ctx.globalAlpha = 1;
  }

  let lastMeter = -1, lastReady = null;
  function syncBalloonBtn() {
    const show = S.screen === 'play' && S.kind !== 'bonus', m = show ? Math.round((S.meter || 0) * 40) / 40 : -1, ready = show && balloonReady();
    if (m !== lastMeter) { lastMeter = m; balloonBtn.style.display = show ? '' : 'none'; balloonBtn.style.setProperty('--fill', Math.round(Math.max(0, m) * 100) + '%'); }
    if (ready !== lastReady) { lastReady = ready; balloonBtn.classList.toggle('ready', ready); }
  }
  function drawHUD() {
    const y0 = insetTopW;
    const sg = ctx.createLinearGradient(0, 0, 0, y0 + 100); sg.addColorStop(0, 'rgba(20,8,40,.42)'); sg.addColorStop(1, 'rgba(20,8,40,0)'); ctx.fillStyle = sg; ctx.fillRect(0, 0, W, y0 + 100);
    text(fmt(S.shown), 12, y0 + 30, 30, '#fff4d6', 'left', 5);
    // fries
    sprite('basket' + clamp(S.lives, 0, 5), 0, 30, y0 + 56, 0, 0.62, 0.62);
    text('x' + S.lives, 56, y0 + 62, 20, '#fff4d6', 'left', 4);
    if (S.stolen) text('STOLEN!', 84, y0 + 62, 15, '#ff8f7d', 'left', 3.5);
    // stage + tag
    const lbl = S.kind === 'bonus' ? 'BONUS' : 'STAGE ' + S.stage;
    text(lbl, 266, y0 + 30, 22, S.kind === 'bonus' ? '#9fffd0' : '#ffe08a', 'right', 4.5);
    if (P.double) { const k = 1 + Math.sin(S.t * 8) * 0.04; ctx.save(); ctx.translate(266, y0 + 54); ctx.scale(k, k); text('DOUBLE BLASTER', 0, 0, 14, '#9fe0ff', 'right', 3.5); ctx.restore(); }
    else if (S.kind === 'bonus' && S.bonus) text(S.bonus.hit + '/' + S.bonus.total, 266, y0 + 54, 15, '#fff4d6', 'right', 3.5);
    else if (S.mode === 'daily') text('DAILY · ' + (MODS.find(m => m.key === S.mod) || {}).name, 266, y0 + 54, 13, '#9fffd0', 'right', 3);
    else if (S.prevBest > 0 && S.score > S.prevBest) text('NEW BEST!', 266, y0 + 54, 14, '#ffe08a', 'right', 3.5);
    else if (S.prevBest > 0) text('BEST ' + fmt(S.prevBest), 266, y0 + 54, 13, '#ffd9bd', 'right', 3);
    // combo
    if (S.combo > 1) {
      const k = 1 + Math.min(0.3, (S.combo - 1) * 0.045) + Math.max(0, S.comboT - 3.1) * 1.0;
      ctx.save(); ctx.translate(14, y0 + 90); ctx.scale(k, k);
      text('COMBO x' + S.combo, 0, 0, 22, '#ffe08a', 'left', 4.5);
      ctx.restore();
      ctx.fillStyle = 'rgba(43,20,66,.7)'; ctx.fillRect(14, y0 + 97, 90, 6);
      ctx.fillStyle = '#ffe08a'; ctx.fillRect(15, y0 + 98, 88 * clamp(S.comboT / 3.4, 0, 1), 4);
    }
    // boss name + health bar (always visible)
    const b = gulls.find(g => g.k === 'b');
    if (b && b.state !== 'wait') {
      const bw = 116, bx = 266 - bw, by = y0 + 81, bh = 12, f = clamp(b.hp / b.maxhp, 0, 1);
      if (b.ghost === undefined || b.ghost < f) b.ghost = f;
      b.ghost += (f - b.ghost) * 0.06; // the lost chunk drains away after a hit
      text(b.name.toUpperCase(), 266, y0 + 77, 13, b.carry ? '#ff8f7d' : '#ffd9bd', 'right', 3.5);
      const rrect = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
      rrect(bx - 2, by - 2, bw + 4, bh + 4, 7); ctx.fillStyle = '#2b1442'; ctx.fill();
      rrect(bx, by, bw, bh, 5); ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fill();
      if (b.ghost > f) { rrect(bx, by, bw * b.ghost, bh, 5); ctx.fillStyle = '#fff4d6'; ctx.fill(); }
      if (f > 0) { rrect(bx, by, Math.max(10, bw * f), bh, 5); const hg = ctx.createLinearGradient(0, by, 0, by + bh); hg.addColorStop(0, '#ff9a8a'); hg.addColorStop(0.5, '#ff6b5e'); hg.addColorStop(1, '#c42f55'); ctx.fillStyle = hg; ctx.fill(); if (b.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,.45)'; ctx.fill(); } }
      ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(bx + 4, by + 2, Math.max(0, bw * f - 8), 2);
    }
  }

  function drawBannerAndTutorial() {
    const b = S.banner;
    if (b && S.screen === 'play') {
      const inT = easeBack(b.t / 0.35), outA = b.t > b.dur - 0.4 ? clamp((b.dur - b.t) / 0.4, 0, 1) : 1;
      const y = H * 0.47;
      ctx.save(); ctx.globalAlpha = outA * 0.92; ctx.translate(W / 2, y); ctx.scale(inT, inT); ctx.rotate(-0.04);
      text(b.txt, 0, 0, b.txt.length > 12 ? 36 : 46, b.col, 'center', 8);
      if (b.sub) text(b.sub, 0, 26, 16, '#fff4d6', 'center', 4);
      ctx.restore();
    }
    if (S.toast && S.screen === 'play') { // patch earned: a stitched badge slides up
      const t = S.toast.t, inK = easeBack(t / 0.4), outA = t > 2.2 ? clamp((2.6 - t) / 0.4, 0, 1) : 1, y = H * 0.6 + (1 - inK) * 40;
      ctx.save(); ctx.globalAlpha = outA; ctx.translate(W / 2, y);
      ctx.fillStyle = 'rgba(255,240,200,.95)'; ctx.strokeStyle = '#2b1442'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, 112, 26, 0, 0, 7); ctx.fill(); ctx.stroke();
      ctx.setLineDash([4, 4]); ctx.strokeStyle = '#c42f55'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(0, 0, 104, 20, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.font = "900 10px Nunito, sans-serif"; ctx.textAlign = 'center'; ctx.fillStyle = '#c42f55'; ctx.fillText('PATCH EARNED', 0, -6);
      text(S.toast.txt.toUpperCase(), 0, 13, 18, '#2b1442', 'center', 0);
      ctx.restore();
    }
    // ghost hand on the very first stage
    if (S.screen === 'play' && S.stage === 1 && !S.tutMoved && !save.tutDone && S.phase !== 'dying') {
      const hx = W / 2 + Math.sin(S.t * 1.7) * 80, hy = PY + 108 + Math.sin(S.t * 3.4) * 3;
      ctx.fillStyle = 'rgba(255,255,255,.2)'; ctx.beginPath(); ctx.arc(hx, hy, 26, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.arc(hx, hy, 12, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(hx, hy, 26, 0, 7); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      [-1, 1].forEach(d => { ctx.beginPath(); ctx.moveTo(hx + d * 52, hy); ctx.lineTo(hx + d * 41, hy - 8); ctx.lineTo(hx + d * 41, hy + 8); ctx.closePath(); ctx.fill(); });
      text('DRAG TO MOVE · IT FIRES AUTOMATICALLY', W / 2, PY + 150, 17, '#fff4d6', 'center', 5);
    }
  }

  function drawParticles() {
    for (const p of parts) {
      const k = p.life / p.max, a = 1 - k * k;
      if (p.type === 'dot') { ctx.globalAlpha = a; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.sz * (1 - k * 0.5), 0, 7); ctx.fill(); }
      else if (p.type === 'ring') { ctx.globalAlpha = 1 - k; ctx.strokeStyle = p.col; ctx.lineWidth = 3 * (1 - k) + 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.sz * ease(k), 0, 7); ctx.stroke(); }
      else if (p.type === 'puff') { ctx.globalAlpha = 0.55 * (1 - k); ctx.fillStyle = '#fff8ee'; ctx.beginPath(); ctx.arc(p.x, p.y, p.sz * (0.6 + 0.7 * ease(k)), 0, 7); ctx.fill(); }
      else if (p.type === 'conf') { ctx.globalAlpha = Math.min(1, a * 1.5); ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col; ctx.fillRect(-3, -2, 6, 4); ctx.restore(); }
      else { ctx.globalAlpha = a; sprite(p.type === 'fry' ? 'fry' : p.type, 0, p.x, p.y, p.rot, p.sz, p.sz); }
    }
    ctx.globalAlpha = 1;
  }

  function drawFlyers() {
    for (const f of flyers) {
      const k = f.t / f.dur, a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      const pop = f.pop ? 1 + 0.35 * Math.max(0, 1 - f.t / 0.2) : 1;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(f.x, f.y); ctx.rotate(f.rot); const sc = 1 + Math.sin(f.t * 14) * 0.05; ctx.scale(sc * pop, pop / sc);
      Art.blit(ctx, f.spr, 0); ctx.restore();
      for (let i = 0; i < 3; i++) { const ang = f.t * 7 + i * 2.09, rx = f.boss ? 40 : 16; ctx.globalAlpha = a; sprite('star', 0, f.x + Math.cos(ang) * rx, f.y - (f.boss ? 44 : 18) + Math.sin(ang) * rx * 0.3, ang, f.boss ? 1.6 : 1, f.boss ? 1.6 : 1); }
      ctx.globalAlpha = 1;
    }
  }

  function drawPops() {
    for (const p of pops) {
      const k = p.t / p.max, sc = easeBack(Math.min(1, p.t / 0.18));
      ctx.save(); ctx.globalAlpha = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1; ctx.translate(p.x, p.y); ctx.scale(sc, sc);
      text(p.txt, 0, 0, p.sz, p.col, 'center', 4); ctx.restore();
    }
  }

  function drawDebugPaths() {
    ctx.save();
    ctx.lineWidth = 1.5;
    if (S.debugPaths === 'all') ENTRY.forEach((t, i) => {
      ['rgba(255,255,0,.9)', 'rgba(0,255,255,.9)'].forEach((c, m) => {
        const pts = t.map(p => [m ? W - p[0] : p[0], p[1]]); pts.push([m ? 100 : 260, F_Y0 - 52], [m ? 100 : 260, F_Y0]);
        const path = makePath(pts); ctx.strokeStyle = c; ctx.beginPath();
        for (let s = 0; s <= path.total; s += 4) { const q = pathAt(path, s); if (s === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); }
        ctx.stroke();
      });
    });
    gulls.forEach(g => { if (g.path) { ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.beginPath(); for (let s = 0; s <= g.path.total; s += 4) { const q = pathAt(g.path, s); if (s === 0) ctx.moveTo(q.x, q.y); else ctx.lineTo(q.x, q.y); } ctx.stroke(); } });
    ctx.restore();
  }

  function render() {
    ctx.setTransform(cv.width / W, 0, 0, cv.width / W, 0, 0);
    ctx.save();
    if (S.shake > 0.05 && !S.paused) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
    drawBG();
    if (S.screen === 'title') {
      demo.forEach(d => {
        d.a += 0.016 * d.sp; const x = d.cx + Math.sin(d.a * 2) * d.r * 0.6 + 30 * Math.sin(S.t * 0.5 + d.ph), y = H * 0.905 + (d.ph % 3) * 8 + Math.sin(d.a * 3 + d.ph) * 12;
        const vx = Math.cos(d.a * 2) * 2 * d.r * 0.6 * d.sp, vy = Math.cos(d.a * 3 + d.ph) * 3 * 36 * d.sp; const hd = Math.atan2(vy + 30, vx);
        const T = TYPES[d.k]; ctx.save(); ctx.translate(x, y); ctx.rotate(hd - Math.PI / 2 + 0.0); Art.blit(ctx, T.spr, Math.floor(((Math.sin(S.t * 12 + d.ph) + 1) / 2) * 2.99)); ctx.restore();
      });
    } else {
      drawWarnings();
      if (basket.state !== 'carried') drawBasket(basket.x, basket.y, S.lives);
      drawPlayer();
      const order = gulls.slice().sort((a, b) => (a.state === 'form' ? 0 : a.k === 'b' ? 2 : 1) - (b.state === 'form' ? 0 : b.k === 'b' ? 2 : 1));
      for (const g of order) { if (g.state === 'wait') continue; drawGull(g); }
      const carrier = gulls.find(g => g.carry);
      if (carrier && basket.state === 'carried') {
        const nervous = carrier.state === 'bhold' && carrier.munchT > 6.5 ? Math.sin(S.t * 50) * 1.6 : 0;
        ctx.strokeStyle = 'rgba(43,20,66,.8)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(carrier.x - 8, carrier.y + 24); ctx.lineTo(basket.x - 14 + nervous, basket.y - 8); ctx.moveTo(carrier.x + 8, carrier.y + 24); ctx.lineTo(basket.x + 14 + nervous, basket.y - 8); ctx.stroke(); drawBasket(basket.x + nervous, basket.y, S.lives);
        // munch timer: the arc fills up until the thief eats a fry
        if (carrier.state === 'bhold' && S.lives > 1) {
          const k = clamp(carrier.munchT / 9, 0, 1);
          ctx.lineCap = 'round'; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(43,20,66,.55)'; ctx.beginPath(); ctx.arc(basket.x, basket.y + 4, 34, 0, 7); ctx.stroke();
          ctx.strokeStyle = k > 0.72 ? (Math.floor(S.t * 8) % 2 ? '#ff6b5e' : '#ffd23a') : '#ff8f7d'; ctx.beginPath(); ctx.arc(basket.x, basket.y + 4, 34, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke(); ctx.lineCap = 'butt';
        }
        // target ring on the thief: this is who you shoot
        const pr = 1 + Math.sin(S.t * 9) * 0.06, R = 48 * pr;
        ctx.save(); ctx.translate(carrier.x, carrier.y); ctx.rotate(S.t * 1.5);
        ctx.strokeStyle = 'rgba(255,214,90,.9)'; ctx.lineWidth = 2.5; ctx.setLineDash([10, 8]); ctx.beginPath(); ctx.arc(0, 0, R, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(R - 7, 0); ctx.lineTo(R + 7, 0); ctx.stroke(); }
        ctx.restore();
        for (let k = 0; k < (carrier.gripMax || 0); k++) { // grip pips: each hit knocks one out
          const px = carrier.x - ((carrier.gripMax - 1) * 9) / 2 + k * 9, py = carrier.y - R - (S.stats && S.stats.rescues === 0 ? 30 : 10);
          ctx.fillStyle = k < carrier.grip ? '#ffd23a' : 'rgba(43,20,66,.6)'; ctx.strokeStyle = '#2b1442'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(px, py, 3.6, 0, 7); ctx.fill(); ctx.stroke();
        }
        if (!S.stats || S.stats.rescues === 0) text('SHOOT IT!', carrier.x, carrier.y - R - 8 + Math.sin(S.t * 6) * 2, 18, '#ffd23a', 'center', 4.5);
      }
      for (const b of bullets) { // water streak behind each drop, then the drop
        const tg = ctx.createLinearGradient(0, b.y, 0, b.y + 26); tg.addColorStop(0, 'rgba(200,240,255,.75)'); tg.addColorStop(1, 'rgba(200,240,255,0)');
        ctx.fillStyle = tg; ctx.beginPath(); ctx.moveTo(b.x - 3, b.y + 2); ctx.lineTo(b.x + 3, b.y + 2); ctx.lineTo(b.x, b.y + 26); ctx.closePath(); ctx.fill();
        sprite('bullet', 0, b.x, b.y, 0, 1, 1);
      }
      for (const s of splats) sprite('splat', 0, s.x, s.y, 0, 1, 1);
      for (const b of S.balloons || []) { // a wobbling blue water balloon with a knot
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.sin(b.rot) * 0.25); const sq = 1 + Math.sin(b.t * 30) * 0.06; ctx.scale(1 / sq, sq);
        const bg = ctx.createRadialGradient(-4, -5, 1, 0, 0, 13); bg.addColorStop(0, '#e6f8ff'); bg.addColorStop(0.35, '#6fcbff'); bg.addColorStop(1, '#1f78c8');
        ctx.fillStyle = bg; ctx.strokeStyle = '#2b1442'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(0, 0, 11, 13, 0, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#1f78c8'; ctx.beginPath(); ctx.moveTo(-3, 13); ctx.lineTo(3, 13); ctx.lineTo(0, 17); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      drawFlyers(); drawParticles(); drawPops();
      if (S.debugPaths) drawDebugPaths();
    }
    ctx.restore();
    if (S.screen === 'play' || S.screen === 'pause' || S.screen === 'over') { drawHUD(); drawBannerAndTutorial(); }
    syncBalloonBtn();
    if (S.resumeT > 0 && S.screen === 'play') text('GET READY', W / 2, H * 0.47, 40, '#fff4d6', 'center', 8);
    if (S.screen === 'title') { ctx.fillStyle = 'rgba(30,10,50,.25)'; ctx.fillRect(0, 0, W, H); }
    if (S.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + S.flash * 0.45 + ')'; ctx.fillRect(0, 0, W, H); }
  }

  // ---------- main loop ----------
  let acc = 0, last = 0;
  function simStep(dt) {
    S.t += dt;
    if (S.hitstop > 0) { S.hitstop -= dt; return; }
    if (S.screen === 'play' && !S.paused) { if (S.resumeT > 0) { S.resumeT -= dt; return; } logic(dt); }
  }
  function frame(ts) {
    requestAnimationFrame(frame);
    const now = ts / 1000; const dt = Math.min(0.1, now - last); last = now;
    if (S.slowmo > 0) { S.slowmo -= dt; acc += dt * 0.3; } else acc += dt;
    if (S.freeze) acc = 0;
    while (acc >= STEP) { simStep(STEP); acc -= STEP; }
    render();
  }

  // ---------- buttons ----------
  function refreshSnd() {
    const any = Snd.sfxOn || Snd.musicOn;
    $('#btnSound').classList.toggle('off', !any);
    $('#sndWaves').style.display = any ? '' : 'none';
    ['tMusic', 'pMusic'].forEach(id => { $('#' + id).textContent = Snd.musicOn ? '♪ MUSIC ON' : '♪ MUSIC OFF'; });
    ['tSfx', 'pSfx'].forEach(id => { $('#' + id).textContent = Snd.sfxOn ? 'SFX ON' : 'SFX OFF'; });
  }
  function toggleAllSound() { const any = Snd.sfxOn || Snd.musicOn; Snd.setSfx(!any); Snd.setMusic(!any); refreshSnd(); }
  const on = (id, fn) => $(id).addEventListener('click', (e) => { Snd.unlock(); if (!S.headless) Snd.click(); e.stopPropagation(); try { e.currentTarget.blur(); } catch (er) { /* */ } fn(); });
  on('#btnPlay', () => startGame(save.start || 1));
  const balloonBtn = $('#btnBalloon');
  $('#btnStart').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; Snd.unlock(); Snd.click(); save.start = +b.dataset.s; persist(); refreshStart(); });
  on('#btnDaily', () => startGame(1, 'daily'));
  on('#btnPatches', () => go('patches'));
  on('#patchClose', () => go('title'));
  on('#btnPause', () => pause());
  on('#btnSound', () => toggleAllSound());
  on('#tSfx', () => { Snd.setSfx(!Snd.sfxOn); refreshSnd(); });
  on('#pSfx', () => { Snd.setSfx(!Snd.sfxOn); refreshSnd(); });
  on('#tMusic', () => { Snd.setMusic(!Snd.musicOn); refreshSnd(); });
  on('#pMusic', () => { Snd.setMusic(!Snd.musicOn); refreshSnd(); });
  on('#pResume', () => resume());
  on('#pRestart', () => { S.paused = false; startGame(S.mode === 'daily' ? 1 : S.startStage, S.mode); });
  on('#pTitle', () => { S.paused = false; go('title'); });
  on('#ovRetry', () => startGame(S.mode === 'daily' ? 1 : S.startStage, S.mode));
  on('#ovTitle', () => go('title'));

  // ---------- test hooks ----------
  const snap = () => ({
    screen: S.screen, phase: S.phase, stage: S.stage, kind: S.kind, score: S.score, lives: S.lives, combo: S.combo, t: +S.stageT.toFixed(1),
    gulls: gulls.length, inForm: gulls.filter(g => g.state === 'form').length, divers: gulls.filter(g => g.state === 'dive' || g.state === 'prep').length,
    entering: gulls.filter(g => g.state === 'wait' || g.state === 'enter').length,
    splats: splats.length, bullets: bullets.length, playerX: +P.x.toFixed(1), double: P.double, inv: +P.inv.toFixed(2), basket: basket.state, stolen: S.stolen,
    boss: (() => { const b = gulls.find(g => g.k === 'b'); return b ? { state: b.state, hp: b.hp, x: +b.x.toFixed(0), y: +b.y.toFixed(0), carry: b.carry, snatchT: +(b.snatchT || 0).toFixed(1) } : null; })(),
    bonus: S.bonus ? Object.assign({}, S.bonus) : null, stats: S.stats ? Object.assign({}, S.stats) : null, urg: +(S.urg || 0).toFixed(2), best: save.best,
  });
  window.__T = {
    start(stage, o) {
      o = o || {}; S.headless = !!o.headless; S.god = !!o.god; S.forceMod = o.mod || null;
      if (o.seed) S.rnd = mkRng(o.seed);
      startGame(stage || 1, o.mode); S.ai = o.ai ? { skill: o.skill || 0 } : null; S.tutMoved = true; save.tutDone = true;
      return snap();
    },
    step(ms) { const n = Math.round(ms / (STEP * 1000)); for (let i = 0; i < n; i++) simStep(STEP); render(); return snap(); },
    state: snap, ai(v, o) { S.ai = v ? Object.assign({ skill: 0 }, o || {}) : null; }, god(v) { S.god = !!v; }, headless(v) { S.headless = !!v; },
    seed(n) { S.rnd = mkRng(n); },
    skipTo(n) { startStage(n); return snap(); },
    killAll() { gulls.slice().forEach(g => { if (g.k !== 'b') shoo(g); }); },
    killBoss() { const b = gulls.find(g => g.k === 'b'); if (b) { b.hp = 1; } },
    forceSnatch() { const b = gulls.find(g => g.k === 'b'); if (b) { b.snatchT = 0.01; } return snap(); },
    hurt() { const i = P.inv; P.inv = 0; hurtPlayer(); return i; },
    setLives(n) { S.lives = n; }, setPlayerX(x) { P.x = P.tx = x; },
    freeze(v) { S.freeze = v !== false; }, render, pause, resume, go, noAutoPause(v) { S.noAutoPause = !!v; },
    debugPaths(v) { S.debugPaths = v === undefined ? true : v; },
    layout() { return { H, TOP, PY, BY, GROUND, F_Y0, cssScale, insetTopW }; },
    gulls() { return gulls.map(g => ({ id: g.id, k: g.k, st: g.state, x: g.x, y: g.y, hd: g.hd, hp: g.hp, vx: g.vx, vy: g.vy, carry: !!g.carry })); },
    splats() { return splats.map(s => ({ x: s.x, y: s.y, vy: s.vy })); },
    meter(v) { if (v !== undefined) S.meter = v; return S.meter || 0; }, balloons() { return (S.balloons || []).length; }, throwBalloon,
    saveData() { return JSON.parse(JSON.stringify(save)); }, setSave(o) { Object.assign(save, o); persist(); if (S.screen === 'title') refreshTitle(); }, resetSave() { save.best = 0; save.bestStage = 0; save.tutDone = false; save.games = 0; save.patches = {}; save.bossBeat = 0; save.start = 1; save.daily = { day: '', best: 0, plays: 0 }; save.streak = 0; save.lastDaily = ''; persist(); }, daily: dailyInfo,
    // headless bot run of one stage onwards; returns what happened per stage
    sim(from, to, o) {
      o = o || {}; const was = S.headless; S.headless = true;
      this.start(from, { headless: true, god: !!o.god, ai: true, seed: o.seed, skill: o.skill, mode: o.mode, mod: o.mod });
      const out = []; let cur = from, cap = Math.round((o.maxSec || 600) / STEP), t0 = S.stageT, h0 = 0;
      for (let k = 0; k < cap; k++) {
        simStep(STEP);
        if (S.screen === 'over') { out.push({ stage: S.stage, died: true, score: S.score, secs: +S.stageT.toFixed(1) }); break; }
        if (S.phase === 'clear' && S.stage === cur) {
          out.push({ stage: cur, kind: S.kind, secs: +S.stageT.toFixed(1), hurts: S.stageHurts, lives: S.lives, score: S.score, bonus: S.bonus ? S.bonus.hit + '/' + S.bonus.total : undefined, acc: S.stats.shots ? Math.round(S.stats.hits / S.stats.shots * 100) : 0 });
          cur++; if (cur > to) break;
        }
      }
      const res = { out, final: snap() }; S.headless = was; return res;
    },
  };

  // ---------- boot ----------
  window.addEventListener('resize', () => layout(false));
  window.addEventListener('orientationchange', () => setTimeout(() => layout(true), 250));
  layout(true);
  refreshSnd();
  go('title');
  requestAnimationFrame((ts) => { last = ts / 1000; frame(ts); });
  if (document.fonts && document.fonts.load) { document.fonts.load("20px 'Bangers'"); document.fonts.load("800 16px 'Nunito'"); }
})();
