// Round 2 waveforms: refinements of A, B, C and F.
// What changed across all four: every moving value goes through a spring or a wave simulation (no direct
// level-to-pixel mapping), hits are impulses that travel instead of flashes, and glow/gradients replace flat fills.
const TEAL = '#7fd1c7', GOLD = '#efd183', SALMON = '#f2a7a0';

function fullShape(track, n) {
  const P = track.peaks, b = P.length / n;
  const raw = Float32Array.from({ length: n }, (_, i) => { let s = 0, c = 0; for (let k = Math.floor(i * b); k < Math.floor((i + 1) * b); k++) { s += P[k]; c++; } return s / Math.max(1, c); });
  const lo = Math.min(...raw), hi = Math.max(...raw);
  return raw.map((v) => 0.12 + 0.88 * Math.pow((v - lo) / (hi - lo || 1), 1.8));
}
function playedGradient(c, R) {
  const g = c.createLinearGradient(R.x, 0, R.x + R.w, 0);
  g.addColorStop(0, TEAL); g.addColorStop(0.55, '#b9e3c0'); g.addColorStop(1, GOLD); return g;
}

export const V2 = [];

// A2. Ripple bars. Bars sit on a 1D string simulation (wave equation with damping). The bass envelope pushes
// the whole string up smoothly; each kick drops an impulse at a point that moves along the bar, so the hit
// travels outward as a ripple. Bar height = waveform shape x (rest + string displacement).
V2.push({
  id: 'ripple', name: 'A2. Ripple bars',
  blurb: "Bars ride on a simulated string. The bass envelope lifts the whole row smoothly. Each kick drops an impulse at a point that walks across the row bar by bar, and the impulse travels outward as a ripple and fades, so every hit is visible as motion through the waveform instead of a flash. Highs add a soft bloom on the crests.",
  init(track) { const n = 72; return { shape: fullShape(track, n), y: new Float32Array(n), v: new Float32Array(n), lift: 0, liftV: 0, hitAt: 0 }; },
  draw(c, R, a, st, pos, dt) {
    const n = st.shape.length, step = R.w / n, bw = step * 0.56;
    // Sub-step the string for stability.
    for (let k = 0; k < 4; k++) {
      const h = dt / 4;
      for (let i = 0; i < n; i++) {
        const l = st.y[Math.max(0, i - 1)], r = st.y[Math.min(n - 1, i + 1)];
        st.v[i] += (900 * (l + r - 2 * st.y[i]) - 30 * st.y[i] - 4.5 * st.v[i]) * h;
      }
      for (let i = 0; i < n; i++) st.y[i] += st.v[i] * h;
    }
    if (a.hit && (a.hit[0] || a.hit[1])) {
      st.hitAt = (st.hitAt + 0.37) % 1; const c0 = Math.floor(st.hitAt * n);
      for (let d = -3; d <= 3; d++) { const i = c0 + d; if (i >= 0 && i < n) st.v[i] += 9 * Math.exp(-d * d / 4); }
    }
    st.liftV += (220 * ((0.3 + a.env[0] * 0.55) - st.lift) - 22 * st.liftV) * dt; st.lift += st.liftV * dt;
    const grad = playedGradient(c, R), crest = 0.25 + (a.env[4] + a.env[5]) * 0.35;
    c.save(); c.shadowColor = TEAL; c.shadowBlur = 18 * crest;
    for (let pass = 0; pass < 2; pass++) {
      c.beginPath();
      for (let i = 0; i < n; i++) {
        if ((i / n < pos) !== (pass === 0)) continue;
        const h = Math.max(6, st.shape[i] * R.h * Math.max(0.05, st.lift + st.y[i] * 0.35)), x = R.x + i * step + (step - bw) / 2;
        c.roundRect(x, R.y - h, bw, h, bw / 2);
      }
      c.fillStyle = pass === 0 ? grad : 'rgba(255,255,255,0.28)'; c.shadowBlur = pass === 0 ? 18 * crest : 0; c.fill();
    }
    c.restore();
    c.save(); c.globalAlpha = 0.14; c.translate(0, R.y * 2 + 8); c.scale(1, -1);
    c.beginPath(); for (let i = 0; i < n; i++) { const h = Math.max(6, st.shape[i] * R.h * Math.max(0.05, st.lift + st.y[i] * 0.35)) * 0.35; c.roundRect(R.x + i * step + (step - bw) / 2, R.y - h, bw, h, bw / 2); }
    c.fillStyle = '#fff'; c.fill(); c.restore();
  },
});

