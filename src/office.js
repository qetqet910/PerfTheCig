/**
 * 직장인 요소: 자리 비운 시간, 팀장님 카톡, 단톡방, 개비 수 멘트.
 * 실제 시간 기준 (게임 접속 후 경과).
 */
const BOSS = [
  [180, '팀장님', '{name}씨 자리에 안 계시네요?'],
  [360, '팀장님', '오후 회의 자료 어디까지 됐어요?'],
  [600, '팀장님', '회의 시작합니다. 어디세요?'],
  [900, '팀장님', '……'],
  [1200, '부장님', '{name}씨 잠깐 내 자리로 와봐요'],
  [1800, '인사팀', '[근태] 장시간 자리 비움이 확인되었습니다'],
];
const GROUP = [
  ['단톡방', '오늘 점심 메뉴 투표 올렸어요'],
  ['단톡방', '혹시 회의실 B 예약하신 분?'],
  ['단톡방', '택배 왔어요~ 1층 데스크'],
  ['단톡방', '오늘 회식 장소 공지드립니다'],
  ['단톡방', '이번 주 금요일 연차자 있나요?'],
  ['거래처 김과장', '견적서 확인 부탁드립니다'],
  ['단톡방', '커피 사러 가실 분~'],
  ['엄마', '밥은 먹었니'],
  ['카드사', '[결제] 편의점 4,500원 승인'],
];
const COUNT = {
  3: '오늘 벌써 3개비째…',
  5: '오늘 5개비. 팀장님이 담배 냄새 난대요',
  10: '오늘 10개비. 반 갑 폈다',
  20: '한 갑 다 폈다…',
};

export function createOffice({ toastsEl, sfx }) {
  let name = '';
  let started = 0;
  let away = 0;
  let bossIdx = 0;
  let nextGroup = 50 + Math.random() * 40;
  let litCount = 0;

  function toast(who, text, sys = false) {
    const el = document.createElement('div');
    el.className = 'toast' + (sys ? ' sys' : '');
    const head = document.createElement('div');
    head.className = 'who';
    head.textContent = who;
    const time = document.createElement('span');
    time.textContent = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
    head.appendChild(time);
    el.append(head, text.replace('{name}', name));
    toastsEl.prepend(el);
    while (toastsEl.children.length > 4) toastsEl.lastChild.remove();
    if (!sys) { sfx.ding(); sfx.buzz(); }
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 700); }, sys ? 4500 : 7000);
  }

  return {
    toast,
    start(n) { name = n; started = performance.now(); },
    awayText() {
      const s = Math.floor(away);
      return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    },
    update(dt) {
      if (!started) return;
      away += dt;
      if (bossIdx < BOSS.length && away > BOSS[bossIdx][0]) {
        const [, who, text] = BOSS[bossIdx++];
        toast(who, text);
      }
      if (away > nextGroup) {
        const [who, text] = GROUP[Math.floor(Math.random() * GROUP.length)];
        toast(who, text);
        nextGroup = away + 70 + Math.random() * 80;
      }
    },
    onLit() {
      litCount++;
      if (litCount === 1) toast('시스템', '불 붙었다. E 꾹 눌러서 빨고, 떼면 후~', true);
    },
    onFinished(today) {
      if (COUNT[today]) toast('시스템', COUNT[today], true);
    },
  };
}
