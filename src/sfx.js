// src/sfx.js — WebAudioによる和風サウンドエンジン。
// 琴・太鼓・銅鑼などをすべて合成音で生成し、モード別のプロシージャルBGMを流す。
// AudioContextが使えない環境でも一切エラーを出さず、ゲーム進行に影響させない。

let ac = null;
let master = null;
let musicBus = null;
let sfxBus = null;
let noiseBuf = null;
let muted = false;
let mode = 'off'; // 'off' | 'title' | 'calm' | 'battle'
let step = 0;
let nextT = 0;
let timer = null;
const lastPlay = {}; // 連射音のスロットリング

export function initAudio() {
  if (ac) {
    if (ac.state === 'suspended') ac.resume().catch(() => {});
    return;
  }
  try {
    ac = new (window.AudioContext || window.webkitAudioContext)();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 1;
    master.connect(ac.destination);
    musicBus = ac.createGain();
    musicBus.gain.value = 0.055;
    musicBus.connect(master);
    sfxBus = ac.createGain();
    sfxBus.gain.value = 0.16;
    sfxBus.connect(master);

    noiseBuf = ac.createBuffer(1, ac.sampleRate * 1, ac.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    nextT = ac.currentTime + 0.1;
    timer = setInterval(tick, 110);
  } catch {
    ac = null;
  }
}

export function setMuted(m) {
  muted = m;
  if (master && ac) master.gain.setTargetAtTime(m ? 0 : 1, ac.currentTime, 0.02);
}

export function isMuted() {
  return muted;
}

export function setMode(m) {
  if (m === mode) return;
  mode = m;
  step = 0;
}

// ---------------- 楽器（合成） ----------------
function env(g, t, vel, attack, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vel, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

// 琴：三角波＋倍音、ローパスで柔らかく
function koto(freq, t, vel = 0.5, bus = musicBus) {
  if (!ac) return;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2100;
  lp.connect(bus);
  const g1 = ac.createGain();
  env(g1, t, vel, 0.006, 0.7);
  const o1 = ac.createOscillator();
  o1.type = 'triangle';
  o1.frequency.value = freq;
  o1.connect(g1).connect(lp);
  const g2 = ac.createGain();
  env(g2, t, vel * 0.25, 0.004, 0.3);
  const o2 = ac.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = freq * 2.02;
  o2.connect(g2).connect(lp);
  o1.start(t); o1.stop(t + 1);
  o2.start(t); o2.stop(t + 0.5);
}

// 太鼓ドン：低いサインのピッチ落下＋皮鳴りノイズ
function don(t, vel = 0.9, bus = musicBus) {
  if (!ac) return;
  const g = ac.createGain();
  env(g, t, vel, 0.004, 0.28);
  const o = ac.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(96, t);
  o.frequency.exponentialRampToValueAtTime(46, t + 0.22);
  o.connect(g).connect(bus);
  o.start(t); o.stop(t + 0.35);
  const ng = ac.createGain();
  env(ng, t, vel * 0.3, 0.002, 0.06);
  const n = ac.createBufferSource();
  n.buffer = noiseBuf;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 320;
  n.connect(lp).connect(ng).connect(bus);
  n.start(t); n.stop(t + 0.1);
}

// 締太鼓カッ：短い高域ノイズ
function ka(t, vel = 0.4, bus = musicBus) {
  if (!ac) return;
  const g = ac.createGain();
  env(g, t, vel, 0.001, 0.05);
  const n = ac.createBufferSource();
  n.buffer = noiseBuf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2400;
  bp.Q.value = 1.2;
  n.connect(bp).connect(g).connect(bus);
  n.start(t); n.stop(t + 0.08);
}

// 銅鑼：不協和な倍音の長い減衰
function gong(t, vel = 0.7, base = 98) {
  if (!ac) return;
  [1, 1.51, 2.32, 3.03].forEach((ratio, i) => {
    const g = ac.createGain();
    env(g, t, vel / (i + 1.5), 0.01, 1.8 - i * 0.3);
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.value = base * ratio;
    o.connect(g).connect(sfxBus);
    o.start(t); o.stop(t + 2);
  });
}

// 鈴・小判
function chime(freq, t, vel = 0.35, dur = 0.25) {
  if (!ac) return;
  const g = ac.createGain();
  env(g, t, vel, 0.002, dur);
  const o = ac.createOscillator();
  o.type = 'square';
  o.frequency.value = freq;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5200;
  o.connect(lp).connect(g).connect(sfxBus);
  o.start(t); o.stop(t + dur + 0.1);
}

// 矢羽音・風切り
function whoosh(t, vel = 0.14, freq = 900) {
  if (!ac) return;
  const g = ac.createGain();
  env(g, t, vel, 0.004, 0.09);
  const n = ac.createBufferSource();
  n.buffer = noiseBuf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(freq, t);
  bp.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.09);
  bp.Q.value = 2.5;
  n.connect(bp).connect(g).connect(sfxBus);
  n.start(t); n.stop(t + 0.15);
}

// ---------------- BGM（プロシージャル） ----------------
// 陽音階（D）: D E G A B
const SCALE = [293.66, 329.63, 392.0, 440.0, 493.88, 587.33, 659.26, 784.0];

// 32ステップのパターン。[step, 音index(-1=低音), vel]
const MELODY_TITLE = [
  [0, 0, 0.5], [6, 2, 0.35], [8, 3, 0.45], [14, 4, 0.3],
  [16, 5, 0.5], [22, 3, 0.35], [24, 2, 0.4], [30, 1, 0.3],
];
const MELODY_CALM = [
  [0, 0, 0.5], [4, 2, 0.3], [8, 3, 0.42], [12, 2, 0.3],
  [16, 4, 0.48], [20, 3, 0.3], [24, 2, 0.4], [28, 1, 0.28],
];
const MELODY_BATTLE = [
  [0, 0, 0.55], [3, 2, 0.3], [6, 3, 0.4], [8, 5, 0.55], [11, 4, 0.35],
  [14, 3, 0.4], [16, 0, 0.55], [19, 2, 0.3], [22, 3, 0.42], [24, 6, 0.5],
  [27, 5, 0.35], [30, 4, 0.4],
];

function tick() {
  if (!ac || mode === 'off' || muted) {
    if (ac) nextT = Math.max(nextT, ac.currentTime + 0.05);
    return;
  }
  const spb = mode === 'battle' ? 0.145 : mode === 'calm' ? 0.21 : 0.24;
  while (nextT < ac.currentTime + 0.35) {
    scheduleStep(step, nextT);
    nextT += spb;
    step = (step + 1) % 32;
  }
}

function scheduleStep(s, t) {
  const melody = mode === 'battle' ? MELODY_BATTLE : mode === 'calm' ? MELODY_CALM : MELODY_TITLE;
  for (const [ms, ni, vel] of melody) {
    if (ms === s) koto(SCALE[ni], t, vel);
  }
  if (mode === 'battle') {
    if (s % 8 === 0) don(t, 0.8);
    if (s % 8 === 4) don(t, 0.55);
    if (s % 8 === 6) ka(t, 0.3);
    if (s === 28) { ka(t, 0.35); }
  } else if (mode === 'calm') {
    if (s === 0) don(t, 0.4);
    if (s === 16) ka(t, 0.18);
  }
}

// ---------------- 効果音（イベント名で再生） ----------------
function throttled(key, gapSec) {
  if (!ac) return true;
  const now = ac.currentTime;
  if (lastPlay[key] && now - lastPlay[key] < gapSec) return true;
  lastPlay[key] = now;
  return false;
}

const SOUNDS = {
  tap: () => chime(880, ac.currentTime, 0.12, 0.06),
  build: () => { don(ac.currentTime, 0.8, sfxBus); chime(660, ac.currentTime + 0.06, 0.2, 0.15); },
  upgrade: () => {
    koto(SCALE[2], ac.currentTime, 0.5, sfxBus);
    koto(SCALE[4], ac.currentTime + 0.09, 0.5, sfxBus);
    koto(SCALE[5], ac.currentTime + 0.18, 0.6, sfxBus);
  },
  sell: () => { chime(1320, ac.currentTime, 0.25, 0.12); chime(990, ac.currentTime + 0.08, 0.2, 0.16); },
  kill: () => { if (!throttled('kill', 0.05)) chime(1560, ac.currentTime, 0.1, 0.07); },
  combo: () => {
    if (throttled('combo', 0.18)) return;
    chime(1320, ac.currentTime, 0.12, 0.07);
    chime(1760, ac.currentTime + 0.06, 0.14, 0.1);
  },
  earlyCall: () => {
    chime(1320, ac.currentTime, 0.22, 0.1);
    chime(1980, ac.currentTime + 0.07, 0.2, 0.16);
    don(ac.currentTime, 0.6, sfxBus);
  },
  leak: () => gong(ac.currentTime, 0.8, 82),
  waveStart: () => {
    don(ac.currentTime, 0.9, sfxBus);
    don(ac.currentTime + 0.14, 0.7, sfxBus);
    don(ac.currentTime + 0.28, 1, sfxBus);
    ka(ac.currentTime + 0.42, 0.5, sfxBus);
  },
  waveClear: () => {
    koto(SCALE[0], ac.currentTime, 0.55, sfxBus);
    koto(SCALE[2], ac.currentTime + 0.1, 0.55, sfxBus);
    koto(SCALE[4], ac.currentTime + 0.2, 0.55, sfxBus);
    koto(SCALE[5], ac.currentTime + 0.32, 0.7, sfxBus);
    chime(1760, ac.currentTime + 0.32, 0.15, 0.3);
  },
  victory: () => {
    [0, 2, 4, 5, 7].forEach((ni, i) => koto(SCALE[ni], ac.currentTime + i * 0.15, 0.7, sfxBus));
    don(ac.currentTime, 0.9, sfxBus);
    don(ac.currentTime + 0.45, 0.9, sfxBus);
    chime(1760, ac.currentTime + 0.75, 0.25, 0.5);
  },
  gameover: () => {
    gong(ac.currentTime, 0.9, 72);
    [4, 2, 1, 0].forEach((ni, i) => koto(SCALE[ni] / 2, ac.currentTime + 0.2 + i * 0.28, 0.5, sfxBus));
  },
  'shoot-arrow': () => { if (!throttled('arrow', 0.07)) whoosh(ac.currentTime, 0.12, 1100); },
  'shoot-frost': () => { if (!throttled('frost', 0.09)) chime(1980, ac.currentTime, 0.06, 0.1); },
  'shoot-cannon': () => { if (!throttled('cannon', 0.1)) don(ac.currentTime, 0.55, sfxBus); },
  'shoot-sniper': () => { if (!throttled('sniper', 0.1)) { whoosh(ac.currentTime, 0.2, 500); ka(ac.currentTime, 0.4, sfxBus); } },
};

export function playSfx(name) {
  if (!ac || muted) return;
  const fn = SOUNDS[name];
  if (!fn) return;
  try {
    fn();
  } catch { /* noop */ }
}

export function disposeAudio() {
  if (timer) clearInterval(timer);
  timer = null;
}
