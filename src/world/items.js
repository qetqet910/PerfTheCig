import * as THREE from 'three';
import { canvasTexture, FONT } from '../util.js';

/** 커피 자판기 메뉴 */
export const COFFEE_MENU = [
  { name: '밀크커피', price: 400, liquid: 0x8a5a3a },
  { name: '설탕커피', price: 400, liquid: 0x4a2c18 },
  { name: '블랙커피', price: 400, liquid: 0x22140c },
  { name: '고급커피', price: 500, liquid: 0x7a4a2a },
  { name: '율무차', price: 400, liquid: 0xcfbd9a },
  { name: '코코아', price: 500, liquid: 0x4e2a1a },
];

/** 음료 자판기 진열 (3단 × 5칸). 상표 없는 일반 음료 */
export const DRINKS = [
  { name: '콜라', price: 1000, color: '#c8202a', kind: 'can' },
  { name: '사이다', price: 1000, color: '#2a9a4a', kind: 'can' },
  { name: '캔커피', price: 900, color: '#5a3a24', kind: 'can' },
  { name: '이온음료', price: 1200, color: '#2a6fd1', kind: 'can' },
  { name: '식혜', price: 1000, color: '#e8d8b0', kind: 'can' },
  { name: '보리차', price: 1200, color: '#b08a4a', kind: 'bottle' },
  { name: '오렌지', price: 1000, color: '#f08a1a', kind: 'can' },
  { name: '포도', price: 1000, color: '#6a2a7a', kind: 'can' },
  { name: '밀크티', price: 1300, color: '#c8a888', kind: 'bottle' },
  { name: '에너지', price: 1500, color: '#1a1a1a', kind: 'can' },
  { name: '생수', price: 800, color: '#bfe0f0', kind: 'bottle' },
  { name: '탄산수', price: 1100, color: '#9ad0c0', kind: 'can' },
  { name: '녹차', price: 1200, color: '#5a8a3a', kind: 'bottle' },
  { name: '두유', price: 900, color: '#e8e0c8', kind: 'can' },
  { name: '쌍화차', price: 1000, color: '#7a3a1a', kind: 'can' },
];

const cupTex = () => canvasTexture(256, 128, (x, w, h) => {
  x.fillStyle = '#f6f3ee';
  x.fillRect(0, 0, w, h);
  x.fillStyle = '#6a3a1e';
  x.fillRect(0, 70, w, 34);
  x.fillStyle = '#f6f3ee';
  x.font = `700 22px ${FONT}`;
  x.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) x.fillText('Coffee', 14 + i * 86, 88);
  // 커피콩
  x.fillStyle = '#6a3a1e';
  for (let i = 0; i < 6; i++) { x.beginPath(); x.ellipse(22 + i * 44, 40, 7, 10, 0.5, 0, 7); x.fill(); }
});
let CUP_TEX = null;

/**
 * 종이컵 (자판기 표준 6.5oz 정도). 원점 = 컵 바닥 중앙.
 * setFill(0..1), setLiquid(color)
 */
export function createPaperCup(scale = 1) {
  CUP_TEX ||= cupTex();
  const H = 0.078 * scale, RT = 0.035 * scale, RB = 0.025 * scale;
  const g = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(RT, RB, H, 28, 1, true).translate(0, H / 2, 0),
    new THREE.MeshStandardMaterial({ map: CUP_TEX, roughness: 0.8, side: THREE.DoubleSide }));
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(RB, 24).rotateX(-Math.PI / 2).translate(0, 0.001, 0), new THREE.MeshStandardMaterial({ color: 0xece8e0, roughness: 0.9 }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(RT, 0.0018 * scale, 6, 28).rotateX(Math.PI / 2).translate(0, H, 0), new THREE.MeshStandardMaterial({ color: 0xf8f6f2, roughness: 0.7 }));
  const liqMat = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.25 });
  const liquid = new THREE.Mesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), liqMat);
  // 거품 링 (밀크커피 위 크레마 느낌)
  const foam = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc89a6a, roughness: 0.6, transparent: true, opacity: 0.6 }));
  foam.position.y = 0.0005;
  liquid.add(foam);
  wall.castShadow = true;
  g.add(wall, bottom, rim, liquid);
  const api = {
    group: g, height: H, fill: 0,
    setFill(f) {
      api.fill = Math.max(0, Math.min(1, f));
      liquid.visible = api.fill > 0.01;
      const y = H * 0.9 * api.fill;
      liquid.position.y = Math.max(0.002, y);
      const r = RB + (RT - RB) * (y / H) - 0.0008 * scale;
      liquid.scale.setScalar(r);
    },
    setLiquid(c) { liqMat.color.set(c); foam.visible = c === 0x8a5a3a || c === 0x7a4a2a; },
    /** 컵 윗면 중앙 (김 나는 곳) */
    topWorld(out) { return out.set(0, H, 0).applyMatrix4(g.matrixWorld); },
  };
  api.setFill(0);
  return api;
}

