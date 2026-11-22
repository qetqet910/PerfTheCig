import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createPost } from './fx/post.js';
import { SmokeSystem } from './fx/smoke.js';
import { createRain } from './fx/rain.js';
import { sfx, setRain } from './fx/audio.js';
import { createSky } from './world/sky.js';
import { loadOsmCity } from './world/city.js';
import { createKolon } from './world/kolon.js';
import { createSmokingArea, nearestAshtray } from './world/smokingArea.js';
import { Avatar } from './world/avatar.js';
import { createPeople, PEOPLE } from './world/people.js';
import { CollisionWorld } from './player/collision.js';
import { FirstPerson } from './player/firstPerson.js';
import { PACK_SIZE } from './smoke/smoker.js';
import { Net } from './net/client.js';
import { createOffice } from './office.js';

// 씬 원점: OSM 로컬 좌표(원점 = 구로디지털단지역, m)에서 코오롱싸이언스밸리 1차·2차 사이 통로 중앙
const ORIGIN = new THREE.Vector2(-222, 116);
const KOLON = '코오롱싸이언스벨리 2차'; // OSM 이름 (1·2차가 한 외곽선)
const HOME = { pos: new THREE.Vector3(-21, 5.5, 11), target: new THREE.Vector3(0, 1.0, 0) };
const COLORS = ['#2b2f38', '#1f3a5a', '#6b6f75', '#5a2a2a', '#2f5a3a', '#c7c2b8', '#6a4a8a'];

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const FOG = new THREE.Color(0x151826);
scene.fog = new THREE.FogExp2(FOG, 0.0075);

const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.03, 3000);
camera.position.copy(HOME.pos);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(HOME.target);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.minDistance = 1.2;
controls.maxDistance = 320;
controls.maxPolarAngle = Math.PI * 0.495;
controls.autoRotateSpeed = 0.35;

const pmrem = new THREE.PMREMGenerator(renderer);
const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

scene.add(new THREE.HemisphereLight(0x3a4a78, 0x1c1612, 0.55));
const moon = new THREE.DirectionalLight(0x8296cc, 0.35);
moon.position.set(-80, 140, 60);
scene.add(moon);
const sky = createSky(FOG);
scene.add(sky);

const city = await loadOsmCity('/data/guro.json', { offset: ORIGIN, avoid: [[0, 0, 14]], exclude: [KOLON] });
scene.add(city.group);
const kolon = createKolon(city.excluded[KOLON], { envMap });
scene.add(kolon.group);
const area = createSmokingArea({ envMap });
scene.add(area.group);

const smoke = new SmokeSystem(3200);
scene.add(smoke.points);
smoke.setViewport(innerHeight * renderer.getPixelRatio(), camera.fov);

const people = createPeople(smoke, { listener: () => camera.position });
scene.add(people.group);

const rain = createRain();
scene.add(rain.object);

const post = createPost(renderer, scene, camera);

// ---------- 충돌 ----------
const world = new CollisionWorld();
world.add(city.colliders);
world.add(kolon.colliders);
world.add(area.colliders);
world.add({ circles: PEOPLE.map((p) => [p.x, p.z, 0.4]) });

// ---------- HUD 헬퍼 ----------
const $ = (id) => document.getElementById(id);
const btn = (k) => document.querySelector(`[data-key="${k}"]`);
const office = createOffice({ toastsEl: $('toasts'), sfx });

// ---------- 1인칭 + 흡연 ----------
let myAvatar = null;
const remotes = new Map(); // id -> { av, name, tx, tz, try, st }

/** 담배 빌릴 수 있는 사람 (NPC 또는 다른 플레이어) */
function borrowTarget() {
  const f = fp.feet;
  const npc = people.nearest(f.x, f.z, 1.8);
  if (npc) return { npc };
  for (const [id, r] of remotes) if (r.av.root.position.distanceTo(f) < 1.8) return { remoteId: id, name: r.name };
  return null;
}

