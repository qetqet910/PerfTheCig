import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { createCigarette, createLighter } from '../smoke/props.js';
import { Smoker } from '../smoke/smoker.js';

const EYE = 1.3; // SD 캐릭터 눈높이 근처
const RADIUS = 0.28;
const WALK = 1.6, RUN = 4.2;
const SPAWN = { pos: new THREE.Vector3(-17.5, 0, 1.5), lookAt: new THREE.Vector3(0, 1.1, 0) };

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
    this.controls.pointerSpeed = 0.8;
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
    dom.addEventListener('mousedown', (e) => {
      if (!this.active || !this.controls.isLocked) return;
      if (e.button === 0) this.smoker.press('puff');
      if (e.button === 2) this.smoker.press('ring');
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.smoker.release('puff');
      if (e.button === 2) this.smoker.release('ring');
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
    this.vm.scale.setScalar(0.8);
    camera.add(this.vm);
    this.lighter = createLighter({ scale: 1 });
    this.lighter.group.visible = false;
    camera.add(this.lighter.group);
    scene.add(camera); // 카메라 자식(뷰모델)이 렌더되려면 씬에 있어야 함

    this.vmT = 0;   // 입으로 올리는 정도 (0..1)
    this.lightT = 0;
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
      else { dir.y -= 0.12; this.smoke.puff(p, dir.normalize(), data.k); }
      data.p = p.clone();
      data.d = dir.clone();
    } else if (name === 'cough') {
      this.shake = 1.3;
      const dir = cam.getWorldDirection(this._v2.clone());
      const p = this._v.copy(cam.position).addScaledVector(dir, 0.2);
      [0, 300, 560, 950].forEach((ms) => setTimeout(() => this.smoke.puff(p, dir, 0.35), ms));
    } else if (name === 'ash') {
      this.cig.tipWorld(this._v);
      this.smoke.ash(this._v, data.amount);
      data.p = this._v.clone();
    } else if (name === 'butt') {
      const dir = cam.getWorldDirection(this._v2.clone());
      dir.y = 0; dir.normalize();
      data.x = this.feet.x + dir.x * 0.6;
      data.z = this.feet.z + dir.z * 0.6;
    }
    outer?.(name, data);
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

  lock() {
    // 포인터락은 사용자 제스처 안에서만 됨. 실패해도 오버레이 클릭으로 재시도 가능.
    try { this.controls.lock(); } catch { /* noop */ }
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
    this.cig.setLength(sm.state === 'done' ? 0 : sm.len);
    this.cig.setAsh(sm.state === 'lit' ? sm.ash : 0);
    this.cig.setLit(sm.state === 'lit');
    this.cig.emberMat.emissiveIntensity = 3 + (sm.holding ? sm.inhale * 16 : 0) + Math.sin(performance.now() * 0.013) * 0.5;

    // 라이터: 아래에서 올라와 담배 끝에 불을 댐
    this.lightT += ((lighting ? 1 : 0) - this.lightT) * (1 - Math.exp(-10 * dt));
    this.lighter.group.visible = this.lightT > 0.02;
    if (this.lighter.group.visible) {
      this.vm.updateMatrixWorld(true);
      const tip = this.cam2local(this.cig.tipWorld(this._v2));
      this.lighter.group.position.set(tip.x + 0.004, THREE.MathUtils.lerp(-0.35, tip.y - 0.055, this.lightT), tip.z + 0.005);
      const flameOn = lighting && sm.lightOkAt >= 0;
      // 딸깍 순간에 잠깐 불꽃
      const sparking = lighting && sm.lightOkAt < 0 && ((sm.lightT - 0.35) % 0.45) < 0.06 && sm.lightT > 0.35;
      this.lighter.setOn(flameOn || sparking);
      this.lighter.update(performance.now() / 1000);
    }

    // 불씨 연기
    if (sm.state === 'lit') {
      this.cig.tipWorld(this._v2);
      this.emitAcc += dt * (sm.holding ? 3 : 9);
      while (this.emitAcc > 1) {
        this.emitAcc -= 1;
        this._v.set((Math.random() - 0.5) * 0.02, 0.1 + Math.random() * 0.05, (Math.random() - 0.5) * 0.02);
        this.smoke.emit(this._v2, this._v, { size: 0.015, grow: 0.12, life: 2.6, alpha: 0.18 });
      }
    }
  }

  cam2local(world) {
    return this.camera.worldToLocal(world.clone());
  }
}