const labelCache = new Map();
function labelTex(d) {
  if (labelCache.has(d.name)) return labelCache.get(d.name);
  const t = canvasTexture(256, 128, (x, w, h) => {
    x.fillStyle = d.color;
    x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(255,255,255,0.18)';
    x.fillRect(0, 18, w, 10);
    x.fillRect(0, h - 28, w, 6);
    const light = ['#e8d8b0', '#bfe0f0', '#9ad0c0', '#e8e0c8', '#c8a888'].includes(d.color);
    x.fillStyle = light ? '#2a2a2a' : '#ffffff';
    x.font = `800 ${d.name.length > 3 ? 30 : 38}px ${FONT}`;
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(d.name, w * 0.25, h / 2 + 2);
    x.fillText(d.name, w * 0.75, h / 2 + 2);
  });
  labelCache.set(d.name, t);
  return t;
}

/** 캔/병. 원점 = 바닥 중앙 */
export function createDrink(d, scale = 1) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.7, roughness: 0.35 });
  let H, R;
  if (d.kind === 'box' || d.kind === 'pouch') {
    // 상자(껌·초코바) / 봉지(핫팩·과자): 세워서 진열
    const pouch = d.kind === 'pouch';
    const w = (pouch ? 0.075 : 0.06) * scale, h = (pouch ? 0.1 : 0.09) * scale, t = (pouch ? 0.016 : 0.022) * scale;
    const geo = pouch ? new THREE.CapsuleGeometry(t / 2, h - t, 4, 10) : new THREE.BoxGeometry(w, h, t);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: labelTex(d), roughness: pouch ? 0.35 : 0.55, metalness: pouch ? 0.25 : 0 }));
    if (pouch) m.scale.set(w / t, 1, 1);
    m.position.y = h / 2;
    g.add(m);
    H = h; R = w / 2;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    return { group: g, height: H, radius: R };
  }
  if (d.kind === 'bottle') {
    R = 0.031 * scale; H = 0.15 * scale;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H * 0.7, 20).translate(0, H * 0.35, 0), new THREE.MeshStandardMaterial({ map: labelTex(d), roughness: 0.4 }));
    const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.45, R, H * 0.18, 20).translate(0, H * 0.79, 0),
      new THREE.MeshStandardMaterial({ color: d.color, roughness: 0.2, transparent: true, opacity: 0.75 }));
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.45, R * 0.45, H * 0.1, 14).translate(0, H * 0.93, 0), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.5 }));
    g.add(body, shoulder, cap);
  } else {
    R = 0.033 * scale; H = 0.122 * scale;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H * 0.9, 22).translate(0, H * 0.5, 0), new THREE.MeshStandardMaterial({ map: labelTex(d), roughness: 0.35, metalness: 0.3 }));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.86, R, H * 0.05, 22).translate(0, H * 0.975, 0), metal);
    const bot = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 0.86, H * 0.05, 22).translate(0, H * 0.025, 0), metal);
    const tab = new THREE.Mesh(new THREE.BoxGeometry(R * 0.6, 0.002 * scale, R * 0.3).translate(0, H + 0.001 * scale, R * 0.3), metal);
    g.add(body, top, bot, tab);
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { group: g, height: H, radius: R };
}

/**
 * 간식·핫팩 자판기 (3단 × 5칸). use: 휠↑ 했을 때 동작
 *   eat 먹기 / warm 핫팩 흔들기 / gum 껌(냄새 제거) / drink 마시기 / mask·wipe 쓰기
 */
export const SNACKS = [
  { name: '핫팩', price: 1000, color: '#e85a2a', kind: 'pouch', use: 'warm' },
  { name: '손난로', price: 1500, color: '#d8342a', kind: 'pouch', use: 'warm' },
  { name: '껌', price: 500, color: '#2a9ad8', kind: 'box', use: 'gum' },
  { name: '민트캔디', price: 800, color: '#3ac8a8', kind: 'box', use: 'gum' },
  { name: '목캔디', price: 800, color: '#e8c42a', kind: 'box', use: 'gum' },
  { name: '초코바', price: 1200, color: '#5a3020', kind: 'box', use: 'eat' },
  { name: '에너지바', price: 1500, color: '#c8a03a', kind: 'box', use: 'eat' },
  { name: '감자칩', price: 1500, color: '#f2c230', kind: 'pouch', use: 'eat' },
  { name: '쿠키', price: 1200, color: '#a8683a', kind: 'box', use: 'eat' },
  { name: '젤리', price: 1000, color: '#e83a8a', kind: 'pouch', use: 'eat' },
  { name: '숙취해소', price: 3000, color: '#2a3a6a', kind: 'can', use: 'drink' },
  { name: '비타민', price: 1500, color: '#f08a1a', kind: 'bottle', use: 'drink' },
  { name: '육포', price: 2500, color: '#7a2a1a', kind: 'pouch', use: 'eat' },
  { name: '마스크', price: 1500, color: '#e8eef4', kind: 'pouch', use: 'mask' },
  { name: '물티슈', price: 1000, color: '#9ad0e8', kind: 'pouch', use: 'wipe' },
];
