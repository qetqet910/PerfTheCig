/**
 * 담배 묘기. 숫자키 1~4 (피우는 중일 때).
 * 한 모금 빨아들인 뒤(PREP초) 연출 → 1인칭/원격 아바타가 같은 함수를 씀.
 * origin() => { p: 입 위치, d: 바라보는 방향 }
 */
export const TRICKS = [
  { key: '1', name: '고스트', prep: 1.1, desc: '뱉었다 다시 빨아들이기' },
  { key: '2', name: '프렌치 인헤일', prep: 1.0, desc: '입에서 코로' },
  { key: '3', name: '도넛 연발', prep: 1.4, desc: '도넛 셋' },
  { key: '4', name: '용 콧김', prep: 1.1, desc: '코로 두 줄기' },
];

/** 연출 실행. vapor: 'smoke' | 'heat' | 'vape' (액상이면 더 크게) */
export function performTrick(smoke, idx, origin, { vapor = 'smoke' } = {}) {
  const big = vapor === 'vape' ? 1.4 : vapor === 'heat' ? 0.8 : 1;
  switch (idx) {
    case 0: smoke.ghost(origin, 0.6 * big); break;
    case 1: smoke.french(origin, 1.3); setTimeout(() => smoke.noseJets(origin, 0.35), 1500); break;
    case 2:
      [0, 380, 760].forEach((ms, i) => setTimeout(() => {
        const o = origin();
        const d = o.d.clone(); d.y += 0.06; d.normalize();
        smoke.ring(o.p.clone().addScaledVector(d, 0.04), d, (1.15 - i * 0.18) * big);
      }, ms));
      break;
    case 3: smoke.noseJets(origin, 0.9 * big); break;
  }
}
