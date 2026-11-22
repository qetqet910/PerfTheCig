import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture, FONT } from '../util.js';
import { COFFEE_MENU, DRINKS, createPaperCup, createDrink } from './items.js';
export { SNACKS } from './items.js';

/**
 * 커피 자판기 / 음료 자판기 — 실제로 동작.
 * 화면 가운데 조준점으로 버튼·컵·캔을 가리키고 좌클릭.
 *
 * 각 상호작용 메시: mesh.userData.interact = { label(): string|null, click(): void }
 * ctx = { sfx, smoke, dist(), wallet: { get(), spend(n) }, handsFull(), give(item), toast(text), net(msg) }
 *
 * 커피: 메뉴 → 동전 투입(가끔 걸림 → 툭 치기) → 컵 톡 → 지이잉 + 쪼르륵 → 삐삐 → 컵 꺼내기
 * 음료: 진열칸 버튼 → 동전 → 덜컹 → 아래 투출구에서 꺼내기
 */
const JAM_CHANCE = 0.07;
const COIN = 100;

// ---------- 공통 ----------
function lcdTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 72;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const draw = (l1, l2 = '') => {
    const x = c.getContext('2d');
    x.fillStyle = '#0b1408';
    x.fillRect(0, 0, 256, 72);
    x.fillStyle = '#7dff6a';
    x.shadowColor = '#7dff6a';
    x.shadowBlur = 6;
    x.font = `700 26px ${FONT}`;
    x.textBaseline = 'middle';
    x.fillText(l1, 12, 22);
    x.font = `600 20px ${FONT}`;
    x.fillText(l2, 12, 54);
    tex.needsUpdate = true;
  };
  return { tex, draw };
}
const glow = (tex, k = 0.5) => new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: k, roughness: 0.5 });
const won = (n) => `${n.toLocaleString('ko-KR')}원`;

/**
 * 구멍 뚫린 케이스: 뒤쪽 몸통(둥근 모서리) + 앞쪽 depth 두께의 앞판을 구멍을 피해 조각내서 붙임.
 * holes: [{ x0, x1, y0, y1 }] (케이스 로컬, 앞에서 본 좌표)
 */
function cabinet(group, W, H, D, depth, holes, mat) {
  const FZ = D / 2;
  const back = new THREE.Mesh(new RoundedBoxGeometry(W, H, D - depth, 4, 0.035), mat);
  back.position.set(0, H / 2, -depth / 2);
  back.castShadow = back.receiveShadow = true;
  group.add(back);
  const parts = [back];
  const ys = [...new Set([0, H, ...holes.flatMap((h) => [h.y0, h.y1])])].sort((a, b) => a - b);
  for (let i = 0; i < ys.length - 1; i++) {
    const y0 = ys[i], y1 = ys[i + 1];
    if (y1 - y0 < 1e-4) continue;
    const cut = holes.filter((h) => h.y0 <= y0 + 1e-4 && h.y1 >= y1 - 1e-4).sort((a, b) => a.x0 - b.x0);
    let x = -W / 2;
    const segs = [];
    for (const h of cut) { if (h.x0 > x) segs.push([x, h.x0]); x = Math.max(x, h.x1); }
    if (x < W / 2) segs.push([x, W / 2]);
    for (const [a, b] of segs) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(b - a, y1 - y0, depth), mat);
      m.position.set((a + b) / 2, (y0 + y1) / 2, FZ - depth / 2);
      m.castShadow = m.receiveShadow = true;
      group.add(m);
      parts.push(m);
    }
  }
  return parts;
}

function coinSlot(parent, x, y, z, metal) {
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.012), metal);
  plate.position.set(x, y, z);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.045, 0.004), new THREE.MeshStandardMaterial({ color: 0x050505 }));
  slot.position.set(0, 0.01, 0.007);
  plate.add(slot);
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.01, 16).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd8d8d8, metalness: 0.6, roughness: 0.3 }));
  btn.position.set(0, -0.03, 0.009);
  plate.add(btn);
  parent.add(plate);
  return plate;
}

