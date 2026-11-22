import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createCigarette, createLighter } from '../smoke/props.js';
import { Smoker } from '../smoke/smoker.js';

const EYE = 1.3; // SD 캐릭터 눈높이 근처
const RADIUS = 0.28;
const WALK = 1.6, RUN = 4.2;
const SPAWN = { pos: new THREE.Vector3(-5.0, 0, 2.6), lookAt: new THREE.Vector3(0.5, 1.0, -0.4) };

/**
 * 1인칭: 포인터락 마우스룩 + WASD + 충돌 + 흡연(Smoker 상태 머신 + 뷰모델)
 *   E/좌클릭 꾹: 빨기 → 떼면 후~   Q/우클릭 꾹: 빨기 → 떼면 도넛
 *   G: 꺼내서 불붙이기 / 꽁초 버리기 / (없으면) 한 개비 빌리기   X: 재 털기
 */
export class FirstPerson {
  constructor({ camera, dom, world, smoke, scene, onLockChange, onSmokerEvent, getContext }) {
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

    this.smoker = new Smoker((name, data) => this.handleSmoker(name, data, onSmokerEvent));

    this.controls.addEventListener('lock', () => onLockChange?.(true));
    this.controls.addEventListener('unlock', () => onLockChange?.(false));

    const typing = (e) => e.target instanceof HTMLInputElement;
    addEventListener('keydown', (e) => {
      if (!this.active || typing(e) || e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyE') this.smoker.press('puff');
      if (e.code === 'KeyQ') this.smoker.press('ring');
      if (e.code === 'KeyG') this.smoker.context(this.getContext());
      if (e.code === 'KeyX') this.smoker.flick();
    });
    addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE') this.smoker.release('puff');
      if (e.code === 'KeyQ') this.smoker.release('ring');
    });
    addEventListener('blur', () => this.clearInput());
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    // 마우스만으로 흡연:
    //   담배 없음/다 핌: 좌·우클릭 = 꺼내 물기 / 꽁초 버리기
    //   피우는 중: 좌클릭 꾹 = 빨기(떼면 후~), 톡 = 재 털기 / 우클릭 꾹 = 도넛, 톡 = 끄고 버리기
    this.downAt = [-1, -1, -1];
    const TAP = 230;
    dom.addEventListener('mousedown', (e) => {
      if (!this.active || !this.controls.isLocked || (e.button !== 0 && e.button !== 2)) return;
      const sm = this.smoker;
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
      if (data.type === 'ring') { dir.y += 0.05; this.smoke.ring(p, dir.normalize(), data.k); }
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
        }, data.v, { nose: data.nose });
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
      ry: e.y + Math.PI, // 카메라는 -z를 봄 → 아바타(+z 정면) yaw
      s: this.vel.length(),
      k: this.vmT,
      inh: sm.holding ? sm.inhale : 0,
      c: sm.code, len: sm.len, ash: sm.ash,
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
    this.feet.x += this.vel.x * dt;
    this.feet.z += this.vel.y * dt;
    this.world.resolve(this.feet, RADIUS);

    // --- 헤드밥 + 기침 흔들림 ---
    const sp = this.vel.length();
    this.bob += dt * sp * (running ? 2.3 : 2.9);
    const bobAmt = Math.min(sp / RUN, 1) * (running ? 0.045 : 0.03);
    const by = Math.sin(this.bob * 2) * bobAmt;
    this.shake = Math.max(0, this.shake - dt);
    const sh = this.shake > 0 ? Math.sin(this.shake * 40) * 0.025 * Math.min(1, this.shake) : 0;
    this.camera.position.set(this.feet.x, EYE + by + Math.abs(sh), this.feet.z);

    // --- 뷰모델 ---
    const has = sm.state !== 'none';
    const lighting = sm.state === 'lighting';
    this.vm.visible = has;
    const raise = lighting || (sm.holding && sm.canInhale) ? 1 : 0;
    this.vmT += (raise - this.vmT) * (1 - Math.exp(-8 * dt));
    const t = this.vmT;
    this.vm.position.set(
      THREE.MathUtils.lerp(0.19, 0.06, t) + Math.cos(this.bob) * bobAmt * 0.6 + sh * 0.5,
      THREE.MathUtils.lerp(-0.17, -0.1, t) + by * 0.5,
      THREE.MathUtils.lerp(-0.4, -0.31, t),
    );
    this.vm.rotation.set(THREE.MathUtils.lerp(0.25, 0.9, t), THREE.MathUtils.lerp(-0.5, -0.1, t), 0);

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
    this.lightT += ((lighting ? 1 : 0) - this.lightT) * (1 - Math.exp(-10 * dt));
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

    // 불씨 연기
    if (sm.state === 'lit') {
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
