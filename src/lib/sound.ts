// Original, minimal sound cues generated in code. Sound is off by default.
let ctx: AudioContext | null = null;
function tone(freqs: number[], dur = 0.09, gap = 0.02) {
  try {
    ctx = ctx ?? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    let t = ctx.currentTime;
    for (const f of freqs) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur);
      t += dur + gap;
    }
  } catch { /* audio not available */ }
}
export const sounds = {
  correct: () => tone([660, 990]),
  wrong: () => tone([220, 180], 0.12),
  complete: () => tone([523, 659, 784, 1047], 0.1),
  tap: () => tone([440], 0.03),
};
