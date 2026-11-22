/**
 * 효과음 전부 Web Audio로 합성 (에셋 없음).
 * 첫 사용자 입력(클릭/키) 이후에만 소리가 남 (브라우저 정책).
 */
let ctx = null, master = null, noiseBuf = null;
let ambience = null;
let rainOn = true;

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
  // ---------- 자판기 / 음료 ----------
  /** 동전 딸랑 */
  coin(dist = 0) {
    const out = at(dist); if (!out || out.gain.value < 0.01) return;
    const f = 2600 + Math.random() * 900;
    tone({ freq: f, dur: 0.18, type: 'sine', gain: 0.06, out });
    tone({ freq: f * 1.51, dur: 0.12, type: 'sine', gain: 0.03, at: 0.01, out });
    noise({ dur: 0.04, type: 'bandpass', freq: 4000, q: 2, gain: 0.08, at: 0.12, out });
  },
  /** 종이컵 톡 떨어짐 */
  cupDrop(dist = 0) {
    const out = at(dist); if (!out || out.gain.value < 0.01) return;
    tone({ freq: 420, dur: 0.08, type: 'triangle', gain: 0.07, slide: 0.7, out });
    noise({ dur: 0.05, type: 'bandpass', freq: 1200, q: 1.5, gain: 0.1, out });
  },
  /** 지이잉 (모터 + 믹서) — 핸들 반환, stop(h)로 끔 */
  whirr(dist = 0) {
    const out = at(dist); if (!out || out.gain.value < 0.01) return null;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t0);
    o.frequency.linearRampToValueAtTime(118, t0 + 0.4);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 11;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 6;
    lfo.connect(lfoG).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 520;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.05, t0 + 0.25);
    o.connect(f).connect(g).connect(out);
    const n = noise({ dur: 30, type: 'bandpass', freq: 2400, q: 0.8, gain: 0.012, attack: 0.3, out });
    o.start(t0); lfo.start(t0);
    return { stop() {
      const t = ctx.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.25);
      if (n) { n.g.gain.cancelScheduledValues(t); n.g.gain.setValueAtTime(n.g.gain.value, t); n.g.gain.linearRampToValueAtTime(0.0001, t + 0.2); }
      o.frequency.linearRampToValueAtTime(50, t + 0.25);
      o.stop(t + 0.3); lfo.stop(t + 0.3);
    } };
  },
  /** 쪼르륵 (커피 내려옴) — 핸들 반환 */
  pour(dist = 0) {
    const out = at(dist); if (!out || out.gain.value < 0.01) return null;
    const n = noise({ dur: 30, type: 'bandpass', freq: 900, q: 3, gain: 0.04, attack: 0.15, out });
    if (!n) return null;
    // 보글보글: 필터 주파수를 랜덤하게 흔듦
    const id = setInterval(() => { if (ctx) n.f.frequency.setTargetAtTime(650 + Math.random() * 700, ctx.currentTime, 0.02); }, 45);
    return { stop() { clearInterval(id); const t = ctx.currentTime; n.g.gain.cancelScheduledValues(t); n.g.gain.setValueAtTime(n.g.gain.value, t); n.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15); } };
  },
  /** 삐-삐 (완료) */
  beep(dist = 0) {
    const out = at(dist); if (!out || out.gain.value < 0.01) return;
    tone({ freq: 1760, dur: 0.12, type: 'square', gain: 0.025, out });
    tone({ freq: 1760, dur: 0.12, type: 'square', gain: 0.025, at: 0.2, out });
  },
  /** 버튼 딸깍 */
  press(dist = 0) {
    const out = at(dist); if (!out || out.gain.value < 0.01) return;
    noise({ dur: 0.02, type: 'highpass', freq: 3000, gain: 0.12, out });
  },
  /** 캔 덜컹 */
  canDrop(dist = 0) {
    const out = at(dist); if (!out || out.gain.value < 0.01) return;
    tone({ freq: 120, dur: 0.18, type: 'sine', gain: 0.18, slide: 0.6, out });
    noise({ dur: 0.12, type: 'bandpass', freq: 700, q: 1, gain: 0.15, out });
    tone({ freq: 140, dur: 0.12, type: 'sine', gain: 0.1, at: 0.22, slide: 0.7, out });
    tone({ freq: 1900, dur: 0.25, type: 'triangle', gain: 0.02, at: 0.02, out });
  },
  /** 치익 (캔 따기) */
  canOpen(dist = 0) {
    const out = at(dist); if (!out || out.gain.value < 0.01) return;
    noise({ dur: 0.02, type: 'highpass', freq: 2000, gain: 0.2, out });
    noise({ dur: 0.45, type: 'highpass', freq: 5000, gain: 0.07, attack: 0.01, at: 0.02, out });
  },
  /** 후루룩 (한 모금) */
  slurp() {
    const n = noise({ dur: 0.35, type: 'bandpass', freq: 1300, q: 2.5, gain: 0.05, attack: 0.04 });
    if (n) n.f.frequency.exponentialRampToValueAtTime(600, n.t0 + 0.3);
  },
  /** 꿀꺽 */
  gulp() {
    tone({ freq: 260, dur: 0.09, type: 'sine', gain: 0.08, slide: 1.6 });
  },
  /** 쾅 (자판기 치기) */
  bang(dist = 0) {
    const out = at(dist); if (!out || out.gain.value < 0.01) return;
    tone({ freq: 70, dur: 0.3, type: 'sine', gain: 0.25, slide: 0.6, out });
    noise({ dur: 0.2, type: 'lowpass', freq: 900, gain: 0.2, out });
    tone({ freq: 380, dur: 0.4, type: 'triangle', gain: 0.03, at: 0.01, out });
  },
  /** 쓰레기통에 툭 */
  toss(dist = 0) {
    const out = at(dist); if (!out || out.gain.value < 0.01) return;
    noise({ dur: 0.08, type: 'bandpass', freq: 900, q: 1.2, gain: 0.12, at: 0.35, out });
    tone({ freq: 200, dur: 0.1, type: 'sine', gain: 0.06, at: 0.35, slide: 0.7, out });
  },
  /** 빨 때 불씨가 타들어가는 타닥 소리 */
  crackle() {
    noise({ dur: 0.012 + Math.random() * 0.015, type: "highpass", freq: 2500 + Math.random() * 2500, gain: 0.05 + Math.random() * 0.06 });
  },
  /** 폰 진동 */
  buzz() {
    for (let i = 0; i < 2; i++) tone({ freq: 140, dur: 0.22, type: 'sawtooth', gain: 0.04, at: i * 0.32 });
  },
};

