// Waveform variants. Each draws into region R = {x, y (baseline), w, h (max height above baseline)}.
// Shared idea: the song's own waveform (bass-driven) is the body; the other bands decorate it smoothly.
const TEAL = '#7fd1c7', GOLD = '#efd183', SALMON = '#f2a7a0', PERI = '#8fb4ff', MINT = '#a1d5b0';
const lerp = (a, b, t) => a + (b - a) * t;
const spring = (st, target, dt, k = 170, c = 14) => { // critically-damped-ish spring, returns position
  const a = k * (target - st.x) - c * st.v; st.v += a * dt; st.x += st.v * dt; return st.x;
};

// Downsample the full-track peaks around the playhead: a scrolling window of the real waveform.
function windowPeaks(track, pos, n, span) {
  const out = new Float32Array(n), P = track.peaks, L = P.length;
  for (let i = 0; i < n; i++) {
    const t = pos + (i / (n - 1) - 0.5) * span, j = Math.floor(t * L);
    out[i] = j < 0 || j >= L ? 0 : P[j];
  }
  return out;
}
// Full-track shape, contrast-stretched: the quietest bucket maps to 0.12 and the loudest to 1,
// with a power curve so the breakdowns read as valleys instead of a flat block.
function fullShape(track, n) {
  const P = track.peaks, b = P.length / n;
  const raw = Float32Array.from({ length: n }, (_, i) => { let s = 0, c = 0; for (let k = Math.floor(i * b); k < Math.floor((i + 1) * b); k++) { s += P[k]; c++; } return s / Math.max(1, c); });
  const lo = Math.min(...raw), hi = Math.max(...raw);
  return raw.map((v) => 0.12 + 0.88 * Math.pow((v - lo) / (hi - lo || 1), 1.8));
}

