import * as THREE from 'three';

/**
 * 흡연장 상호작용 (조준점으로 가리키고 좌클릭/우클릭).
 * 각 대상: mesh.userData.interact = { label(), click(), rlabel?(), rclick?() }
 *   label/rlabel은 지금 할 수 있는 동작 문구 (없으면 null), 끝에 " · 좌클릭" / 우클릭은 main이 붙임.
 *
 * 네트워크: ev 'deco' idx  0 자전거 벨 / 1 소화기 분사 / 3 눈사람 담배(k=길이, to=불 붙음 1/0)
 */
const NPC_TALK = [
  '오늘 일 많아요?', '저 이거 다 피고 들어가요', '자판기 커피 은근 맛있어요', '부장님 오늘 기분 별로래요',
  '눈 엄청 오네요', '퇴근하고 뭐 하세요?', '점심 뭐 드셨어요?', '이번 주 금요일 회식이래요', '연차 언제 쓰세요?',
];
const NPC_TALK_SMOKING = ['불 필요하면 말해요', '그거 무슨 담배예요?', '요즘 담뱃값 너무 올랐어요', '한 대 피고 나면 좀 살 것 같아요'];
const NPC_TALK_SNOWBALL = ['던지면 저도 던져요', '그거 내려놓으세요…', '눈싸움 하실래요?'];
const NPC_HIT = ['아 차가워!', '누구야!', '아 진짜…', '옷 다 젖었잖아요', '받아라!'];
const PARCELS = ['받는 사람: 김대리 (3층)', '받는 사람: 박과장 — 생수 2박스', '받는 사람: 인사팀 — 사무용품', '받는 사람: 이주임 — 쿠팡', '받는 사람: 최부장 — 골프공'];
const DOOR = ['팀장님이 지나간다… 조용히 닫음', '히터 바람 따뜻하다… 아니야 한 대만 더', '복도에서 회의 소리 들린다', '엘리베이터 앞에 사람 많다'];