const fp = new FirstPerson({
  camera, dom: renderer.domElement, world, smoke, scene,
  onLockChange: (locked) => document.body.classList.toggle('paused', fp.active && !locked && !chatOpen()),
  getContext: () => {
    const f = fp.feet;
    const b = borrowTarget();
    return { ashtrayDist: nearestAshtray(f.x, f.z).dist, borrowFrom: b && (b.npc ? 'npc' : b.name), _b: b };
  },
  onSmokerEvent: (name, d) => {
    switch (name) {
      case 'click':
        sfx.click(d.ok);
        net.send({ t: 'ev', kind: 'click', k: d.ok ? 1 : 0 });
        break;
      case 'lit':
        office.onLit();
        break;
      case 'exhale':
        sfx.exhale(d.k);
        if (d.type === 'ring') net.send({ t: 'ev', kind: 'ring', p: d.p.toArray(), d: d.d.toArray(), k: d.k });
        else net.send({ t: 'puff', p: d.p.toArray(), d: d.d.toArray(), k: d.k });
        break;
      case 'cough':
        sfx.cough();
        myAvatar?.cough();
        net.send({ t: 'ev', kind: 'cough' });
        break;
      case 'ash':
        if (d.flicked) sfx.tap();
        net.send({ t: 'ev', kind: 'ash', p: d.p.toArray(), k: d.amount });
        break;
      case 'butt':
        if (!d.inTray) {
          area.addButt(d.x, d.z);
          people.onLitter(d.x, d.z);
          office.toast('시스템', '꽁초를 바닥에 버렸습니다… 다른 사람들도 다 봐요', true);
        }
        net.send({ t: 'ev', kind: 'butt', x: d.x, z: d.z, inTray: d.inTray });
        office.onFinished(fp.smoker.today);
        break;
      case 'borrow': {
        const b = borrowTarget();
        if (b?.npc) people.give(b.npc);
        if (b?.remoteId) net.send({ t: 'ev', kind: 'borrow', to: b.remoteId });
        office.toast('시스템', `${b?.npc ? '옆 사람' : b?.name ?? '누군가'}한테 한 개비 얻었다`, true);
        break;
      }
      case 'empty':
        office.toast('시스템', '담배가 다 떨어졌다. 옆 사람 근처에서 G를 누르면 한 개비 빌릴 수 있어요', true);
        break;
    }
  },
});

function setFirstPerson(on) {
  if (on === fp.active) return;
  if (on) {
    controls.enabled = false;
    controls.autoRotate = false;
    btn('o').classList.remove('on');
    camera.fov = 70;
    fp.enter();
  } else {
    fp.exit();
    camera.fov = 48;
    const me = fp.feet;
    controls.target.set(me.x, 1.0, me.z);
    camera.position.set(me.x - 3.5, 2.2, me.z + 3.8);
    controls.enabled = true;
  }
  camera.updateProjectionMatrix();
  smoke.setViewport(innerHeight * renderer.getPixelRatio(), camera.fov);
  document.body.classList.toggle('fp', on);
  document.body.classList.toggle('paused', on && !fp.isLocked);
  btn('f').classList.toggle('on', on);
  myAvatar?.setBodyVisible(!on);
}
$('pause').addEventListener('click', () => fp.lock());

// ---------- 멀티 ----------
const onlineEl = $('online');
const refreshOnline = () => {
  onlineEl.textContent = net.online ? `접속 ${remotes.size + 1}명` : '오프라인';
  onlineEl.classList.toggle('on', net.online);
};
const remoteDist = (r) => r.av.root.position.distanceTo(camera.position);

