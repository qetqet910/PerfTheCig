import * as THREE from 'three';
import { Avatar } from './avatar.js';
import { sfx } from '../fx/audio.js';

// 평범한 직장인 대사
const LINES = [
  '부장님 또 회의 잡으셨대', '보고서 수정 7번째…', '엑셀 수식 다 날아감', '점심 뭐 먹지', '오늘 회식이래요…',
  '월급날 언제 오냐', '주말에 뭐 하세요?', '결재 또 반려됨', '퇴근 30분 전이 제일 길어', '연차 쓰고 싶다',
  '팀장님이 찾으셨어요', '메일 회신해야 되는데', '이번 달 카드값…', '출근하자마자 퇴근하고 싶다', '오후 미팅 몇 시였죠?',
  '거래처에서 또 전화 옴', '아 내일 월요일이네', '커피 사러 갈 사람?', '오늘 야근각…', '이거 피고 들어가야지',
];
const LITTER = ['아 거기 버리시면…', '재떨이 저기 있어요', '청소하시는 분 고생하시겠다'];
const GIVE = ['여기요 한 대 드세요', '하나 남았는데 드릴게요', '불도 빌려드려요?'];

const NPC_STYLE = (o) => ({ hair: 'short', hairColor: 0x1b1512, skin: 0xffdcc2, glasses: false, tie: false, tieColor: 0x8a1f2a, pants: 0x22252b, ...o });
// 흡연구역 좌표 (smokingArea.js 기준). face = 바라보는 지점
export const PEOPLE = [
  // 넥타이 맨 부장님
  { x: -1.15, z: -0.8, face: [-2.0, -1.5], color: '#c4c9d0', phone: false, phase: 0.0, style: NPC_STYLE({ hair: 'side', glasses: true, tie: true, tieColor: 0x1d3a6b, hairColor: 0x3a3a3a }) },
  // 카디건 대리 (단톡방 확인 중)
  { x: -2.7, z: -0.55, face: [-2.0, -1.5], color: '#8a6a4a', phone: true, phase: 2.7, style: NPC_STYLE({ hair: 'bob', hairColor: 0x3b2a1e, skin: 0xf6cfae }) },
  // 셔츠 신입
  { x: 1.75, z: 1.05, face: [2.5, 1.8], color: '#a8c8e8', phone: false, phase: 5.1, style: NPC_STYLE({ hair: 'short', tie: true, tieColor: 0x8a1f2a }) },
  // 점퍼 입은 과장님 (거래처 문자 확인)
  { x: 3.35, z: 2.55, face: [2.5, 1.8], color: '#2f4a3a', phone: true, phase: 1.3, style: NPC_STYLE({ hair: 'bun', glasses: true, pants: 0x3a3530 }) },
];

