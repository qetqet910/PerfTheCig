import * as THREE from 'three';
import { canvasTexture, FONT } from '../util.js';

/**
 * 코오롱싸이언스밸리 1차(A05) / 2차(A07).
 * OSM에는 두 동이 외곽선 하나로 합쳐져 있어서, z = ±GAP/2 에서 잘라 사이에 통로를 만든다.
 * 디테일(주차장 진입로·캐노피·소나무 화단·세로 간판 등)은 카카오 로드뷰(2025.07) 참고.
 */
export const GAP = 12;

/** 반평면 클리핑 (keep(p) >= 0 인 쪽만) */
function clip(poly, keep) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], c = poly[(i + 1) % poly.length];
    const ka = keep(a), kc = keep(c);
    if (ka >= 0) out.push(a);
    if ((ka >= 0) !== (kc >= 0)) {
      const t = ka / (ka - kc);
      out.push([a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t]);
    }
  }
  return out;
}
/** 폴리곤과 수평선 z의 교차 x들 */
export function xAtZ(poly, z) {
  const r = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], c = poly[(i + 1) % poly.length];
    if ((a[1] - z) * (c[1] - z) < 0) r.push(a[0] + (c[0] - a[0]) * (z - a[1]) / (c[1] - a[1]));
  }
  return r.sort((p, q) => p - q);
}

