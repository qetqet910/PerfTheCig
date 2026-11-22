import * as THREE from 'three';
import { canvasTexture, FONT } from '../util.js';

/**
 * 코오롱싸이언스밸리 1차(북) ↔ 2차(남) 사이 통로의 흡연구역.
 * 씬 좌표: 원점 = 통로 중앙, +x = 통로 안쪽(동), -x = 디지털로34길(서).
 * 1차 벽 z = -6 (통로를 바라봄), 2차 벽 z = +6.
 */
export const AREA = { X0: -6.2, X1: 9.0, WALL: 6 };
export const ASHTRAYS = [[-2.0, -1.5], [2.5, 1.8], [5.2, -2.2]];

export function createSmokingArea({ envMap }) {
  const group = new THREE.Group();
  const circles = [], boxes = [];
  const { X0, X1, WALL } = AREA;

  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 1, roughness: 0.28, envMap, envMapIntensity: 0.5 });
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

  // ---------- 스탠드 재떨이 ----------
  const ashtray = (x, z) => {
    const g = new THREE.Group();
    for (const [geo, y] of [
      [new THREE.CylinderGeometry(0.05, 0.05, 0.85, 12), 0.425],
      [new THREE.CylinderGeometry(0.19, 0.14, 0.15, 20), 0.9],
      [new THREE.CylinderGeometry(0.21, 0.23, 0.04, 20), 0.02],
    ]) {
      const m = new THREE.Mesh(geo, steel);
      m.position.y = y;
      m.castShadow = true;
      g.add(m);
    }
    const sand = new THREE.Mesh(new THREE.CircleGeometry(0.175, 20), new THREE.MeshStandardMaterial({ color: 0x4f473f, roughness: 1 }));
    sand.rotation.x = -Math.PI / 2;
    sand.position.y = 0.97;
    g.add(sand);
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 5), new THREE.MeshStandardMaterial({ color: i % 3 ? 0xece6da : 0xc98a4a }));
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.13;
      b.position.set(Math.cos(a) * r, 0.98, Math.sin(a) * r);
      b.rotation.set((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2);
      g.add(b);
    }
    g.position.set(x, 0, z);
    group.add(g);
    circles.push([x, z, 0.22]);
  };
  ASHTRAYS.forEach(([x, z]) => ashtray(x, z));

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

  const doorMat = new THREE.MeshStandardMaterial({ color: 0x1a2028, metalness: 0.4, roughness: 0.3, emissive: 0x9fb8d0, emissiveIntensity: 0.25 });
  add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.3, 0.1), metal), 0.6, 1.15, WALL - 0.22);
  add(new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.15), doorMat), 0.6, 1.1, WALL - 0.28, Math.PI);
  const exitTex = exitTexture();
  add(new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.18), new THREE.MeshStandardMaterial({ map: exitTex, emissive: 0xffffff, emissiveMap: exitTex, emissiveIntensity: 2.2 })), 0.6, 2.55, WALL - 0.27, Math.PI);

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

  // ---------- 1차 벽 쪽: 자판기 2대, 분리수거함, 화단 ----------
  const vending = (x, color, label) => {
    const v = new THREE.Group();
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.85, 0.75), new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.3 }));
    cab.position.y = 0.925;
    cab.castShadow = cab.receiveShadow = true;
    const vtex = vendTexture(label);
    const front = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 1.2), new THREE.MeshStandardMaterial({ map: vtex, emissive: 0xffffff, emissiveMap: vtex, emissiveIntensity: 0.7 }));
    front.position.set(0, 1.18, 0.376);
    const light = new THREE.PointLight(0xdfe9ff, 2, 4, 2);
    light.position.set(0, 1.2, 0.8);
    v.add(cab, front, light);
    v.position.set(x, 0, -WALL + 0.42);
    group.add(v);
    boxes.push([x, -WALL + 0.42, 0.5, 0.375, 0]);
  };
  vending(-0.6, 0xb3262e, '음료');
  vending(0.5, 0x2a4f8a, 'COFFEE');

  const binMat = new THREE.MeshStandardMaterial({ color: 0x2f5e8a, roughness: 0.6 });
  for (const [i, c] of [[0, 0x2f5e8a], [1, 0x3a7a3a], [2, 0xb08a2a]]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 })), 1.6 + i * 0.55, 0.45, -WALL + 0.32);
  }
  boxes.push([2.15, -WALL + 0.32, 0.8, 0.25, 0]);
  void binMat;

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

  // ---------- 조명: 양쪽 벽등 + 통로 입구 가로등(그림자) ----------
  const wallLampMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffe0b8, emissiveIntensity: 6 });
  for (const [x, z] of [[-3.5, -WALL + 0.12], [4.5, -WALL + 0.12], [-1.2, WALL - 0.12], [6.0, WALL - 0.12]]) {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.18), wallLampMat), x, 3.4, z);
    const l = new THREE.PointLight(0xffd9a8, 3, 8, 1.8);
    l.position.set(x, 3.0, z * 0.75);
    group.add(l);
  }
  const lamp = new THREE.Group();
  lamp.position.set(-14.6, 0, -4.9);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 6.5, 10), metal);
  pole.position.y = 3.25;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.07, 0.07), metal);
  arm.position.set(0.75, 6.45, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffdcaa, emissiveIntensity: 8 }));
  head.position.set(1.45, 6.4, 0);
  pole.castShadow = arm.castShadow = true;
  lamp.add(pole, arm, head);
  group.add(lamp);
  circles.push([-14.6, -4.9, 0.12]);
  const spot = new THREE.SpotLight(0xffd6a0, 190, 34, 0.75, 0.6, 1.6);
  spot.position.set(-14.6 + 1.45, 6.3, -4.9);
  spot.target.position.set(0.5, 0, 0);
  spot.castShadow = true;
  spot.shadow.mapSize.set(2048, 2048);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.02;
  spot.shadow.camera.near = 0.5;
  spot.shadow.camera.far = 34;
  group.add(spot, spot.target);

  // ---------- 흡연구역 표지판 ----------
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 8), metal), X0 + 0.3, 1.15, -WALL + 0.9);
  const signTex = signTexture();
  const signMat = new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffffff, emissiveMap: signTex, emissiveIntensity: 0.9 });
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

  return { group, colliders: { circles, boxes }, addButt };
}

/** 가장 가까운 재떨이까지 거리 */
export function nearestAshtray(x, z) {
  let best = Infinity, at = null;
  for (const a of ASHTRAYS) {
    const d = Math.hypot(a[0] - x, a[1] - z);
    if (d < best) { best = d; at = a; }
  }
  return { dist: best, at };
}

// ---------- textures ----------
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
function vendTexture(label) {
  return canvasTexture(256, 360, (x, w, h) => {
    x.fillStyle = '#e9eef5';
    x.fillRect(0, 0, w, h);
    const colors = ['#1e5bd6', '#d62f2f', '#f2c230', '#2fa15a', '#111', '#e86c1a', '#7a3fd1', '#c9c9c9'];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 6; c++) {
      const cx = 22 + c * 37, cy = 22 + r * 62;
      x.fillStyle = colors[(r * 6 + c * 5 + label.length) % colors.length];
      x.fillRect(cx - 11, cy, 22, 40);
      x.fillStyle = '#fff';
      x.fillRect(cx - 11, cy + 8, 22, 6);
      x.fillStyle = '#d33';
      x.fillRect(cx - 9, cy + 46, 18, 7);
    }
    x.fillStyle = '#222';
    x.font = `700 30px ${FONT}`;
    x.textAlign = 'center';
    x.fillText(label, w / 2, h - 34);
  });
}