function addRemote(p) {
  if (remotes.has(p.id)) return;
  const av = new Avatar({ color: p.color, name: p.name, smoke });
  av.root.position.set(p.x, 0, p.z);
  av.root.rotation.y = p.ry;
  scene.add(av.group);
  remotes.set(p.id, { av, name: p.name, tx: p.x, tz: p.z, try: p.ry, st: { speed: p.s, k: p.k, inhale: p.inh, c: p.c, len: p.len, ash: p.ash } });
}
function removeRemote(id) {
  const r = remotes.get(id);
  if (!r) return;
  r.av.dispose();
  remotes.delete(id);
}

const net = new Net({
  welcome: (m) => {
    m.players.forEach(addRemote);
    (m.butts || []).forEach(([x, z]) => area.addButt(x, z));
    refreshOnline();
  },
  join: (m) => { addRemote(m.player); logChat(null, `${m.player.name} 님이 담배 피러 나왔습니다`); refreshOnline(); },
  leave: (m) => {
    const r = remotes.get(m.id);
    if (r) logChat(null, `${r.name} 님이 사무실로 복귀했습니다`);
    removeRemote(m.id);
    refreshOnline();
  },
  state: (m) => {
    const r = remotes.get(m.id);
    if (!r) return;
    Object.assign(r, { tx: m.x, tz: m.z, try: m.ry });
    Object.assign(r.st, { speed: m.s, k: m.k, inhale: m.inh, c: m.c, len: m.len, ash: m.ash });
  },
  puff: (m) => {
    smoke.puff(new THREE.Vector3(...m.p), new THREE.Vector3(...m.d), m.k);
    const r = remotes.get(m.id);
    if (r) { r.av.mouthOUntil = r.av.clock + 1.2; sfx.exhale(m.k, remoteDist(r)); }
  },
  ev: (m) => {
    const r = remotes.get(m.id);
    const dist = r ? remoteDist(r) : 20;
    switch (m.kind) {
      case 'click': sfx.click(!!m.k, dist); break;
      case 'ring':
        smoke.ring(new THREE.Vector3(...m.p), new THREE.Vector3(...m.d), m.k);
        if (r) r.av.mouthOUntil = r.av.clock + 1.0;
        break;
      case 'cough': r?.av.cough(); sfx.cough(dist); break;
      case 'ash': if (m.p) smoke.ash(new THREE.Vector3(...m.p), m.k); break;
      case 'butt':
        if (!m.inTray) { area.addButt(m.x, m.z); people.onLitter(m.x, m.z); }
        break;
      case 'borrow':
        if (m.to === net.id && r) {
          // 누가 나한테서 한 개비 빌려감
          if (fp.smoker.pack > 0) fp.smoker.pack--;
          myAvatar?.say('여기요 한 대 드세요');
          office.toast('시스템', `${r.name} 님이 담배 한 개비 빌려갔다`, true);
        }
        break;
    }
  },
  chat: (m) => {
    if (m.id === net.id) { myAvatar?.say(m.text); logChat(profile.name, m.text, true); return; }
    const r = remotes.get(m.id);
    if (!r) return;
    r.av.say(m.text);
    logChat(r.name, m.text);
  },
  status: refreshOnline,
  reset: () => { for (const id of [...remotes.keys()]) removeRemote(id); refreshOnline(); },
});

// ---------- 입장 ----------
const profile = JSON.parse(localStorage.getItem('gvalley.profile') || 'null') || { name: '', color: COLORS[0] };
const nickEl = $('nick');
const swatchEl = $('swatches');
nickEl.value = profile.name;
for (const c of COLORS) {
  const b = document.createElement('button');
  b.style.background = c;
  b.className = c === profile.color ? 'sel' : '';
  b.addEventListener('click', () => {
    profile.color = c;
    swatchEl.querySelectorAll('button').forEach((x) => x.classList.toggle('sel', x === b));
  });
  swatchEl.appendChild(b);
}
function join() {
  if (myAvatar) return;
  profile.name = nickEl.value.trim().slice(0, 12) || `직장인${Math.floor(Math.random() * 900 + 100)}`;
  localStorage.setItem('gvalley.profile', JSON.stringify(profile));
  $('join').classList.add('hidden');
  nickEl.blur();
  myAvatar = new Avatar({ color: profile.color, name: profile.name, smoke });
  scene.add(myAvatar.group);
  net.connect(profile.name, profile.color);
  document.body.classList.add('joined');
  office.start(profile.name);
  setFirstPerson(true);
}
$('enter').addEventListener('click', join);
nickEl.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); join(); } });
setTimeout(() => nickEl.focus(), 100);

