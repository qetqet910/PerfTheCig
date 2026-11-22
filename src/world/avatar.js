import * as THREE from 'three';
import { bubbleTexture, nameTexture } from '../util.js';
import { createCigarette, createLighter } from '../smoke/props.js';

/**
 * 절차적 SD(2등신) 직장인 캐릭터.
 * - 큰 머리 + 점 눈 + 볼터치, 툰 셰이딩 + 외곽선
 * - 머리 스타일 / 안경 / 넥타이 / 사원증 조합
 * - 걷기·뛰기·숨쉬기는 절차적 애니메이션, 담배·폰 든 팔은 2-bone IK
 * 외부 에셋 없음.
 */

// 머리 꼭대기 ≈ 1.42m
const DIM = { hip: 0.4, leg: 0.34, shoulderY: 0.8, shoulderX: 0.2, upper: 0.17, fore: 0.16, neck: 0.86, headR: 0.25 };
export const EYE_HEIGHT = 1.3;

const HAIRS = ['short', 'side', 'bob', 'bun', 'cap', 'beanie', 'spiky'];
const HAIR_COLORS = [0x1b1512, 0x2a1d16, 0x3b2a1e, 0x111111, 0x5a3a24];
const SKINS = [0xffdcc2, 0xf6cfae, 0xeec29c];

let gradientMap = null;
function toonGradient() {
  if (gradientMap) return gradientMap;
  const data = new Uint8Array([90, 170, 255]);
  gradientMap = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
  gradientMap.needsUpdate = true;
  return gradientMap;
}
const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });
const OUTLINE = new THREE.MeshBasicMaterial({ color: 0x0b0c10, side: THREE.BackSide });

function hashStr(s) {
  let h = 2166136261;
  for (const c of String(s)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  return h >>> 0;
}
/** 이름(또는 seed)으로 외형을 고정 → 다른 사람 화면에서도 같은 모습 */
export function styleFromSeed(seed) {
  const h = hashStr(seed);
  const pick = (arr, shift) => arr[(h >>> shift) % arr.length];
  return {
    hair: pick(HAIRS, 0),
    hairColor: pick(HAIR_COLORS, 5),
    skin: pick(SKINS, 9),
    glasses: ((h >>> 13) & 3) === 0,
    tie: ((h >>> 16) & 1) === 0,
    tieColor: pick([0x8a1f2a, 0x1d3a6b, 0x2f4f2f, 0x5a4a1a], 18),
    pants: pick([0x22252b, 0x2b2f3a, 0x3a3530, 0x1a1c20], 21),
  };
}

// ---------- IK ----------
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _t = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3();
const _q = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion();

function rotateToward(obj, from, to) {
  if (from.lengthSq() < 1e-10 || to.lengthSq() < 1e-10) return;
  _q.setFromUnitVectors(from.normalize(), to.normalize());
  obj.getWorldQuaternion(_wq);
  obj.parent.getWorldQuaternion(_pq);
  obj.quaternion.copy(_pq.invert().multiply(_wq.premultiply(_q)));
  obj.updateMatrixWorld(true);
}
function solveTwoBone(upper, lower, end, target, pole) {
  upper.getWorldPosition(_a);
  lower.getWorldPosition(_b);
  end.getWorldPosition(_c);
  const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c);
  _d.subVectors(target, _a);
  const dist = THREE.MathUtils.clamp(_d.length(), Math.abs(l1 - l2) + 1e-3, l1 + l2 - 1e-3);
  _d.normalize();
  const x = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const y = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  _p.subVectors(pole, _a);
  _p.addScaledVector(_d, -_p.dot(_d)).normalize();
  _e.copy(_a).addScaledVector(_d, x).addScaledVector(_p, y);
  rotateToward(upper, _t.subVectors(_b, _a), _f.subVectors(_e, _a));
  lower.getWorldPosition(_b);
  end.getWorldPosition(_c);
  _e.copy(_a).addScaledVector(_d, dist);
  rotateToward(lower, _t.subVectors(_c, _b), _f.subVectors(_e, _b));
}

