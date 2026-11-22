import * as THREE from 'three';

/**
 * 담배 한 개비 메시. 로컬 -Y 방향이 불붙는 끝(팁), +Y가 필터.
 *   필터 [0, F] / 종이 [-P*len, 0] / 재 [-P*len - ash, -P*len]
 * setLength(0..1) / setAsh(m) / setLit(bool)
 */
export const PAPER = 0.085, FILTER = 0.026;

/**
 * 개비 디자인: 레종 프렌치 블랙 (임시값).
 * 실물과 다르면 여기 값만 고치면 1인칭·아바타·NPC 전부 바뀜.
 */
export const CIG_SKIN = {
  name: '레종 프렌치 블랙',
  paper: 0x1d1c1f,     // 궐련지: 블랙
  filter: 0x111113,    // 필터 팁: 블랙
  band: 0xb8964a,      // 필터와 궐련지 경계 금색 띠
  bandW: 0.0022,
  thin: 0.86,          // 굵기 배율 (슬림)
  ash: 0x9a9690,
};

export function createCigarette({ radius = 0.0045, skin = CIG_SKIN } = {}) {
  radius *= skin.thin;
  const group = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 12).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: skin.paper, roughness: 0.55 }));
  const filter = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.03, radius * 1.03, FILTER, 12).translate(0, FILTER / 2, 0), new THREE.MeshStandardMaterial({ color: skin.filter, roughness: 0.4 }));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.05, radius * 1.05, skin.bandW, 12).translate(0, skin.bandW / 2, 0), new THREE.MeshStandardMaterial({ color: skin.band, roughness: 0.35, metalness: 0.6 }));
  filter.add(band);
  const ash = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.92, radius * 0.85, 1, 8).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: skin.ash, roughness: 1 }));
  const emberMat = new THREE.MeshStandardMaterial({ color: 0x220800, emissive: 0xff5a14, emissiveIntensity: 3 });
  const ember = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.15, 10, 8), emberMat);
  ember.scale.y = 0.6;
  group.add(paper, filter, ash, ember);

  const api = {
    group, ember, emberMat,
    len: 1, ash: 0, lit: false,
    setLength(len) {
      api.len = Math.max(0, len);
      const L = Math.max(1e-4, PAPER * api.len);
      paper.scale.y = L;
      paper.visible = api.len > 0.001;
      ember.position.y = -L;
      ash.position.y = -L;
    },
    setAsh(a) {
      api.ash = a;
      ash.scale.y = Math.max(1e-4, a);
      ash.visible = a > 0.0008;
    },
    setLit(v) {
      api.lit = v;
      ember.visible = v;
    },
    /** 불씨 월드 좌표 (재가 있으면 그 끝 근처) */
    tipWorld(out) { return ember.getWorldPosition(out); },
  };
  api.setLength(1);
  api.setAsh(0);
  api.setLit(false);
  return api;
}

/** 라이터 (몸통 + 불꽃 + 작은 점광원) */
export function createLighter({ scale = 1, color = 0x2f6fd1 } = {}) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.024 * scale, 0.05 * scale, 0.012 * scale), new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1, transparent: true, opacity: 0.92 }));
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.022 * scale, 0.01 * scale, 0.011 * scale), new THREE.MeshStandardMaterial({ color: 0xb0b4b8, metalness: 1, roughness: 0.3 }));
  cap.position.y = 0.03 * scale;
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb040, transparent: true, opacity: 0.9, toneMapped: false, depthWrite: false });
  const flame = new THREE.Mesh(new THREE.SphereGeometry(0.006 * scale, 10, 8), flameMat);
  flame.scale.set(1, 2.4, 1);
  flame.position.y = 0.047 * scale;
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.003 * scale, 8, 6), new THREE.MeshBasicMaterial({ color: 0x6fa8ff, toneMapped: false }));
  core.position.y = 0.04 * scale;
  group.add(body, cap, flame, core);
  let on = false;
  const api = {
    group,
    flameWorld(out) { return flame.getWorldPosition(out); },
    setOn(v) { on = v; flame.visible = core.visible = v; },
    update(t) {
      if (!on) return;
      const f = 0.85 + Math.sin(t * 37) * 0.08 + Math.sin(t * 23.7) * 0.07;
      flame.scale.set(f, 2.4 * f, f);
    },
  };
  api.setOn(false);
  return api;
}

