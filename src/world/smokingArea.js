import * as THREE from 'three';
import { canvasTexture, FONT } from '../util.js';

/**
 * 코오롱싸이언스밸리 1차(북) ↔ 2차(남) 사이 통로의 흡연구역.
 * 씬 좌표: 원점 = 통로 중앙, +x = 통로 안쪽(동), -x = 디지털로34길(서).
 * 1차 벽 z = -6 (통로를 바라봄), 2차 벽 z = +6.
 */
export const AREA = { X0: -6.2, X1: 9.0, WALL: 6 };
export const ASHTRAYS = [[-2.0, -1.5], [2.5, 1.8], [5.2, -2.2]];
// 비 가림막 (폴리카보네이트 지붕) 범위: 흡연구역 위를 1차~2차 벽까지 덮음
export const SHELTER = { x0: -6.6, x1: 9.4, z0: -6, z1: 6, y: 3.7 };

export function createSmokingArea({ envMap }) {
  const group = new THREE.Group();
  const circles = [], boxes = [];
  const { X0, X1, WALL } = AREA;

  const metal = new THREE.MeshStandardMaterial({ color: 0x3b3f44, metalness: 0.7, roughness: 0.4, envMap, envMapIntensity: 0.3 });
  const concrete = new THREE.MeshStandardMaterial({ color: 0x6d6c69, roughness: 0.95 });
  const add = (mesh, x, y, z, ry = 0) => {
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };

  // ---------- 바닥: 통로 전체 회색 보도블럭 + 흡연구역 초록선 ----------
  const pw = 40, pd = WALL * 2;
  const paverTex = paverTexture();
  paverTex.wrapS = paverTex.wrapT = THREE.RepeatWrapping;
  paverTex.repeat.set(pw / 1.2, pd / 1.2);
  const pavers = new THREE.Mesh(new THREE.PlaneGeometry(pw, pd), new THREE.MeshStandardMaterial({ map: paverTex, roughness: 0.9, color: 0x8a8a8a }));
  pavers.rotation.x = -Math.PI / 2;
  pavers.position.set(X0 + pw / 2, 0.032, 0);
  pavers.receiveShadow = true;
  group.add(pavers);

  const lineMat = new THREE.MeshStandardMaterial({ color: 0x1f8a5c, roughness: 0.8 });
  const strip = (w, d, x, z) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineMat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.037, z);
    group.add(m);
  };
  const zl = WALL - 0.45;
  strip(0.08, zl * 2, X0, 0);
  strip(0.08, zl * 2, X1, 0);
  strip(X1 - X0, 0.08, (X0 + X1) / 2, -zl);
  strip(X1 - X0, 0.08, (X0 + X1) / 2, zl);

  const floorText = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 0.8),
    new THREE.MeshStandardMaterial({ map: floorTextTexture(), transparent: true, roughness: 0.85, depthWrite: false }),
  );
  floorText.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
  floorText.position.set(X0 + 1.2, 0.038, 0);
  group.add(floorText);

  // ---------- 재떨이: 흙 채운 콘크리트 통 ----------
  const potMat = new THREE.MeshStandardMaterial({ color: 0x5e5a55, roughness: 1, metalness: 0 });
  const soilMat = new THREE.MeshStandardMaterial({ color: 0x3a2e24, roughness: 1, metalness: 0 });
  const buttMats = [new THREE.MeshStandardMaterial({ color: 0xd9d2c4, roughness: 1 }), new THREE.MeshStandardMaterial({ color: 0xa8743e, roughness: 1 })];
  const ashtray = (x, z) => {
    const g = new THREE.Group();
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 0.62, 24, 1, true), potMat);
    pot.position.y = 0.31;
    pot.castShadow = pot.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.025, 6, 24), potMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.62;
    const soil = new THREE.Mesh(new THREE.CircleGeometry(0.285, 24), soilMat);
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.57;
    soil.receiveShadow = true;
    g.add(pot, rim, soil);
    // 흙에 꽂힌 꽁초들
    for (let i = 0; i < 16; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.034, 5), buttMats[i % 4 === 0 ? 1 : 0]);
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.24;
      b.position.set(Math.cos(a) * r, 0.585, Math.sin(a) * r);
      b.rotation.set((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6);
      g.add(b);
    }
    g.position.set(x, 0, z);
    group.add(g);
    circles.push([x, z, 0.33]);

    // 흙 위에 쌓이는 재 (회색 부스러기)
    const ASH_CAP = 160;
    const ash = new THREE.InstancedMesh(new THREE.CircleGeometry(0.012, 6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8e8a85, roughness: 1 }), ASH_CAP);
    ash.count = 0;
    ash.position.y = 0.572;
    g.add(ash);
    // 재떨이에 버린 꽁초 (공유)
    const BUTT_CAP = 80;
    const butts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.005, 0.005, 0.034, 5), buttMats[0], BUTT_CAP);
    butts.count = 0;
    g.add(butts);
    // 가까이 가면 바닥에 뜨는 링
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.47, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
    ring.position.y = 0.04;
    g.add(ring);

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    const tray = {
      x, z, top: new THREE.Vector3(x, 0.66, z), count: 0, ashAmount: 0, smolders: [], highlight: 0,
      /** 재 추가 (m 단위 길이 → 부스러기 개수) */
      addAsh(amount = 0.01) {
        const n = Math.max(2, Math.round(amount * 220));
        for (let k = 0; k < n; k++) {
          const i = ash.count < ASH_CAP ? ash.count++ : Math.floor(Math.random() * ASH_CAP);
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.25;
          const s = 0.6 + Math.random() * 1.2;
          m.compose(p.set(Math.cos(a) * r, Math.random() * 0.002, Math.sin(a) * r), q.identity(), sc.set(s, 1, s));
          ash.setMatrixAt(i, m);
        }
        ash.instanceMatrix.needsUpdate = true;
        tray.ashAmount += amount;
      },
      /** 꽁초 꽂기. dx/dz 없으면 랜덤 위치. 반환: 꽂힌 월드 좌표 */
      addButt(dx, dz, smolder = false) {
        if (dx === undefined) { const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 0.23; dx = Math.cos(a) * r; dz = Math.sin(a) * r; }
        const i = butts.count < BUTT_CAP ? butts.count++ : Math.floor(Math.random() * BUTT_CAP);
        m.compose(p.set(dx, 0.585, dz), q.setFromEuler(e.set((Math.random() - 0.5) * 1.4, Math.random() * 6, (Math.random() - 0.5) * 1.4)), sc.set(1, 1, 1));
        butts.setMatrixAt(i, m);
        butts.instanceMatrix.needsUpdate = true;
        tray.count++;
        const world = new THREE.Vector3(x + dx, 0.6, z + dz);
        if (smolder) tray.smolders.push({ p: world, until: performance.now() + 6000, acc: 0 });
        return { dx, dz, world };
      },
      setHighlight(v) { tray.highlight = v ? 1 : 0; },
      update(dt, smoke) {
        ring.material.opacity += (tray.highlight * 0.35 - ring.material.opacity) * Math.min(1, dt * 8);
        const now = performance.now();
        tray.smolders = tray.smolders.filter((s) => s.until > now);
        for (const s of tray.smolders) {
          s.acc += dt * 6 * ((s.until - now) / 6000);
          while (s.acc > 1) {
            s.acc -= 1;
            smoke.emit(s.p, p.set((Math.random() - 0.5) * 0.02, 0.1, (Math.random() - 0.5) * 0.02), { size: 0.02, grow: 0.12, life: 2.5, alpha: 0.16 });
          }
        }
      },
    };
    return tray;
  };
  const trays = ASHTRAYS.map(([x, z]) => ashtray(x, z));
  // 처음부터 좀 쓴 재떨이
  trays.forEach((t) => { t.addAsh(0.08 + Math.random() * 0.1); for (let i = 0; i < 6 + Math.floor(Math.random() * 6); i++) t.addButt(); });

  // ---------- 2차 벽 쪽: 벤치 2개, 뒷문 + 비상구, 실외기 ----------
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a32, roughness: 0.75 });
  const bench = (x, z) => {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.04, 0.09), wood);
      s.position.set(0, 0.45, -0.17 + i * 0.11);
      s.castShadow = s.receiveShadow = true;
      g.add(s);
    }
    for (const lx of [-0.75, 0.75]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.45), metal);
      leg.position.set(lx, 0.225, 0);
      leg.castShadow = true;
      g.add(leg);
    }
    g.position.set(x, 0, z);
    group.add(g);
    boxes.push([x, z, 0.9, 0.25, 0]);
  };
  bench(-3.4, WALL - 0.55);
  bench(4.4, WALL - 0.55);
  // 앉을 수 있는 자리 (벤치당 2자리). 2차 벽을 등지고 통로 쪽(-z)을 봄 → 아바타 yaw = π
  const seats = [];
  const benchMeshes = [];
  group.children.slice(-2).forEach((g) => g.traverse((o) => { if (o.isMesh) benchMeshes.push(o); }));
  for (const bx of [-3.4, 4.4]) for (const dx of [-0.45, 0.45]) seats.push({ x: bx + dx, z: WALL - 0.55, y: 0.47, yaw: Math.PI, taken: false });

  const doorMat = new THREE.MeshStandardMaterial({ color: 0x1a2028, metalness: 0.4, roughness: 0.3, emissive: 0x9fb8d0, emissiveIntensity: 0.04 });
  add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.3, 0.1), metal), 0.6, 1.15, WALL - 0.22);
  add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.15), doorMat), 0.6, 1.1, WALL - 0.28, Math.PI);
  const exitTex = exitTexture();
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshStandardMaterial({ map: exitTex, emissive: 0xffffff, emissiveMap: exitTex, emissiveIntensity: 0.5 })), 0.6, 2.55, WALL - 0.27, Math.PI);

  const acMat = new THREE.MeshStandardMaterial({ color: 0xd8d8d2, roughness: 0.6 });
  const grill = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
  for (const [x, y] of [[7.6, 0.4], [7.6, 1.2], [8.6, 0.4]]) {
    const ac = add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.75, 0.4), acMat), x, y, WALL - 0.45);
    const fan = new THREE.Mesh(new THREE.CircleGeometry(0.27, 20), grill);
    fan.position.set(0, 0, -0.201);
    fan.rotation.y = Math.PI;
    ac.add(fan);
  }
  boxes.push([8.1, WALL - 0.45, 1.0, 0.2, 0]);

  // ---------- 1차 벽 쪽: (자판기는 vending.js) 분리수거함, 화단 ----------
  // 분리수거함 3칸: 캔·병 / 플라스틱 / 종이컵·일반 (뚜껑 투입구 + 라벨)
  const bins = [];
  const BIN_TYPES = [['캔·병', 0x2f5e8a, 'can'], ['플라스틱', 0x3a7a3a, 'plastic'], ['일반·종이', 0xb08a2a, 'cup']];
  BIN_TYPES.forEach(([label, color, kind], i) => {
    const x = 1.55 + i * 0.56, z = -WALL + 0.32;
    const bin = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.86, 0.5), bodyMat);
    body.position.y = 0.43;
    body.castShadow = body.receiveShadow = true;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.52), new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.7), roughness: 0.5 }));
    lid.position.y = 0.885;
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.075, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x070707 }));
    hole.position.set(0, 0.912, 0.06);
    const tag = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.12), new THREE.MeshStandardMaterial({ map: binLabel(label), roughness: 0.6 }));
    tag.position.set(0, 0.68, 0.252);
    bin.add(body, lid, hole, tag);
    bin.position.set(x, 0, z);
    group.add(bin);
    bins.push({ kind, label, meshes: [body, lid, tag], top: new THREE.Vector3(x, 0.95, z + 0.06) });
  });
  boxes.push([2.11, -WALL + 0.32, 0.82, 0.25, 0]);

  const leaf = new THREE.MeshStandardMaterial({ color: 0x1f3b24, roughness: 0.9, flatShading: true });
  const planter = (x, z, len) => {
    add(new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 0.6), concrete), x, 0.25, z);
    for (let i = 0; i < Math.round(len * 2.2); i++) {
      const r = 0.22 + Math.random() * 0.12;
      add(new THREE.Mesh(new THREE.IcosahedronGeometry(r, 0), leaf), x - len / 2 + 0.25 + (i / (len * 2.2)) * (len - 0.4), 0.55 + r * 0.4, z + (Math.random() - 0.5) * 0.2);
    }
    boxes.push([x, z, len / 2, 0.3, 0]);
  };
  planter(-4.4, -WALL + 0.35, 2.6);
  planter(6.6, -WALL + 0.35, 2.2);

  // ---------- 조명: 가로등만 (통로 입구 + 통로 안쪽) ----------
  const headMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffdcaa, emissiveIntensity: 8 });
  const streetLamp = (x, z, dir, target, intensity) => {
    const lamp = new THREE.Group();
    lamp.position.set(x, 0, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6.5, 10), metal);
    pole.position.y = 3.25;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.07, 0.07), metal);
    arm.position.set(0.75 * dir, 6.45, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.3), headMat);
    head.position.set(1.45 * dir, 6.4, 0);
    pole.castShadow = arm.castShadow = true;
    lamp.add(pole, arm, head);
    group.add(lamp);
    circles.push([x, z, 0.12]);
    const spot = new THREE.SpotLight(0xffd6a0, intensity, 34, 0.8, 0.6, 1.6);
    spot.position.set(x + 1.45 * dir, 6.3, z);
    spot.target.position.set(...target);
    spot.castShadow = true;
    spot.shadow.mapSize.set(2048, 2048);
    spot.shadow.bias = -0.0004;
    spot.shadow.normalBias = 0.02;
    spot.shadow.camera.near = 0.5;
    spot.shadow.camera.far = 34;
    group.add(spot, spot.target);
  };
  streetLamp(-14.6, -4.9, 1, [-1.0, 0, 0], 210);
  streetLamp(12.2, 4.9, -1, [3.5, 0, 0], 150);

  // ---------- 비 가림막: 철골 기둥 + 반투명 폴리카보네이트 지붕 (2차 쪽으로 살짝 기울어 물 빠짐) ----------
  const S = SHELTER;
  const frame = new THREE.MeshStandardMaterial({ color: 0x2c3036, metalness: 0.6, roughness: 0.5 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x9ab0b8, transparent: true, opacity: 0.38, roughness: 0.35, metalness: 0, side: THREE.DoubleSide, depthWrite: false });
  const tilt = 0.06;
  const roofY = (z) => S.y - z * tilt; // z가 클수록(2차 쪽) 낮음
  const roof = new THREE.Mesh(new THREE.BoxGeometry(S.x1 - S.x0, 0.02, S.z1 - S.z0 - 0.1), roofMat);
  // 지붕 위에 쌓이는 눈 (눈 오는 날 서서히 하얘짐)
  const roofSnowMat = new THREE.MeshStandardMaterial({ color: 0xeef2f8, roughness: 1, transparent: true, opacity: 0, depthWrite: false });
  const roofSnow = new THREE.Mesh(new THREE.BoxGeometry(S.x1 - S.x0, 0.03, S.z1 - S.z0 - 0.1), roofSnowMat);
  roofSnow.position.set((S.x0 + S.x1) / 2, S.y + 0.04, 0);
  roofSnow.rotation.x = 0.06;
  roofSnow.renderOrder = 3;
  group.add(roofSnow);
  roof.position.set((S.x0 + S.x1) / 2, S.y, 0);
  roof.rotation.x = tilt;
  roof.renderOrder = 2;
  group.add(roof);
  for (let x = S.x0 + 0.2; x <= S.x1; x += 1.0) {
    const rib = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, S.z1 - S.z0 - 0.1), frame);
    rib.position.set(x, S.y + 0.03, 0);
    rib.rotation.x = tilt;
    group.add(rib);
  }
  // 앞뒤 보 + 벽 쪽 기둥 (통로 가운데는 비워서 지나다닐 수 있게)
  for (const x of [S.x0, S.x1]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, S.z1 - S.z0 - 0.1), frame);
    beam.position.set(x, S.y - 0.1, 0);
    beam.rotation.x = tilt;
    beam.castShadow = true;
    group.add(beam);
    for (const z of [S.z0 + 0.25, S.z1 - 0.25]) {
      const h = roofY(z) - 0.15;
      add(new THREE.Mesh(new THREE.BoxGeometry(0.12, h, 0.12), frame), x, h / 2, z);
      circles.push([x, z, 0.1]);
    }
  }
  // 빗물받이 (2차 쪽)
  const gutter = new THREE.Mesh(new THREE.BoxGeometry(S.x1 - S.x0, 0.12, 0.14), frame);
  gutter.position.set((S.x0 + S.x1) / 2, roofY(S.z1 - 0.12) - 0.08, S.z1 - 0.12);
  group.add(gutter);

  // ---------- 흡연구역 표지판 ----------
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 8), metal), X0 + 0.3, 1.15, -WALL + 0.9);
  const signTex = signTexture();
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.15 });
  // 앞뒤 따로 (DoubleSide면 뒤에서 글씨가 뒤집혀 보임)
  add(new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.44), signMat), X0 + 0.29, 2.05, -WALL + 0.9, -Math.PI / 2);
  add(new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.44), signMat), X0 + 0.31, 2.05, -WALL + 0.9, Math.PI / 2);
  circles.push([X0 + 0.3, -WALL + 0.9, 0.08]);

  // ---------- 바닥 꽁초: 장식용 + 플레이어가 버린 것(공유) ----------
  const buttGeo = new THREE.CylinderGeometry(0.0045, 0.0045, 0.03, 5).rotateZ(Math.PI / 2);
  const buttMat = new THREE.MeshStandardMaterial({ color: 0xe6dfd2, roughness: 0.8 });
  const CAP = 600;
  const butts = new THREE.InstancedMesh(buttGeo, buttMat, CAP);
  butts.count = 0;
  group.add(butts);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1), v = new THREE.Vector3();
  const addButt = (x, z) => {
    const i = butts.count < CAP ? butts.count++ : Math.floor(Math.random() * CAP);
    m4.compose(v.set(x, 0.038, z), q.setFromEuler(e.set(0, Math.random() * 6.28, 0)), one);
    butts.setMatrixAt(i, m4);
    butts.instanceMatrix.needsUpdate = true;
  };
  for (let i = 0; i < 90; i++) {
    const [ax, az] = ASHTRAYS[i % 3];
    const r = 0.3 + Math.random() ** 2 * 2.2, a = Math.random() * Math.PI * 2;
    addButt(ax + Math.cos(a) * r, az + Math.sin(a) * r);
  }

  return {
    group, colliders: { circles, boxes }, addButt, trays, bins, seats, benchMeshes,
    setSnow(k) { roofSnowMat.opacity = k * 0.92; roofSnow.visible = k > 0.01; },
    update(dt, smoke) { for (const t of trays) t.update(dt, smoke); },
  };
}