/**
 * 빗소리 ASMR (합성)
 *   1) 와시: 핑크 노이즈를 부드럽게 깎은 "쏴아—" (아주 작게)
 *   2) 럼블: 브라운 노이즈 저음 (멀리서 쏟아지는 느낌)
 *   3) 지붕 빗방울: 폴리카보네이트 가림막에 떨어지는 "타닥타닥" — 랜덤 짧은 틱을 좌우로 흩뿌림
 *   4) 낙수: 빗물받이에서 똑… 똑… 떨어지는 소리
 * public/audio/rain.mp3 (직접 구한 CC0/무료 빗소리)가 있으면 그걸 대신 루프 재생.
 */
function makeColoredNoise(kind) {
  const len = ctx.sampleRate * 4;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (kind === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  return buf;
}

function loopNode(buf, filterType, freq, gain, q = 0.7) {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g);
  src.start(0, Math.random() * 3);
  return g;
}

const RAIN_LEVEL = 1; // 전체 빗소리 볼륨 배율

function startAmbience() {
  const pink = makeColoredNoise('pink');
  const brown = makeColoredNoise('brown');
  const city = loopNode(brown, 'lowpass', 160, 0.05);
  city.connect(master);

  const rainBus = ctx.createGain();
  rainBus.gain.value = rainOn ? RAIN_LEVEL : 0;
  rainBus.connect(master);
  ambience = { city, rainBus, file: null };

  // 직접 넣은 빗소리 파일이 있으면 우선
  fetch('/audio/rain.mp3').then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((ab) => ctx.decodeAudioData(ab)).then((buf) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0.6;
    src.connect(g).connect(rainBus);
    src.start();
    ambience.file = src;
  }).catch(() => startSynthRain(pink, brown, rainBus));
}

function startSynthRain(pink, brown, bus) {
  loopNode(pink, 'lowpass', 1400, 0.035, 0.5).connect(bus);   // 쏴아
  loopNode(brown, 'lowpass', 380, 0.05).connect(bus);         // 저음
  loopNode(pink, 'bandpass', 5200, 0.006, 0.6).connect(bus);  // 아주 옅은 고음 결

  // 빗방울 스케줄러 (50ms마다 앞으로 120ms 분량 예약)
  let next = ctx.currentTime + 0.1;
  let nextDrip = ctx.currentTime + 1;
  const drop = (t, big) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = big ? 900 + Math.random() * 700 : 2200 + Math.random() * 3800;
    f.Q.value = big ? 3 : 1.4;
    const g = ctx.createGain();
    const vol = (big ? 0.05 : 0.012 + Math.random() * 0.02);
    const dur = big ? 0.06 : 0.012 + Math.random() * 0.02;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.random() * 1.6 - 0.8;
    src.connect(f).connect(g).connect(p).connect(bus);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  };
  const drip = (t) => {
    // 똑: 빠르게 올라가는 사인 + 짧은 감쇠
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f0 = 700 + Math.random() * 500;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 1.8, t + 0.04);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.03, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    const p = ctx.createStereoPanner();
    p.pan.value = 0.35;
    o.connect(g).connect(p).connect(bus);
    o.start(t);
    o.stop(t + 0.15);
  };
  setInterval(() => {
    if (!rainOn || ctx.state !== 'running') { next = ctx.currentTime + 0.1; nextDrip = next + 0.5; return; }
    const horizon = ctx.currentTime + 0.12;
    while (next < horizon) {
      drop(next, Math.random() < 0.06);
      next += 0.012 + Math.random() * 0.05; // 초당 30~40방울, 불규칙하게
    }
    while (nextDrip < horizon) {
      drip(nextDrip);
      nextDrip += Math.random() < 0.3 ? 0.18 + Math.random() * 0.1 : 0.6 + Math.random() * 1.2;
    }
  }, 50);
}