export const VARIANTS = [
  {
    id: 'pump', name: 'A. Gated pump bars',
    blurb: "Discrete bars from the full track's waveform. Height comes from the bass envelope only, so the whole row breathes with the low end. A kick onset (not raw level) fires a spring that overshoots and settles, so hits feel punchy but never jittery. Highs only add a soft glint on bar tips.",
    init(track) { return { shape: fullShape(track, 84), sp: { x: 0, v: 0 } }; },
    draw(c, R, a, st, pos, dt) {
      const pump = spring(st.sp, 0.25 + a.env[0] * 0.5 + a.kick * 0.3, dt, 220, 16);
      const n = st.shape.length, step = R.w / n, bw = step * 0.55;
      for (let i = 0; i < n; i++) {
        const ripple = 1 + 0.12 * Math.sin(i * 0.45 - a.beat * Math.PI) * a.env[2], h = Math.max(6, st.shape[i] * R.h * pump * ripple), x = R.x + i * step + (step - bw) / 2, done = i / n < pos;
        c.fillStyle = done ? TEAL : 'rgba(255,255,255,0.32)';
        c.beginPath(); c.roundRect(x, R.y - h, bw, h, bw / 2); c.fill();
        c.globalAlpha = 0.18; c.beginPath(); c.roundRect(x, R.y + 4, bw, h * 0.3, bw / 2); c.fill(); c.globalAlpha = 1;
        const glint = a.env[5] * 0.8 + a.gate[4] * 0.5;
        if (glint > 0.05) { c.fillStyle = `rgba(255,255,255,${Math.min(0.9, glint)})`; c.beginPath(); c.arc(x + bw / 2, R.y - h, bw * 0.45, 0, 7); c.fill(); }
      }
    },
  },
  {
    id: 'strands', name: 'B. Siri strands',
    blurb: "Three luminous strands (teal, gold, salmon) in the Apple/Siri style: each is a sum of travelling sine waves under a bell-shaped attenuation, so the ends stay pinned and the middle swells. Strand amplitude follows bass, low-mid and presence envelopes through springs, so each band moves its own strand smoothly. Additive blend where they cross.",
    init() { return { sp: [0, 1, 2].map(() => ({ x: 0, v: 0 })), ph: [0, 2, 4] }; },
    draw(c, R, a, st, pos, dt) {
      const bands = [[0, TEAL, 1.0], [2, GOLD, 1.6], [4, SALMON, 2.3]];
      c.save(); c.globalCompositeOperation = 'lighter';
      bands.forEach(([b, col, f], k) => {
        const amp = spring(st.sp[k], Math.max(a.env[b], a.gate[b] * 0.8), dt, 90, 12);
        st.ph[k] += dt * (1.2 + f * 0.6 + a.env[b] * 2);
        for (const [lw, al] of [[18, 0.08], [7, 0.22], [2.5, 0.95]]) {
          c.beginPath();
          for (let i = 0; i <= 240; i++) {
            const u = i / 240, x = R.x + u * R.w, att = Math.pow(Math.sin(Math.PI * u), 2.4);
            const y = R.y - R.h * 0.42 + Math.sin(u * Math.PI * 2 * f + st.ph[k]) * Math.cos(u * Math.PI * 3.1 - st.ph[k] * 0.7) * att * amp * R.h * 0.5;
            i ? c.lineTo(x, y) : c.moveTo(x, y);
          }
          c.strokeStyle = col; c.globalAlpha = al; c.lineWidth = lw; c.stroke();
        }
      });
      c.restore();
      c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(R.x, R.y + 30, R.w, 3);
      c.fillStyle = TEAL; c.fillRect(R.x, R.y + 30, R.w * pos, 3);
    },
  },
  {
    id: 'ridges', name: 'C. Ridgeline history',
    blurb: "Unknown Pleasures style. Every 1/8 note a new line is stamped from the live spectrum (bass on the left, highs on the right) and the stack scrolls back into depth, so you see the last two bars as a landscape. The newest line is bright, older lines dim and occlude each other. Gated: only onsets add a bright crest, so the drops read as mountains.",
    init() { return { lines: [], acc: 0 }; },
    draw(c, R, a, st, pos, dt) {
      st.acc += dt;
      const every = 60 / 132 / 2;
      if (st.acc >= every) { st.acc -= every; st.lines.unshift({ s: Float32Array.from(a.spectrum), hit: a.kick }); if (st.lines.length > 16) st.lines.pop(); }
      const N = st.lines.length, gap = R.h * 0.055;
      for (let li = N - 1; li >= 0; li--) {
        const L = st.lines[li], y0 = R.y - li * gap, sc = 1 - li * 0.03, x0 = R.x + R.w * (1 - sc) / 2, w = R.w * sc;
        c.beginPath(); c.moveTo(x0, y0);
        for (let i = 0; i < 96; i++) { const u = i / 95, bell = Math.pow(Math.sin(Math.PI * u), 0.7); c.lineTo(x0 + u * w, y0 - L.s[i] * bell * R.h * (0.35 + L.hit * 0.35)); }
        c.lineTo(x0 + w, y0); c.closePath();
        c.fillStyle = '#1b1830'; c.fill();
        const fade = 1 - li / N;
        c.strokeStyle = li === 0 ? '#fff' : `rgba(127,209,199,${0.15 + fade * 0.6})`; c.lineWidth = li === 0 ? 3 : 2; c.stroke();
      }
    },
  },
  {
    id: 'scrub', name: 'D. Scrolling waveform + band glow',
    blurb: "The real waveform scrolls under a fixed playhead (bars ahead dim, bars behind lit), so the shape is the song itself, not a live guess. The live audio only touches it near the playhead: a soft lens bulges the bars by the bass envelope, and onsets in mids and highs light the bars in gold and salmon that fade out as they scroll away.",
    init(track) { return { track, heat: new Float32Array(120) }; },
    draw(c, R, a, st, pos, dt) {
      const n = 120, span = 0.06, pk = windowPeaks(st.track, pos, n, span), step = R.w / n, bw = step * 0.6;
      // Heat travels left with the scroll; new heat is injected at the playhead.
      const shift = (dt / (span * 365.45)) * n; st.heat.copyWithin(0, Math.min(n - 1, Math.round(shift)));
      const mid = n / 2 | 0; st.heat[mid] = Math.max(st.heat[mid], a.gate[3] * 0.8 + a.gate[4] * 0.6);
      for (let i = 0; i < n; i++) st.heat[i] *= Math.exp(-dt * 1.2);
      for (let i = 0; i < n; i++) {
        const d = (i - mid) / 12, lens = 1 + Math.exp(-d * d) * (a.env[0] * 0.6 + a.kick * 0.3);
        const h = Math.max(4, pk[i] * R.h * 0.8 * lens), x = R.x + i * step, hot = st.heat[i];
        c.fillStyle = i < mid ? TEAL : 'rgba(255,255,255,0.3)';
        c.beginPath(); c.roundRect(x, R.y - h / 2 - R.h * 0.3, bw, h, bw / 2); c.fill();
        if (hot > 0.04) { c.globalAlpha = Math.min(1, hot); c.fillStyle = hot > 0.4 ? GOLD : SALMON; c.beginPath(); c.roundRect(x, R.y - h / 2 - R.h * 0.3, bw, h, bw / 2); c.fill(); c.globalAlpha = 1; }
      }
      c.fillStyle = '#fff'; c.fillRect(R.x + mid * step + bw / 2 - 1.5, R.y - R.h * 0.85, 3, R.h * 1.1);
    },
  },
  {
    id: 'mirror', name: 'E. Mirrored band stack',
    blurb: "Bars grow up and down from a centre line. The bass envelope sets the overall height (the waveform body). Each bar is split into stacked colour segments, one per band group (teal low, gold mid, salmon high), whose proportions shift with the band envelopes, so the colour of the wave tells you what is playing. Onsets add a short white flash to the segment that hit.",
    init(track) { return { shape: fullShape(track, 64) }; },
    draw(c, R, a, st, pos, dt) {
      const n = st.shape.length, step = R.w / n, bw = step * 0.62, cy = R.y - R.h * 0.45;
      const lo = a.env[0] + a.env[1], mi = a.env[2] + a.env[3], hi = a.env[4] + a.env[5], tot = lo + mi + hi + 1e-3;
      const parts = [[lo / tot, TEAL, Math.max(a.gate[0], a.gate[1])], [mi / tot, GOLD, Math.max(a.gate[2], a.gate[3])], [hi / tot, SALMON, Math.max(a.gate[4], a.gate[5])]];
      const body = 0.3 + a.env[0] * 0.55 + a.kick * 0.15;
      for (let i = 0; i < n; i++) {
        const H = Math.max(8, st.shape[i] * R.h * 0.5 * body * (1 + 0.15 * Math.sin(i * 0.5 - a.beat * Math.PI) * a.env[2])), x = R.x + i * step + (step - bw) / 2, dim = i / n < pos ? 1 : 0.35;
        let y = cy - H;
        for (const [p, col, g] of parts) {
          const seg = 2 * H * p;
          c.globalAlpha = dim; c.fillStyle = col; c.fillRect(x, y, bw, seg);
          if (g > 0.1) { c.globalAlpha = g * 0.7 * dim; c.fillStyle = '#fff'; c.fillRect(x, y, bw, seg); }
          y += seg;
        }
        c.globalAlpha = 1;
      }
    },
  },
  {
    id: 'orbit', name: 'F. Beat-locked dots',
    blurb: "Each bar is a column of dots instead of a solid bar (LED / dot-matrix look). The number of lit dots follows the waveform shape times the bass envelope. Dots don't jitter: they snap on with a fast attack and fall off one at a time on a 1/16-note grid locked to 132 BPM, so the decay is rhythmic. Hi-hat onsets sparkle a random dot near the top.",
    init(track) { return { shape: fullShape(track, 56), lit: new Float32Array(56), last16: -1, sparks: [] }; },
    draw(c, R, a, st, pos, dt) {
      const n = st.shape.length, step = R.w / n, rows = 14, r = step * 0.26, gy = R.h / rows;
      const s16 = Math.floor(a.beat * 4), tick = s16 !== st.last16; st.last16 = s16;
      for (let i = 0; i < n; i++) {
        const target = Math.round(st.shape[i] * rows * (0.3 + a.env[0] * 0.55 + a.kick * 0.25) * (1 + 0.15 * Math.sin(i * 0.5 - a.beat * Math.PI)));
        if (target > st.lit[i]) st.lit[i] = target; else if (tick && st.lit[i] > target) st.lit[i] -= 1;
      }
      if (a.gate[5] > 0.9 || a.gate[4] > 0.9) st.sparks.push({ i: Math.random() * n | 0, life: 1 });
      for (let i = 0; i < n; i++) {
        const x = R.x + i * step + step / 2, done = i / n < pos;
        for (let k = 0; k < rows; k++) {
          const on = k < st.lit[i], y = R.y - k * gy - gy / 2;
          c.fillStyle = on ? (done ? lerpCol(k / rows) : 'rgba(255,255,255,0.55)') : 'rgba(255,255,255,0.06)';
          c.beginPath(); c.arc(x, y, r, 0, 7); c.fill();
        }
      }
      st.sparks = st.sparks.filter((s) => (s.life -= dt * 2.5) > 0);
      for (const s of st.sparks) { const x = R.x + s.i * step + step / 2, y = R.y - st.lit[s.i] * gy - gy / 2; c.fillStyle = `rgba(255,255,255,${s.life})`; c.beginPath(); c.arc(x, y, r * 1.4, 0, 7); c.fill(); }
    },
  },
];
function lerpCol(t) { return t < 0.5 ? TEAL : t < 0.8 ? MINT : GOLD; }
