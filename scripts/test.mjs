// npm test — 흡연 상태 머신 / 릴레이 / 충돌 검증 (브라우저 없이 node로)
import http from 'node:http';
import WebSocket from 'ws';
import { Smoker, PACK_SIZE } from '../src/smoke/smoker.js';
import { attachRelay } from '../server/relay.js';
import { CollisionWorld } from '../src/player/collision.js';

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name} ${extra}`); }
};
const step = (sm, sec, opts) => { for (let i = 0; i < Math.round(sec * 60); i++) sm.update(1 / 60, opts); };
const mk = () => { const ev = []; const sm = new Smoker((n, d) => ev.push([n, d])); return { sm, ev, names: () => ev.map((e) => e[0]) }; };
const withRandom = (v, fn) => { const r = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = r; } };
/** 꺼내서 라이터 켜고(성공) 빨아서 불붙이기 */
const light = (sm) => { sm.context({}); withRandom(0, () => step(sm, 0.5)); sm.press('puff'); step(sm, 1.0); sm.release('puff'); };

// ---------------------------------------------------------------- Smoker
console.log('\n[Smoker 상태 머신]');
{
  const { sm, names } = mk();
  ok(sm.state === 'none' && sm.pack === PACK_SIZE, '시작: 담배 없음, 한 갑 20개비');
  sm.context({ ashtrayDist: 9 });
  ok(sm.state === 'lighting' && sm.pack === PACK_SIZE - 1, '꺼내기 → lighting, 19개비');
  withRandom(0.0, () => step(sm, 1.2));
  ok(sm.state === 'lighting' && sm.flame, '라이터 불은 켜졌지만 안 빨면 안 붙음', sm.state);
  step(sm, 2);
  ok(sm.state === 'lighting', '불 대고 2초 더 있어도 안 빨면 그대로');
  sm.press('puff'); step(sm, 0.5);
  ok(sm.state === 'lighting' && sm.igniteP > 0.4, '빨기 시작하면 불 붙는 진행도가 오름', sm.igniteP.toFixed(2));
  step(sm, 0.5);
  ok(sm.state === 'lit' && sm.holding === 'puff', '0.9초 빨면 붙고, 계속 빨던 게 첫 모금으로 이어짐');
  sm.release('puff');
  ok(names().join() === 'takeout,click,flame,lit,exhale', '이벤트 순서 takeout,click,flame,lit,exhale', names().join());
  sm.context({ ashtrayDist: 9 }); // lit 상태 G = 버리기
  ok(sm.state === 'none' && sm.today === 1, '피우다 버리기 → none, 오늘 1개비');
}
{
  const { sm, ev } = mk();
  sm.context({ ashtrayDist: 9 });
  withRandom(0.99, () => step(sm, 2.4)); // 매번 실패 → 5번째에 강제 성공
  const clicks = ev.filter((e) => e[0] === 'click');
  ok(clicks.length === 5 && clicks.at(-1)[1].ok && !clicks[0][1].ok, '라이터 계속 실패해도 5번째엔 켜짐', `clicks=${clicks.length}`);
  ok(sm.flame, '→ 불꽃 켜짐');
  step(sm, 5.2);
  ok(!sm.flame && ev.some((e) => e[0] === 'flameOut'), '안 빨고 5초 넘게 켜두면 라이터 뜨거워서 꺼짐');
  withRandom(0, () => step(sm, 1.0));
  ok(sm.flame, '꺼지면 다시 딸깍해서 켜짐');
}
{
  const { sm, ev } = mk();
  light(sm);
  const len0 = sm.len;
  step(sm, 10);
  const idleBurn = len0 - sm.len;
  ok(Math.abs(idleBurn - 10 / 420) < 0.002, '가만히 두면 10초에 ~2.4% 탐', idleBurn.toFixed(4));
  ok(sm.ash > 0, '탄 만큼 재가 생김');
  const l1 = sm.len;
  sm.press('puff'); step(sm, 1.0);
  ok(l1 - sm.len > 0.08, '빨면 훨씬 빨리 탐', (l1 - sm.len).toFixed(3));
  sm.release('puff');
  const ex = ev.filter((e) => e[0] === 'exhale').at(-1);
  ok(ex && ex[1].type === 'puff', '1초 빨고 떼면 후~(puff)');
  const nEx = ev.filter((e) => e[0] === 'exhale').length;
  sm.press('ring'); step(sm, 0.1); sm.release('ring');
  ok(ev.filter((e) => e[0] === 'exhale').length === nEx, '0.1초 톡은 내뱉기 없음');
  sm.press('ring'); step(sm, 1.0); sm.release('ring');
  ok(ev.at(-1)[0] === 'exhale' && ev.at(-1)[1].type === 'ring', '우클릭 꾹 → 도넛(ring)');
  sm.press('puff'); step(sm, 3.2);
  ok(ev.some((e) => e[0] === 'cough') && sm.holding === null, '3초 가까이 빨면 기침 + 자동으로 멈춤');
  sm.press('puff'); step(sm, 0.3);
  ok(sm.holding === null || sm.inhale === 0, '기침 직후엔 못 빰');
}
{
  const { sm, ev } = mk();
  light(sm);
  sm.ash = 0;
  sm.flick();
  ok(ev.at(-1)[0] === 'tapEmpty', '재 없을 때 털면 tapEmpty만');
  sm.ash = 0.01; sm.flick();
  ok(ev.at(-1)[0] === 'ash' && ev.at(-1)[1].flicked && sm.ash === 0, '재 털기 → ash 이벤트, 재 0');
  sm.ash = 0.0239; sm.len = 0.5; step(sm, 1.5);
  ok(ev.some((e) => e[0] === 'ash' && !e[1].flicked), '재가 2.4cm 넘으면 저절로 떨어짐');
  sm.len = 0.001; step(sm, 1);
  ok(sm.state === 'done' && ev.some((e) => e[0] === 'finished'), '다 타면 done');
  sm.context({ ashtrayDist: 0.6, trayIdx: 2 });
  const b = ev.at(-1);
  ok(b[0] === 'butt' && b[1].inTray && b[1].tray === 2, '재떨이 근처에서 버리면 재떨이로(tray 번호 포함)');
}
{
  const { sm, ev } = mk();
  light(sm);
  sm.context({ ashtrayDist: 5 });
  ok(ev.at(-1)[0] === 'butt' && !ev.at(-1)[1].inTray, '재떨이 멀면 바닥에 버림');
  sm.pack = 0;
  sm.context({ ashtrayDist: 5 });
  ok(ev.at(-1)[0] === 'empty' && sm.state === 'none', '갑 비었고 주변에 아무도 없으면 empty');
  sm.context({ ashtrayDist: 5, borrowFrom: 'npc' });
  ok(ev.at(-1)[0] === 'borrow' && sm.pack === 1, '옆 사람 있으면 한 개비 빌림');
}
{
  const { sm } = mk();
  sm.context({});
  sm.press('puff'); step(sm, 0.3);
  ok(sm.state === 'lighting' && sm.inhale <= 0.3 && sm.igniteP === 0, '라이터 켜지기 전엔 빨아도 헛빨기(불 안 붙음)');
  sm.release('puff');
  let rainyClicks = 0, dryClicks = 0;
  for (let i = 0; i < 400; i++) {
    const a = mk(); a.sm.context({}); step(a.sm, 0.4, { raining: true }); if (a.ev.find((e) => e[0] === 'click')?.[1].ok) rainyClicks++;
    const b = mk(); b.sm.context({}); step(b.sm, 0.4); if (b.ev.find((e) => e[0] === 'click')?.[1].ok) dryClicks++;
  }
  ok(rainyClicks < dryClicks, '비 오면 라이터가 더 잘 안 켜짐', `rain ${rainyClicks}/400 vs dry ${dryClicks}/400`);
}

// ---------------------------------------------------------------- Relay
console.log('\n[멀티플레이 릴레이]');
const server = http.createServer();
attachRelay(server, { log: () => {} });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `ws://127.0.0.1:${server.address().port}/ws`;
const client = (name) => new Promise((res) => {
  const ws = new WebSocket(url);
  const msgs = [];
  ws.on('message', (d) => { const m = JSON.parse(d); msgs.push(m); if (m.t === 'welcome') res({ ws, msgs, welcome: m, send: (o) => ws.send(JSON.stringify(o)) }); });
  ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', name, color: '#123456' })));
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
{
  const A = await client('A\u0007<b>' + 'x'.repeat(30));
  const B = await client('B');
  ok(B.welcome.players.length === 1 && B.welcome.players[0].name.length <= 12 && !/\u0007/.test(B.welcome.players[0].name), '닉네임: 제어문자 제거 + 12자 제한');
  A.send({ t: 'state', x: 1, z: 2, ry: 0.5, s: 1, k: 0, inh: 0, c: 2, len: 0.4, ash: 0.01 });
  A.send({ t: 'state', x: 1e9, z: NaN, ry: 0, s: 0, k: 0, inh: 0, c: 99, len: 0, ash: 0 });
  A.send({ t: 'ev', kind: 'hack', x: 1 });
  A.send({ t: 'ev', kind: 'cough' });
  A.send({ t: 'ev', kind: 'butt', inTray: false, x: 3, z: 4 });
  A.send({ t: 'ev', kind: 'butt', inTray: true, tray: 1, x: 0.1, z: -0.1, k: 0.3 });
  A.send({ t: 'ev', kind: 'ash', tray: 0, p: [0, 1, 0], k: 0.01 });
  A.send({ t: 'chat', text: '안녕' });
  A.send({ t: 'chat', text: '도배' });
  await sleep(250);
  ok(A.msgs.some((m) => m.t === 'join'), '기존 사람한테 join 알림');
  const st = B.msgs.filter((m) => m.t === 'state');
  ok(st[0]?.c === 2 && st[0]?.len === 0.4 && !('name' in st[0]), '상태 중계(담배 상태 포함, 이름은 안 보냄)');
  ok(st[1]?.x === 2000 && st[1]?.z === 0 && st[1]?.c === 3, '이상한 값은 클램프 (x 1e9→2000, NaN→0, c 99→3)', JSON.stringify(st[1]));
  const evs = B.msgs.filter((m) => m.t === 'ev').map((m) => m.kind);
  ok(!evs.includes('hack') && evs.includes('cough'), '허용 안 된 이벤트는 버림');
  ok(B.msgs.some((m) => m.t === 'ev' && m.kind === 'butt' && m.inTray && m.tray === 1), '재떨이 꽁초 이벤트 중계(tray 번호)');
  ok(B.msgs.some((m) => m.t === 'ev' && m.kind === 'ash' && m.tray === 0), '재 털기 이벤트 중계(tray 번호)');
  const chats = B.msgs.filter((m) => m.t === 'chat');
  ok(chats.length === 1 && chats[0].text === '안녕', '채팅 도배 방지(0.6초)');
  ok(A.msgs.some((m) => m.t === 'chat'), '채팅은 본인한테도 돌아옴');
  const C = await client('C');
  ok(C.welcome.butts.length === 1 && C.welcome.butts[0][0] === 3, '나중에 들어온 사람도 바닥 꽁초 받음');
  ok(C.welcome.trayButts.length === 1 && C.welcome.trayButts[0][0] === 1, '나중에 들어온 사람도 재떨이 꽁초 받음');
  A.ws.close();
  await sleep(150);
  ok(B.msgs.some((m) => m.t === 'leave'), '나가면 leave 알림');
  B.ws.close(); C.ws.close();
}
server.close();

// ---------------------------------------------------------------- Collision
console.log('\n[충돌]');
{
  const w = new CollisionWorld();
  w.add({ polygons: [[[0, -6], [10, -6], [10, -20], [0, -20]]] }); // 1차 벽 z=-6
  w.add({ circles: [[2, 0, 0.33]], boxes: [[5, 3, 0.9, 0.25, 0]] });
  const p = { x: 3, z: -5.9 };
  w.resolve(p, 0.28);
  ok(p.z >= -6 + 0.279, '벽 안으로 못 들어감', p.z.toFixed(3));
  const q = { x: 2.1, z: 0.05 };
  w.resolve(q, 0.28);
  ok(Math.hypot(q.x - 2, q.z) >= 0.6, '재떨이에 밀려남', Math.hypot(q.x - 2, q.z).toFixed(3));
  const r = { x: 5, z: 3 };
  w.resolve(r, 0.28);
  ok(Math.abs(r.z - 3) >= 0.25 + 0.27 || Math.abs(r.x - 5) >= 0.9 + 0.27, '벤치(박스)에 밀려남', JSON.stringify(r));
}

{
  const w = new CollisionWorld();
  w.add({ polygons: [[[0, 0], [20, 0], [20, 20], [0, 20]]] });
  const p = { x: 3, z: 10 };
  w.resolve(p, 0.28);
  ok(p.x <= -0.27, '건물 한가운데 스폰돼도 가장 가까운 벽 밖으로 빠져나옴', JSON.stringify(p));
}

console.log(`\n결과: ${pass} 통과, ${fail} 실패`);
process.exit(fail ? 1 : 0);
