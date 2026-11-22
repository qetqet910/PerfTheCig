import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hash2 } from '../util.js';

/**
 * 배경 레이어: OSM 건물/도로 → 밤 도시.
 * 나중에 Google 3D Tiles / V-World 레이어로 교체할 수 있게
 * { group, update(t), setWetness(w) } 인터페이스만 맞추면 된다.
 */
export async function loadOsmCity(url, { offset, rotation = 0, avoid = [], exclude = [] }) {
  const data = await (await fetch(url)).json();
  const group = new THREE.Group();
  const ox = offset.x, oz = offset.y;
  // offset을 원점으로 옮긴 뒤 rotation(rad)만큼 돌림 → 흡연장 축과 건물 벽을 평행하게
  const c = Math.cos(rotation), s = Math.sin(rotation);
  const local = (p) => p.map(([x, z]) => {
    const dx = x - ox, dz = z - oz;
    return [dx * c - dz * s, dx * s + dz * c];
  });

  // ---------- buildings ----------
  const geos = [], polygons = [], excluded = {};
  for (const b of data.buildings) {
    const pts = local(b.p);
    const a = pts[0], z = pts.at(-1);
    if (pts.length > 1 && a[0] === z[0] && a[1] === z[1]) pts.pop();
    if (pts.length < 3) continue;
    // 따로 디테일하게 만들 건물(코오롱 1·2차)은 빼고 외곽선만 넘겨줌
    if (b.name && exclude.includes(b.name)) { excluded[b.name] = { pts, h: b.h }; continue; }
    const h = b.h ?? 7 + Math.floor(hash2(pts[0][0], pts[0][1]) * 6) * 3.4;
    const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    geos.push(g);
    polygons.push(pts);
  }
  const buildings = new THREE.Mesh(mergeGeometries(geos, false), createBuildingMaterial());
  geos.forEach((g) => g.dispose());
  buildings.receiveShadow = true;
  group.add(buildings);

  // ---------- ground ----------
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.92, metalness: 0 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // ---------- roads ----------
  const MAJOR = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
  const WALK = new Set(['footway', 'pedestrian', 'path', 'steps']);
  const asphalt = [], walk = [], lamps = [];
  for (const r of data.roads) {
    const pts = local(r.p);
    (WALK.has(r.k) ? walk : asphalt).push(ribbon(pts, r.w, WALK.has(r.k) ? 0.025 : 0.015));
    if (MAJOR.has(r.k)) collectLamps(pts, r.w, lamps, avoid);
  }
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x141619, roughness: 0.7, metalness: 0 });
  const walkMat = new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.85, metalness: 0 });
  for (const [list, mat] of [[asphalt, roadMat], [walk, walkMat]]) {
    const m = new THREE.Mesh(mergeGeometries(list, false), mat);
    m.receiveShadow = true;
    group.add(m);
  }

  group.add(createLampInstances(lamps));

  const dry = { g: groundMat.color.clone(), r: roadMat.color.clone(), w: walkMat.color.clone() };
  return {
    group,
    /** 1인칭 충돌용: 건물 외곽 폴리곤 + 가로등 기둥 */
    colliders: { polygons, circles: lamps.map((l) => [l.x, l.z, 0.15]) },
    excluded,
    update() {},
    setWetness(w) {
      // 젖은 아스팔트: 어둡고 매끈하게 → 가로등 반사가 살아남
      groundMat.roughness = THREE.MathUtils.lerp(0.92, 0.28, w);
      roadMat.roughness = THREE.MathUtils.lerp(0.7, 0.18, w);
      walkMat.roughness = THREE.MathUtils.lerp(0.85, 0.3, w);
      groundMat.color.copy(dry.g).multiplyScalar(1 - 0.35 * w);
      roadMat.color.copy(dry.r).multiplyScalar(1 - 0.3 * w);
      walkMat.color.copy(dry.w).multiplyScalar(1 - 0.35 * w);
    },
  };
}

/** 폴리라인 → 평평한 띠 */
function ribbon(pts, width, y) {
  const pos = [], idx = [];
  const hw = width / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * hw, nz = (dx / len) * hw;
    // 이음새 갭을 줄이려고 살짝 연장
    const ex = (dx / len) * hw * 0.5, ez = (dz / len) * hw * 0.5;
    const b = pos.length / 3;
    pos.push(
      x0 + nx - ex, y, z0 + nz - ez,
      x0 - nx - ex, y, z0 - nz - ez,
      x1 + nx + ex, y, z1 + nz + ez,
      x1 - nx + ex, y, z1 - nz + ez,
    );
    idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g.toNonIndexed();
}

