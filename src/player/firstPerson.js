import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createCigarette, createLighter, createHeatDevice, createVape } from '../smoke/props.js';
import { TRICKS, performTrick } from '../smoke/tricks.js';
import { SNACKS } from '../world/items.js';
import { createSnowballMesh, createUmbrellaMesh } from '../world/snowball.js';
import { Smoker } from '../smoke/smoker.js';
import { createPaperCup, createDrink, COFFEE_MENU, DRINKS } from '../world/items.js';

const EYE = 1.3; // SD 캐릭터 눈높이 근처
const EYE_SIT = 1.12;
const RADIUS = 0.28;
const WALK = 1.6, RUN = 4.2;
const SPAWN = { pos: new THREE.Vector3(-5.0, 0, 2.6), lookAt: new THREE.Vector3(0.5, 1.0, -0.4) };

/**
 * 1인칭: 포인터락 마우스룩 + WASD + 충돌 + 흡연(Smoker 상태 머신 + 뷰모델)
 *   E/좌클릭 꾹: 빨기 → 떼면 후~   Q/우클릭 꾹: 빨기 → 떼면 도넛
 *   G: 꺼내서 불붙이기 / 꽁초 버리기 / (없으면) 한 개비 빌리기   X: 재 털기
 */
export class FirstPerson {
  constructor({ camera, dom, world, smoke, scene, onLockChange, onSmokerEvent, getContext, onItemEvent, onTrick, onSit, onStep, device = 'cig' }) {
    this.onStep = onStep;
    this.onItemEvent = onItemEvent;
    this.onTrick = onTrick;
    this.onSit = onSit;
    this.trick = null;   // { i, t, done }
    this.seat = null;    // 앉은 자리
    // 왼손에 든 음료 { type:'cup'|'can', fill, temp, opened, ... }
    this.item = null;
    this.itemVm = null;
    this.itemObj = null;
    this.sipT = 0;
    this.wheelUntil = 0;
    this.qDownAt = -1;
    this.jumpY = 0;     // 점프 높이
    this.jumpV = 0;
    this.stepPhase = 0; // 발소리 타이밍
    this.sipBlock = 0;
    this.slurpAcc = 0;
    this.steamAcc = 0;
    this.interact = null; // 조준 중인 상호작용 대상 (main이 매 프레임 설정)
    this.camera = camera;
    this.world = world;
    this.smoke = smoke;
    this.getContext = getContext || (() => ({}));
    this.active = false;
    this.controls = new PointerLockControls(camera, dom);
    this.controls.pointerSpeed = 0.7;
    this.keys = new Set();
    this.vel = new THREE.Vector2();
    this.feet = new THREE.Vector3();
    this.bob = 0;
    this.emitAcc = 0;
    this.shake = 0;

    this.smoker = new Smoker((name, data) => this.handleSmoker(name, data, onSmokerEvent), device);

    this.controls.addEventListener('lock', () => onLockChange?.(true));
    this.controls.addEventListener('unlock', () => onLockChange?.(false));

    const typing = (e) => e.target instanceof HTMLInputElement;
    addEventListener('keydown', (e) => {
      if (!this.active || typing(e) || e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.smoker.press('puff');
      if (e.code === 'KeyQ') {
        this.qDownAt = performance.now();
        const sm = this.smoker;
        if (sm.state === 'done') { sm.context(this.getContext()); this.qDownAt = -1; }
        else if (sm.state === 'lit') sm.press('ring');
      }
      if (e.code === 'KeyG') this.smoker.context(this.getContext());
      if (e.code === 'KeyX') this.smoker.flick();
      if (e.code === 'Space') {
        e.preventDefault();
        if (this.seat) this.stand();
        else if (this.jumpY <= 0 && this.jumpV === 0) this.jumpV = 3.6; // 약 32cm, 체공 0.33초
      }
      const tk = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
      if (tk >= 0) this.startTrick(tk);
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE') this.smoker.release('puff');
      if (e.code === 'KeyQ') {
        const tap = this.qDownAt > 0 && performance.now() - this.qDownAt < 230;
        this.qDownAt = -1;
        this.smoker.release('ring');
        if (tap && this.smoker.state === 'lit') this.smoker.context(this.getContext());
      }
    });
    addEventListener('blur', () => this.clearInput());
    // 우클릭: 메뉴/브라우저 마우스 제스처(Whale 등) 최대한 막기
    const blockRight = (e) => { if (e.button === 2 || e.type === 'contextmenu') { e.preventDefault(); e.stopPropagation(); } };
    dom.addEventListener('contextmenu', blockRight);
    dom.addEventListener('pointerdown', blockRight);
    dom.addEventListener('pointerup', blockRight);
    dom.addEventListener('auxclick', blockRight);
    addEventListener('contextmenu', (e) => { if (this.active) e.preventDefault(); }, { capture: true });
    // 마우스만으로 흡연:
    //   담배 없음/다 핌: 좌·우클릭 = 꺼내 물기 / 꽁초 버리기
    //   피우는 중: 좌클릭 꾹 = 빨기(떼면 후~), 톡 = 재 털기 / 우클릭 꾹 = 도넛, 톡 = 끄고 버리기
    this.downAt = [-1, -1, -1];
    const TAP = 230;
    dom.addEventListener('mousedown', (e) => {
      if (e.button === 2) e.preventDefault();
      if (!this.active || !this.controls.isLocked || (e.button !== 0 && e.button !== 2)) return;
      const sm = this.smoker;
      // 조준 중인 대상 (자판기·쓰레기통·눈사람…): 좌클릭/우클릭 동작이 있으면 그게 우선
      if (e.button === 0 && this.interact?.click) { this.interact.click(); this.downAt[0] = -1; return; }
      if (e.button === 2 && this.interact?.rclick) { this.interact.rclick(); this.downAt[2] = -1; return; }
      // 눈뭉치 들고 있으면 좌클릭 = 던지기
      if (e.button === 0 && this.item?.type === 'snowball') { this.onItemEvent?.('throw', this.item); this.downAt[0] = -1; return; }
      this.downAt[e.button] = performance.now();
      if (sm.state === 'none' || sm.state === 'done') {
        sm.context(this.getContext());
        this.downAt[e.button] = -1; // 소비됨
      } else if (sm.state === 'lit') {
        sm.press(e.button === 0 ? 'puff' : 'ring');
      } else if (sm.state === 'lighting') {
        sm.press('puff'); // 물고 빨아야 불이 붙음
      }
    });
    dom.addEventListener('wheel', (e) => {
      if (!this.active || !this.controls.isLocked) return;
      this.wheelUntil = e.deltaY < 0 ? performance.now() + 340 : 0; // 위로 굴리는 동안 마심
    }, { passive: true });
    addEventListener('mouseup', (e) => {
      if (e.button !== 0 && e.button !== 2) return;
      const t0 = this.downAt[e.button];
      this.downAt[e.button] = -1;
      const tap = t0 > 0 && performance.now() - t0 < TAP;
      const sm = this.smoker;
      sm.release(e.button === 0 ? 'puff' : 'ring'); // 짧게 눌렀으면 들숨이 얕아서 후~ 안 나옴
      if (tap && sm.state === 'lit') {
        if (e.button === 0) sm.flick();
        else sm.context(this.getContext());
      }
    });

    // 뷰모델: 담배 + 라이터
    this.vm = new THREE.Group();
    this.cig = createCigarette({ radius: 0.0045 });
    this.cig.group.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(-0.55, 0.08, -0.83).normalize());
    this.vm.add(this.cig.group);
    // 손가락 두 개 (필터 근처를 가로지름)
    const skin = new THREE.MeshStandardMaterial({ color: 0xffdcc2, roughness: 0.7 });
    for (const y of [0.0085, -0.0085]) {
      const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.0072, 0.045, 4, 8), skin);
      f.rotation.set(0, 0, Math.PI / 2 + 0.5);
      f.position.set(0.026, y + 0.004, 0.01);
      this.vm.add(f);
    }
    // 전자담배: 담배와 따로. 기기를 세워서(+Y=입) 주먹으로 감싸 쥠
    this.devVm = new THREE.Group();
    this.heatDev = createHeatDevice(1);
    this.vapeDev = createVape(1);
    this.devVm.add(this.heatDev.group, this.vapeDev.group);
    // SD 캐릭터 스타일 주먹: 통통한 주먹 + 볼록한 손가락 마디 + 감싸는 엄지 + 소매, 툰 셰이딩 + 외곽선
    const fist = buildFist();
    this.devVm.add(fist);
    this.devVm.traverse((o) => { o.renderOrder = 20; });
    this.devVm.visible = false;
    camera.add(this.devVm);
    this.vm.visible = false;
    this.vm.scale.setScalar(1.05);
    camera.add(this.vm);
    this.lighter = createLighter({ scale: 1 });
    this.lighter.group.visible = false;
    camera.add(this.lighter.group);
    scene.add(camera); // 카메라 자식(뷰모델)이 렌더되려면 씬에 있어야 함

    this.vmT = 0;   // 입으로 올리는 정도 (0..1)
    this.lightT = 0;
    this.scene = scene;
    // 재 털기 애니메이션: 손을 재떨이 위로 → 툭, 툭 → 복귀
    this.flick = null;      // { t, dur, amount, target(Vector3|null), taps:[], outer, data }
    this.shownAsh = 0;      // 화면에 보이는 재 길이 (털기 전까지 유지)
    this.chunks = [];       // 떨어지는 재 덩어리
    this.chunkGeo = new THREE.CylinderGeometry(0.0034, 0.003, 1, 7);
    this.chunkMat = new THREE.MeshStandardMaterial({ color: 0x9a9690, roughness: 1 });

    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
  }

  get isLocked() { return this.controls.isLocked; }

  /** 연출(연기/흔들림)은 여기서, 오디오·네트워크·HUD는 밖으로 */
  handleSmoker(name, data, outer) {
    const cam = this.camera;
    if (name === 'exhale') {
      const dir = cam.getWorldDirection(this._v2.clone());
      const p = this._v.copy(cam.position).addScaledVector(dir, 0.22);
      p.y -= 0.08;
      if (data.type === 'ring') { dir.y += 0.05; this.smoke.ring(p, dir.normalize(), data.k * (data.device === 'vape' ? 1.3 : 1)); }
      else {
        dir.y -= 0.12;
        dir.normalize();
        // 입 위치를 매 프레임 따라감 (걸으면서/고개 돌리면서 뱉어도 자연스럽게)
        const mouth = { p: new THREE.Vector3(), d: new THREE.Vector3() };
        this.smoke.exhale(() => {
          cam.getWorldDirection(mouth.d);
          mouth.p.copy(cam.position).addScaledVector(mouth.d, 0.16);
          mouth.p.y -= 0.075;
          mouth.d.y -= 0.15;
          mouth.d.normalize();
          return mouth;
        }, data.v, { nose: data.nose, vapor: data.device === 'cig' ? 'smoke' : data.device });
      }
      data.p = p.clone();
      data.d = dir.clone();
    } else if (name === 'cough') {
      this.shake = 1.3;
      const dir = cam.getWorldDirection(this._v2.clone());
      const p = this._v.copy(cam.position).addScaledVector(dir, 0.2);
      [0, 300, 560, 950].forEach((ms) => setTimeout(() => this.smoke.puff(p, dir, 0.35), ms));
    } else if (name === 'ash') {
      const ctx = this.getContext();
      const near = ctx.tray && ctx.ashtrayDist < 1.1;
      if (near) data.tray = ctx.trayIdx;
      if (data.flicked) {
        // 툭툭 터는 애니메이션이 끝나는 타이밍에 맞춰 바깥 이벤트 실행
        this.flick = { t: 0, dur: 0.75, amount: data.amount, target: near ? ctx.tray.top.clone() : null, tapped: 0, outer, data };
        this.shownAsh = data.amount;
        return;
      }
      // 저절로 떨어진 재: 팁에서 바로 툭
      this.cig.tipWorld(this._v);
      this.dropChunk(this._v, data.amount, near ? ctx.tray : null);
      data.p = this._v.clone();
    } else if (name === 'butt') {
      const dir = cam.getWorldDirection(this._v2.clone());
      dir.y = 0; dir.normalize();
      data.x = this.feet.x + dir.x * 0.6;
      data.z = this.feet.z + dir.z * 0.6;
    }
    outer?.(name, data);
  }

  /** 입 위치/방향 (매번 새 객체) */
  mouthOrigin() {
    const d = this.camera.getWorldDirection(new THREE.Vector3());
    const p = this.camera.position.clone().addScaledVector(d, 0.16);
    p.y -= 0.075;
    d.y -= 0.15;
    d.normalize();
    return { p, d };
  }

  /** 묘기 (피우는 중일 때 1~4) */
  startTrick(i) {
    const sm = this.smoker;
    if (this.trick || !TRICKS[i] || !sm.takeDrag(TRICKS[i].prep)) return;
    this.trick = { i, t: 0, done: false };
    this.onTrick?.('start', i);
  }

  /** 벤치에 앉기 / 일어나기 */
  sit(seat) {
    if (this.seat || seat.taken) return;
    seat.taken = true;
    this.seat = seat;
    this.vel.set(0, 0);
    this.feet.set(seat.x, 0, seat.z);
    this.onSit?.(true, seat);
  }
  stand() {
    if (!this.seat) return;
    const seat = this.seat;
    seat.taken = false;
    this.seat = null;
    // 벤치 앞으로 한 걸음
    this.feet.set(seat.x - Math.sin(seat.yaw) * -0.65, 0, seat.z + Math.cos(seat.yaw) * 0.65);
    this.world.resolve(this.feet, RADIUS);
    this.onSit?.(false, seat);
  }

  /** 왼손에 음료 쥐기 (null이면 비움) */
  setItem(item) {
    if (this.itemVm) { this.camera.remove(this.itemVm); this.itemVm = null; this.itemObj = null; }
    this.item = item;
    this.sipT = 0;
    if (!item) return;
    const vm = new THREE.Group();
    if (item.type === 'cup') {
      const cup = createPaperCup(1);
      cup.setLiquid(item.liquid);
      cup.setFill(item.fill);
      vm.add(cup.group);
      this.itemObj = cup;
    } else if (item.type === 'umbrella') {
      const u = createUmbrellaMesh(item.color, 1);
      vm.add(u.group);
      this.itemObj = u;
    } else if (item.type === 'snowball') {
      const b = createSnowballMesh(1);
      vm.add(b.group);
      this.itemObj = b;
    } else {
      const can = createDrink(item.drink, 1);
      vm.add(can.group);
      this.itemObj = can;
    }
    vm.traverse((o) => { o.renderOrder = 20; });
    vm.position.set(-0.2, -0.2, -0.42);
    this.camera.add(vm);
    this.itemVm = vm;
  }

  /** 재 덩어리 하나가 떨어짐 (재떨이 위면 재떨이 흙 높이에서 멈춤) */
  dropChunk(p, amount, tray) {
    const m = new THREE.Mesh(this.chunkGeo, this.chunkMat);
    m.scale.y = Math.max(0.004, Math.min(0.025, amount));
    m.position.copy(p);
    m.rotation.set(Math.random() * 0.6, 0, Math.PI / 2 + (Math.random() - 0.5) * 0.6);
    m.castShadow = true;
    this.scene.add(m);
    const floor = tray && Math.hypot(p.x - tray.x, p.z - tray.z) < 0.32 ? 0.58 : 0.045;
    this.chunks.push({ m, vy: -0.2, vx: (Math.random() - 0.5) * 0.1, vz: (Math.random() - 0.5) * 0.1, floor, life: 3.5, spin: (Math.random() - 0.5) * 8 });
    this.smoke.ash(p, amount * 0.5); // 같이 흩날리는 부스러기
  }

  updateEffects(dt) {
    // 떨어지는 재 덩어리
    for (const c of this.chunks) {
      c.life -= dt;
      if (c.m.position.y > c.floor) {
        c.vy -= 9.8 * dt;
        c.m.position.x += c.vx * dt;
        c.m.position.z += c.vz * dt;
        c.m.position.y = Math.max(c.floor, c.m.position.y + c.vy * dt);
        c.m.rotation.x += c.spin * dt;
        if (c.m.position.y <= c.floor) { // 바닥/흙에 닿으면 부서짐
          this.smoke.ash(c.m.position, 0.006);
          c.m.scale.y *= 0.5;
        }
      }
      if (c.life < 0.6) c.m.scale.setScalar(Math.max(0.001, c.life / 0.6)).setY(c.m.scale.y);
    }
    this.chunks = this.chunks.filter((c) => {
      if (c.life > 0) return true;
      this.scene.remove(c.m);
      return false;
    });


  }

  enter() {
    this.active = true;
    if (this.feet.lengthSq() === 0) this.respawn();
    else this.camera.position.set(this.feet.x, EYE, this.feet.z);
    this.lock();
  }

  exit() {
    this.active = false;
    this.clearInput();
    this.vm.visible = false;
    this.lighter.group.visible = false;
    if (this.controls.isLocked) this.controls.unlock();
  }

  /**
   * 포인터락: 커서를 화면 안에 가두고 마우스 이동량만 받음.
   * - unadjustedMovement(raw input)를 먼저 시도 → OS 마우스 가속 영향 없이 일정한 감도
   * - 사용자 제스처 안에서만 되고, 풀린 직후(~1초)엔 브라우저가 거부할 수 있음 → 실패 시 오버레이 클릭으로 재시도
   */
  lock() {
    const el = this.controls.domElement;
    if (document.pointerLockElement === el) return;
    try {
      const p = el.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => { try { el.requestPointerLock(); } catch { /* noop */ } });
    } catch {
      try { el.requestPointerLock(); } catch { /* noop */ }
    }
  }

  respawn() {
    this.feet.copy(SPAWN.pos);
    this.vel.set(0, 0);
    this.camera.position.set(this.feet.x, EYE, this.feet.z);
    this.camera.lookAt(SPAWN.lookAt);
  }

  clearInput() {
    this.keys.clear();
    this.smoker.release('puff');
    this.smoker.release('ring');
  }

  /** 네트워크/아바타용 상태 */
  getState() {
    const e = new THREE.Euler().setFromQuaternion(this.camera.quaternion, 'YXZ');
    const sm = this.smoker;
    return {
      x: this.feet.x, z: this.feet.z,
      ry: this.seat ? this.seat.yaw : e.y + Math.PI, // 카메라는 -z를 봄 → 아바타(+z 정면) yaw
      si: this.seat ? 1 : 0,
      jy: this.jumpY,
      dv: { cig: 0, heat: 1, vape: 2 }[sm.device],
      lq: sm.liquid,
      s: this.vel.length(),
      k: this.vmT,
      inh: sm.holding ? sm.inhale : 0,
      c: sm.code, len: sm.len, ash: sm.ash,
      it: this.item ? ({ cup: 1, can: 2, snack: 3, umbrella: 4, snowball: 5 })[this.item.type] : 0,
      ii: this.item ? (this.item.type === 'umbrella' ? this.item.idx : this.item.type === 'snowball' ? 0 : this.item.type === 'cup' ? COFFEE_MENU.findIndex((m) => m.name === this.item.name) : this.item.type === 'snack' ? SNACKS.indexOf(this.item.drink) : DRINKS.indexOf(this.item.drink)) : -1,
      if: this.item ? this.item.fill : 0,
      sp: this.sipT,
    };
  }

  update(dt, { raining = false } = {}) {
    const sm = this.smoker;
    sm.update(dt, { raining });
    this.updateEffects(dt);
    if (!this.active) return;
    const k = this.keys;
    const locked = this.controls.isLocked;

    // --- 이동 ---
    const fwd = (locked && (k.has('KeyW') || k.has('ArrowUp')) ? 1 : 0) - (locked && (k.has('KeyS') || k.has('ArrowDown')) ? 1 : 0);
    const side = (locked && (k.has('KeyD') || k.has('ArrowRight')) ? 1 : 0) - (locked && (k.has('KeyA') || k.has('ArrowLeft')) ? 1 : 0);
    const running = k.has('ShiftLeft') || k.has('ShiftRight');
    const speed = running ? RUN : WALK;
    const dir = this.camera.getWorldDirection(this._v);
    dir.y = 0; dir.normalize();
    const rx = -dir.z, rz = dir.x;
    let wx = dir.x * fwd + rx * side, wz = dir.z * fwd + rz * side;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx = (wx / wl) * speed; wz = (wz / wl) * speed; }
    const a = 1 - Math.exp(-(wl > 0 ? 10 : 12) * dt);
    this.vel.x += (wx - this.vel.x) * a;
    this.vel.y += (wz - this.vel.y) * a;
    if (this.seat) {
      if (fwd || side) this.stand();
      else { this.vel.set(0, 0); this.feet.set(this.seat.x, 0, this.seat.z); }
    } else {
      this.feet.x += this.vel.x * dt;
      this.feet.z += this.vel.y * dt;
      this.world.resolve(this.feet, RADIUS);
    }

    // --- 헤드밥 + 기침 흔들림 ---
    const sp = this.vel.length();
    this.bob += dt * sp * (running ? 2.3 : 2.9);
    const bobAmt = Math.min(sp / RUN, 1) * (running ? 0.045 : 0.03);
    const by = Math.sin(this.bob * 2) * bobAmt;
    // 점프
    if (this.jumpV !== 0 || this.jumpY > 0) {
      this.jumpY += this.jumpV * dt;
      // 올라갈 땐 20, 내려올 땐 32 → 둥실 뜨지 않고 툭 떨어짐
      this.jumpV -= (this.jumpV > 0 ? 20 : 32) * dt;
      if (this.jumpY <= 0) {
        const hard = this.jumpV < -2;
        this.jumpY = 0; this.jumpV = 0;
        this.landDip = 0.035; // 착지할 때 살짝 내려앉음
        this.onStep?.(hard ? 'land' : 'step', this.feet);
      }
    }
    // 발소리: 걸음 주기마다 (땅에 있을 때)
    const phase = Math.floor((this.bob * 2) / Math.PI);
    if (phase !== this.stepPhase) {
      this.stepPhase = phase;
      if (sp > 0.4 && this.jumpY <= 0 && !this.seat) this.onStep?.('step', this.feet);
    }
    this.shake = Math.max(0, this.shake - dt);
    const sh = this.shake > 0 ? Math.sin(this.shake * 40) * 0.025 * Math.min(1, this.shake) : 0;
    this.landDip = Math.max(0, (this.landDip || 0) - dt * 0.25);
    const dip = this.landDip > 0 ? Math.sin((this.landDip / 0.035) * Math.PI) * this.landDip : 0;
    this.camera.position.set(this.feet.x, (this.seat ? EYE_SIT : EYE) + by + Math.abs(sh) + this.jumpY - dip, this.feet.z);

    // --- 묘기 진행: 한 모금 빨아들임(prep) → 연출 ---
    let trickRaise = 0;
    if (this.trick) {
      const T = this.trick, def = TRICKS[T.i];
      T.t += dt;
      if (T.t < def.prep) trickRaise = 1;
      if (!T.done && T.t >= def.prep) {
        T.done = true;
        const vapor = sm.device === 'cig' ? 'smoke' : sm.device;
        performTrick(this.smoke, T.i, () => this.mouthOrigin(), {
          vapor,
          hooks: { shake: (k) => { this.shake = k; }, suck: () => this.onTrick?.('suck', T.i), pop: (n) => this.onTrick?.('pop', n) },
        });
        this.onTrick?.('perform', T.i);
      }
      if (T.t > def.prep + 2.2) this.trick = null;
    }

    // --- 뷰모델 ---
    const has = sm.state !== 'none';
    const lighting = sm.state === 'lighting';
    this.vm.visible = has && sm.device === 'cig';
    this.devVm.visible = has && sm.device !== 'cig';
    const dev = sm.device;
    const raise = (lighting && dev === 'cig') || (sm.holding && sm.canInhale) || trickRaise ? 1 : 0;
    // 기기별로 손에 든 것
    this.cig.group.visible = dev === 'cig';
    this.heatDev.group.visible = dev === 'heat';
    this.vapeDev.group.visible = dev === 'vape';
    this.heatDev.setStick(has);
    this.heatDev.setLed(lighting ? 'blink' : sm.state === 'lit' ? 'on' : 'off');
    this.heatDev.update(performance.now() / 1000);
    this.vapeDev.setFiring(!!(sm.holding && sm.canInhale) || trickRaise > 0);
    this.vapeDev.setLiquid(sm.liquid);
    this.vmT += (raise - this.vmT) * (1 - Math.exp(-8 * dt));
    const t = this.vmT;
    this.vm.position.set(
      THREE.MathUtils.lerp(0.19, 0.06, t) + Math.cos(this.bob) * bobAmt * 0.6 + sh * 0.5,
      THREE.MathUtils.lerp(-0.17, -0.1, t) + by * 0.5,
      THREE.MathUtils.lerp(-0.4, -0.31, t),
    );
    this.vm.rotation.set(THREE.MathUtils.lerp(0.25, 0.9, t), THREE.MathUtils.lerp(-0.5, -0.1, t), 0);
    // 전자담배: 평소엔 오른쪽 아래에 세워 들고, 빨 때 입에 갖다 댐 (드립팁이 입 쪽으로 기울어짐)
    this.devVm.position.set(
      THREE.MathUtils.lerp(0.16, 0.012, t) + Math.cos(this.bob) * bobAmt * 0.6 + sh * 0.5,
      THREE.MathUtils.lerp(-0.13, -0.06, t) + by * 0.5,
      THREE.MathUtils.lerp(-0.34, -0.15, t),
    );
    this.devVm.rotation.set(THREE.MathUtils.lerp(0.12, 1.2, t), THREE.MathUtils.lerp(-0.3, 0, t), THREE.MathUtils.lerp(0.12, 0, t));

    // 재 털기: 손을 재떨이 위로 → 검지로 툭(0.3s) 툭(0.45s) → 복귀
    let ashShown = sm.state === 'lit' ? sm.ash : 0;
    if (this.flick) {
      const F = this.flick;
      F.t += dt;
      const k = F.t / F.dur;
      const go = THREE.MathUtils.smoothstep(k, 0, 0.3) * (1 - THREE.MathUtils.smoothstep(k, 0.72, 1));
      // 재떨이가 화면 앞쪽에 있으면 그쪽으로 손을 뻗음, 아니면 앞 아래로
      const reach = new THREE.Vector3(0.05, -0.24, -0.42);
      if (F.target) {
        const L = this.cam2local(F.target.clone().setY(F.target.y + 0.22));
        if (L.z < -0.15) reach.copy(L.setLength(Math.min(L.length(), 0.55)));
      }
      this.vm.position.lerp(reach, go);
      this.vm.rotation.x = THREE.MathUtils.lerp(this.vm.rotation.x, 0.05, go);
      const tap = (tt) => Math.exp(-Math.pow((F.t - tt) / 0.035, 2));
      this.vm.rotation.z += (tap(0.3) + tap(0.45)) * 0.35; // 툭, 툭
      this.vm.position.y -= (tap(0.3) + tap(0.45)) * 0.012;
      ashShown = this.shownAsh;
      if (F.tapped === 0 && F.t >= 0.3) {
        F.tapped = 1;
        this.vm.updateMatrixWorld(true);
        this.cig.tipWorld(this._v);
        // 재떨이 위면 재떨이 안으로 (팁이 살짝 벗어나 있어도 재떨이 쪽으로 보정)
        const tray = F.target ? this.getContext().tray : null;
        if (tray && Math.hypot(this._v.x - tray.x, this._v.z - tray.z) < 0.6) {
          this._v.x = THREE.MathUtils.lerp(this._v.x, tray.x, 0.6);
          this._v.z = THREE.MathUtils.lerp(this._v.z, tray.z, 0.6);
        }
        this.dropChunk(this._v, F.amount, tray);
        this.shownAsh = 0;
        F.data.p = this._v.clone();
        F.outer?.('ash', F.data); // 소리·재떨이 재 쌓기·네트워크
      }
      if (F.t >= F.dur) this.flick = null;
    }

    this.cig.setLength(sm.state === 'done' ? 0 : sm.len);
    this.cig.setAsh(ashShown);
    // 불 붙는 중(빨면서 불 대는 중)엔 끝이 점점 달아오름
    const igniting = lighting && sm.igniteP > 0.25;
    this.cig.setLit(sm.state === 'lit' || igniting);
    this.cig.emberMat.emissiveIntensity = igniting
      ? sm.igniteP * 10
      : 3 + (sm.holding ? sm.inhale * 16 : 0) + Math.sin(performance.now() * 0.013) * 0.5;

    // 라이터: 아래에서 올라와 담배 끝에 불을 댐
    this.lightT += ((lighting && dev === 'cig' ? 1 : 0) - this.lightT) * (1 - Math.exp(-10 * dt));
    this.lighter.group.visible = this.lightT > 0.02;
    if (this.lighter.group.visible) {
      this.vm.updateMatrixWorld(true);
      const tip = this.cam2local(this.cig.tipWorld(this._v2));
      this.lighter.group.position.set(tip.x + 0.004, THREE.MathUtils.lerp(-0.35, tip.y - 0.055, this.lightT), tip.z + 0.005);
      const flameOn = lighting && sm.flame;
      const sparking = lighting && !sm.flame && sm.t - sm.lastStrike < 0.06; // 딸깍 순간 스파크
      this.lighter.setOn(flameOn || sparking);
      this.lighter.update(performance.now() / 1000);
    }

    // --- 왼손 아이템: 휠↑ / F 로 사용 (마시기·먹기·흔들기…) ---
    if (this.item && this.itemVm) {
      const it = this.item;
      const emit = (n) => this.onItemEvent?.(n, it);
      const use = it.type === 'snack' ? it.drink.use : it.type === 'cup' ? 'sip' : it.type === 'umbrella' ? 'twirl' : it.type === 'snowball' ? 'throw' : 'drink';
      const wantSip = (performance.now() < this.wheelUntil || k.has('KeyF')) && it.fill > 0.005 && sm.t > this.sipBlock;
      // 핫팩은 입으로 안 가져가고 손에서 흔들기만
      const lift = use === 'warm' ? 0.25 : 1;
      this.sipT += ((wantSip ? lift : 0) - this.sipT) * (1 - Math.exp(-9 * dt));
      const q = this.sipT;
      this.itemVm.position.set(
        THREE.MathUtils.lerp(-0.2, -0.035, q) - Math.cos(this.bob) * bobAmt * 0.5,
        THREE.MathUtils.lerp(-0.2, -0.095, q) + by * 0.5,
        THREE.MathUtils.lerp(-0.42, -0.2, q),
      );
      const tiltDrink = use === 'sip' || use === 'drink';
      this.itemVm.rotation.set(THREE.MathUtils.lerp(0.08, tiltDrink ? 1.05 : 0.35, q), THREE.MathUtils.lerp(0.35, 0.05, q), THREE.MathUtils.lerp(0.1, 0, q));
      if (use === 'warm' && wantSip) this.itemVm.rotation.z += Math.sin(performance.now() * 0.03) * 0.25; // 흔들흔들
      if (use === 'twirl') {
        // 우산: 손잡이는 왼쪽 아래, 캐노피는 머리 위
        this.itemVm.position.set(-0.17 - Math.cos(this.bob) * bobAmt * 0.4, -0.36 + by * 0.4, -0.22);
        this.itemVm.rotation.set(-0.12, (this.itemVm.userData.spin = (this.itemVm.userData.spin || 0) + (wantSip ? dt * 6 : 0)), 0.14);
      }
      if (use === 'throw' && wantSip) { this.wheelUntil = 0; emit('throw'); }
      if (wantSip && q > 0.65 * lift && use !== 'twirl' && use !== 'throw') {
        if ((use === 'drink') && !it.opened) { it.opened = true; emit(it.drink.kind === 'bottle' ? 'cap' : 'open'); this.sipBlock = sm.t + 0.45; }
        else if (use === 'sip' && it.temp > 0.72 && !it.burned) { it.burned = true; emit('hot'); this.sipBlock = sm.t + 1.4; this.shake = 0.5; this.wheelUntil = 0; }
        else if (use === 'sip' || use === 'drink') {
          it.fill = Math.max(0, it.fill - dt * (use === 'sip' ? 0.14 : 0.17));
          this.slurpAcc += dt;
          if (this.slurpAcc > 0.42) { this.slurpAcc = 0; emit(use === 'sip' ? 'slurp' : 'gulp'); }
          if (it.fill <= 0.005) { it.fill = 0; emit('empty'); this.wheelUntil = 0; }
        } else if (use === 'eat') {
          if (!it.opened) { it.opened = true; emit('rustle'); this.sipBlock = sm.t + 0.4; }
          else { it.fill = Math.max(0, it.fill - 0.25); emit('bite'); this.sipBlock = sm.t + 0.55; if (it.fill <= 0.005) { it.fill = 0; emit('empty'); this.wheelUntil = 0; } }
        } else if (use === 'warm') {
          this.slurpAcc += dt;
          if (this.slurpAcc > 0.5) { this.slurpAcc = 0; emit('warm'); }
        } else { // gum / mask / wipe: 한 번 쓰면 끝
          it.fill = 0; emit(use); this.wheelUntil = 0;
        }
      }
      if (it.type === 'cup') {
        it.temp = Math.max(0, it.temp - dt / 150);
        this.itemObj.setFill(it.fill);
        // 김: 뜨거울수록 많이
        if (it.fill > 0.02 && it.temp > 0.15) {
          this.steamAcc += dt * it.temp * 5;
          while (this.steamAcc > 1) {
            this.steamAcc -= 1;
            this.itemVm.updateMatrixWorld(true);
            this.itemObj.topWorld(this._v);
            this.smoke.emit(this._v, this._v2.set((Math.random() - 0.5) * 0.02, 0.1, (Math.random() - 0.5) * 0.02), { size: 0.018, grow: 0.12, life: 1.4, alpha: 0.1 * it.temp, tint: 1 });
          }
        }
      }
    }

    // 불씨 연기 (궐련만)
    if (sm.state === 'lit' && dev === 'cig') {
      this.cig.tipWorld(this._v2);
      this.emitAcc += dt * (sm.holding ? 4 : 12);
      while (this.emitAcc > 1) {
        this.emitAcc -= 1;
        this._v.set((Math.random() - 0.5) * 0.02, 0.1 + Math.random() * 0.05, (Math.random() - 0.5) * 0.02);
        this.smoke.emit(this._v2, this._v, { size: 0.03, grow: 0.28, life: 3.6, alpha: 0.1 });
      }
    }
  }

  cam2local(world) {
    return this.camera.worldToLocal(world.clone());
  }
}