// B2. Bass ribbon. The main strand is the actual low-passed bass waveform (one cycle-aligned window, so it
// holds still instead of scrolling), smoothed point by point with a spring so it flows. Two thinner strands
// follow it at an offset, pulled by mids and highs. A soft filled glow sits under the main strand.
function alignedWindow(w, n) { // start at a rising zero crossing so the shape is stable frame to frame
  let s = 0; for (let i = 1; i < w.length / 2; i++) if (w[i - 1] < 0 && w[i] >= 0) { s = i; break; }
  const span = Math.min(w.length - s, 900), out = new Float32Array(n); // about 3 bass cycles
  for (let i = 0; i < n; i++) out[i] = w[s + Math.floor(i / (n - 1) * (span - 1))];
  return out;
}
V2.push({
  id: 'ribbon', name: 'B2. Bass ribbon',
  blurb: "The main strand is the real bass waveform: the audio is low-passed at 150 Hz and one cycle-aligned window is drawn, so the shape holds still instead of crawling. Each point eases toward it with a spring, so it flows like a ribbon. Two thinner strands (gold for mids, salmon for highs) trail it with an offset and swell with their own bands. The ends taper so it floats.",
  init() { const n = 160; return { n, y: [0, 1, 2].map(() => new Float32Array(n)), v: [0, 1, 2].map(() => new Float32Array(n)), gain: 1 }; },
  draw(c, R, a, st, pos, dt) {
    const n = st.n, cy = R.y - R.h * 0.45;
    const w = a.bassWave ? alignedWindow(a.bassWave, n) : new Float32Array(n);
    let pk = 0; for (const v of w) pk = Math.max(pk, Math.abs(v));
    st.gain += ((pk > 1e-4 ? 0.9 / pk : st.gain) - st.gain) * (1 - Math.exp(-dt / (pk * st.gain > 0.9 ? 0.15 : 1.2))); // drop fast, rise slow // slow auto-gain so quiet bass still reads
    const amps = [0.35 + a.env[0] * 0.65, 0.15 + a.env[2] * 0.4 + a.env[3] * 0.3, 0.1 + a.env[4] * 0.35 + a.env[5] * 0.25];
    for (let k = 0; k < 3; k++) {
      const lag = k * 9;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), taper = Math.pow(Math.sin(Math.PI * u), 1.5);
        const src = w[Math.min(n - 1, Math.max(0, i - lag))] * st.gain;
        const target = -src * taper * amps[k] * R.h * 0.95 * (k ? 0.7 : 1);
        st.v[k][i] += (260 * (target - st.y[k][i]) - 24 * st.v[k][i]) * dt; st.y[k][i] += st.v[k][i] * dt;
      }
    }
    const path = (k) => { c.beginPath(); for (let i = 0; i < n; i++) { const x = R.x + i / (n - 1) * R.w, y = cy + st.y[k][i]; i ? c.lineTo(x, y) : c.moveTo(x, y); } };
    c.save();
    path(0); c.lineTo(R.x + R.w, cy); c.lineTo(R.x, cy); c.closePath();
    const g = c.createLinearGradient(0, cy - R.h * 0.5, 0, cy + R.h * 0.5); g.addColorStop(0, 'rgba(127,209,199,0.28)'); g.addColorStop(0.5, 'rgba(127,209,199,0.02)'); g.addColorStop(1, 'rgba(127,209,199,0.28)');
    c.fillStyle = g; c.fill();
    c.globalCompositeOperation = 'lighter';
    for (const [k, col, w0] of [[2, SALMON, 2], [1, GOLD, 2.5], [0, TEAL, 4]]) {
      for (const [lw, al] of [[w0 * 6, 0.07], [w0 * 2.5, 0.2], [w0, 0.95]]) { path(k); c.strokeStyle = col; c.globalAlpha = al; c.lineWidth = lw; c.lineJoin = 'round'; c.stroke(); }
    }
    c.restore();
    c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(R.x, R.y + 26, R.w, 3); c.fillStyle = playedGradient(c, R); c.fillRect(R.x, R.y + 26, R.w * pos, 3);
  },
});