export function setRain(on) {
  rainOn = on;
  if (!ambience) return;
  ambience.rainBus.gain.setTargetAtTime(on ? RAIN_LEVEL : 0, ctx.currentTime, 1.2);
}

// ---------- 전자담배 / 기타 ----------
Object.assign(sfx, {
  /** 궐련형 준비 완료 징- */
  heatReady() { tone({ freq: 160, dur: 0.18, type: 'sawtooth', gain: 0.04 }); tone({ freq: 160, dur: 0.18, type: 'sawtooth', gain: 0.04, at: 0.25 }); },
  /** 액상 코일 지글지글 (빠는 동안) — 핸들 반환 */
  vapeStart() {
    if (!ensure()) return null;
    return noise({ dur: 6, type: 'bandpass', freq: 3200, q: 0.9, gain: 0.05, attack: 0.05 });
  },
  /** 바스락 (과자 봉지) */
  rustle() { noise({ dur: 0.25, type: 'highpass', freq: 3500, gain: 0.08, attack: 0.01 }); noise({ dur: 0.2, type: 'highpass', freq: 5000, gain: 0.05, at: 0.12 }); },
  /** 와그작 (한 입) */
  crunch() { for (let i = 0; i < 3; i++) noise({ dur: 0.04, type: 'bandpass', freq: 1800 + Math.random() * 1500, q: 1.2, gain: 0.12, at: i * 0.06 }); },
  /** 핫팩 흔들기 사각사각 */
  shake() { for (let i = 0; i < 4; i++) noise({ dur: 0.06, type: 'bandpass', freq: 2500, q: 1, gain: 0.05, at: i * 0.11 }); },
  /** 앉기 (벤치 삐걱) */
  sit() { tone({ freq: 210, dur: 0.25, type: 'triangle', gain: 0.04, slide: 0.8 }); noise({ dur: 0.1, type: 'lowpass', freq: 600, gain: 0.08 }); },
});

Object.assign(sfx, {
  /** 쓱 (연기 다시 빨아들임) */
  suck(dist = 0) {
    const out = at(dist); if (!out || out.gain.value < 0.01) return;
    const n = noise({ dur: 0.35, type: 'bandpass', freq: 1500, q: 1.2, gain: 0.1, attack: 0.05, out });
    if (n) n.f.frequency.exponentialRampToValueAtTime(2600, n.t0 + 0.3);
  },
  /** 퐁 (도넛) */
  pop(dist = 0) {
    const out = at(dist); if (!out || out.gain.value < 0.01) return;
    tone({ freq: 210, dur: 0.12, type: 'sine', gain: 0.07, slide: 0.6, out });
    noise({ dur: 0.06, type: 'lowpass', freq: 500, gain: 0.08, out });
  },
  /** 뽀드득 (눈 밟기): 짧은 알갱이 여러 개 */
  snowStep() {
    const grains = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < grains; i++) {
      noise({ dur: 0.02 + Math.random() * 0.025, type: 'bandpass', freq: 900 + Math.random() * 2200, q: 2, gain: 0.05 + Math.random() * 0.05, at: i * (0.012 + Math.random() * 0.01) });
    }
    noise({ dur: 0.13, type: 'lowpass', freq: 700, gain: 0.05, attack: 0.01 });
  },
  /** 톡 (마른 바닥 발소리, 아주 작게) */
  step() { noise({ dur: 0.05, type: 'lowpass', freq: 400 + Math.random() * 200, gain: 0.04 }); },
  /** 찰박 (젖은 바닥) */
  splash() {
    noise({ dur: 0.12, type: 'bandpass', freq: 1800 + Math.random() * 800, q: 0.8, gain: 0.05, attack: 0.005 });
    noise({ dur: 0.08, type: 'lowpass', freq: 500, gain: 0.04 });
  },
});