// =====================================================================
// 커피 자판기
// =====================================================================
export function createCoffeeMachine(ctx) {
  const W = 0.86, H = 1.83, D = 0.72, FZ = D / 2;
  const group = new THREE.Group();
  const interactables = [];
  const WX = -0.08, WY = 0.36, WW = 0.28, WH = 0.3, WD = 0.2;
  const shell = cabinet(group, W, H, D, WD, [{ x0: WX - WW / 2, x1: WX + WW / 2, y0: WY, y1: WY + WH }],
    new THREE.MeshStandardMaterial({ color: 0x1f2f4e, roughness: 0.45, metalness: 0.25 }));
  const metal = new THREE.MeshStandardMaterial({ color: 0xa8acb2, metalness: 0.7, roughness: 0.35 });

  // 상단 간판 + 포스터
  const header = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.08, 0.2), glow(canvasTexture(512, 120, (x, w, h) => {
    const gr = x.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#3a1e10'); gr.addColorStop(1, '#7a4422');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    x.fillStyle = '#f6e6c8';
    x.font = `900 68px ${FONT}`;
    x.textBaseline = 'middle';
    x.fillText('COFFEE', 28, h / 2 + 4);
    x.font = `700 30px ${FONT}`;
    x.fillText('따뜻한 한 잔', 300, h / 2 + 4);
  }), 0.35));
  header.position.set(0, 1.66, FZ + 0.001);
  group.add(header);
  const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.5), glow(canvasTexture(320, 286, (x, w, h) => {
    const gr = x.createRadialGradient(w * 0.5, h * 0.55, 10, w * 0.5, h * 0.5, w * 0.7);
    gr.addColorStop(0, '#d8a870'); gr.addColorStop(1, '#4a2410');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    // 종이컵 그림 + 김
    x.fillStyle = '#f4efe6';
    x.beginPath(); x.moveTo(100, 110); x.lineTo(220, 110); x.lineTo(205, 250); x.lineTo(115, 250); x.closePath(); x.fill();
    x.fillStyle = '#6a3a1e'; x.fillRect(106, 170, 108, 34);
    x.fillStyle = '#8a5a3a'; x.beginPath(); x.ellipse(160, 112, 60, 10, 0, 0, 7); x.fill();
    x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 6; x.lineCap = 'round';
    for (let i = 0; i < 3; i++) { x.beginPath(); x.moveTo(130 + i * 30, 95); x.bezierCurveTo(115 + i * 30, 70, 150 + i * 30, 55, 135 + i * 30, 25); x.stroke(); }
  }), 0.28));
  poster.position.set(-0.1, 1.25, FZ + 0.001);
  group.add(poster);

  // 메뉴 버튼 2×3
  const btnMeshes = COFFEE_MENU.map((m, i) => {
    const tex = canvasTexture(200, 80, (x, w, h) => {
      x.fillStyle = '#f4efe6'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#' + m.liquid.toString(16).padStart(6, '0'); x.fillRect(0, 0, 14, h);
      x.fillStyle = '#222'; x.font = `800 30px ${FONT}`; x.textBaseline = 'middle';
      x.fillText(m.name, 24, 28);
      x.fillStyle = '#c8202a'; x.font = `700 24px ${FONT}`;
      x.fillText(won(m.price), 24, 60);
    });
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15, roughness: 0.4 });
    const b = new THREE.Mesh(new RoundedBoxGeometry(0.17, 0.068, 0.02, 2, 0.006), mat);
    b.position.set(-0.3 + (i % 3) * 0.185, 0.93 - Math.floor(i / 3) * 0.085, FZ + 0.01);
    b.castShadow = true;
    group.add(b);
    b.userData.interact = {
      label: () => (st.mode === 'idle' ? `${m.name} ${won(m.price)} · 좌클릭` : st.mode === 'jam' ? null : '사용 중…'),
      click: () => request(i),
    };
    interactables.push(b);
    return { mesh: b, mat, menu: m };
  });

  // 표시창 + 동전 투입구 (오른쪽 세로 패널)
  const lcd = lcdTexture();
  const lcdMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.056), new THREE.MeshBasicMaterial({ map: lcd.tex, toneMapped: false }));
  lcdMesh.position.set(0.3, 1.27, FZ + 0.002);
  group.add(lcdMesh);
  const slot = coinSlot(group, 0.3, 1.1, FZ + 0.006, metal);
  // 고장 문의 스티커
  const sticker = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.06), new THREE.MeshStandardMaterial({ map: canvasTexture(256, 96, (x, w, h) => {
    x.fillStyle = '#f2e04a'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#222'; x.font = `800 24px ${FONT}`; x.fillText('고장 문의', 14, 36);
    x.font = `600 20px ${FONT}`; x.fillText('☎ 02-000-0000', 14, 72);
  }), roughness: 0.8 }));
  sticker.position.set(0.3, 0.98, FZ + 0.002);
  group.add(sticker);

  // 컵 나오는 곳: 안쪽 어두운 공간 + 노즐 + 물받이 + 아크릴 문
  const recess = new THREE.Group();
  recess.position.set(WX, WY, FZ - WD);
  group.add(recess);
  const inner = new THREE.MeshStandardMaterial({ color: 0x2a2e34, roughness: 0.7, side: THREE.BackSide });
  const box = new THREE.Mesh(new THREE.BoxGeometry(WW, WH, WD), inner);
  box.position.set(0, WH / 2, WD / 2);
  recess.add(box);
  // 금속 테두리
  for (const [w, h, x, y] of [[WW + 0.04, 0.02, 0, WH / 2 + 0.01], [WW + 0.04, 0.02, 0, -WH / 2 - 0.01], [0.02, WH, -WW / 2 - 0.01, 0], [0.02, WH, WW / 2 + 0.01, 0]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.014), metal);
    f.position.set(WX + x, WY + WH / 2 + y, FZ + 0.004);
    group.add(f);
  }
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xfff0d0, emissiveIntensity: 0 });
  const lamp = new THREE.Mesh(new THREE.PlaneGeometry(WW * 0.8, 0.012), lampMat);
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(0, WH - 0.004, WD * 0.6);
  recess.add(lamp);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.03, 12), metal);
  nozzle.position.set(0, WH - 0.03, WD * 0.5);
  recess.add(nozzle);
  const grate = new THREE.Mesh(new THREE.BoxGeometry(WW * 0.9, 0.008, WD * 0.85), new THREE.MeshStandardMaterial({ color: 0x55595f, metalness: 0.6, roughness: 0.4 }));
  grate.position.set(0, 0.006, WD * 0.5);
  recess.add(grate);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(WW, WH * 0.75), new THREE.MeshStandardMaterial({ color: 0xb8d8e8, transparent: true, opacity: 0.22, roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }));
  const doorPivot = new THREE.Group();
  doorPivot.position.set(WX, WY + WH, FZ + 0.006);
  door.position.y = -WH * 0.375;
  doorPivot.add(door);
  group.add(doorPivot);
  const winLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.035), glow(canvasTexture(256, 44, (x, w, h) => {
    x.fillStyle = '#1f2f4e'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#e8eef8'; x.font = `700 26px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('컵 나오는 곳', w / 2, h / 2 + 1);
  }), 0.3));
  winLabel.position.set(WX, WY + WH + 0.045, FZ + 0.002);
  group.add(winLabel);

  // 컵 + 커피 줄기
  const cup = createPaperCup(1);
  cup.group.visible = false;
  cup.group.position.set(0, 0.012, WD * 0.5);
  recess.add(cup.group);
  const stream = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0028, 1, 8).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: 0x5a3420, roughness: 0.2, transparent: true, opacity: 0.85 }));
  stream.position.set(0, WH - 0.045, WD * 0.5);
  stream.visible = false;
  recess.add(stream);
  // 컵 꺼내기 대상: 컵 크기보다 넉넉한 투명 박스
  const cupHit = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial({ visible: false }));
  cupHit.position.set(0, 0.06, WD * 0.5);
  recess.add(cupHit);
  cupHit.userData.interact = {
    label: () => (st.mode === 'ready' ? (st.owner === 'me' ? (ctx.handsFull() ? '손이 꽉 찼다' : `${st.menu.name} 꺼내기 · 좌클릭`) : '다른 사람 커피') : null),
    click: () => take(),
  };
  interactables.push(cupHit);
  // 자판기 몸통: 동전 걸렸을 때 툭 치기
  for (const part of shell) {
    part.userData.interact = {
      label: () => (st.mode === 'jam' && st.owner === 'me' ? '동전이 걸렸다… 툭 치기 · 좌클릭' : null),
      click: () => kick(),
    };
    interactables.push(part);
  }
  void slot;

  // ---------- 상태 ----------
  const st = { mode: 'idle', t: 0, owner: null, menu: null, idx: -1, inserted: 0, coins: 0, whirr: null, pour: null, steamAcc: 0 };
  const showIdle = () => lcd.draw(`지갑 ${won(ctx.wallet.get())}`, '메뉴를 골라주세요');
  showIdle();
  const tmp = new THREE.Vector3();

  function request(i) {
    if (st.mode !== 'idle') return;
    const m = COFFEE_MENU[i];
    if (ctx.wallet.get() < m.price) { lcd.draw('잔액 부족', `${won(m.price)} 필요`); ctx.sfx.press(); setTimeout(showIdle, 1500); return; }
    ctx.wallet.spend(m.price);
    ctx.sfx.press();
    Object.assign(st, { mode: 'paying', t: 0, owner: 'me', menu: m, idx: i, inserted: 0, coins: m.price / COIN });
  }
  function start(owner, i) {
    const m = COFFEE_MENU[i];
    Object.assign(st, { mode: 'cup', t: 0, owner, menu: m, idx: i });
    cup.setLiquid(m.liquid);
    cup.setFill(0);
    cup.group.visible = true;
    cup.group.position.y = WH * 0.7;
    lcd.draw(m.name, '컵이 나옵니다');
  }
  function kick() {
    if (st.mode !== 'jam' || st.owner !== 'me') return;
    ctx.sfx.bang();
    ctx.net({ t: 'ev', kind: 'kick', machine: 0 });
    group.position.x += 0.01;
    setTimeout(() => { group.position.x -= 0.01; }, 80);
    if (Math.random() < 0.6) {
      ctx.toast('툭… 동전이 들어갔다');
      ctx.net({ t: 'ev', kind: 'vend', machine: 0, idx: st.idx });
      start('me', st.idx);
    } else {
      lcd.draw('동전 걸림', '꿈쩍도 안 한다…');
    }
  }
  function take() {
    if (st.mode !== 'ready' || st.owner !== 'me') return;
    if (ctx.handsFull()) { ctx.toast('손에 든 거부터 처리하자'); return; }
    ctx.give({ type: 'cup', name: st.menu.name, liquid: st.menu.liquid, fill: cup.fill, temp: 1 });
    ctx.net({ t: 'ev', kind: 'take', machine: 0 });
    clearReady();
  }
  function clearReady() {
    cup.group.visible = false;
    doorPivot.rotation.x = 0;
    lampMat.emissiveIntensity = 0;
    st.mode = 'idle';
    st.owner = null;
    showIdle();
  }
  const stopSounds = () => { st.whirr?.stop(); st.pour?.stop(); st.whirr = st.pour = null; };

  return {
    group, interactables,
    collider: [W / 2, D / 2],
    get busy() { return st.mode !== 'idle'; },
    remoteVend(i) { if (st.mode === 'idle' || st.owner !== 'me') { stopSounds(); start('remote', i); } },
    remoteTake() { if (st.owner === 'remote') { stopSounds(); clearReady(); } },
    remoteKick() { ctx.sfx.bang(ctx.dist()); },
    refreshIdle() { if (st.mode === 'idle') showIdle(); },
    update(dt) {
      st.t += dt;
      const afford = (m) => st.mode === 'idle' && ctx.wallet.get() >= m.price;
      for (const b of btnMeshes) b.mat.emissiveIntensity = afford(b.menu) ? 0.45 : 0.08;
      const d = ctx.dist();
      if (st.mode === 'paying') {
        const want = Math.min(st.coins, Math.floor(st.t / 0.13) + 1);
        while (st.inserted < want) { st.inserted++; ctx.sfx.coin(d); lcd.draw(st.menu.name, `투입 ${won(st.inserted * COIN)}`); }
        if (st.inserted >= st.coins && st.t > st.coins * 0.13 + 0.25) {
          if (Math.random() < JAM_CHANCE) { st.mode = 'jam'; lcd.draw('동전 걸림', '자판기를 툭 쳐보세요'); ctx.toast('자판기가 동전을 먹었다…'); }
          else { ctx.net({ t: 'ev', kind: 'vend', machine: 0, idx: st.idx }); start('me', st.idx); }
        }
      } else if (st.mode === 'cup') {
        // 컵이 톡 떨어짐
        const k = Math.min(1, st.t / 0.35);
        cup.group.position.y = THREE.MathUtils.lerp(WH * 0.7, 0.012, k * k);
        if (k >= 1 && !st.dropped) { st.dropped = true; ctx.sfx.cupDrop(d); }
        if (st.t > 0.7) {
          st.dropped = false;
          st.mode = 'brew'; st.t = 0;
          st.whirr = ctx.sfx.whirr(d);
          lampMat.emissiveIntensity = 0.8;
          lcd.draw(st.menu.name, '만드는 중…');
        }
      } else if (st.mode === 'brew') {
        // 0.8~3.9초 쪼르륵, 컵이 차오름
        const pouring = st.t > 0.8 && st.t < 3.9;
        if (pouring && !st.pour) st.pour = ctx.sfx.pour(d);
        if (!pouring && st.pour) { st.pour.stop(); st.pour = null; }
        if (pouring) cup.setFill(((st.t - 0.8) / 3.1) * 0.85);
        stream.visible = pouring;
        if (pouring) stream.scale.y = Math.max(0.01, (WH - 0.045) - (0.012 + cup.height * 0.9 * cup.fill));
        if (st.t > 4.3) {
          stopSounds();
          stream.visible = false;
          st.mode = 'ready'; st.t = 0;
          ctx.sfx.beep(d);
          doorPivot.rotation.x = -0.9; // 아크릴 문 살짝 열림
          lcd.draw(st.menu.name, st.owner === 'me' ? '커피를 꺼내세요' : '완료');
        }
      }
      // 김
      if ((st.mode === 'brew' && st.t > 1.5) || st.mode === 'ready') {
        st.steamAcc += dt * 5;
        while (st.steamAcc > 1) {
          st.steamAcc -= 1;
          cup.group.updateMatrixWorld(true);
          cup.topWorld(tmp);
          ctx.smoke.emit(tmp, new THREE.Vector3((Math.random() - 0.5) * 0.02, 0.12, (Math.random() - 0.5) * 0.02), { size: 0.02, grow: 0.14, life: 1.6, alpha: 0.12, tint: 1 });
        }
      }
    },
  };
}