// C2. Flowing ridges. Instead of stamping discrete lines, a continuous scroll: every line's depth increases
// smoothly every frame, so the landscape glides back. Each line keeps its spectrum but the newest line is
// spring-smoothed per point, so it flows rather than jitters. Lines get perspective (narrower, higher,
// dimmer with depth) and a gradient stroke; kick onsets brighten the line being born.
V2.push({
  id: 'ridges2', name: 'C2. Flowing ridges',
  blurb: "Unknown Pleasures, smoothed. The front line is the live spectrum (bass left, highs right) with every point on a spring, so it flows instead of flickering. Lines are born every eighth note and glide back into perspective continuously, getting narrower, higher and dimmer, so the last two bars become a moving landscape. A kick makes the line being born glow teal to gold.",
  init() { const P = 80; return { P, live: new Float32Array(P), liveV: new Float32Array(P), lines: [], acc: 0 }; },
  draw(c, R, a, st, pos, dt) {
    const P = st.P, every = 60 / 132 / 2, depthMax = 16;
    for (let i = 0; i < P; i++) {
      const sp = a.spectrum, j = Math.floor(i / P * 88), t = sp ? (sp[Math.max(0, j - 2)] + 2 * sp[Math.max(0, j - 1)] + 3 * sp[j] + 2 * sp[j + 1] + sp[j + 2]) / 9 : 0;
      st.liveV[i] += (180 * (t - st.live[i]) - 20 * st.liveV[i]) * dt; st.live[i] += st.liveV[i] * dt;
    }
    st.acc += dt / every;
    while (st.acc >= 1) { st.acc -= 1; st.lines.unshift({ s: Float32Array.from(st.live), glow: a.kick, d: 0 }); }
    for (const L of st.lines) L.d += dt / every;
    st.lines = st.lines.filter((L) => L.d < depthMax);
    const all = [{ s: st.live, glow: a.kick, d: 0 }, ...st.lines.map((L) => ({ ...L, d: L.d + st.acc * 0 }))];
    const proj = (d) => { const z = d / depthMax; return { y: R.y - z * R.h * 0.95, sc: 1 - z * 0.45, fade: Math.pow(1 - z, 1.4) }; };
    for (let li = all.length - 1; li >= 0; li--) {
      const L = all[li], p = proj(L.d), w = R.w * p.sc, x0 = R.x + (R.w - w) / 2, amp = R.h * 0.55 * p.sc;
      c.beginPath(); c.moveTo(x0, p.y);
      for (let i = 0; i < P; i++) { const u = i / (P - 1), bell = Math.pow(Math.sin(Math.PI * u), 0.8); c.lineTo(x0 + u * w, p.y - L.s[i] * L.s[i] * bell * amp); }
      c.lineTo(x0 + w, p.y); c.closePath();
      c.fillStyle = '#16132a'; c.globalAlpha = 0.92; c.fill(); c.globalAlpha = 1;
      const g = c.createLinearGradient(x0, 0, x0 + w, 0); const hot = Math.min(1, L.glow);
      g.addColorStop(0, `rgba(127,209,199,${p.fade})`); g.addColorStop(1, `rgba(${Math.round(127 + 112 * hot)},${Math.round(209 + 0 * hot)},${Math.round(199 - 68 * hot)},${p.fade})`);
      c.strokeStyle = li === 0 ? '#ffffff' : g; c.lineWidth = li === 0 ? 3 : 1.5 + p.sc; c.stroke();
    }
  },
});