function collectLamps(pts, width, out, avoid) {
  const SPACING = 32;
  let carry = SPACING / 2;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, z0] = pts[i], [x1, z1] = pts[i + 1];
    const dx = x1 - x0, dz = z1 - z0, len = Math.hypot(dx, dz);
    if (!len) continue;
    const nx = -dz / len, nz = dx / len;
    for (let d = carry; d < len; d += SPACING) {
      const t = d / len;
      const side = out.length % 2 ? 1 : -1;
      const x = x0 + dx * t + nx * (width / 2 + 1.2) * side;
      const z = z0 + dz * t + nz * (width / 2 + 1.2) * side;
      if (Math.hypot(x, z) > 450) continue;
      if (avoid.some(([ax, az, r]) => Math.hypot(x - ax, z - az) < r)) continue;
      out.push({ x, z, rot: Math.atan2(-nx * side, -nz * side) });
    }
    carry = (carry - len) % SPACING;
    if (carry < 0) carry += SPACING;
  }
}

function createLampInstances(lamps) {
  const g = new THREE.Group();
  const poleGeo = new THREE.CylinderGeometry(0.07, 0.1, 8, 6).translate(0, 4, 0);
  const armGeo = new THREE.BoxGeometry(0.08, 0.08, 1.6).translate(0, 7.9, 0.8);
  const headGeo = new THREE.BoxGeometry(0.35, 0.12, 0.7).translate(0, 7.85, 1.5);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3b3f44, metalness: 0.6, roughness: 0.5 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffe2b0, emissiveIntensity: 6 });
  const metal = new THREE.InstancedMesh(mergeGeometries([poleGeo, armGeo]), poleMat, lamps.length);
  const heads = new THREE.InstancedMesh(headGeo, headMat, lamps.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(1, 1, 1);
  lamps.forEach((l, i) => {
    q.setFromAxisAngle(up, l.rot);
    m.compose(new THREE.Vector3(l.x, 0, l.z), q, s);
    metal.setMatrixAt(i, m);
    heads.setMatrixAt(i, m);
  });
  g.add(metal, heads);

  // 바닥에 떨어지는 가로등 빛 웅덩이 (라이트 수십 개 대신 가짜 데칼)
  const poolTex = radialTexture();
  const poolMat = new THREE.MeshBasicMaterial({
    map: poolTex, color: 0xffcf8a, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(14, 14).rotateX(-Math.PI / 2).translate(0, 0.04, 1.5), poolMat, lamps.length);
  lamps.forEach((l, i) => {
    q.setFromAxisAngle(up, l.rot);
    m.compose(new THREE.Vector3(l.x, 0, l.z), q, s);
    pools.setMatrixAt(i, m);
  });
  g.add(pools);
  return g;
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, '#ffffff66'); gr.addColorStop(1, '#fff0');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** 절차적 창문 + 야근 불빛 셰이더 */
function createBuildingMaterial() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x23272f, roughness: 0.95, metalness: 0 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos;
        varying vec3 vWNrm;
        float h3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 n = normalize(cross(dFdx(vWPos), dFdy(vWPos)));
          if (abs(n.y) < 0.5) {
            vec2 t = normalize(vec2(-n.z, n.x));
            float u = dot(vWPos.xz, t);
            float v = vWPos.y;
            bool street = v < 4.0;               // 1층: 상가 쇼윈도
            float cw = street ? 6.0 : 3.2;
            float ch = street ? 4.0 : 3.4;
            vec2 cell = vec2(floor(u / cw), floor(v / ch));
            vec2 f = vec2(fract(u / cw), fract(v / ch));
            float win = street
              ? step(0.06, f.x) * step(f.x, 0.94) * step(0.1, f.y) * step(f.y, 0.78)
              : step(0.14, f.x) * step(f.x, 0.86) * step(0.22, f.y) * step(f.y, 0.82);
            vec3 seed = vec3(cell, floor(n.x * 7.0 + n.z * 13.0 + 0.5) + floor(vWPos.x / 97.0) * 3.0);
            float r = h3(seed);
            float lit = street ? step(0.75, r) : step(0.78, r);
            // 사무실 형광등(야근) vs 오피스텔 전구색
            vec3 cool = vec3(0.70, 0.85, 1.0);
            vec3 warm = vec3(1.0, 0.70, 0.40);
            vec3 wc = street ? vec3(1.0, 0.88, 0.7) : mix(cool, warm, step(0.62, h3(seed + 3.1)));
            float k = (0.45 + 0.55 * h3(seed + 7.7)) * (street ? 0.15 : 0.22);
            totalEmissiveRadiance += win * lit * wc * k;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.04, 0.055), win * (1.0 - lit));
          }
        }`);
  };
  return mat;
}