/**
 * 궐련형 전자담배 (일반형 디자인). 담배와 같은 축: +Y 쪽이 입(스틱 끝), -Y 쪽이 본체.
 * setStick(bool) / setLed(mode: 'off'|'blink'|'on') / update(t)
 */
export function createHeatDevice(scale = 1) {
  const g = new THREE.Group();
  const s = scale;
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xeceef0, roughness: 0.35, metalness: 0.1 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.0115 * s, 0.085 * s, 6, 16), bodyMat);
  body.scale.set(1.25, 1, 0.85);
  body.position.y = -0.055 * s;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0095 * s, 0.011 * s, 0.012 * s, 16), new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.4, metalness: 0.4 }));
  cap.position.y = 0.0 * s;
  const ledMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x6ab8ff, emissiveIntensity: 0 });
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.003 * s, 0.022 * s, 0.002 * s), ledMat);
  led.position.set(0, -0.04 * s, 0.0105 * s);
  // 꽂힌 스틱 (흰 종이 + 필터)
  const stick = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.0036 * s, 0.0036 * s, 0.022 * s, 10), new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 0.6 }));
  paper.position.y = 0.012 * s;
  const filt = new THREE.Mesh(new THREE.CylinderGeometry(0.0037 * s, 0.0037 * s, 0.014 * s, 10), new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.7 }));
  filt.position.y = 0.03 * s;
  stick.add(paper, filt);
  g.add(body, cap, led, stick);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  let mode = 'off';
  return {
    group: g,
    setStick(v) { stick.visible = v; },
    setLed(m) { mode = m; },
    update(t) { ledMat.emissiveIntensity = mode === 'on' ? 2.5 : mode === 'blink' ? (Math.sin(t * 9) > 0 ? 2.5 : 0.2) : 0; },
  };
}

/**
 * 폐호흡 액상 전자담배 (박스 모드 + 탱크). +Y = 드립팁(입), -Y = 본체.
 * setFiring(bool) / setLiquid(0..1)
 */
export function createVape(scale = 1) {
  const g = new THREE.Group();
  const s = scale;
  const metal = new THREE.MeshStandardMaterial({ color: 0x3a3e46, roughness: 0.35, metalness: 0.7 });
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.03 * s, 0.07 * s, 0.022 * s), metal);
  box.position.y = -0.062 * s;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.031 * s, 0.035 * s, 0.023 * s), new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.9 }));
  grip.position.y = -0.07 * s;
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.011 * s, 0.011 * s, 0.026 * s, 18), new THREE.MeshStandardMaterial({ color: 0xdfe8ef, roughness: 0.05, transparent: true, opacity: 0.35 }));
  tank.position.y = -0.013 * s;
  const liqMat = new THREE.MeshStandardMaterial({ color: 0xc87a3a, roughness: 0.2, transparent: true, opacity: 0.85 });
  const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.0095 * s, 0.0095 * s, 1, 16).translate(0, 0.5, 0), liqMat);
  liquid.position.y = -0.025 * s;
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.0115 * s, 0.0115 * s, 0.004 * s, 18), metal);
  ring.position.y = 0.001 * s;
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.005 * s, 0.006 * s, 0.012 * s, 14), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 }));
  tip.position.y = 0.009 * s;
  const btnMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xff5a2a, emissiveIntensity: 0 });
  const btn = new THREE.Mesh(new THREE.BoxGeometry(0.012 * s, 0.008 * s, 0.003 * s), btnMat);
  btn.position.set(0, -0.04 * s, 0.0115 * s);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.014 * s, 0.008 * s), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x7dff6a, emissiveIntensity: 0.6 }));
  screen.position.set(0, -0.055 * s, 0.0112 * s);
  g.add(box, grip, tank, liquid, ring, tip, btn, screen);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const api = {
    group: g,
    setFiring(v) { btnMat.emissiveIntensity = v ? 3 : 0; },
    setLiquid(k) { liquid.scale.y = Math.max(0.0005, 0.024 * s * Math.max(0, Math.min(1, k))); liquid.visible = k > 0.01; },
  };
  api.setLiquid(1);
  return api;
}