// 하위 호환 (예전엔 Xbot 로드)
export async function loadAvatarAsset() {}

export class Avatar {
  constructor({ color = '#2b2f38', name = '', smoke = null, phone = false, style = null, seed = null } = {}) {
    this.smoke = smoke;
    this.style = style || styleFromSeed(seed ?? name ?? Math.random());
    const S = this.style;

    this.group = new THREE.Group(); // 월드 공간 (말풍선·폰 포함)
    this.root = new THREE.Group();  // 위치 + yaw (+z가 정면)
    this.group.add(this.root);
    this.model = new THREE.Group(); // 몸 전체 (1인칭에서 숨김)
    this.root.add(this.model);
    this.body = new THREE.Group();  // 숨쉬기·흔들림
    this.model.add(this.body);

    const M = {
      shirt: toon(color), pants: toon(S.pants), skin: toon(S.skin), hair: toon(S.hairColor),
      shoe: toon(0x16171a), white: toon(0xf4f4f4), tie: toon(S.tieColor),
      eye: new THREE.MeshBasicMaterial({ color: 0x15161a }), hl: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      blush: new THREE.MeshBasicMaterial({ color: 0xff8a8a, transparent: true, opacity: 0.45, depthWrite: false }),
      lanyard: toon(0x2f6fd1),
    };
    this.mats = M;
    const mesh = (geo, mat, parent, x = 0, y = 0, z = 0, outline = 0) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      if (outline) {
        const o = new THREE.Mesh(geo, OUTLINE);
        o.scale.setScalar(1 + outline);
        o.castShadow = false;
        m.add(o);
      }
      return m;
    };