// ---------- 1인칭 주먹 (전자담배 쥘 때) ----------
let TOON_GRAD = null;
function toonMat(color) {
  if (!TOON_GRAD) {
    TOON_GRAD = new THREE.DataTexture(new Uint8Array([110, 185, 255]), 3, 1, THREE.RedFormat);
    TOON_GRAD.minFilter = TOON_GRAD.magFilter = THREE.NearestFilter;
    TOON_GRAD.needsUpdate = true;
  }
  return new THREE.MeshToonMaterial({ color, gradientMap: TOON_GRAD });
}
const OUTLINE_MAT = new THREE.MeshBasicMaterial({ color: 0x0b0c10, side: THREE.BackSide });

/**
 * 기기를 감싸 쥔 주먹. 기기는 원점에서 +Y가 입, 본체는 -0.02 ~ -0.1 구간.
 * 손가락 마디는 앞(카메라 쪽)에서 기기를 감쌈, 손목·소매는 오른쪽 아래로 이어짐.
 */
function buildFist() {
  const g = new THREE.Group();
  const skin = toonMat(0xffd7bc);
  const crease = new THREE.MeshBasicMaterial({ color: 0xc89478 });
  const sleeveM = toonMat(0x3a4a62);
  const part = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1, outline = 0.06) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    g.add(m);
    if (outline) {
      const o = new THREE.Mesh(geo, OUTLINE_MAT);
      o.scale.setScalar(1 + outline);
      m.add(o);
    }
    return m;
  };
  // 주먹 몸통: 둥글게 (손바닥 + 손등)
  part(new THREE.SphereGeometry(0.03, 20, 16), skin, 0.008, -0.068, -0.004, 1.15, 1.25, 1.0);
  // 손가락 마디 4개: 기기 앞을 가로로 감싼 둥근 볼록이
  for (let i = 0; i < 4; i++) {
    const y = -0.047 - i * 0.0145;
    part(new THREE.CapsuleGeometry(0.0082, 0.03, 6, 12), skin, 0.004, y, 0.019, 1, 1, 1, 0.08).rotation.z = Math.PI / 2;
    if (i < 3) { // 마디 사이 주름
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.0012, 0.002), crease);
      c.position.set(0.004, y - 0.0072, 0.0275);
      g.add(c);
    }
  }
  // 엄지: 옆에서 감싸 올라와 기기 옆면을 누름
  const thumb = part(new THREE.CapsuleGeometry(0.0085, 0.026, 6, 12), skin, -0.017, -0.045, 0.008, 1, 1, 1, 0.08);
  thumb.rotation.set(0.15, 0, 0.35);
  // 손목 + 소매
  const wrist = part(new THREE.CylinderGeometry(0.02, 0.022, 0.05, 14), skin, 0.02, -0.11, -0.012, 1, 1, 1, 0.06);
  wrist.rotation.z = -0.5;
  const sleeve = part(new THREE.CylinderGeometry(0.03, 0.034, 0.16, 16), sleeveM, 0.06, -0.175, -0.02, 1, 1, 1, 0.04);
  sleeve.rotation.z = -0.5;
  const cuff = part(new THREE.TorusGeometry(0.03, 0.006, 8, 18), sleeveM, 0.035, -0.128, -0.016, 1, 1, 1, 0);
  cuff.rotation.set(Math.PI / 2, 0.5, 0);
  return g;
}
