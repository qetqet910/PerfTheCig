// 테스트용 봇: 흡연구역을 돌아다니다 멈춰서 한 모금 빨고, 가끔 채팅함
//   node scripts/bot.mjs [ws://localhost:5179/ws] [이름]
import WebSocket from 'ws';

const url = process.argv[2] || 'ws://localhost:5179/ws';
const name = process.argv[3] || '테스트봇';
const LINES = ['ㅎㅇ', '담배 한 대 ㄱ?', '오늘 배포 있음?', '아 퇴근하고 싶다', '라이터 있으세요?'];
const ws = new WebSocket(url);
let t = 0, id = null;

ws.on('open', () => ws.send(JSON.stringify({ t: 'hello', name, color: '#5a2a2a' })));
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.t === 'welcome') { id = m.id; console.log(`welcome #${id}, others: ${m.players.length}`); }
  else if (m.t !== 'state') console.log('<-', JSON.stringify(m));
});
ws.on('close', () => process.exit(0));

setInterval(() => {
  if (id === null) return;
  t += 0.1;
  const phase = t % 12;          // 0~6 걷기, 6~12 멈춰서 흡연
  const cycle = Math.floor(t / 12);
  const walking = phase < 6;
  const a = (cycle * 6 + Math.min(phase, 6)) * 0.35;
  const x = -3.5 + Math.cos(a) * 2.0, z = 1.0 + Math.sin(a) * 2.0;
  const ry = Math.atan2(-Math.sin(a), Math.cos(a)); // 원 접선 방향 (+z 정면 기준)
  const k = !walking && phase > 7.5 && phase < 9.5 ? 1 : 0;
  ws.send(JSON.stringify({ t: 'state', x, z, ry, s: walking ? 0.7 : 0, k, inh: k, c: 2, len: 1 - (t % 300) / 300, ash: 0 }));
  if (!walking && Math.abs(phase - 10) < 0.05) {
    ws.send(JSON.stringify({ t: 'puff', p: [x + Math.sin(ry) * 0.15, 1.58, z + Math.cos(ry) * 0.15], d: [Math.sin(ry), 0.2, Math.cos(ry)], k: 1.2 }));
  }
}, 100);
setInterval(() => id && ws.send(JSON.stringify({ t: 'chat', text: LINES[Math.floor(Math.random() * LINES.length)] })), 7000);