// ---------- 채팅 ----------
const chatInput = $('chatInput');
const chatLog = $('chatLog');
const chatOpen = () => document.activeElement === chatInput;
function logChat(name, text, mine = false) {
  const row = document.createElement('div');
  row.className = 'row' + (name ? '' : ' sys') + (mine ? ' mine' : '');
  if (name) {
    const n = document.createElement('b');
    n.textContent = name;
    row.append(n, ' ');
  }
  row.append(text);
  chatLog.appendChild(row);
  while (chatLog.children.length > 8) chatLog.firstChild.remove();
  setTimeout(() => row.classList.add('old'), 12000);
}
function openChat() {
  if (!myAvatar) return;
  fp.clearInput();
  document.body.classList.add('chatting');
  chatInput.focus();
}
function closeChat() {
  chatInput.value = '';
  chatInput.blur();
}
chatInput.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter' && !e.isComposing) {
    const text = chatInput.value.trim();
    if (text) {
      if (net.online) net.send({ t: 'chat', text });
      else { myAvatar?.say(text); logChat(profile.name, text, true); }
    }
    closeChat();
  } else if (e.key === 'Escape') closeChat();
});
chatInput.addEventListener('blur', () => {
  document.body.classList.remove('chatting');
  document.body.classList.toggle('paused', fp.active && !fp.isLocked);
});

// ---------- 단축키 ----------
let wet = 0;
const actions = {
  f: () => myAvatar && setFirstPerson(!fp.active),
  r: () => { rain.enabled = !rain.enabled; setRain(rain.enabled); btn('r').classList.toggle('on', rain.enabled); },
  o: () => { if (fp.active) return; controls.autoRotate = !controls.autoRotate; btn('o').classList.toggle('on', controls.autoRotate); },
  c: () => { if (fp.active) fp.respawn(); else { camera.position.copy(HOME.pos); controls.target.copy(HOME.target); } },
};
addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.repeat) return;
  if (e.key === 'Enter') { e.preventDefault(); openChat(); return; }
  actions[e.code.replace('Key', '').toLowerCase()]?.(); // 한글 입력 상태에서도 동작
});
document.querySelectorAll('[data-key]').forEach((b) => b.addEventListener('click', () => actions[b.dataset.key]()));

const tickClock = () => {
  const d = new Date();
  $('clock').textContent = `${d.toLocaleDateString('ko-KR', { weekday: 'short' })} ${d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`;
};
tickClock();
setInterval(tickClock, 10_000);
$('loading').classList.add('done');