// F2. Glow matrix. Dot-matrix columns, but each dot has its own brightness that eases on fast and fades slow,
// so the column top is a soft gradient rather than a hard step. The fall is still beat-locked: the column's
// target height only drops on 1/16 ticks, but the dots ease toward it. A peak-hold dot floats above each
// column and drifts down. Additive glow so dense areas bloom.
V2.push({
  id: 'matrix', name: 'F2. Glow matrix',
  blurb: "LED matrix with soft light. Column height follows the waveform shape times a sprung bass envelope, rises instantly and only falls on 1/16-note ticks at 132 BPM, so the decay stays rhythmic. Each dot fades in and out on its own curve, so the top of every column is a soft gradient. A peak dot hovers above each column and floats down. Hi-hat hits sparkle along the peaks.",
  init(track) { const n = 52, rows = 16; return { n, rows, shape: fullShape(track, n), tgt: new Float32Array(n), dot: new Float32Array(n * rows), peak: new Float32Array(n), last16: -1, sp: { x: 0, v: 0 }, spark: new Float32Array(n) }; },
  draw(c, R, a, st, pos, dt) {
    const { n, rows } = st, step = R.w / n, gy = R.h / rows, rad = Math.min(step, gy) * 0.3;
    st.sp.v += (240 * ((0.3 + a.env[0] * 0.55 + a.kick * 0.25) - st.sp.x) - 20 * st.sp.v) * dt; st.sp.x += st.sp.v * dt;
    const s16 = Math.floor((a.beat || 0) * 4), tick = s16 !== st.last16; st.last16 = s16;
    const hat = a.hit && (a.hit[4] || a.hit[5]);
    for (let i = 0; i < n; i++) {
      const t = st.shape[i] * rows * st.sp.x * (1 + 0.12 * Math.sin(i * 0.4 - (a.beat || 0) * Math.PI / 2));
      if (t > st.tgt[i]) st.tgt[i] = t; else if (tick) st.tgt[i] = Math.max(t, st.tgt[i] - 1);
      st.peak[i] = Math.max(st.tgt[i], st.peak[i] - dt * 3);
      if (hat && Math.random() < 0.25) st.spark[i] = 1; st.spark[i] *= Math.exp(-dt * 5);
      for (let k = 0; k < rows; k++) {
        const on = Math.min(1, Math.max(0, st.tgt[i] - k)), j = i * rows + k;
        st.dot[j] += (on - st.dot[j]) * (1 - Math.exp(-dt / (on > st.dot[j] ? 0.02 : 0.18)));
      }
    }
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const x = R.x + i * step + step / 2, done = i / n < pos;
      for (let k = 0; k < rows; k++) {
        const v = st.dot[i * rows + k], y = R.y - k * gy - gy / 2;
        if (v < 0.02) { c.fillStyle = 'rgba(255,255,255,0.05)'; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill(); continue; }
        const col = done ? (k / rows < 0.55 ? [127, 209, 199] : k / rows < 0.8 ? [185, 227, 192] : [239, 209, 131]) : [215, 210, 235];
        c.fillStyle = `rgba(${col},${(done ? 0.95 : 0.45) * v})`; c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill();
        if (done && v > 0.5) { c.fillStyle = `rgba(${col},${0.12 * v})`; c.beginPath(); c.arc(x, y, rad * 2.6, 0, 7); c.fill(); }
      }
      const py = R.y - st.peak[i] * gy - gy / 2, sp = st.spark[i];
      c.fillStyle = `rgba(255,255,255,${0.35 + sp * 0.65})`; c.beginPath(); c.arc(x, py, rad * (1 + sp * 0.8), 0, 7); c.fill();
    }
    c.restore();
  },
});