export function createKolon({ pts, h = 71 }, { envMap }) {
  const group = new THREE.Group();
  const north = clip(pts, (p) => -GAP / 2 - p[1]); // 1차
  const south = clip(pts, (p) => p[1] - GAP / 2);  // 2차

  const towerMat = createTowerMaterial(envMap);
  const extrude = (poly, height) => {
    const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, towerMat);
    m.receiveShadow = true;
    m.castShadow = false;
    group.add(m);
    // 옥상 파라펫
    const roof = new THREE.Mesh(g.clone().scale(1, 0.02, 1).translate(0, height, 0), new THREE.MeshStandardMaterial({ color: 0x2a2f36, roughness: 0.8 }));
    group.add(roof);
    return m;
  };
  extrude(north, h + 4);
  extrude(south, h);

  const add = (mesh, x, y, z, ry = 0, parent = group) => {
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const metal = new THREE.MeshStandardMaterial({ color: 0x3b4048, metalness: 0.7, roughness: 0.4, envMap, envMapIntensity: 0.3 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x8c9096, roughness: 0.75 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x5a7a8a, transparent: true, opacity: 0.22, roughness: 0.25, metalness: 0.1, envMap, envMapIntensity: 0.15, depthWrite: false, side: THREE.DoubleSide });

  // ---------- 통로 쪽 벽면 1층 석재 띠 ----------
  const xN = xAtZ(north, -GAP / 2 - 0.3), xS = xAtZ(south, GAP / 2 + 0.3);
  const lenN = xN.at(-1) - xN[0], lenS = xS.at(-1) - xS[0];
  add(new THREE.Mesh(new THREE.BoxGeometry(lenN, 4.2, 0.3), stone), (xN[0] + xN.at(-1)) / 2, 2.1, -GAP / 2 + 0.1);
  add(new THREE.Mesh(new THREE.BoxGeometry(lenS, 4.2, 0.3), stone), (xS[0] + xS.at(-1)) / 2, 2.1, GAP / 2 - 0.1);

  // ---------- 1차 세로 간판 "코오롱싸이언스밸리 I" + A05 ----------
  const xNw = xAtZ(north, -9)[0];
  const signN = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 30), signMat(verticalSignTexture('코오롱싸이언스밸리', 'I', 'A05')));
  add(signN, xNw - 0.12, 34, -8.6, -Math.PI / 2);
  // 1차 정문 유리 캐노피 (길 쪽)
  const xNw2 = xAtZ(north, -22)[0];
  const canopyN = new THREE.Group();
  canopyN.position.set(xNw2, 0, -22);
  group.add(canopyN);
  add(new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.08, 7), glass), -2.2, 4.4, 0, 0, canopyN).rotation.z = -0.12;
  for (const z of [-3.3, 3.3]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.4, 10), metal), -4.2, 2.2, z, 0, canopyN);
  add(new THREE.Mesh(new THREE.PlaneGeometry(6, 3.6), lobbyMat()), -0.08, 1.8, 0, -Math.PI / 2, canopyN);

  // ---------- 2차 서쪽 벽면 (길 쪽): 주차장 진입로 / 캐노피 / 소나무 / 상가 / 로비 ----------
  // 벽이 살짝 기울어 있어서 벽을 따라가는 로컬 좌표계 사용 (로컬 +z = 벽 따라 남쪽, -x = 바깥)
  const z0 = GAP / 2 + 0.4, z1 = 26;
  const xa = xAtZ(south, z0)[0], xb = xAtZ(south, z1)[0];
  const wallAng = Math.atan2(xb - xa, z1 - z0);
  const facade = new THREE.Group();
  facade.position.set(xa, 0, z0);
  facade.rotation.y = wallAng;
  group.add(facade);
  const F = (mesh, lx, y, lz, ry = 0) => add(mesh, lx, y, lz, ry, facade);

  // 진입로 입구 (어두운 터널 + 간판)
  F(new THREE.Mesh(new THREE.BoxGeometry(0.4, 3.4, 6.2), new THREE.MeshStandardMaterial({ color: 0x07080a, roughness: 1 })), -0.1, 1.7, 6.0);
  F(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 6.6), stone), -0.2, 3.55, 6.0);
  const pSign = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 0.7), signMat(parkingSignTexture(), 1.2));
  F(pSign, -0.46, 4.2, 6.0, -Math.PI / 2);
  // 진입로 바닥 (내려가는 경사 느낌: 어두운 콘크리트 + 노란 연석선)
  const rampMat = new THREE.MeshStandardMaterial({ color: 0x3a3b3e, roughness: 0.85 });
  const ramp = F(new THREE.Mesh(new THREE.PlaneGeometry(6, 5.8), rampMat), -3.0, 0.05, 6.0);
  ramp.rotation.x = -Math.PI / 2;
  const yellow = new THREE.MeshStandardMaterial({ color: 0xe0b020, roughness: 0.6 });
  for (const lz of [3.05, 8.95]) {
    const l = F(new THREE.Mesh(new THREE.BoxGeometry(6, 0.12, 0.15), yellow), -3.0, 0.06, lz);
    l.castShadow = false;
  }
  // 차단기
  F(new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.0, 0.3), new THREE.MeshStandardMaterial({ color: 0xd8d8d8 })), -0.8, 0.5, 3.3);
  const bar = F(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 4.6), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff2020, emissiveIntensity: 0.15 })), -0.8, 0.95, 5.6);
  bar.castShadow = false;

  // 진입로 옆 유리 캐노피 + 소나무 화단 (통로 쪽)
  for (const [lx, lz] of [[-3.6, 0.4], [-3.6, 2.6]]) F(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3.0, 8), metal), lx, 1.5, lz);
  const canopy = F(new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.05, 2.8), glass), -1.9, 3.15, 1.5);
  canopy.rotation.z = 0.18;
  canopy.castShadow = false;
  F(new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.1, 0.08), metal), -1.9, 3.05, 0.15).rotation.z = 0.18;
  F(new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.1, 0.08), metal), -1.9, 3.05, 2.85).rotation.z = 0.18;
  const planter = F(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.55, 2.0), stone), -2.0, 0.275, 1.5);
  planter.receiveShadow = true;
  const soil = F(new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 1.8), new THREE.MeshStandardMaterial({ color: 0x2d2418, roughness: 1 })), -2.0, 0.56, 1.5);
  soil.castShadow = false;
  for (const [lx, lz, s] of [[-2.8, 1.0, 1], [-1.4, 1.9, 0.8], [-2.2, 2.1, 0.65]]) addPine(facade, lx, 0.56, lz, s);

  // 1층 상가 간판 (빨간 계열)
  const shops = [['국수', '#c8202a'], ['김밥', '#d6402a'], ['카페', '#7a2a1a'], ['편의점', '#2a6a3a']];
  shops.forEach(([name, color], i) => {
    const lz = 10.5 + i * 3.2;
    F(new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.6), lobbyMat(i % 2 ? 0.55 : 0.8)), -0.06, 1.4, lz, -Math.PI / 2);
    F(new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.55), signMat(shopSignTexture(name, color), 1.1)), -0.12, 3.1, lz, -Math.PI / 2);
  });
  // 2차 로비 입구 (금색 캐노피)
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 0.9, roughness: 0.3, envMap, envMapIntensity: 0.8 });
  F(new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.35, 5.2), gold), -1.3, 4.0, 25.0);
  F(new THREE.Mesh(new THREE.PlaneGeometry(4.6, 3.6), lobbyMat(1.0)), -0.06, 1.8, 25.0, -Math.PI / 2);
  F(new THREE.Mesh(new THREE.PlaneGeometry(4.4, 0.45), signMat(textBarTexture('코오롱싸이언스밸리 2차', '#2b2416', '#e6c878'), 0.9)), -2.62, 4.0, 25.0, -Math.PI / 2);
  // 2차 상단 A07
  F(new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.4), signMat(a07Texture('A07'), 1.4, true)), -0.1, h - 6, 2.6, -Math.PI / 2);

  // ---------- 길가: 붉은 보도블럭 광장, 볼라드, 난간, 소화전, 전봇대 + 전선, 횡단보도 ----------
  const brick = brickTexture();
  brick.wrapS = brick.wrapT = THREE.RepeatWrapping;
  const plazaW = 21.5, plazaD = 50;
  brick.repeat.set(plazaW / 1.6, plazaD / 1.6);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(plazaW, plazaD), new THREE.MeshStandardMaterial({ map: brick, roughness: 0.88 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(-27.5 + plazaW / 2, 0.028, 2);
  plaza.receiveShadow = true;
  group.add(plaza);

  const blackMetal = new THREE.MeshStandardMaterial({ color: 0x1c1d20, metalness: 0.5, roughness: 0.5 });
  const circles = [];
  for (let z = -4.5; z <= 4.5; z += 1.5) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.85, 10), blackMetal), -15.6, 0.425, z);
    circles.push([-15.6, z, 0.09]);
  }
  // 차도 쪽 철제 난간 (횡단보도 구간은 비움)
  const railX = -27.6;
  const railing = (za, zb) => {
    const len = zb - za;
    add(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, len), blackMetal), railX, 1.0, (za + zb) / 2);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, len), blackMetal), railX, 0.55, (za + zb) / 2);
    for (let z = za; z <= zb + 0.01; z += 1.8) add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 6), blackMetal), railX, 0.5, z);
  };
  railing(-26, -12.5);
  railing(-5.5, 30);
  const hydrant = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.5 });
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.6, 12), red), 0, 0.3, 0, 0, hydrant);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), red), 0, 0.6, 0, 0, hydrant);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 8), red), 0, 0.42, 0, 0, hydrant).rotation.z = Math.PI / 2;
  hydrant.position.set(-26.9, 0, 9.5);
  group.add(hydrant);
  circles.push([-26.9, 9.5, 0.16]);

  const poleMat = new THREE.MeshStandardMaterial({ color: 0x8a8a86, roughness: 0.8 });
  const poles = [[-27.0, -27], [-27.0, 3], [-27.0, 33]];
  for (const [x, z] of poles) {
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 11, 10), poleMat), x, 5.5, z);
    add(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.1), metal), x, 10.2, z);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.35), new THREE.MeshStandardMaterial({ color: 0x9a9a96 })), x + 0.3, 7.2, z); // 변압기통
    circles.push([x, z, 0.2]);
  }
  // 전선: 처진 곡선
  const wireMat = new THREE.LineBasicMaterial({ color: 0x0c0c0e });
  for (let i = 0; i < poles.length - 1; i++) {
    for (const [dx, y] of [[-0.8, 10.25], [0.8, 10.25], [0, 9.6], [0.3, 9.2]]) {
      const a = new THREE.Vector3(poles[i][0] + dx, y, poles[i][1]);
      const b = new THREE.Vector3(poles[i + 1][0] + dx, y, poles[i + 1][1]);
      const pts3 = [];
      for (let k = 0; k <= 16; k++) {
        const t = k / 16;
        const p = a.clone().lerp(b, t);
        p.y -= Math.sin(Math.PI * t) * 0.9;
        pts3.push(p);
      }
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts3), wireMat));
    }
  }
  // 건너편으로 가는 전선 몇 가닥
  for (const [x, z] of poles.slice(0, 2)) {
    const pts3 = [];
    const a = new THREE.Vector3(x, 9.9, z), b = new THREE.Vector3(x - 22, 8.5, z + 4);
    for (let k = 0; k <= 12; k++) { const t = k / 12; const p = a.clone().lerp(b, t); p.y -= Math.sin(Math.PI * t) * 0.7; pts3.push(p); }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts3), wireMat));
  }
  // 횡단보도
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xdedede, roughness: 0.7 });
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 6.5), stripeMat);
    s.rotation.x = -Math.PI / 2;
    s.position.set(-37 + i * 1.6, 0.03, -9);
    s.rotation.z = Math.PI / 2;
    s.receiveShadow = true;
    group.add(s);
  }

  return {
    group,
    north, south,
    colliders: { polygons: [north, south], circles, segments: [[railX, -26, railX, -12.5], [railX, -5.5, railX, 30]] },
    passage: { x0: Math.max(xN[0], xS[0]), x1: Math.min(xN.at(-1), xS.at(-1)) },
  };
}

