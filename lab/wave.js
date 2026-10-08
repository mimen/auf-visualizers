// Drops a lab waveform onto a concept page. The page keeps its own background and audio element;
// this adds the precomputed analysis, the two picked waveforms (C2 flowing ridges, A gated pump bars)
// and a switch between them. ?wave=pump starts on the bars.
import { precompute } from './audio.js';
import { V2 } from './v2.js';
import { VARIANTS } from './variants.js';

const WAVES = [V2.find((v) => v.id === 'ridges2'), VARIANTS.find((v) => v.id === 'pump')];
const LABELS = ['Flowing ridges', 'Pump bars'];

export async function mountWave({ audio, track, getContext, button }) {
  const lookup = await precompute(await new OfflineAudioContext(1, 1, 44100).decodeAudioData(await (await fetch('../assets/clip.mp3')).arrayBuffer()));
  const lead = +(new URLSearchParams(location.search).get('lead') ?? 30) / 1000;
  let cur = new URLSearchParams(location.search).get('wave') === 'pump' ? 1 : 0, state = null, lastT = 0;
  const st = WAVES.map((v) => v.init(track));
  const sw = document.createElement('button'); sw.style.marginLeft = '10px';
  const label = () => { sw.textContent = `Waveform: ${LABELS[cur]}`; }; label();
  sw.onclick = () => { cur = 1 - cur; label(); }; button.after(sw);
  return function draw(ctx, R, pos, dt) {
    const ac = getContext();
    if (ac && !audio.paused) { const t = audio.currentTime - (ac.outputLatency || ac.baseLatency || 0) + lead; state = lookup(t, lastT); lastT = t; }
    const a = state || { env: new Float32Array(6), gate: new Float32Array(6), hit: new Uint8Array(6), spectrum: new Float32Array(96), kick: 0, beat: 0 };
    ctx.save(); WAVES[cur].draw(ctx, R, a, st[cur], pos, dt); ctx.restore();
  };
}
