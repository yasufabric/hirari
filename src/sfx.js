// src/sfx.js — WebAudioの簡易効果音。失敗しても無視（ゲーム進行に影響させない）。

let ctx = null;

export function initAudio() {
  if (ctx) return;
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch {
    ctx = null;
  }
}

function beep(freq, dur = 0.08, type = 'square', vol = 0.04, slide = 0) {
  if (!ctx || ctx.state === 'suspended') {
    try { ctx?.resume(); } catch { /* noop */ }
  }
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, ctx.currentTime + dur);
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch { /* noop */ }
}

const SOUNDS = {
  build: () => beep(440, 0.1, 'triangle', 0.06, 220),
  upgrade: () => { beep(520, 0.08, 'triangle', 0.06); setTimeout(() => beep(780, 0.1, 'triangle', 0.06), 70); },
  sell: () => beep(600, 0.1, 'triangle', 0.05, -250),
  kill: () => beep(880, 0.05, 'square', 0.02),
  leak: () => beep(180, 0.25, 'sawtooth', 0.07, -60),
  waveStart: () => beep(330, 0.12, 'square', 0.05, 110),
  waveClear: () => { beep(523, 0.1, 'triangle', 0.06); setTimeout(() => beep(659, 0.1, 'triangle', 0.06), 90); setTimeout(() => beep(784, 0.14, 'triangle', 0.06), 180); },
  victory: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.16, 'triangle', 0.07), i * 130)); },
  gameover: () => { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'sawtooth', 0.05), i * 160)); },
};

export function playSfx(name) {
  const fn = SOUNDS[name];
  if (fn) fn();
}
