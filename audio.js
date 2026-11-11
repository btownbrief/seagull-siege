/* Seagull Siege — WebAudio synth: sound effects, squawks, a punchy music loop, haptics. No audio files. */
(function () {
  'use strict';

  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

  const Snd = {
    ctx: null, master: null, sfxGain: null, musicGain: null,
    sfxOn: true, musicOn: true, started: false,
    _noiseBuf: null, _timer: null, _next: 0, _step: 0,
    mode: 'off',        // off | game | boss | bonus
    energy: 0,          // 0..1 — raises tempo as the formation thins

    load() {
      try {
        const s = JSON.parse(localStorage.getItem('seagullsiege.audio') || '{}');
        if (typeof s.sfx === 'boolean') this.sfxOn = s.sfx;
        if (typeof s.music === 'boolean') this.musicOn = s.music;
      } catch (e) { /* ignore */ }
    },
    save() { try { localStorage.setItem('seagullsiege.audio', JSON.stringify({ sfx: this.sfxOn, music: this.musicOn })); } catch (e) { /* ignore */ } },

    unlock() { // must run inside a user gesture (iOS)
      try {
        if (!this.ctx) {
          const AC = window.AudioContext || window.webkitAudioContext;
          if (!AC) return;
          this.ctx = new AC();
          this.master = this.ctx.createGain(); this.master.gain.value = 0.9;
          const comp = this.ctx.createDynamicsCompressor();
          this.master.connect(comp); comp.connect(this.ctx.destination);
          this.sfxGain = this.ctx.createGain(); this.sfxGain.gain.value = this.sfxOn ? 0.85 : 0;
          this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = this.musicOn ? 0.5 : 0;
          // music runs through a gentle low-pass so saw/square leads don't buzz on phone speakers
          this.musicLP = this.ctx.createBiquadFilter(); this.musicLP.type = 'lowpass'; this.musicLP.frequency.value = 3400; this.musicLP.Q.value = 0.5;
          this.sfxGain.connect(this.master); this.musicGain.connect(this.musicLP); this.musicLP.connect(this.master);
          const len = this.ctx.sampleRate;
          this._noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
          const d = this._noiseBuf.getChannelData(0);
          for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        }
        if (this.ctx.state !== 'running') this.ctx.resume();
        this.started = true;
        this._startMusic();
      } catch (e) { /* audio unavailable */ }
    },
    suspend() { try { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); } catch (e) { /* */ } },
    resume() { try { if (this.ctx && this.ctx.state !== 'running' && this.started) this.ctx.resume(); } catch (e) { /* */ } },
    setSfx(on) { this.sfxOn = on; if (this.sfxGain) this.sfxGain.gain.value = on ? 0.85 : 0; this.save(); },
    setMusic(on) { this.musicOn = on; if (this.musicGain) this.musicGain.gain.value = on ? 0.5 : 0; this.save(); },

    // ---- primitives ----
    tone(freq, dur, type, vol, slideTo, delay, dest) {
      if (!this.ctx || (!this.sfxOn && !dest)) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t0);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g); g.connect(dest || this.sfxGain);
      o.start(t0); o.stop(t0 + dur + 0.03);
    },
    noise(dur, vol, ff, ftype, delay, dest, q) {
      if (!this.ctx || (!this.sfxOn && !dest)) return;
      const t0 = this.ctx.currentTime + (delay || 0);
      const s = this.ctx.createBufferSource(); s.buffer = this._noiseBuf;
      const f = this.ctx.createBiquadFilter(); f.type = ftype || 'highpass'; f.frequency.value = ff || 2000; if (q) f.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(vol || 0.2, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(dest || this.sfxGain);
      s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.03);
    },
    // cartoon squawk: wobbly saw through a vowel-ish bandpass; `p` is a pitch multiplier
    squawk(p, dur, vol) {
      if (!this.ctx || !this.sfxOn) return;
      p = (p || 1) * (0.9 + Math.random() * 0.22); dur = dur || 0.26; vol = vol || 0.16;
      const t0 = this.ctx.currentTime;
      const o = this.ctx.createOscillator(), o2 = this.ctx.createOscillator(), g = this.ctx.createGain();
      const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3.2;
      o.type = 'sawtooth'; o2.type = 'square';
      const f0 = 620 * p;
      o.frequency.setValueAtTime(f0 * 0.8, t0); o.frequency.exponentialRampToValueAtTime(f0 * 1.55, t0 + dur * 0.28); o.frequency.exponentialRampToValueAtTime(f0 * 0.95, t0 + dur);
      o2.frequency.setValueAtTime(f0 * 0.4, t0); o2.frequency.exponentialRampToValueAtTime(f0 * 0.78, t0 + dur * 0.28); o2.frequency.exponentialRampToValueAtTime(f0 * 0.48, t0 + dur);
      bp.frequency.setValueAtTime(1100 * p, t0); bp.frequency.exponentialRampToValueAtTime(2300 * p, t0 + dur * 0.3); bp.frequency.exponentialRampToValueAtTime(1300 * p, t0 + dur);
      const lfo = this.ctx.createOscillator(), lg = this.ctx.createGain(); lfo.frequency.value = 26 + Math.random() * 10; lg.gain.value = 70 * p;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(vol * 0.7, t0 + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(bp); o2.connect(bp); bp.connect(g); g.connect(this.sfxGain);
      o.start(t0); o2.start(t0); lfo.start(t0); const e = t0 + dur + 0.05; o.stop(e); o2.stop(e); lfo.stop(e);
    },

    // pentatonic ladder so combos climb
    ladder: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21],
    pitch(step) { return 523.25 * Math.pow(2, this.ladder[Math.min(step, this.ladder.length - 1)] / 12); },

    // ---- game sfx ----
    shoot(dbl) { // soft 'pew' that walks a little 4-note cycle so autofire doesn't drone
      this._sh = ((this._sh || 0) + 1) % 4; const f = [880, 990, 935, 1040][this._sh];
      this.tone(f, 0.06, 'sine', dbl ? 0.045 : 0.055, f * 1.8); this.noise(0.04, 0.02, 4800, 'highpass'); },
    hit(kind) { // hit but not shooed (herring / boss)
      this.squawk(kind === 'b' ? 0.5 : 0.7, 0.18, 0.13); this.noise(0.08, 0.1, 1800, 'bandpass'); this.tone(240, 0.09, 'square', 0.08, 150);
    },
    shoo(combo, kind) {
      const base = kind === 'h' ? 0.72 : kind === 't' ? 1.5 : 1.0;
      this.squawk(base * (1 + Math.min(combo, 8) * 0.045), 0.28, 0.17);
      this.noise(0.12, 0.09, 3000, 'highpass');
      this.tone(this.pitch(Math.max(0, combo - 1)), 0.14, 'triangle', 0.13, 0, 0.04);
    },
    bossShoo() { this.squawk(0.45, 0.6, 0.22); this.squawk(0.6, 0.5, 0.18); [0, 4, 7, 12, 16].forEach((s, i) => this.tone(midi(60 + s), 0.22, 'triangle', 0.16, 0, 0.12 + i * 0.07)); this.noise(0.4, 0.2, 1500, 'highpass', 0.05); },
    drop() { this.tone(700, 0.12, 'sine', 0.05, 380); },
    splatLand() { this.noise(0.09, 0.07, 700, 'bandpass'); this.tone(150, 0.08, 'sine', 0.07, 80); },
    hurt() { this.tone(300, 0.5, 'sawtooth', 0.16, 70); this.noise(0.35, 0.18, 600, 'lowpass'); this.tone(140, 0.3, 'square', 0.1, 60, 0.02); },
    alarm() { for (let i = 0; i < 4; i++) { this.tone(880, 0.13, 'square', 0.085, 0, i * 0.2); this.tone(660, 0.13, 'square', 0.085, 0, i * 0.2 + 0.1); } },
    snatch() { this.noise(0.4, 0.14, 1200, 'bandpass', 0, null, 1.2); this.squawk(0.58, 0.55, 0.2); this.tone(200, 0.4, 'sawtooth', 0.07, 520); },
    swoosh() { this.noise(0.5, 0.09, 700, 'bandpass', 0, null, 0.9); },
    rescue() { [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone(midi(64 + s), 0.2, 'triangle', 0.17, 0, i * 0.06)); this.tone(midi(88), 0.5, 'sine', 0.09, 0, 0.45); },
    basketLand() { this.tone(180, 0.1, 'sine', 0.2, 90); this.noise(0.07, 0.08, 1500, 'bandpass'); },
    munch() { for (let i = 0; i < 3; i++) { this.tone(260, 0.07, 'square', 0.1, 150, i * 0.1); this.noise(0.05, 0.1, 1500, 'bandpass', i * 0.1); } },
    extra() { [0, 5, 9, 12, 17].forEach((s, i) => this.tone(midi(72 + s), 0.16, 'triangle', 0.15, 0, i * 0.07)); },
    stageClear() { [0, 4, 7, 12, 7, 12, 16].forEach((s, i) => this.tone(midi(62 + s), 0.2, 'triangle', 0.16, 0, i * 0.085)); this.tone(midi(86), 0.6, 'sine', 0.08, 0, 0.55); },
    bonusHit(n) { this.tone(this.pitch(Math.min(9, n)), 0.13, 'triangle', 0.17); this.tone(this.pitch(Math.min(9, n)) * 2, 0.08, 'sine', 0.06); this.noise(0.05, 0.06, 4500, 'highpass'); },
    perfect() { [0, 4, 7, 12, 16, 19, 24, 28].forEach((s, i) => { this.tone(midi(60 + s), 0.3, 'triangle', 0.16, 0, i * 0.075); this.tone(midi(72 + s), 0.2, 'sine', 0.06, 0, i * 0.075); }); },
    over() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.4, 'triangle', 0.2, 0, i * 0.2)); this.squawk(0.7, 0.5, 0.14); },
    banner() { this.tone(midi(67), 0.12, 'triangle', 0.12); this.tone(midi(74), 0.18, 'triangle', 0.12, 0, 0.09); },
    best() { [0, 4, 7, 12, 16].forEach((s, i) => this.tone(midi(67 + s), 0.18, 'triangle', 0.15, 0, i * 0.09)); },
    lob() { this.tone(300, 0.3, 'triangle', 0.12, 900); this.noise(0.25, 0.05, 1200, 'bandpass', 0, null, 1.5); },
    balloon() { this.noise(0.6, 0.3, 900, 'lowpass'); this.noise(0.45, 0.16, 3000, 'bandpass', 0.03, null, 0.8); this.tone(110, 0.35, 'sine', 0.3, 50);
      [0, 4, 7, 12, 16].forEach((s, i) => this.tone(midi(76 + s), 0.14, 'triangle', 0.08, 0, 0.12 + i * 0.045)); },
    ready() { [0, 7, 12].forEach((s, i) => this.tone(midi(79 + s), 0.12, 'sine', 0.1, 0, i * 0.06)); },
    close() { this.tone(1300, 0.08, 'sine', 0.06, 1900); this.tone(1950, 0.1, 'sine', 0.04, 0, 0.05); },
    click() { this.tone(660, 0.05, 'triangle', 0.12); },

    // ---- music: punchy 8-bar synth song (A minor; A section + B section with lead, fills, crash). Tempo and hats rise with `energy`. ----
    setMode(m) { this.mode = m; if (m !== 'off') this._startMusic(); },
    _startMusic() {
      if (this._timer || !this.ctx) return;
      this._next = this.ctx.currentTime + 0.15; this._step = 0;
      this._timer = setInterval(() => this._tick(), 90);
    },
    _tick() {
      if (!this.ctx || this.ctx.state !== 'running') { if (this.ctx) this._next = Math.max(this._next, this.ctx.currentTime); return; }
      while (this._next < this.ctx.currentTime + 0.35) {
        this._play(this._step, this._next - this.ctx.currentTime);
        const bpm = this.mode === 'title' ? 96 : (this.mode === 'bonus' ? 138 : this.mode === 'boss' ? 140 : 126) + this.energy * 22;
        this._next += 60 / bpm / 4; this._step++;
      }
    },
    _play(step, dt) {
      if (this.mode === 'off') return;
      const m = this.musicGain, d = Math.max(0, dt), e = this.energy || 0;
      const bonus = this.mode === 'bonus', boss = this.mode === 'boss';
      const bar = Math.floor(step / 16) % 8, i = step % 16, B = bar >= 4, pass = Math.floor(step / 128) % 2;
      if (this.mode === 'title') { // calm lakeside version for the menu: pad, soft arp, the hook on a triangle
        const tp = [[45, 1], [41, 0], [48, 0], [43, 0], [41, 0], [43, 0], [40, 1], [45, 1]][bar], tt = [0, tp[1] ? 3 : 4, 7];
        if (i === 0) { tt.forEach(t => this.tone(midi(tp[0] + 12 + t), 2.4, 'triangle', 0.035, 0, d, m)); this.tone(midi(tp[0] - 12), 2.2, 'sine', 0.12, 0, d, m); }
        if (i % 8 === 0) this.tone(160, 0.2, 'sine', 0.14, 60, d, m);
        if (i % 2 === 0) this.tone(midi(tp[0] + 24 + tt[(i / 2) % 3]), 0.25, 'triangle', 0.022, 0, d, m);
        const th = [null, null, { 0: 76, 6: 81, 12: 76 }, { 0: 74, 6: 71, 12: 69 }, null, null, { 0: 76, 4: 79, 8: 84 }, { 0: 81, 8: 76 }][bar];
        if (th && th[i]) this.tone(midi(th[i]), 0.6, 'triangle', 0.05, 0, d, m);
        if (i === 0 && bar % 2 === 0) this.noise(2.2, 0.04, 1000, 'lowpass', d, m); // lake waves
        if (i === 8 && (bar === 3 || bar === 6) && this.sfxOn) this.squawk(0.9 + Math.random() * 0.3, 0.3, 0.04); // a distant gull
        return;
      }
      // 8-bar song: A = Am F C G (hook in bars 3-4), B = F G Em Am (lead all through, drum fill at the end)
      const prog = bonus ? [[48, 0], [55, 0], [57, 1], [53, 0], [53, 0], [55, 0], [52, 1], [48, 0]]
        : boss ? [[45, 1], [45, 1], [44, 0], [41, 0], [45, 1], [45, 1], [46, 0], [44, 0]]
        : [[45, 1], [41, 0], [48, 0], [43, 0], [41, 0], [43, 0], [40, 1], [45, 1]];
      const K = this.key || 0, root = prog[bar][0] + K, tri = [0, prog[bar][1] ? 3 : 4, 7];
      const fill = bar === 7 && i >= 8;
      // drums
      if (step % 128 === 0 && step > 0) this.noise(0.9, 0.16, 5200, 'highpass', d, m); // crash at the top of the song
      if (i % 4 === 0 && !fill) { this.tone(190, 0.14, 'sine', 0.3, 62, d, m); this.noise(0.018, 0.11, 2400, 'bandpass', d, m, 1.2); }
      if (boss && i % 4 === 2 && B) { this.tone(190, 0.12, 'sine', 0.22, 62, d, m); this.noise(0.015, 0.08, 2400, 'bandpass', d, m, 1.2); }
      if ((i === 4 || i === 12) && !fill) { this.noise(0.12, 0.2, 1900, 'bandpass', d, m, 0.8); this.tone(210, 0.07, 'triangle', 0.1, 130, d, m); }
      if (fill) { this.noise(0.08, 0.1 + (i - 8) * 0.018, 1600 + (i - 8) * 120, 'bandpass', d, m, 0.8); this.tone(260 - (i - 8) * 14, 0.07, 'triangle', 0.09, 140, d, m); }
      const night = K >= 5, sw = night && i % 2 === 1 ? 0.045 : 0; // night stages swing the hats
      if (i % 2 === 1) this.noise(0.04, i % 4 === 3 ? 0.07 : 0.045, 7000, 'highpass', d + sw, m);
      if (night && B && i === 0) this.tone(midi(root + 36), 1.4, 'sine', 0.035, 0, d, m); // bell pluck under the night B section
      if (i === 0 && bar % 2 === 0) this.noise(1.8, 0.03, 1100, 'lowpass', d, m); // soft lake waves
      else if (e > 0.55 && !fill) this.noise(0.03, 0.03, 8000, 'highpass', d, m); // busier hats as the formation thins
      // bass: driving eighths, octave pops; B section walks
      if (i % 2 === 0 || (pass && !B && i === 7)) {
        const walk = B && (i === 12 || i === 14) ? (i === 12 ? 7 : 10) : 0;
        const oct = (i === 6 || i === 14) && !walk ? 12 : 0;
        this.tone(midi(root - 12 + oct + walk), 0.19, 'sawtooth', 0.12, 0, d, m);
        this.tone(midi(root - 24), 0.19, 'sine', 0.12, 0, d, m); this.tone(midi(root + oct + walk), 0.12, 'triangle', 0.045, 0, d, m);
      }
      // arpeggio sparkle (quieter under the B-section lead, brighter with energy)
      const arp = [0, 1, 2, 1, 2, 1, 0, 2, 1, 2, 1, 2, 0, 1, 2, 1][i];
      this.tone(midi(root + 12 + tri[arp] + (i % 8 === 7 ? 12 : 0)), 0.1, 'square', (B ? 0.026 : 0.04) * (0.8 + e * 0.4), 0, d, m);
      // pad under the B section
      if (B && i === 0) tri.forEach(t => this.tone(midi(root + 12 + t), 1.7, 'triangle', 0.03, 0, d, m));
      // melody
      let mel = null;
      if (bonus) mel = [null, null, { 0: 72, 3: 76, 6: 79, 8: 76, 11: 79, 14: 84 }, { 0: 83, 4: 81, 8: 79, 12: 76 },
        { 0: 77, 2: 76, 4: 74, 8: 72, 12: 74 }, { 0: 79, 4: 83, 6: 86, 8: 83, 12: 79 }, { 0: 76, 3: 79, 6: 83, 8: 84, 12: 83 }, { 0: 84, 6: 79, 8: 76 }][bar];
      else if (boss) mel = B ? [{ 0: 69, 3: 72, 6: 76, 8: 75, 12: 72 }, { 0: 69, 6: 64, 8: 68, 12: 71 }, { 0: 70, 4: 69, 8: 70, 12: 72 }, { 0: 68, 6: 71, 8: 74, 12: 76 }][bar - 4] : null;
      else mel = [pass ? { 0: 69, 3: 72, 6: 76, 10: 74, 12: 72 } : null, pass ? { 0: 72, 3: 69, 6: 65, 12: 69 } : null, { 0: 76, 3: 79, 6: 81, 10: 79, 12: 76 }, { 0: 74, 3: 76, 6: 74, 8: 71, 12: 69 },
        { 0: 81, 2: 79, 4: 77, 6: 76, 8: 77, 12: 72 }, { 0: 74, 2: 76, 4: 79, 8: 83, 10: 81, 12: 79 }, { 0: 76, 4: 79, 6: 83, 8: 84, 12: 83, 14: 79 }, { 0: 81, 8: 76, 12: 69 }][bar];
      if (mel && mel[i]) mel = Object.assign({}, mel, { [i]: mel[i] + K });
      if (this.lowLife && !bonus && (i === 0 || i === 3)) { this.tone(i ? 98 : 82, 0.16, 'triangle', i ? 0.16 : 0.22, 55, d, m); this.noise(0.03, 0.08, 900, 'lowpass', d, m); } // heartbeat on your last fry (audible on phone speakers)
      if ((this.comboLvl || 0) >= 4 && i % 2 === 1) this.tone(midi(root + 24 + tri[(i >> 1) % 3]), 0.07, 'sine', 0.03, 0, d, m); // combo sparkle
      if (mel && mel[i]) { this.tone(midi(mel[i]), B ? 0.24 : 0.2, 'sawtooth', 0.06, 0, d, m); if (B) this.tone(midi(mel[i] - 12), 0.24, 'triangle', 0.035, 0, d, m); }
      if (boss && i % 8 === 0) this.tone(midi(root + 24), 0.5, 'sawtooth', 0.04, midi(root + 24) * 0.97, d, m); // ominous siren-ish pad
    },
    buzz(ms) { try { if (navigator.vibrate && this.sfxOn && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(ms); } catch (e) { /* iOS etc. */ } },
  };

  Snd.load();
  window.Snd = Snd;
})();