// ---------- 흡연 HUD ----------
const hud = { pack: $('packCount'), today: $('todayCount'), paper: $('cigPaper'), ash: $('cigAsh'), bar: document.querySelector('.cigbar'), away: $('away'), ctx: $('ctxHint') };
let hudAcc = 0, lastCtx = '';
function updateHud(dt) {
  hudAcc += dt;
  if (hudAcc < 0.1) return;
  hudAcc = 0;
  const sm = fp.smoker;
  hud.pack.textContent = sm.pack;
  hud.today.textContent = sm.today;
  const has = sm.state !== 'none';
  hud.bar.classList.toggle('none', !has);
  hud.paper.style.width = `${(has && sm.state !== 'done' ? sm.len : 0) * 70}%`;
  hud.paper.classList.toggle('lit', sm.state === 'lit');
  hud.ash.style.width = `${Math.min(8, (sm.ash / 0.024) * 8)}%`;
  hud.away.textContent = office.awayText();

  // 상황별 안내
  const f = fp.feet;
  const tray = nearestAshtray(f.x, f.z).dist < 1.1;
  let ctx = '';
  if (sm.state === 'none') ctx = sm.pack > 0 ? '<kbd>G</kbd>담배 꺼내서 불붙이기' : borrowTarget() ? '<kbd>G</kbd>한 개비만 빌리기' : '담배가 없다… 옆 사람한테 가보자';
  else if (sm.state === 'lighting') ctx = sm.lightOkAt >= 0 ? '불 붙는 중…' : sm.lightT > 0.9 ? '딸깍… 딸깍… (바람 때문에 잘 안 켜짐)' : '딸깍';
  else if (sm.state === 'done') ctx = tray ? '<kbd>G</kbd>꽁초 재떨이에 버리기' : '<kbd>G</kbd>꽁초 버리기 (재떨이 근처로 가면 재떨이에)';
  else if (sm.t < sm.coughUntil) ctx = '콜록콜록… 너무 깊게 빨았다';
  else if (sm.holding) ctx = sm.holding === 'ring' ? '쓰읍… (떼면 도넛)' : '쓰읍…';
  else if (sm.ash > 0.012) ctx = '<kbd>X</kbd>재 털기';
  else if (tray && sm.len < 0.5) ctx = '<kbd>G</kbd>재떨이에 비벼 끄기';
  if (ctx !== lastCtx) { hud.ctx.innerHTML = ctx; hud.ctx.classList.toggle('show', !!ctx); lastCtx = ctx; }
}

// 빨기 소리 (누르는 동안)
let inhaleSound = null;

// ---------- loop ----------
const clock = new THREE.Clock();
const angLerp = (a, b, t) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  wet = THREE.MathUtils.clamp(wet + (rain.enabled ? dt / 6 : -dt / 20), 0, 1);
  city.setWetness(wet);

  fp.update(dt, { raining: rain.enabled });
  const sm = fp.smoker;
  const sucking = !!(sm.holding && sm.canInhale);
  if (sucking && !inhaleSound) inhaleSound = sfx.inhaleStart();
  if (!sucking && inhaleSound) { sfx.inhaleStop(inhaleSound); inhaleSound = null; }

  if (myAvatar) {
    const st = fp.getState();
    if (!fp.active) { st.s = 0; }
    myAvatar.root.position.set(st.x, 0, st.z);
    myAvatar.root.rotation.y = st.ry;
    myAvatar.update(dt, { speed: st.s, k: st.k, inhale: st.inh, c: st.c, len: st.len, ash: st.ash, flame: sm.lightOkAt >= 0 });
    net.sendState(st);
    updateHud(dt);
    office.update(dt, { smoking: sm.state === 'lit' });
  }

  const a = 1 - Math.exp(-10 * dt);
  for (const r of remotes.values()) {
    const p = r.av.root.position;
    p.x += (r.tx - p.x) * a;
    p.z += (r.tz - p.z) * a;
    r.av.root.rotation.y = angLerp(r.av.root.rotation.y, r.try, a);
    r.av.update(dt, r.st);
  }

  people.update(t, dt);
  smoke.update(dt);
  rain.update(dt, camera);
  sky.position.copy(camera.position);
  const camDist = fp.active ? 0 : camera.position.distanceTo(controls.target);
  scene.fog.density = THREE.MathUtils.lerp(0.0075, 0.0016, THREE.MathUtils.smoothstep(camDist, 10, 180));
  if (!fp.active) controls.update();
  post.render(t);
});

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  post.setSize(innerWidth, innerHeight);
  smoke.setViewport(innerHeight * renderer.getPixelRatio(), camera.fov);
});

// 디버그용
Object.assign(window, { scene, camera, controls, fp, setFirstPerson, net, remotes, people, PACK_SIZE });