/** 가장 가까운 재떨이까지 거리 */
export function nearestAshtray(x, z) {
  let best = Infinity, at = null, idx = -1;
  ASHTRAYS.forEach((a, i) => {
    const d = Math.hypot(a[0] - x, a[1] - z);
    if (d < best) { best = d; at = a; idx = i; }
  });
  return { dist: best, at, idx };
}

// ---------- textures ----------
function binLabel(text) {
  return canvasTexture(256, 90, (x, w, h) => {
    x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#222'; x.font = `800 44px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(text, w / 2, h / 2 + 2);
  });
}
function paverTexture() {
  return canvasTexture(256, 256, (x, w, h) => {
    x.fillStyle = '#7d7b77';
    x.fillRect(0, 0, w, h);
    const tiles = [[0, 0, 128, 64], [128, 0, 128, 64], [64, 64, 128, 64], [0, 64, 64, 64], [192, 64, 64, 64], [0, 128, 128, 64], [128, 128, 128, 64], [64, 192, 128, 64], [0, 192, 64, 64], [192, 192, 64, 64]];
    for (const [tx, ty, tw, th] of tiles) {
      const v = 105 + Math.floor(Math.random() * 30);
      x.fillStyle = `rgb(${v},${v - 2},${v - 6})`;
      x.fillRect(tx + 3, ty + 3, tw - 6, th - 6);
    }
    for (let i = 0; i < 500; i++) {
      x.fillStyle = `rgba(0,0,0,${Math.random() * 0.12})`;
      x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}
function floorTextTexture() {
  return canvasTexture(512, 128, (x, w, h) => {
    x.fillStyle = 'rgba(40,160,105,0.85)';
    x.font = `800 84px ${FONT}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('흡 연 구 역', w / 2, h / 2 + 4);
  });
}
function signTexture() {
  return canvasTexture(512, 204, (x, w, h) => {
    x.fillStyle = '#0f6b4a';
    x.fillRect(0, 0, w, h);
    x.strokeStyle = '#fff';
    x.lineWidth = 6;
    x.strokeRect(10, 10, w - 20, h - 20);
    x.fillStyle = '#fff';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `800 76px ${FONT}`;
    x.fillText('흡연구역', w / 2, 82);
    x.font = `600 34px ${FONT}`;
    x.fillText('SMOKING AREA', w / 2, 152);
  });
}
function exitTexture() {
  return canvasTexture(256, 92, (x, w, h) => {
    x.fillStyle = '#1aa35a';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff';
    x.font = `800 48px ${FONT}`;
    x.textBaseline = 'middle';
    x.fillText('비상구', 92, h / 2 + 3);
    x.beginPath(); x.arc(46, 24, 9, 0, 7); x.fill();
    x.fillRect(38, 34, 14, 28);
    x.fillRect(26, 60, 12, 20);
    x.fillRect(52, 60, 12, 20);
  });
}