const FULL = ['재떨이 꽉 찼네…', '이거 누가 좀 비워야 되는데', '재떨이 넘치겠다'];
export function createPeople(smoke, { listener, trays = [] } = {}) {
  const group = new THREE.Group();
  const npcs = PEOPLE.map((cfg) => {
    const av = new Avatar({ color: cfg.color, smoke, phone: cfg.phone, style: cfg.style });
    av.root.position.set(cfg.x, 0, cfg.z);
    av.root.rotation.y = Math.atan2(cfg.face[0] - cfg.x, cfg.face[1] - cfg.z);
    group.add(av.group);
    return {
      av, cfg,
      st: { speed: 0, k: 0, inhale: 0, c: 2, len: 0.4 + Math.random() * 0.6, ash: 0 },
      nextDrag: 2 + cfg.phase, dragT: -1, exhaleAt: -1, restUntil: 0, lightT: 0, clicked: false,
    };
  });
  let nextBubble = 2.5;
  const ease = (x) => x * x * (3 - 2 * x);
  const dist = (n) => (listener ? n.av.root.position.distanceTo(listener()) : 6);

  return {
    group,
    npcs,
    /** 플레이어가 꽁초를 바닥에 버렸을 때 근처 NPC 반응 */
    onLitter(x, z) {
      const near = npcs.filter((n) => Math.hypot(n.cfg.x - x, n.cfg.z - z) < 4);
      if (near.length) near[0].av.say(LITTER[Math.floor(Math.random() * LITTER.length)]);
    },
    /** 담배 빌려줄 NPC (가까운 사람) */
    nearest(x, z, r = 1.8) {
      let best = null, bd = r;
      for (const n of npcs) { const d = Math.hypot(n.cfg.x - x, n.cfg.z - z); if (d < bd) { bd = d; best = n; } }
      return best;
    },
    onTrayFull(i) {
      const tr = trays[i];
      const near = tr && npcs.find((n) => Math.hypot(n.cfg.x - tr.x, n.cfg.z - tr.z) < 3);
      if (near) near.av.say(FULL[Math.floor(Math.random() * FULL.length)]);
    },
    give(n) { n.av.say(GIVE[Math.floor(Math.random() * GIVE.length)]); },
    update(t, dt) {
      for (const n of npcs) {
        const st = n.st;
        if (st.c === 2) {
          // 한 모금 사이클: 올림 → 빨기 → 내림 → 후~ (가끔 도넛)
          if (t > n.nextDrag && n.dragT < 0) n.dragT = 0;
          let k = 0, inhale = 0;
          if (n.dragT >= 0) {
            const d = (n.dragT += dt);
            if (d < 0.7) k = ease(d / 0.7);
            else if (d < 1.8) { k = 1; inhale = 1; st.len -= dt / 11; }
            else if (d < 2.8) k = 1 - ease((d - 1.8) / 1.0);
            else { n.dragT = -1; n.exhaleAt = t + 0.3; n.nextDrag = t + 6 + Math.random() * 6; }
          }
          st.len -= dt / 420;
          st.ash += dt * (1 / 420 + (inhale ? 1 / 11 : 0)) * 0.085;
          if (st.ash > 0.02 && k === 0) { // 재떨이에 재 털기
            const tray = trays.reduce((b, tr) => (!b || Math.hypot(tr.x - n.cfg.x, tr.z - n.cfg.z) < Math.hypot(b.x - n.cfg.x, b.z - n.cfg.z) ? tr : b), null);
            if (tray) { _v.copy(tray.top); tray.addAsh(st.ash); } else n.av.ember.getWorldPosition(_v);
            smoke.ash(_v, st.ash);
            sfx.tap(dist(n));
            st.ash = 0;
          }
          st.k = k;
          st.inhale = inhale;
          if (st.len <= 0) { // 다 폈으면 (빨던 중이면 마지막 모금 내뱉고) 재떨이에 비벼 끄고 잠깐 쉼
            if (inhale) n.exhaleAt = t + 0.3;
            st.c = 0; st.k = 0; n.restUntil = t + 15 + Math.random() * 25;
            const tray = trays.reduce((b, tr) => (!b || Math.hypot(tr.x - n.cfg.x, tr.z - n.cfg.z) < Math.hypot(b.x - n.cfg.x, b.z - n.cfg.z) ? tr : b), null);
            tray?.addButt(undefined, undefined, true);
          }
        } else if (st.c === 0 && t > n.restUntil) {
          st.c = 1; n.lightT = 0; n.clicked = false; st.len = 1; st.ash = 0;
        } else if (st.c === 1) {
          n.lightT += dt;
          st.flame = n.lightT > 0.5;
          st.inhale = n.lightT > 0.7 ? 1 : 0; // 불 대고 쓰읍
          if (!n.clicked && n.lightT > 0.4) { n.clicked = true; sfx.click(true, dist(n)); }
          if (n.lightT > 1.7) { st.c = 2; n.dragT = 1.8; n.nextDrag = t + 6; } // 붙자마자 첫 모금 내뱉기로 이어짐
        }
        n.av.update(dt, st);
        if (n.exhaleAt > 0 && t > n.exhaleAt) {
          n.exhaleAt = -1;
          if (Math.random() < 0.2) n.av.ring(0.9);
          else n.av.exhale(0.35 + Math.random() * 0.45, Math.random() < 0.15);
          sfx.exhale(0.8, dist(n));
        }
      }
      if (t > nextBubble) {
        const free = npcs.filter((n) => n.av.clock > n.av.bubbleUntil);
        if (free.length) free[Math.floor(Math.random() * free.length)].av.say(LINES[Math.floor(Math.random() * LINES.length)]);
        nextBubble = t + 4 + Math.random() * 5;
      }
    },
  };
}
const _v = new THREE.Vector3();