function addPine(parent, x, y, z, s) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.09 * s, 1.4 * s, 6), new THREE.MeshStandardMaterial({ color: 0x5a3e2a, roughness: 0.9 }));
  trunk.position.y = 0.7 * s;
  trunk.rotation.z = 0.12;
  g.add(trunk);
  const leaf = new THREE.MeshStandardMaterial({ color: 0x1e3a22, roughness: 0.9, flatShading: true });
  for (const [yy, r] of [[1.2, 0.75], [1.65, 0.6], [2.05, 0.42]]) {
    const c = new THREE.Mesh(new THREE.IcosahedronGeometry(r * s, 0), leaf);
    c.scale.set(1.2, 0.45, 1.1);
    c.position.set((Math.random() - 0.5) * 0.3, yy * s, (Math.random() - 0.5) * 0.3);
    c.castShadow = true;
    g.add(c);
  }
  g.position.set(x, y, z);
  parent.add(g);
}

// ---------- materials / textures ----------
function signMat(tex, k = 1, toneOff = false) {
  return new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: k, roughness: 0.6, transparent: toneOff });
}
function lobbyMat(k = 0.9) {
  return new THREE.MeshStandardMaterial({ color: 0x20262e, emissive: 0xffe6c4, emissiveIntensity: 0.35 * k, roughness: 0.15, metalness: 0.3 });
}

