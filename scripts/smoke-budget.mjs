// 연기 입자 예산 확인 (풀은 1500개 하드 캡 — 넘치면 가장 오래된 연기부터 일찍 사라짐)
//   node scripts/smoke-budget.mjs
import * as THREE from 'three';
import { SmokeSystem } from '../src/fx/smoke.js';

function run({ smokers, exhales, v, rings }) {
  const sm = new SmokeSystem(100000); // 넉넉히 잡고 실제 사용량만 측정
  const dt = 1 / 60;
  let acc = 0, peak = 0;
  const alive = () => { let n = 0; for (let i = 0; i < sm.max; i++) if (sm.age[i] < sm.life[i]) n++; return n; };
  for (let f = 0; f < 60 * 20; f++) {
    acc += dt * 11 * smokers; // 불씨 연기 초당 11개/명
    while (acc > 1) { acc -= 1; sm.emit(new THREE.Vector3(Math.random(), 1, 0), new THREE.Vector3(0, 0.15, 0), { size: 0.035, grow: 0.3, life: 3.8, alpha: 0.1 }); }
    if (f === 60 * 8) for (let k = 0; k < exhales; k++) { const o = { p: new THREE.Vector3(k, 1, 0), d: new THREE.Vector3(1, 0, 0) }; sm.exhale(() => o, v, { nose: v > 0.6 }); }
    if (f === 60 * 9) for (let k = 0; k < rings; k++) sm.ring(new THREE.Vector3(k, 1, 0), new THREE.Vector3(1, 0, 0), 1);
    sm.update(dt);
    if (f % 10 === 0) peak = Math.max(peak, alive());
  }
  return peak;
}

const cases = [
  ['보통: 5명 피우는 중, 2명이 동시에 보통 한 모금', { smokers: 5, exhales: 2, v: 0.45, rings: 0 }],
  ['많음: 5명 피우는 중, 3명이 동시에 길게 + 도넛 1', { smokers: 5, exhales: 3, v: 1, rings: 1 }],
  ['극단: 5명 전원 동시에 최대 + 도넛 3', { smokers: 5, exhales: 5, v: 1, rings: 3 }],
];
for (const [name, c] of cases) console.log(`${String(run(c)).padStart(5)}개  ${name}`);
console.log('(풀 1500개 하드 캡)');
