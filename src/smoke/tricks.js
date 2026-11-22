/**
 * 담배 묘기. 숫자키 1~5 (피우는 중일 때).
 * 한 모금 빨아들인 뒤(prep초) 연출 → 1인칭/원격 아바타가 같은 함수를 씀.
 * origin() => { p: 입 위치, d: 바라보는 방향 }
 */
export const TRICKS = [
  { key: '1', name: '고스트', prep: 1.1, desc: '연기 공을 뱉었다 다시 빨아들이기' },
  { key: '2', name: '프렌치 인헤일', prep: 1.0, desc: '입에서 흘러나와 코로' },
  { key: '3', name: '도넛 연발', prep: 1.5, desc: '도넛 셋, 뒤 도넛이 앞 도넛 통과' },
  { key: '4', name: '용 콧김', prep: 1.1, desc: '코로 두 줄기' },
  { key: '5', name: '폭포', prep: 1.2, desc: '연기가 턱을 타고 흘러내림' },
];

/** 연출 실행. vapor: 'smoke' | 'heat' | 'vape' (액상이면 더 크게). 소리 타이밍은 hooks로 */
export function performTrick(smoke, idx, origin, { vapor = 'smoke', hooks = {} } = {}) {
  const big = vapor === 'vape' ? 1.35 : vapor === 'heat' ? 0.8 : 1;
  switch (idx) {
    case 0:
      smoke.ghost(origin, 0.7 * big);
      setTimeout(() => hooks.suck?.(), 1000); // 다시 빨아들이는 순간 "쓱"
      break;
    case 1:
      smoke.french(origin, 1.4);
      setTimeout(() => smoke.noseJets(origin, 0.3), 1700); // 마지막에 코로 살짝
      break;
    case 2: {
      // 첫 도넛: 크고 느림 → 뒤로 갈수록 작고 빠름 → 앞 도넛을 통과
      const shots = [{ s: 1.25, v: 0.38 }, { s: 0.95, v: 0.62 }, { s: 0.7, v: 0.9 }];
      shots.forEach((r, i) => setTimeout(() => {
        const o = origin();
        const d = o.d.clone(); d.y += 0.07; d.normalize();
        smoke.ring(o.p.clone().addScaledVector(d, 0.04), d, r.s * big, { speed: r.v });
        hooks.pop?.(i);
      }, i * 420));
      break;
    }
    case 3:
      smoke.noseJets(origin, 0.95 * big);
      setTimeout(() => smoke.exhale(origin, 0.25, { vapor }), 250); // 입으로도 새어 나옴
      hooks.shake?.(0.7);
      break;
    case 4:
      smoke.waterfall(origin, 1.6 * big);
      break;
  }
}