export function setupInteractions(ctx) {
  const { scene, deco, people, fp, smoke, sfx, office, net, snowballs, camera } = ctx;
  const R = deco.refs;
  const targets = [];
  const toast = (t) => office.toast('시스템', t, true);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const hitBox = (w, h, d, x, y, z, interact) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), hitMat);
    m.position.set(x, y, z);
    m.userData.interact = interact;
    scene.add(m);
    targets.push(m);
    return m;
  };
  const handsFree = () => !fp.item;
  const L = (t) => `${t} · 좌클릭`;

  // ---------- 눈 뭉치기 (가림막 밖 눈 바닥) → 좌클릭으로 던지기 ----------
  let packedOnce = false;
  for (const m of R.snowPlanes) {
    m.userData.interact = {
      label: () => (handsFree() && !fp.seat ? L('눈 뭉치기') : null),
      click: () => {
        sfx.pack();
        fp.setItem({ type: 'snowball', fill: 1 });
        if (!packedOnce) { packedOnce = true; toast('눈뭉치 완성. 좌클릭으로 던지기'); }
      },
    };
    targets.push(m);
  }

  // ---------- NPC 말 걸기 ----------
  people.npcs.forEach((n) => {
    const hit = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.4, 8), hitMat);
    hit.position.y = 0.7;
    n.av.root.add(hit);
    hit.userData.interact = {
      label: () => (n.av.clock > n.av.bubbleUntil - 0.5 ? L('말 걸기') : null),
      click: () => {
        const pool = fp.item?.type === 'snowball' ? NPC_TALK_SNOWBALL : fp.smoker.state === 'lit' ? NPC_TALK_SMOKING.concat(NPC_TALK) : NPC_TALK;
        n.av.say(pool[Math.floor(Math.random() * pool.length)]);
      },
    };
    targets.push(hit);
  });

  // ---------- 우산 꺼내 쓰기 / 꽂기 ----------
  hitBox(0.4, 1.0, 0.4, 2.15, 0.5, 5.6, {
    label: () => {
      if (fp.item?.type === 'umbrella') return L('우산 다시 꽂기');
      if (!handsFree()) return null;
      return R.umbrellas.some((u) => u.group.visible) ? L('우산 꺼내 쓰기') : '우산이 다 나갔다';
    },
    click: () => {
      if (fp.item?.type === 'umbrella') {
        const u = R.umbrellas[fp.item.idx];
        if (u) u.group.visible = true;
        fp.setItem(null);
        sfx.press();
        return;
      }
      const idx = R.umbrellas.findIndex((u) => u.group.visible);
      if (idx < 0) return;
      R.umbrellas[idx].group.visible = false;
      fp.setItem({ type: 'umbrella', idx, color: R.umbrellas[idx].color, fill: 1 });
      sfx.rustle();
      toast('우산 펼침. 가림막 밖에서도 눈 안 맞음 (기분상)');
    },
  });

  // ---------- 소화기 분사 ----------
  let sprayReady = 0;
  const spray = (local) => {
    const p = R.extinguisher.position.clone().add(new THREE.Vector3(0, 0.85, -0.15));
    const d = new THREE.Vector3(-0.25, 0.1, -1).normalize();
    const o = { p, d };
    smoke.exhale(() => o, 1, { vapor: 'vape' });
    setTimeout(() => smoke.exhale(() => o, 0.8, { vapor: 'vape' }), 400);
    sfx.hiss(local ? 0 : camera.position.distanceTo(p));
    const near = people.npcs.filter((n) => n.av.root.position.distanceTo(p) < 5);
    if (near[0]) setTimeout(() => near[0].av.say('콜록, 뭐하는 거예요!'), 700);
  };
  hitBox(0.32, 0.62, 0.22, 2.85, 0.75, 5.72, {
    label: () => (performance.now() > sprayReady ? L('소화기 분사') : '소화기 재충전 중…'),
    click: () => {
      if (performance.now() < sprayReady) return;
      sprayReady = performance.now() + 15000;
      spray(true);
      net.send({ t: 'ev', kind: 'deco', idx: 1 });
      toast('푸쉬익—! 관리실에서 연락 올 듯');
    },
  });

  // ---------- 자전거 벨 ----------
  hitBox(1.2, 0.9, 0.35, -10.6, 0.6, -5.55, {
    label: () => L('자전거 벨 울리기'),
    click: () => { sfx.bell(); net.send({ t: 'ev', kind: 'deco', idx: 0 }); },
  });

  // ---------- 벽시계: 지금 시각 + 퇴근까지 ----------
  hitBox(0.4, 0.4, 0.12, 0.6, 3.15, 5.78, {
    label: () => L('벽시계 보기'),
    click: () => {
      const d = new Date();
      const hm = d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
      const left = 18 * 60 - (d.getHours() * 60 + d.getMinutes());
      toast(left > 0 ? `${hm} · 퇴근까지 ${Math.floor(left / 60)}시간 ${left % 60}분` : `${hm} · 퇴근 시간 지났는데 왜 아직 여기…`);
    },
  });

  // ---------- 테이블 위 빈 종이컵 줍기 ----------
  hitBox(0.66, 0.2, 0.66, -0.45, 1.12, 2.7, {
    label: () => (handsFree() && R.tableCups.some((c) => c.visible) ? L('남이 버린 종이컵 줍기') : null),
    click: () => {
      const c = R.tableCups.find((x) => x.visible);
      if (!c) return;
      c.visible = false;
      fp.setItem({ type: 'cup', name: '밀크커피', liquid: 0x8a5a3a, fill: 0, temp: 0 });
      toast('누가 두고 간 종이컵. 분리수거함에 버려주자');
    },
  });

  // ---------- 눈사람: 좌클릭 담배 빼기 / 우클릭 내 담배 꽂아주기 ----------
  const sc = R.snowmanCig;
  const snowmanState = { lit: true, len: 0.6 };
  const setSnowmanCig = (visible, lit, len) => {
    sc.group.visible = visible;
    snowmanState.lit = lit;
    snowmanState.len = len;
    sc.setLit(lit && visible);
    sc.setLength(len);
  };
  setSnowmanCig(true, true, 0.6);
  hitBox(0.75, 1.45, 0.75, -9.2, 0.72, -3.8, {
    label: () => (R.snowman.visible && sc.group.visible ? L('눈사람 담배 빼기') : null),
    click: () => {
      setSnowmanCig(false, false, 0);
      fp.smoker.pack++;
      net.send({ t: 'ev', kind: 'deco', idx: 3, k: 0, to: 0 });
      toast('눈사람한테서 한 개비 뺏었다 (갑에 넣음)');
    },
    rlabel: () => {
      if (!R.snowman.visible || sc.group.visible) return null;
      const sm = fp.smoker;
      if (sm.device !== 'cig') return '눈사람은 연초만 피움';
      if (sm.state === 'lit' || sm.state === 'lighting' || sm.state === 'done') return '피우던 담배 꽂아주기';
      return sm.pack > 0 ? '새 담배 불 붙여서 꽂아주기' : null;
    },
    rclick: () => {
      const sm = fp.smoker;
      if (sm.device !== 'cig') return;
      let len = 1, lit = true;
      if (sm.state === 'lit' || sm.state === 'lighting' || sm.state === 'done') { len = sm.len; lit = sm.state === 'lit'; sm.giveAway(); }
      else if (sm.pack > 0) { sm.pack--; sfx.click(true); }
      else return;
      setSnowmanCig(true, lit && len > 0, len);
      net.send({ t: 'ev', kind: 'deco', idx: 3, k: len, to: lit ? 1 : 0 });
      toast('눈사람도 한 대. 이제 같은 흡연자');
    },
  });

  // ---------- 그 외 한마디씩 ----------
  hitBox(0.5, 0.7, 0.5, -5.05, 0.35, 4.7, {
    label: () => L('난로에 손 쬐기'),
    click: () => { sfx.crackle(); setTimeout(() => sfx.crackle(), 120); toast('아 따뜻하다… 여기서 한 대 더 필까'); },
  });
  hitBox(0.95, 0.75, 0.5, -0.9, 0.38, 5.57, {
    label: () => L('택배 송장 보기'),
    click: () => toast(PARCELS[Math.floor(Math.random() * PARCELS.length)]),
  });
  R.posters[0].userData.interact = { label: () => L('흡연구역 이용 안내 읽기'), click: () => toast('꽁초는 재떨이에, 침 뱉지 않기, 통로 막지 않기… 다 지키고 있음 (아마도)') };
  R.posters[1].userData.interact = { label: () => L('금연 포스터 읽기'), click: () => toast('담배 끊고 건강 찾자… 다음 주 월요일부터 끊는다') };
  targets.push(R.posters[0], R.posters[1]);
  hitBox(0.3, 0.3, 0.4, 6.2, 3.25, -5.72, {
    label: () => L('CCTV에 손 흔들기'),
    click: () => toast('관리실 아저씨도 손 흔들어줌 (아마)'),
  });
  hitBox(1.7, 2.2, 0.12, 0.6, 1.1, 5.74, {
    label: () => L('뒷문 살짝 열어보기'),
    click: () => { sfx.creak(); toast(DOOR[Math.floor(Math.random() * DOOR.length)]); },
  });
  hitBox(1.1, 1.6, 0.45, 8.1, 0.8, 5.55, {
    label: () => L('실외기에 손 대보기'),
    click: () => toast('미지근한 바람이 나온다. 손 녹이기 딱'),
  });
  hitBox(0.85, 0.75, 0.6, 8.45, 0.35, -5.45, {
    label: () => L('종량제 봉투 보기'),
    click: () => toast('음식물 같이 버린 사람 누구야…'),
  });

  // ---------- 눈싸움: NPC가 맞으면 반응 + 가끔 되던짐 ----------
  const npcTargets = people.npcs.map((n, i) => ({
    pos: n.av.root.position,
    owner: 'npc' + i,
    onHit: () => {
      sfx.thud(camera.position.distanceTo(n.av.root.position));
      n.av.say(NPC_HIT[Math.floor(Math.random() * NPC_HIT.length)]);
      n.av.cough?.();
      if (Math.random() < 0.45) setTimeout(() => {
        const from = n.av.root.position.clone().add(new THREE.Vector3(0, 1.0, 0));
        const to = camera.position.clone().add(new THREE.Vector3(0, -0.2, 0));
        const dist = from.distanceTo(to);
        const d = to.sub(from).normalize();
        d.y -= 0.12 + dist * 0.004; // 포물선 보정 (던지기 속도에 위로 2.2가 더해짐)
        snowballs.throw(from, d.normalize(), { owner: 'npc' + i });
      }, 900);
    },
  }));

  // 눈사람 담배가 타들어감 + 연기
  let smokeAcc = 0;
  const tip = new THREE.Vector3(), up = new THREE.Vector3();
  return {
    targets,
    npcTargets,
    update(dt) {
      if (snowmanState.lit && sc.group.visible && R.snowman.visible) {
        snowmanState.len -= dt / 420;
        if (snowmanState.len <= 0) setSnowmanCig(false, false, 0);
        else {
          sc.setLength(snowmanState.len);
          smokeAcc += dt * 10;
          while (smokeAcc > 1) {
            smokeAcc -= 1;
            sc.tipWorld(tip);
            smoke.emit(tip, up.set((Math.random() - 0.5) * 0.02, 0.12, (Math.random() - 0.5) * 0.02), { size: 0.03, grow: 0.25, life: 3.4, alpha: 0.08 });
          }
        }
      }
    },
    /** 원격 'deco' 이벤트 */
    remote(m) {
      if (m.idx === 0) sfx.bell(camera.position.distanceTo(R.bike.position));
      else if (m.idx === 1) spray(false);
      else if (m.idx === 3) setSnowmanCig(m.k > 0, !!m.to && m.k > 0, m.k || 0);
    },
  };
}