/** 파란 유리 커튼월 + 사무실 불빛 (야근 많음) */
function createTowerMaterial(envMap) {
  const mat = new THREE.MeshStandardMaterial({ color: 0x2a4058, roughness: 0.3, metalness: 0.55, envMap, envMapIntensity: 0.5 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; varying vec3 vWNrm;
        float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 n = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
          if (abs(n.y) < 0.5) {
            vec2 t = normalize(vec2(-n.z, n.x));
            float u = dot(vWPos.xz, t), v = vWPos.y;
            if (v < 4.2) {
              diffuseColor.rgb = vec3(0.16, 0.18, 0.2);   // 1층은 석재/로비 (메시로 디테일)
            } else {
              vec2 cell = vec2(floor(u / 1.6), floor((v - 4.2) / 3.6));
              vec2 f = vec2(fract(u / 1.6), fract((v - 4.2) / 3.6));
              float mull = step(0.06, f.x) * step(f.x, 0.94) * step(0.1, f.y) * step(f.y, 0.86);
              // 층 단위로 사무실 불이 켜짐 (같은 층 옆칸끼리 비슷)
              float floorSeed = h3(vec3(floor(u / 9.6), cell.y, floor(n.x * 3.0 + n.z * 7.0 + 0.5)));
              float lit = step(0.5, floorSeed) * step(0.15, h3(vec3(cell, 2.0)));
              vec3 office = vec3(0.78, 0.9, 1.0);
              totalEmissiveRadiance += mull * lit * office * (0.55 + 0.35 * h3(vec3(cell, 5.0)));
              diffuseColor.rgb = mix(vec3(0.2, 0.22, 0.25), diffuseColor.rgb, mull); // 멀리언(프레임)은 밝은 회색
            }
          }
        }`);
  };
  return mat;
}

function verticalSignTexture(text, roman, code) {
  const chars = [...text];
  return canvasTexture(120, 2000, (x, w, h) => {
    x.fillStyle = '#3a3f46';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffffff';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `800 84px ${FONT}`;
    const step = 112;
    chars.forEach((c, i) => x.fillText(c, w / 2, 90 + i * step));
    x.font = `800 90px ${FONT}`;
    x.fillText(roman, w / 2, 90 + chars.length * step + 20);
    x.fillStyle = '#e02a2a';
    x.font = `900 60px ${FONT}`;
    x.save();
    x.translate(w / 2, h - 170);
    x.rotate(Math.PI / 2);
    x.fillText(code, 0, 0);
    x.restore();
  });
}
function parkingSignTexture() {
  return canvasTexture(720, 140, (x, w, h) => {
    x.fillStyle = '#1d2a4a';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff';
    x.textBaseline = 'middle';
    x.font = `700 40px ${FONT}`;
    x.fillText('코오롱', 30, 48);
    x.fillText('싸이언스밸리', 30, 98);
    x.fillStyle = '#f2c230';
    x.font = `900 100px ${FONT}`;
    x.fillText('2', 330, h / 2 + 4);
    x.font = `800 44px ${FONT}`;
    x.fillText('차', 395, h / 2 + 20);
    x.fillStyle = '#2f6fd1';
    x.fillRect(560, 20, 110, 100);
    x.fillStyle = '#fff';
    x.font = `900 84px ${FONT}`;
    x.fillText('P', 588, h / 2 + 4);
  });
}
function shopSignTexture(name, color) {
  return canvasTexture(512, 100, (x, w, h) => {
    x.fillStyle = color;
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `800 60px ${FONT}`;
    x.fillText(name, w / 2, h / 2 + 3);
  });
}
function textBarTexture(text, bg, fg) {
  return canvasTexture(800, 80, (x, w, h) => {
    x.fillStyle = bg;
    x.fillRect(0, 0, w, h);
    x.fillStyle = fg;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `700 46px ${FONT}`;
    x.fillText(text, w / 2, h / 2 + 2);
  });
}
function a07Texture(code) {
  return canvasTexture(400, 230, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.fillStyle = '#e02a2a';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = `900 180px ${FONT}`;
    x.fillText(code, w / 2, h / 2 + 8);
  });
}
function brickTexture() {
  return canvasTexture(256, 256, (x, w, h) => {
    x.fillStyle = '#5a4a44';
    x.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 4; c++) {
      const off = r % 2 ? 32 : 0;
      const v = Math.random() * 25;
      x.fillStyle = `rgb(${125 + v},${80 + v * 0.6},${70 + v * 0.5})`;
      x.fillRect(c * 64 + off + 2 - (off && c === 3 ? 64 : 0), r * 32 + 2, 60, 28);
      if (off && c === 3) x.fillRect(off - 32 + 2, r * 32 + 2, 28, 28);
    }
    for (let i = 0; i < 400; i++) {
      x.fillStyle = `rgba(0,0,0,${Math.random() * 0.15})`;
      x.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}
