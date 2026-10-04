// Audio analysis shared by every waveform variant.
// Raw FFT jitters; everything here is conditioned before it reaches a visual:
// - bands: 6 log-spaced bands in dB, normalised against their own running floor and ceiling (auto-gain)
// - env: envelope follower per band, fast attack / slow release
// - gate: per-band onset gate (spectral flux over an adaptive threshold) that fires a 0..1 pulse with exponential decay
// - kick: the low-band gate, plus a beat clock locked to 132 BPM so motion can phase-lock to the bar
const BANDS = [[30, 90], [90, 250], [250, 800], [800, 2500], [2500, 6000], [6000, 14000]];
export const BAND_NAMES = ['sub', 'bass', 'low mid', 'mid', 'presence', 'air'];
export const BPM = 132, CLIP_OFFSET = 160.5, TRACK_LEN = 365.45;

export function createAnalysis(ctx, source) {
  const an = ctx.createAnalyser();
  an.fftSize = 2048; an.smoothingTimeConstant = 0; // we smooth ourselves
  source.connect(an);
  const bins = an.frequencyBinCount, hz = ctx.sampleRate / an.fftSize;
  const db = new Float32Array(bins), wave = new Float32Array(an.fftSize);
  const ranges = BANDS.map(([lo, hi]) => [Math.max(1, Math.round(lo / hz)), Math.round(hi / hz)]);
  // The bass alone, low-passed, for variants that draw the actual bass waveform.
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150; lp.Q.value = 0.7;
  const anB = ctx.createAnalyser(); anB.fftSize = 4096; source.connect(lp); lp.connect(anB);
  const bassWave = new Float32Array(anB.fftSize);
  const n = BANDS.length;
  const s = {
    raw: new Float32Array(n), level: new Float32Array(n), env: new Float32Array(n), gate: new Float32Array(n),
    floor: new Float32Array(n).fill(-60), ceil: new Float32Array(n).fill(36), // running mean and variance in dB
    flux: new Float32Array(n), fluxAvg: new Float32Array(n), fluxVar: new Float32Array(n), lastHit: new Float32Array(n),
    prev: new Float32Array(bins), wave, bassWave, hit: new Uint8Array(n), spectrum: new Float32Array(96), kick: 0, beat: 0, bar: 0, onsets: 0,
  };
  // 96 log-spaced spectrum points (40 Hz..16 kHz) for variants that want a continuous shape.
  const specIdx = Array.from({ length: 97 }, (_, i) => Math.round(40 * Math.pow(400, i / 96) / hz));

  return function update(dt, time) {
    an.getFloatFrequencyData(db); an.getFloatTimeDomainData(wave); anB.getFloatTimeDomainData(bassWave); s.hit.fill(0);
    for (let b = 0; b < n; b++) {
      const [lo, hi] = ranges[b]; let sum = 0, flux = 0;
      for (let k = lo; k < hi; k++) { const v = Math.max(db[k], -110); sum += v; const d = v - s.prev[k]; if (d > 0) flux += d; }
      const v = sum / (hi - lo); s.raw[b] = v; flux /= (hi - lo);
      // Auto-gain: level is how far this band sits above or below its own recent average (about 3 s),
      // in units of its recent spread, squashed to 0..1. 0.5 means "normal for this song right now".
      const ag = 1 - Math.exp(-dt / 3), d0 = v - s.floor[b];
      s.floor[b] += d0 * ag; s.ceil[b] += (d0 * d0 - s.ceil[b]) * ag;
      const z = (v - s.floor[b]) / Math.max(2.5, Math.sqrt(Math.max(0, s.ceil[b])));
      const level = 1 / (1 + Math.exp(-z * 1.6));
      s.level[b] = level;
      // Envelope follower: ~15 ms attack, ~250 ms release.
      s.env[b] += (level - s.env[b]) * (level > s.env[b] ? 1 - Math.exp(-dt / 0.015) : 1 - Math.exp(-dt / 0.25));
      // Onset gate: flux above mean + 1.6 sd of recent flux, with a refractory period so it fires once per hit.
      const a = 1 - Math.exp(-dt / 0.6);
      const dev = flux - s.fluxAvg[b]; s.fluxAvg[b] += dev * a; s.fluxVar[b] += (dev * dev - s.fluxVar[b]) * a;
      const thresh = s.fluxAvg[b] + 1.6 * Math.sqrt(s.fluxVar[b]) + 0.4;
      if (flux > thresh && time - s.lastHit[b] > (b < 2 ? 0.18 : 0.09)) { s.gate[b] = 1; s.hit[b] = 1; s.lastHit[b] = time; s.onsets++; }
      s.gate[b] *= Math.exp(-dt / (b < 2 ? 0.22 : 0.12));
      s.flux[b] = flux;
    }
    for (let k = 0; k < bins; k++) s.prev[k] = Math.max(db[k], -110);
    for (let i = 0; i < 96; i++) {
      let m = -110; for (let k = specIdx[i]; k <= Math.max(specIdx[i], specIdx[i + 1] - 1); k++) m = Math.max(m, db[k]);
      const v = Math.min(1, Math.max(0, (m + 85) / 60));
      s.spectrum[i] += (v - s.spectrum[i]) * (v > s.spectrum[i] ? 1 - Math.exp(-dt / 0.02) : 1 - Math.exp(-dt / 0.3));
    }
    s.kick = Math.max(s.gate[0], s.gate[1]);
    s.beat = time * BPM / 60; s.bar = s.beat / 4;
    return s;
  };
}