    // --- 다리 ---
    this.legs = [-1, 1].map((side) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.085, DIM.hip, 0);
      this.body.add(hip);
      mesh(new THREE.CapsuleGeometry(0.068, DIM.leg - 0.14, 4, 10), M.pants, hip, 0, -DIM.leg / 2 + 0.02, 0, 0.06);
      const shoe = mesh(new THREE.SphereGeometry(0.075, 14, 10), M.shoe, hip, 0, -DIM.leg + 0.0, 0.035, 0.06);
      shoe.scale.set(1, 0.6, 1.45);
      return hip;
    });

    // --- 몸통 (셔츠) ---
    const torso = mesh(new THREE.CapsuleGeometry(0.175, 0.2, 6, 16), M.shirt, this.body, 0, 0.6, 0, 0.04);
    torso.scale.set(1, 1, 0.82);
    // 옷깃
    for (const side of [-1, 1]) {
      const collar = mesh(new THREE.ConeGeometry(0.05, 0.07, 3), M.white, this.body, side * 0.045, 0.82, 0.12);
      collar.rotation.set(Math.PI * 0.62, 0, side * 0.5);
    }
    if (S.tie) {
      const tie = mesh(new THREE.BoxGeometry(0.045, 0.2, 0.02), M.tie, this.body, 0, 0.7, 0.152);
      tie.rotation.x = -0.12;
      mesh(new THREE.BoxGeometry(0.05, 0.04, 0.03), M.tie, this.body, 0, 0.8, 0.14);
    }
    // 사원증 (줄 + 카드)
    const strap = mesh(new THREE.TorusGeometry(0.15, 0.008, 6, 24, Math.PI), M.lanyard, this.body, 0, 0.78, 0.02);
    strap.rotation.set(Math.PI / 2 + 0.55, 0, Math.PI);
    strap.scale.set(0.9, 1.1, 1);
    const card = mesh(new THREE.BoxGeometry(0.075, 0.1, 0.008), M.white, this.body, S.tie ? 0.06 : 0, 0.58, 0.155);
    card.rotation.x = -0.1;
    mesh(new THREE.BoxGeometry(0.075, 0.025, 0.009), M.lanyard, card, 0, 0.037, 0);

    // --- 팔 (어깨 → 팔꿈치 → 손) ---
    const makeArm = (side) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * DIM.shoulderX, DIM.shoulderY, 0);
      this.body.add(shoulder);
      mesh(new THREE.CapsuleGeometry(0.055, DIM.upper - 0.06, 4, 8), M.shirt, shoulder, 0, -DIM.upper / 2, 0, 0.07);
      const elbow = new THREE.Group();
      elbow.position.y = -DIM.upper;
      shoulder.add(elbow);
      mesh(new THREE.CapsuleGeometry(0.05, DIM.fore - 0.06, 4, 8), M.shirt, elbow, 0, -DIM.fore / 2, 0, 0.07);
      const hand = new THREE.Group();
      hand.position.y = -DIM.fore;
      elbow.add(hand);
      mesh(new THREE.SphereGeometry(0.052, 12, 10), M.skin, hand, 0, -0.02, 0, 0.07);
      return { shoulder, elbow, hand, side };
    };
    this.R = makeArm(-1); // 캐릭터 기준 오른손 (+z 정면일 때 -x)
    this.L = makeArm(1);

    // --- 머리 ---
    this.head = new THREE.Group();
    this.head.position.y = DIM.neck;
    this.body.add(this.head);
    const r = DIM.headR, hy = r + 0.02; // 머리 중심 높이 (목 기준)
    const skull = mesh(new THREE.SphereGeometry(r, 28, 22), M.skin, this.head, 0, hy, 0, 0.035);
    skull.scale.set(1.04, 0.96, 1);
    const onFace = (x, y, z, d = 0) => new THREE.Vector3(x, y, z).normalize().multiplyScalar(r + d).add(new THREE.Vector3(0, hy, 0));

    // 눈 + 하이라이트
    this.eyes = [-1, 1].map((side) => {
      const g = new THREE.Group();
      g.position.copy(onFace(side * 0.36, -0.06, 0.93, -0.012));
      g.lookAt(g.position.clone().add(new THREE.Vector3(side * 0.25, -0.05, 1)));
      this.head.add(g);
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.034, 14, 10), M.eye);
      e.scale.set(1, 1.3, 0.45);
      g.add(e);
      const h = new THREE.Mesh(new THREE.SphereGeometry(0.011, 8, 6), M.hl);
      h.position.set(0.01, 0.017, 0.013);
      g.add(h);
      return g;
    });
    // 볼터치
    for (const side of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.CircleGeometry(0.038, 16), M.blush);
      b.position.copy(onFace(side * 0.62, -0.3, 0.73, 0.004));
      b.lookAt(b.position.clone().add(new THREE.Vector3(side * 0.62, -0.3, 0.73)));
      b.scale.set(1.3, 0.8, 1);
      this.head.add(b);
    }
    // 입
    this.mouth = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.0055, 6, 16, Math.PI), M.eye);
    this.mouth.position.copy(onFace(0, -0.36, 0.93, -0.002));
    this.mouth.rotation.set(-0.35, 0, Math.PI);
    this.head.add(this.mouth);
    this.mouthO = new THREE.Mesh(new THREE.TorusGeometry(0.014, 0.006, 6, 16), M.eye);
    this.mouthO.position.copy(this.mouth.position);
    this.mouthO.rotation.x = -0.35;
    this.mouthO.visible = false;
    this.head.add(this.mouthO);

    // 안경
    if (S.glasses) {
      const frame = toon(0x1a1a1a);
      for (const side of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.007, 6, 20), frame);
        ring.position.copy(onFace(side * 0.36, -0.06, 0.93, 0.018));
        ring.lookAt(ring.position.clone().add(new THREE.Vector3(side * 0.2, 0, 1)));
        this.head.add(ring);
      }
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.008, 0.008), frame);
      bridge.position.copy(onFace(0, -0.02, 1, 0.02));
      this.head.add(bridge);
    }

    this.buildHair(S.hair, M.hair, mesh, hy, color);

    // --- 담배 (오른손에 직접 붙임: 손 로컬 -Y = 팔 방향) ---
    this.cigObj = createCigarette({ radius: 0.0074 });
    this.cig = this.cigObj.group;
    this.cig.position.set(0.0, -0.03, 0.035);
    this.cig.rotation.x = 0.9;
    this.ember = this.cigObj.ember;
    this.emberMat = this.cigObj.emberMat;
    this.R.hand.add(this.cig);
    // 라이터 (왼손, 불붙일 때만)
    this.lighter = createLighter({ scale: 1.4, color: [0x2f6fd1, 0xd23a3a, 0x2fa15a, 0xe0b020][Math.floor(Math.random() * 4)] });
    this.lighter.group.position.set(0, -0.05, 0.03);
    this.lighter.group.visible = false;
    this.L.hand.add(this.lighter.group);
    this.coughUntil = 0;
    this.coughPuffs = [];

    // --- 폰 (월드 공간에서 매 프레임 배치) ---
    this.phone = null;
    if (phone) {
      this.phone = new THREE.Group();
      const pb = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.13, 0.012), toon(0x1a1b20));
      this.screenMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x9cc8ff, emissiveIntensity: 2.2 });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.115), this.screenMat);
      screen.position.z = 0.0065;
      this.phone.add(pb, screen);
      this.group.add(this.phone);
    }

    // --- 닉네임 / 말풍선 ---
    this.nameSprite = null;
    if (name) this.setName(name, color);
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, fog: false, opacity: 0, toneMapped: false }));
    this.bubble.renderOrder = 10;
    this.group.add(this.bubble);
    this.bubbleUntil = 0;
    this.bubbleBorn = -10;

    this.state = { speed: 0, k: 0, inhale: 0 };
    this.emitAcc = 0;
    this.clock = Math.random() * 10;
    this.walkPhase = 0;
    this.nextBlink = 2 + Math.random() * 3;
    this.mouthOUntil = 0;
    this._head = new THREE.Vector3();
    // 하위 호환: 예전 코드가 av.b.head를 참조
    this.b = { head: this.head };
  }

  buildHair(kind, mat, mesh, hy, color) {
    const r = DIM.headR, h = this.head;
    const cap = (scale, theta, rotX = -0.3) => {
      const m = mesh(new THREE.SphereGeometry(r * scale, 28, 18, 0, Math.PI * 2, 0, Math.PI * theta), mat, h, 0, hy, 0, 0.035);
      m.rotation.x = rotX;
      m.scale.set(1.04, 0.98, 1.02);
      return m;
    };
    const bangs = (n, y = 0.16, spread = 0.75) => {
      for (let i = 0; i < n; i++) {
        const a = (i / (n - 1) - 0.5) * spread;
        const b = mesh(new THREE.SphereGeometry(0.075, 12, 10), mat, h, Math.sin(a) * r * 0.95, hy + y, Math.cos(a) * r * 0.88);
        b.scale.set(1, 0.7, 0.55);
      }
    };
    switch (kind) {
      case 'short': cap(1.06, 0.5); bangs(4); break;
      case 'side': {
        cap(1.07, 0.52, -0.25);
        const s = mesh(new THREE.SphereGeometry(0.12, 14, 10), mat, h, -0.1, hy + 0.17, 0.17);
        s.scale.set(1.5, 0.6, 0.6);
        s.rotation.z = 0.35;
        break;
      }
      case 'bob': {
        cap(1.08, 0.62, -0.1);
        bangs(5, 0.13, 0.9);
        for (const side of [-1, 1]) {
          const v = mesh(new THREE.SphereGeometry(0.12, 14, 10), mat, h, side * 0.2, hy - 0.04, -0.03, 0.04);
          v.scale.set(0.7, 1.15, 1.1);
        }
        break;
      }
      case 'bun': cap(1.06, 0.52); bangs(4); mesh(new THREE.SphereGeometry(0.09, 14, 10), mat, h, 0, hy + 0.22, -0.13, 0.05); break;
      case 'spiky': {
        cap(1.05, 0.48);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const sp = mesh(new THREE.ConeGeometry(0.05, 0.13, 6), mat, h, Math.cos(a) * 0.12, hy + 0.22, Math.sin(a) * 0.12 - 0.02);
          sp.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
        }
        break;
      }
      case 'cap': {
        cap(1.02, 0.45);
        const capM = toon(new THREE.Color(color).offsetHSL(0, 0, 0.12));
        const dome = mesh(new THREE.SphereGeometry(r * 1.09, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.45), capM, h, 0, hy + 0.01, 0, 0.03);
        dome.rotation.x = -0.15;
        const brim = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.018, 20, 1, false, -Math.PI / 2, Math.PI), capM, h, 0, hy + 0.1, 0.2, 0.05);
        brim.rotation.x = 0.12;
        brim.scale.set(1.1, 1, 0.9);
        break;
      }
      case 'beanie': {
        const bm = toon(0x7a2f2f);
        const b = mesh(new THREE.SphereGeometry(r * 1.1, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52), bm, h, 0, hy + 0.01, 0, 0.03);
        b.rotation.x = -0.12;
        const band = mesh(new THREE.TorusGeometry(r * 1.06, 0.035, 8, 28), bm, h, 0, hy + 0.04, 0.0);
        band.rotation.x = Math.PI / 2 - 0.12;
        mesh(new THREE.SphereGeometry(0.06, 10, 8), toon(0xeeeeee), h, 0, hy + 0.29, -0.04);
        bangs(3, 0.08, 0.6);
        break;
      }
    }
  }

  setName(name, color) {
    if (this.nameSprite) { this.nameSprite.material.map.dispose(); this.group.remove(this.nameSprite); }
    const tex = nameTexture(name, color);
    this.nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, toneMapped: false, depthWrite: false }));
    this.nameSprite.scale.set(0.28 * (tex.image.width / tex.image.height), 0.28, 1);
    this.nameSprite.renderOrder = 9;
    this.group.add(this.nameSprite);
  }

  setBodyVisible(v) {
    this.model.visible = v;
    if (this.phone) this.phone.visible = v;
    if (this.nameSprite) this.nameSprite.visible = v;
  }

  say(text) {
    const m = this.bubble.material;
    m.map?.dispose();
    m.map = bubbleTexture(text);
    m.needsUpdate = true;
    this.bubble.scale.set(0.4 * (m.map.image.width / m.map.image.height), 0.4, 1);
    this.bubbleBorn = this.clock;
    this.bubbleUntil = this.clock + Math.min(6, 2.5 + text.length * 0.12);
  }

  /** 입에서 후~ */
  puff(strength = 1) {
    if (!this.smoke) return null;
    const p = this.mouth.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion);
    p.addScaledVector(dir, 0.04);
    dir.y += 0.25;
    dir.normalize();
    this.smoke.puff(p, dir, strength);
    this.mouthOUntil = this.clock + 1.2;
    return { p, dir };
  }

  /** 콜록콜록 (말풍선 + 몸 들썩 + 연기 조각) */
  cough() {
    this.say('콜록콜록');
    this.coughUntil = this.clock + 1.3;
    this.coughPuffs = [0.05, 0.35, 0.62, 1.0].map((d) => this.clock + d);
  }

  /** 도넛 연기 */
  ring(strength = 1) {
    if (!this.smoke) return null;
    const p = this.mouth.getWorldPosition(new THREE.Vector3());
    const dir = new THREE.Vector3(0, 0.12, 1).applyQuaternion(this.root.quaternion).normalize();
    p.addScaledVector(dir, 0.05);
    this.smoke.ring(p, dir, strength);
    this.mouthOUntil = this.clock + 1.0;
    return { p, dir };
  }

  /** st: { speed, k 팔 올림 0..1, inhale 0..1, c 담배상태(0없음 1불붙이는중 2핌 3다탐), len 0..1, ash m } */
  update(dt, st = this.state) {
    this.clock += dt;
    const t = this.clock;
    const sp = st.speed ?? 0;
    const c = st.c ?? 2;
    const lighting = c === 1;
    const k = lighting ? 1 : c === 2 ? (st.k ?? 0) : 0;
    const inh = c === 2 ? (st.inhale ?? 0) : 0;
    const coughing = t < this.coughUntil;
    const moving = THREE.MathUtils.smoothstep(sp, 0.1, 0.9);
    const run = THREE.MathUtils.smoothstep(sp, 2.4, 3.6);

    // --- 걷기/뛰기 (절차적) ---
    this.walkPhase += dt * (4.5 + sp * 2.2) * (moving > 0.01 ? 1 : 0);
    const ph = this.walkPhase;
    const amp = moving * (0.55 + run * 0.35);
    this.legs[0].rotation.x = Math.sin(ph) * amp;
    this.legs[1].rotation.x = -Math.sin(ph) * amp;
    this.body.position.y = Math.abs(Math.sin(ph)) * 0.04 * moving + Math.sin(t * 1.8) * 0.004 * (1 - moving);
    this.body.rotation.z = Math.sin(ph) * 0.06 * moving + Math.sin(t * 0.4) * 0.02 * (1 - moving); // 뒤뚱뒤뚱
    this.body.rotation.x = run * 0.22 + (coughing ? Math.abs(Math.sin(t * 22)) * 0.18 : 0);
    this.head.rotation.y = Math.sin(t * 0.27) * 0.3 * (1 - moving) * (1 - k);
    this.head.rotation.z = Math.sin(t * 0.6) * 0.05 * (1 - moving);

    // 팔 흔들기 기본 포즈 → 그 위에 IK
    const swing = Math.sin(ph) * amp * 0.9;
    for (const A of [this.R, this.L]) {
      A.shoulder.rotation.set(A.side === -1 ? swing : -swing, 0, A.side * 0.18);
      A.elbow.rotation.set(-0.35 * moving, 0, 0);
    }
    this.model.updateMatrixWorld(true);
    const root = this.root;
    const toWorld = (x, y, z) => root.localToWorld(_c.set(x, y, z)).clone();

    if (this.model.visible) {
      // 오른손: 담배 (가슴 앞 ↔ 입)
      this.cig.visible = c !== 0;
      if (c !== 0) {
        const rest = new THREE.Vector3(-0.15, 0.6, 0.2), mouth = new THREE.Vector3(-0.05, 0.98, 0.25);
        const tl = rest.lerp(mouth, k);
        const w = Math.max(k, 1 - moving * 0.8);
        const anim = this.R.hand.getWorldPosition(new THREE.Vector3());
        solveTwoBone(this.R.shoulder, this.R.elbow, this.R.hand, toWorld(tl.x, tl.y, tl.z).lerp(anim, 1 - w), toWorld(-0.55, 0.45, -0.3));
        this.cig.rotation.x = THREE.MathUtils.lerp(0.9, 1.9, k);
      }
      this.cigObj.setLength(c === 3 ? 0 : (st.len ?? 1));
      this.cigObj.setAsh(c === 2 ? (st.ash ?? 0) : 0);
      this.cigObj.setLit(c === 2 || (lighting && (st.inhale ?? 0) > 0.5));

      // 왼손: 불붙이기(라이터) > 폰
      this.lighter.group.visible = lighting;
      this.lighter.setOn(lighting && (st.flame ?? true));
      if (lighting) {
        if (this.phone) this.phone.visible = false;
        const tip = this.ember.getWorldPosition(new THREE.Vector3());
        const tgt = tip.clone().add(new THREE.Vector3(0, -0.07, 0));
        solveTwoBone(this.L.shoulder, this.L.elbow, this.L.hand, tgt, toWorld(0.55, 0.45, -0.3));
        this.lighter.update(t);
        this.head.rotation.x = 0.12;
      } else if (this.phone) {
        this.phone.visible = true;
        const wl = 1 - moving * 0.7;
        const animL = this.L.hand.getWorldPosition(new THREE.Vector3());
        solveTwoBone(this.L.shoulder, this.L.elbow, this.L.hand, toWorld(0.08, 0.68, 0.24).lerp(animL, 1 - wl), toWorld(0.55, 0.45, -0.3));
        const h = this.L.hand.getWorldPosition(new THREE.Vector3());
        const eye = this.eyes[0].getWorldPosition(new THREE.Vector3());
        this.phone.position.copy(h).add(eye.clone().sub(h).multiplyScalar(0.12));
        this.phone.position.y += 0.03;
        this.phone.lookAt(eye);
        this.screenMat.emissiveIntensity = 2.2 + Math.sin(t * 0.7) * 0.2;
        this.head.rotation.x = 0.28 * (1 - k) * wl; // 폰 보느라 고개 숙임
      } else {
        this.head.rotation.x = -0.05;
      }
    }

    // --- 표정: 깜빡임 / 빨 때 ^^ / 후~ 할 때 o ---
    let eyeY = 1;
    if (t > this.nextBlink) { if (t > this.nextBlink + 0.13) this.nextBlink = t + 2.5 + Math.random() * 3.5; else eyeY = 0.12; }
    if (inh > 0.1) eyeY = 0.15;
    for (const e of this.eyes) e.scale.y = THREE.MathUtils.lerp(e.scale.y, eyeY, 1 - Math.exp(-30 * dt));
    const o = t < this.mouthOUntil;
    this.mouthO.visible = o;
    this.mouth.visible = !o;

    // --- 불씨 + 연기 ---
    this.emberMat.emissiveIntensity = 3 + inh * 14 + Math.sin(t * 13) * 0.6;
    if (this.smoke && this.coughPuffs.length && t > this.coughPuffs[0]) {
      this.coughPuffs.shift();
      const p = this.mouth.getWorldPosition(new THREE.Vector3());
      const dir = new THREE.Vector3((Math.random() - 0.5) * 0.4, -0.1, 1).applyQuaternion(this.root.quaternion).normalize();
      this.smoke.puff(p, dir, 0.35);
    }
    if (this.smoke && this.model.visible && c === 2) {
      this.ember.getWorldPosition(_c);
      this.emitAcc += dt * (inh > 0.1 ? 3 : 10);
      while (this.emitAcc > 1) {
        this.emitAcc -= 1;
        _t.set((Math.random() - 0.5) * 0.02, 0.12 + Math.random() * 0.06, (Math.random() - 0.5) * 0.02);
        this.smoke.emit(_c, _t, { size: 0.02, grow: 0.14, life: 3.2, alpha: 0.2 });
      }
    }
    this.updateLabels();
  }

  updateLabels() {
    this.head.getWorldPosition(this._head);
    if (this.nameSprite) {
      this.nameSprite.position.copy(this._head);
      this.nameSprite.position.y += 0.78;
    }
    const life = this.bubbleUntil - this.clock, age = this.clock - this.bubbleBorn;
    this.bubble.material.opacity = life > 0 ? Math.min(1, age * 5, life * 3) : 0;
    this.bubble.position.copy(this._head);
    this.bubble.position.y += (this.nameSprite?.visible ? 1.05 : 0.8) + Math.min(age, 0.3) * 0.2;
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => {
      if (o.material && o.material !== OUTLINE) { o.material.map?.dispose(); o.material.dispose(); }
    });
  }
}