// =====================================================================
// 음료 자판기
// =====================================================================
export function createDrinkMachine(ctx, { products = DRINKS, title = '시원한 음료', color = 0xa8222a, item = 'can', no = 1 } = {}) {
  const P = products;
  const W = 0.95, H = 1.83, D = 0.75, FZ = D / 2;
  const group = new THREE.Group();
  const interactables = [];
  const DX = -0.08, DW = 0.68, DY0 = 0.92, DH = 0.78;     // 진열창
  const outW = 0.5, outY = 0.14, outH = 0.18;             // 투출구
  const shell = cabinet(group, W, H, D, 0.2, [
    { x0: DX - DW / 2, x1: DX + DW / 2, y0: DY0, y1: DY0 + DH },
    { x0: -0.08 - outW / 2, x1: -0.08 + outW / 2, y0: outY, y1: outY + outH },
  ], new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.2 }));
  const metal = new THREE.MeshStandardMaterial({ color: 0xa8acb2, metalness: 0.7, roughness: 0.35 });

  // 진열창: 밝은 뒷판 + 3단 선반 + 실제 캔/병 + 유리
  const back = new THREE.Mesh(new THREE.PlaneGeometry(DW, DH), new THREE.MeshStandardMaterial({ color: 0xe8eef4, emissive: 0xf4f8ff, emissiveIntensity: 0.22, roughness: 0.6 }));
  back.position.set(DX, DY0 + DH / 2, FZ - 0.16);
  group.add(back);
  for (const [w, h, x, y, z, d] of [[DW, 0.02, DX, DY0, FZ - 0.08, 0.16], [DW, 0.02, DX, DY0 + DH, FZ - 0.08, 0.16], [0.02, DH, DX - DW / 2, DY0 + DH / 2, FZ - 0.08, 0.16], [0.02, DH, DX + DW / 2, DY0 + DH / 2, FZ - 0.08, 0.16]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: 0xd8d8dc, roughness: 0.5 }));
    m.position.set(x, y, z);
    group.add(m);
  }
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(DW, DH), new THREE.MeshStandardMaterial({ color: 0xcfe4f0, transparent: true, opacity: 0.14, roughness: 0.05, depthWrite: false }));
  glass.position.set(DX, DY0 + DH / 2, FZ + 0.002);
  glass.renderOrder = 2;
  group.add(glass);

  const btnMats = [];
  const slotsFor = [];
  P.forEach((dk, i) => {
    const row = Math.floor(i / 5), col = i % 5;
    const sx = DX - DW / 2 + 0.07 + col * 0.135;
    const shelfY = DY0 + DH - (row + 1) * (DH / 3) + 0.035;
    // 선반
    if (col === 0) {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(DW - 0.02, 0.008, 0.14), new THREE.MeshStandardMaterial({ color: 0xbfc4ca, metalness: 0.4, roughness: 0.4 }));
      shelf.position.set(DX, shelfY - 0.006, FZ - 0.085);
      group.add(shelf);
    }
    const item = createDrink(dk, 1);
    item.group.position.set(sx, shelfY, FZ - 0.07);
    item.group.rotation.y = (Math.random() - 0.5) * 0.3;
    group.add(item.group);
    // 가격표 + 버튼
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.03), new THREE.MeshStandardMaterial({ map: canvasTexture(160, 48, (x, w, h) => {
      x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
      x.fillStyle = '#222'; x.font = `800 30px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(dk.price.toLocaleString(), w / 2, h / 2 + 1);
    }), roughness: 0.6 }));
    tag.position.set(sx, shelfY - 0.03, FZ + 0.004);
    group.add(tag);
    const bm = new THREE.MeshStandardMaterial({ color: 0x1a3a1a, emissive: 0x30ff60, emissiveIntensity: 0.1, roughness: 0.4 });
    btnMats.push({ mat: bm, price: dk.price });
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 16).rotateX(Math.PI / 2), bm);
    btn.position.set(sx + 0.035, shelfY - 0.03, FZ + 0.008);
    group.add(btn);
    // 상품/버튼/가격표 모두 클릭 가능하게 넉넉한 히트박스
    const hit = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.05), new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.set(sx, shelfY + 0.06, FZ + 0.01);
    group.add(hit);
    hit.userData.interact = {
      label: () => (st.mode === 'idle' ? `${dk.name} ${won(dk.price)} · 좌클릭` : st.mode === 'jam' ? null : '사용 중…'),
      click: () => request(i),
    };
    interactables.push(hit);
    slotsFor.push(item);
  });

  // 오른쪽 패널: 표시창 + 동전 투입구 + 지폐 투입구
  const lcd = lcdTexture();
  const lcdMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.048), new THREE.MeshBasicMaterial({ map: lcd.tex, toneMapped: false }));
  lcdMesh.position.set(0.37, 1.45, FZ + 0.002);
  group.add(lcdMesh);
  coinSlot(group, 0.37, 1.3, FZ + 0.006, metal);
  const bill = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.012), metal);
  bill.position.set(0.37, 1.17, FZ + 0.006);
  const billSlot = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.006, 0.004), new THREE.MeshStandardMaterial({ color: 0x050505 }));
  billSlot.position.z = 0.007;
  bill.add(billSlot);
  group.add(bill);
  const brand = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.08, 0.12), glow(canvasTexture(512, 64, (x, w, h) => {
    x.fillStyle = '#' + color.toString(16).padStart(6, '0'); x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff'; x.font = `900 40px ${FONT}`; x.textBaseline = 'middle';
    x.fillText(title, 24, h / 2 + 2);
  }), 0.3));
  brand.position.set(0, 1.76, FZ + 0.001);
  group.add(brand);

  // 투출구 (아래)
  const pocket = new THREE.Mesh(new THREE.BoxGeometry(outW, outH, 0.2), new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.8, side: THREE.BackSide }));
  pocket.position.set(-0.08, outY + outH / 2, FZ - 0.1);
  group.add(pocket);
  const flap = new THREE.Mesh(new THREE.PlaneGeometry(outW, outH), new THREE.MeshStandardMaterial({ color: 0x2a2c30, transparent: true, opacity: 0.55, roughness: 0.3, side: THREE.DoubleSide }));
  const flapPivot = new THREE.Group();
  flapPivot.position.set(-0.08, outY + outH, FZ + 0.004);
  flap.position.y = -outH / 2;
  flapPivot.add(flap);
  group.add(flapPivot);
  const outLabel = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.03), glow(canvasTexture(200, 40, (x, w, h) => {
    x.fillStyle = '#' + color.toString(16).padStart(6, '0'); x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff'; x.font = `700 24px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('PUSH', w / 2, h / 2 + 1);
  }), 0.25));
  outLabel.position.set(-0.08, outY + outH + 0.03, FZ + 0.002);
  group.add(outLabel);
  let dropped = null;
  const outHit = new THREE.Mesh(new THREE.BoxGeometry(outW, outH, 0.1), new THREE.MeshBasicMaterial({ visible: false }));
  outHit.position.set(-0.08, outY + outH / 2, FZ);
  group.add(outHit);
  outHit.userData.interact = {
    label: () => (st.mode === 'ready' ? (st.owner === 'me' ? (ctx.handsFull() ? '손이 꽉 찼다' : `${st.drink.name} 꺼내기 · 좌클릭`) : '다른 사람 음료') : null),
    click: () => take(),
  };
  interactables.push(outHit);
  for (const part of shell) {
    part.userData.interact = {
      label: () => (st.mode === 'jam' && st.owner === 'me' ? '동전이 걸렸다… 툭 치기 · 좌클릭' : null),
      click: () => kick(),
    };
    interactables.push(part);
  }

  const st = { mode: 'idle', t: 0, owner: null, drink: null, idx: -1, inserted: 0, coins: 0 };
  const showIdle = () => lcd.draw(`지갑 ${won(ctx.wallet.get())}`, '골라주세요');
  showIdle();

  function request(i) {
    if (st.mode !== 'idle') return;
    const dk = P[i];
    if (ctx.wallet.get() < dk.price) { lcd.draw('잔액 부족', `${won(dk.price)} 필요`); ctx.sfx.press(); setTimeout(showIdle, 1500); return; }
    ctx.wallet.spend(dk.price);
    ctx.sfx.press();
    Object.assign(st, { mode: 'paying', t: 0, owner: 'me', drink: dk, idx: i, inserted: 0, coins: dk.price / COIN });
  }
  function start(owner, i) {
    Object.assign(st, { mode: 'drop', t: 0, owner, drink: P[i], idx: i });
    lcd.draw(P[i].name, '나옵니다');
  }
  function kick() {
    if (st.mode !== 'jam' || st.owner !== 'me') return;
    ctx.sfx.bang();
    ctx.net({ t: 'ev', kind: 'kick', machine: no });
    group.position.x += 0.01;
    setTimeout(() => { group.position.x -= 0.01; }, 80);
    if (Math.random() < 0.6) {
      ctx.toast('툭… 들어갔다');
      ctx.net({ t: 'ev', kind: 'vend', machine: no, idx: st.idx });
      start('me', st.idx);
    } else lcd.draw('동전 걸림', '꿈쩍도 안 한다…');
  }
  function take() {
    if (st.mode !== 'ready' || st.owner !== 'me') return;
    if (ctx.handsFull()) { ctx.toast('손에 든 거부터 처리하자'); return; }
    ctx.give({ type: item, drink: st.drink, fill: 1, opened: false });
    ctx.net({ t: 'ev', kind: 'take', machine: no });
    clearReady();
  }
  function clearReady() {
    if (dropped) { group.remove(dropped.group); dropped = null; }
    flapPivot.rotation.x = 0;
    st.mode = 'idle';
    st.owner = null;
    showIdle();
  }

  return {
    group, interactables,
    collider: [W / 2, D / 2],
    get busy() { return st.mode !== 'idle'; },
    remoteVend(i) { if (st.mode === 'idle' || st.owner !== 'me') { clearReady(); start('remote', i); } },
    remoteTake() { if (st.owner === 'remote') clearReady(); },
    remoteKick() { ctx.sfx.bang(ctx.dist()); },
    refreshIdle() { if (st.mode === 'idle') showIdle(); },
    update(dt) {
      st.t += dt;
      for (const b of btnMats) b.mat.emissiveIntensity = st.mode === 'idle' && ctx.wallet.get() >= b.price ? 0.9 : 0.06;
      const d = ctx.dist();
      if (st.mode === 'paying') {
        const want = Math.min(st.coins, Math.floor(st.t / 0.11) + 1);
        while (st.inserted < want) { st.inserted++; ctx.sfx.coin(d); lcd.draw(st.drink.name, `투입 ${won(st.inserted * COIN)}`); }
        if (st.inserted >= st.coins && st.t > st.coins * 0.11 + 0.25) {
          if (Math.random() < JAM_CHANCE) { st.mode = 'jam'; lcd.draw('동전 걸림', '툭 쳐보세요'); ctx.toast('자판기가 동전을 먹었다…'); }
          else { ctx.net({ t: 'ev', kind: 'vend', machine: no, idx: st.idx }); start('me', st.idx); }
        }
      } else if (st.mode === 'drop' && st.t > 0.6) {
        ctx.sfx.canDrop(d);
        dropped = createDrink(st.drink, 1);
        dropped.group.rotation.z = Math.PI / 2;
        dropped.group.rotation.y = (Math.random() - 0.5) * 0.4;
        dropped.group.position.set(-0.08 + dropped.height / 2, outY + dropped.radius + 0.005, FZ - 0.1);
        group.add(dropped.group);
        flapPivot.rotation.x = -0.25; // 플랩이 살짝 흔들림
        st.mode = 'ready'; st.t = 0;
        lcd.draw(st.drink.name, st.owner === 'me' ? '꺼내 가세요' : '완료');
      }
      if (st.mode === 'ready') flapPivot.rotation.x = -0.25 * Math.exp(-st.t * 4) * Math.cos(st.t * 18);
    },
  };
}
