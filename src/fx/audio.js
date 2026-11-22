/**
 * 효과음 전부 Web Audio로 합성 (에셋 없음).
 * 첫 사용자 입력(클릭/키) 이후에만 소리가 남 (브라우저 정책).
 */
let ctx = null, master = null, noiseBuf = null;
let ambience = null;

function ensure() {
  if (ctx) return ctx.state === 'running';
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return false;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.7;
  master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx.state === 'running';
}
export function unlockAudio() {
  ensure();
  if (ctx && ctx.state !== 'running') ctx.resume();
  if (!ambience && ctx) startAmbience();
}
addEventListener('pointerdown', unlockAudio, { once: false });
addEventListener('keydown', unlockAudio, { once: false });

function noise({ dur, type = 'bandpass', freq = 1000, q = 1, gain = 0.5, attack = 0.002, at = 0, out = master }) {
  if (!ensure()) return;
  const t0 = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t0, Math.random());
  src.stop(t0 + dur + 0.05);
  return { f, g, t0 };
}
function tone({ freq, dur, type = 'sine', gain = 0.2, at = 0, slide = 0, out = master }) {
  if (!ensure()) return;
  const t0 = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(out);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}
/** 거리 감쇠용 출력 노드 */
function at(dist = 0) {
  if (!ensure()) return null;
  const g = ctx.createGain();
  g.gain.value = Math.max(0, 1 - dist / 14) ** 1.5;
  g.connect(master);
  return g;
}

export const sfx = {
  /** 라이터 딸깍 (ok면 불 붙는 소리까지) */
  click(ok, dist = 0) {
    const out = at(dist); if (!out || out.gain.value < 0.01) return;
    noise({ dur: 0.03, type: 'highpass', freq: 3500, gain: 0.6, out });
    tone({ freq: 2400, dur: 0.04, type: 'square', gain: 0.05, out });
    if (ok) noise({ dur: 0.5, type: 'lowpass', freq: 900, gain: 0.18, attack: 0.03, at: 0.03, out });
  },
  /** 쓰읍 (빨기) — 지속음이라 핸들 반환 */
  inhaleStart() {
    if (!ensure()) return null;
    const n = noise({ dur: 4, type: 'bandpass', freq: 1800, q: 0.7, gain: 0.05, attack: 0.25 });
    return n;
  },
  inhaleStop(h) {
    if (!h || !ctx) return;
    const t = ctx.currentTime;
    h.g.gain.cancelScheduledValues(t);
    h.g.gain.setValueAtTime(h.g.gain.value, t);
    h.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  },
  /** 후~ */
  exhale(k = 1, dist = 0) {
    const out = at(dist); if (!out || out.gain.value < 0.01) return;
    const n = noise({ dur: 0.9 + k * 0.4, type: 'bandpass', freq: 650, q: 0.6, gain: 0.12 * k, attack: 0.08, out });
    if (n) n.f.frequency.exponentialRampToValueAtTime(320, n.t0 + 1.1);
  },
  /** 콜록콜록 */
  cough(dist = 0) {
    const out = at(dist); if (!out || out.gain.value < 0.01) return;
    [0, 0.32, 0.58, 1.0].forEach((t, i) => {
      noise({ dur: 0.18, type: 'bandpass', freq: 520 - i * 40, q: 1.6, gain: 0.45, attack: 0.008, at: t, out });
      tone({ freq: 190 - i * 10, dur: 0.12, type: 'sawtooth', gain: 0.05, at: t, slide: 0.6, out });
    });
  },
  /** 톡톡 재 털기 */
  tap(dist = 0) {
    const out = at(dist); if (!out || out.gain.value < 0.01) return;
    tone({ freq: 900, dur: 0.05, type: 'triangle', gain: 0.08, out });
    tone({ freq: 850, dur: 0.05, type: 'triangle', gain: 0.06, at: 0.12, out });
  },
  /** 카톡 알림 비슷한 띵 */
  ding() {
    tone({ freq: 1318, dur: 0.18, gain: 0.12 });
    tone({ freq: 1760, dur: 0.25, gain: 0.1, at: 0.09 });
  },
  /** 폰 진동 */
  buzz() {
    for (let i = 0; i < 2; i++) tone({ freq: 140, dur: 0.22, type: 'sawtooth', gain: 0.04, at: i * 0.32 });
  },
};

/** 도시 앰비언스 + 빗소리 (setRain으로 조절) */
function startAmbience() {
  const mk = (type, freq, gain) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(f).connect(g).connect(master);
    src.start();
    return g;
  };
  ambience = { city: mk('lowpass', 180, 0.07), rain: mk('highpass', 1400, 0) };
}
export function setRain(on) {
  if (!ambience) return;
  ambience.rain.gain.setTargetAtTime(on ? 0.09 : 0, ctx.currentTime, 1.2);
}
