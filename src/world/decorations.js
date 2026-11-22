import * as THREE from 'three';
import { canvasTexture, FONT } from '../util.js';
import { createPaperCup, createDrink, DRINKS } from './items.js';
import { createCigarette } from '../smoke/props.js';
import { SHELTER } from './smokingArea.js';

/**
 * 흡연장 소품 + 가림막 바깥에 쌓이는 눈.
 * 씬 좌표는 smokingArea와 같음 (1차 벽 z=-6, 2차 벽 z=+6, 가림막 x -6.6~9.4).
 */
export function createDecorations() {
  const group = new THREE.Group();
  const circles = [], boxes = [];
  const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, ...extra });
  const add = (mesh, x, y, z, parent = group) => {
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  // ---------- 스탠딩 테이블 (남은 종이컵·캔) ----------
  {
    const g = new THREE.Group();
    g.position.set(-0.45, 0, 2.7);
    const metal = M(0x2c2f34, { metalness: 0.6, roughness: 0.4 });
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.03, 28), M(0xd8d2c8, { roughness: 0.5 })), 0, 1.05, 0, g);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.04, 10), metal), 0, 0.52, 0, g);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.03, 20), metal), 0, 0.015, 0, g);
    const cup = createPaperCup(1); cup.setFill(0.15); cup.group.position.set(0.1, 1.066, 0.05); g.add(cup.group);
    const cup2 = createPaperCup(1); cup2.setFill(0); cup2.group.position.set(-0.12, 1.066, -0.08); cup2.group.rotation.z = Math.PI / 2; cup2.group.position.y = 1.066 + 0.03; g.add(cup2.group);
    const can = createDrink(DRINKS[2], 1); can.group.position.set(0.02, 1.066, -0.15); g.add(can.group);
    group.add(g);
    circles.push([-0.45, 2.7, 0.33]);
  }

  // ---------- 우산꽂이 + 우산 3개 ----------
  {
    const g = new THREE.Group();
    g.position.set(2.15, 0, 5.6);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.5, 18, 1, true), M(0x8a9098, { metalness: 0.7, roughness: 0.3, side: THREE.DoubleSide })), 0, 0.25, 0, g);
    [[0x1d3a6b, -0.04, 0.03, 0.12], [0xc82a2a, 0.05, -0.02, -0.1], [0x222222, 0.0, -0.05, 0.05]].forEach(([c, x, z, tilt]) => {
      const u = new THREE.Group();
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.9, 6), M(0x333333)), 0, 0.45, 0, u);
      const canopy = add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.6, 8), M(c, { roughness: 0.5 })), 0, 0.62, 0, u);
      canopy.rotation.x = Math.PI;
      const handle = add(new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 6, 12, Math.PI), M(0x5a3a24)), 0.03, 0.95, 0, u);
      handle.rotation.z = Math.PI;
      u.position.set(x, 0, z);
      u.rotation.set(tilt, 0, tilt * 0.6);
      g.add(u);
    });
    group.add(g);
    circles.push([2.15, 5.6, 0.17]);
  }

  // ---------- 택배 상자 더미 (뒷문 옆) ----------
  {
    const box = M(0xb48a5a, { roughness: 0.9 });
    const tape = M(0xc8b088, { roughness: 0.6 });
    [[-1.1, 0.2, 5.55, 0.5, 0.4, 0.4, 0.1], [-1.05, 0.55, 5.6, 0.4, 0.3, 0.32, -0.15], [-0.6, 0.15, 5.6, 0.36, 0.3, 0.3, 0.3]].forEach(([x, y, z, w, h, d, r]) => {
      const b = add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), box), x, y, z);
      b.rotation.y = r;
      const t = new THREE.Mesh(new THREE.BoxGeometry(w + 0.002, 0.004, 0.06), tape);
      t.position.y = h / 2;
      b.add(t);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.08), M(0xf4f4f0));
      label.position.set(0, 0, d / 2 + 0.002);
      b.add(label);
    });
    boxes.push([-0.9, 5.57, 0.45, 0.25, 0]);
  }

  // ---------- 종량제 봉투 더미 ----------
  {
    const bag = M(0xe8e4c8, { roughness: 0.4, metalness: 0.05, transparent: true, opacity: 0.92 });
    [[8.3, 0.22, -5.4, 0.26], [8.65, 0.2, -5.5, 0.23], [8.45, 0.5, -5.45, 0.2]].forEach(([x, y, z, r]) => {
      const b = add(new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), bag), x, y, z);
      b.scale.set(1, 1.15, 0.9);
      const knot = add(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 8), bag), 0, r * 1.1, 0, b);
      knot.scale.set(1, 1, 1);
    });
    circles.push([8.45, -5.45, 0.42]);
  }

  // ---------- 소화기 (벽걸이함) ----------
  {
    const g = new THREE.Group();
    g.position.set(2.85, 0, 5.82);
    const boxM = M(0xc8202a, { roughness: 0.5 });
    add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.6, 0.18), boxM), 0, 0.75, 0, g);
    const glass = add(new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.42), new THREE.MeshStandardMaterial({ color: 0xcfe4f0, transparent: true, opacity: 0.2, roughness: 0.05 })), 0, 0.72, -0.091, g);
    glass.rotation.y = Math.PI;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.38, 16), M(0xe02a2a, { roughness: 0.35 })), 0, 0.69, 0, g);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.06, 10), M(0x222222)), 0, 0.91, 0, g);
    const lab = add(new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.07), new THREE.MeshStandardMaterial({ map: textTex('소화기', '#c8202a', '#fff'), roughness: 0.6 })), 0, 1.1, -0.091, g);
    lab.rotation.y = Math.PI;
    group.add(g);
  }

  // ---------- 벽 포스터 2장 (1차 벽) ----------
  const poster = (x, y, w, h, draw) => {
    const m = add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: canvasTexture(Math.round(w * 600), Math.round(h * 600), draw), roughness: 0.75 })), x, y, -5.84);
    m.castShadow = false;
  };
  poster(2.1, 1.65, 0.6, 0.8, (c, w, h) => {
    c.fillStyle = '#f4f2ec'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#0f6b4a'; c.fillRect(0, 0, w, 90);
    c.fillStyle = '#fff'; c.font = `800 46px ${FONT}`; c.textAlign = 'center'; c.fillText('흡연구역 이용 안내', w / 2, 60);
    c.fillStyle = '#222'; c.font = `600 30px ${FONT}`; c.textAlign = 'left';
    ['1. 꽁초는 재떨이에', '2. 침 뱉지 않기', '3. 통로 막지 않기', '4. 다 핀 뒤 손 씻기', '5. 실내 흡연 금지'].forEach((t, i) => c.fillText(t, 36, 160 + i * 56));
    c.fillStyle = '#888'; c.font = `500 22px ${FONT}`; c.fillText('코오롱싸이언스밸리 관리사무소', 36, h - 30);
  });
  poster(-4.4, 1.55, 0.55, 0.75, (c, w, h) => {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#2a6fd1'); g.addColorStop(1, '#1a3a6b');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.fillStyle = '#fff'; c.font = `900 54px ${FONT}`; c.textAlign = 'center';
    c.fillText('담배 끊고', w / 2, 120); c.fillText('건강 찾자', w / 2, 190);
    c.font = `600 26px ${FONT}`; c.fillText('금연 상담 ☎ 1544-9030', w / 2, h - 50);
    c.strokeStyle = '#fff'; c.lineWidth = 10; c.beginPath(); c.arc(w / 2, 300, 70, 0, 7); c.stroke();
    c.fillRect(w / 2 - 50, 292, 100, 16); c.beginPath(); c.moveTo(w / 2 - 50, 250); c.lineTo(w / 2 + 50, 350); c.stroke();
  });

  // ---------- CCTV + 벽시계 ----------
  {
    const g = new THREE.Group();
    g.position.set(6.2, 3.3, -5.85);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.12), M(0xd8d8d8)), 0, 0, 0.06, g);
    const cam = add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.2, 14), M(0xeeeeee, { roughness: 0.4 })), 0, -0.06, 0.15, g);
    cam.rotation.set(Math.PI / 2 + 0.4, 0, 0.5);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.006, 6, 6), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2020, emissiveIntensity: 2 }));
    led.position.set(0, -0.11, 0);
    cam.add(led);
    group.add(g);
  }
  {
    const clock = new THREE.Group();
    clock.position.set(0.6, 3.15, 5.82);
    clock.rotation.y = Math.PI;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.04, 28).rotateX(Math.PI / 2), M(0x222222)), 0, 0, 0, clock);
    const face = add(new THREE.Mesh(new THREE.CircleGeometry(0.15, 28), new THREE.MeshStandardMaterial({ map: clockFace(), roughness: 0.6 })), 0, 0, 0.021, clock);
    face.castShadow = false;
    const hand = (len, w) => { const h = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.004).translate(0, len / 2, 0), M(0x111111)); h.position.z = 0.025; clock.add(h); return h; };
    const hh = hand(0.08, 0.012), mh = hand(0.12, 0.008);
    group.add(clock);
    clock.userData.tick = () => {
      const d = new Date();
      mh.rotation.z = -(d.getMinutes() / 60) * Math.PI * 2;
      hh.rotation.z = -((d.getHours() % 12 + d.getMinutes() / 60) / 12) * Math.PI * 2;
    };
    clock.userData.tick();
    var clockRef = clock; // eslint-disable-line no-var
  }

  // ---------- 겨울 난로 (벤치 옆) ----------
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x331008, emissive: 0xff5a1a, emissiveIntensity: 1.6 });
  {
    const g = new THREE.Group();
    g.position.set(-5.05, 0, 4.7);
    g.rotation.y = Math.PI / 2 + 0.4;
    const body = M(0xc8c4bc, { metalness: 0.3, roughness: 0.5 });
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.55, 20), body), 0, 0.32, 0, g);
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.04, 20), M(0x2a2a2a)), 0, 0.02, 0, g);
    const grille = add(new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.32, 20, 1, true, -0.9, 1.8), glowMat), 0, 0.36, 0, g);
    grille.castShadow = false;
    add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.06, 20), body), 0, 0.62, 0, g);
    group.add(g);
    circles.push([-5.05, 4.7, 0.25]);
  }

  // ---------- 자전거 (통로 입구, 1차 벽에 기대어) ----------
  {
    const g = new THREE.Group();
    g.position.set(-10.6, 0, -5.55);
    const frameM = M(0x2a6a4a, { metalness: 0.5, roughness: 0.4 });
    const tire = M(0x111111, { roughness: 0.9 });
    for (const x of [-0.5, 0.5]) {
      const w = add(new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.022, 8, 30), tire), x, 0.33, 0, g);
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.005, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0x9a9a9a, wireframe: true }));
      spoke.rotation.x = Math.PI / 2;
      w.add(spoke);
    }
    const tube = (x1, y1, x2, y2, r = 0.016) => {
      const a = new THREE.Vector3(x1, y1, 0), b = new THREE.Vector3(x2, y2, 0);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 8), frameM);
      m.position.copy(a).lerp(b, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      m.castShadow = true;
      g.add(m);
    };
    tube(-0.5, 0.33, -0.05, 0.33); tube(-0.05, 0.33, 0.35, 0.78); tube(-0.05, 0.33, -0.12, 0.72); tube(-0.12, 0.72, 0.35, 0.72);
    tube(-0.5, 0.33, -0.12, 0.72); tube(0.35, 0.78, 0.5, 0.33); tube(0.35, 0.72, 0.38, 0.92);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.08), M(0x111111)), -0.14, 0.78, 0, g);
    const bar = add(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.45, 8), M(0x222222)), 0.38, 0.93, 0, g);
    bar.rotation.x = Math.PI / 2;
    g.rotation.z = 0.04;
    group.add(g);
    boxes.push([-10.6, -5.55, 0.85, 0.2, 0]);
  }

  // ---------- 눈사람 (눈 쌓이면 나타남, 담배 물고 있음) ----------
  const snowman = new THREE.Group();
  {
    snowman.position.set(-9.2, 0, -3.8);
    snowman.rotation.y = 0.9;
    const snowM = M(0xf2f4f8, { roughness: 1 });
    add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 16), snowM), 0, 0.3, 0, snowman);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.25, 20, 16), snowM), 0, 0.78, 0, snowman);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.18, 20, 16), snowM), 0, 1.15, 0, snowman);
    const coal = M(0x111111);
    for (const sx of [-0.06, 0.06]) add(new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), coal), sx, 1.2, 0.16, snowman);
    for (let i = 0; i < 3; i++) add(new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), coal), 0, 0.9 - i * 0.1, 0.235, snowman);
    const nose = add(new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.13, 10), M(0xe86a1a)), 0, 1.15, 0.22, snowman);
    nose.rotation.x = Math.PI / 2;
    for (const sx of [-1, 1]) {
      const arm = add(new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.42, 6), M(0x4a3020)), sx * 0.36, 0.86, 0, snowman);
      arm.rotation.z = sx * -1.0;
    }
    const scarf = add(new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.035, 8, 20), M(0xc82a2a)), 0, 0.98, 0, snowman);
    scarf.rotation.x = Math.PI / 2;
    const cig = createCigarette({ radius: 0.006 });
    cig.setLength(0.6); cig.setLit(true);
    cig.group.position.set(0.05, 1.08, 0.16);
    cig.group.rotation.set(-1.9, 0, 0.3);
    snowman.add(cig.group);
    snowman.visible = false;
    group.add(snowman);
  }
  circles.push([-9.2, -3.8, 0.36]); // 겨울 내내 눈 → 눈사람 자리는 항상 막음

  // ---------- 가림막 바깥 눈 덮개 (가림막 경계에서 바로 시작, 경계는 부드럽게) ----------
  const snowMats = [];
  const snowPatch = (x0, x1, z0, z1, fadeSide) => {
    const w = x1 - x0, d = z1 - z0;
    const tex = snowTexture(fadeSide, w, d);
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: 0, roughness: 1, depthWrite: false, color: 0xeef2f8 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set((x0 + x1) / 2, 0.05, (z0 + z1) / 2);
    m.receiveShadow = true;
    m.renderOrder = 1;
    group.add(m);
    snowMats.push(mat);
  };
  snowPatch(-27.5, SHELTER.x0, -23, 27, 'right');  // 통로 입구 쪽 광장 (가림막 서쪽 끝에서 시작)
  snowPatch(SHELTER.x1, 34, -6, 6, 'left');        // 통로 안쪽 (가림막 동쪽 끝에서 시작)

  return {
    group,
    colliders: { circles, boxes },
    update() { clockRef.userData.tick(); },
    setSnow(k) {
      for (const m of snowMats) m.opacity = Math.min(1, k * 1.15);
      snowman.visible = k > 0.35;
    },
  };
}

function textTex(text, bg, fg) {
  return canvasTexture(256, 80, (c, w, h) => {
    c.fillStyle = bg; c.fillRect(0, 0, w, h);
    c.fillStyle = fg; c.font = `800 46px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 2);
  });
}
function clockFace() {
  return canvasTexture(256, 256, (c, w, h) => {
    c.fillStyle = '#f6f4ee'; c.beginPath(); c.arc(128, 128, 126, 0, 7); c.fill();
    c.fillStyle = '#222'; c.font = `700 30px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) { const a = (i / 12) * Math.PI * 2; c.fillText(String(i), 128 + Math.sin(a) * 98, 128 - Math.cos(a) * 98); }
  });
}
/** 얼룩덜룩한 눈 + 가림막 쪽 가장자리는 부드럽게 사라짐 */
function snowTexture(fadeSide, w, d) {
  const W = 512, H = Math.max(64, Math.round(512 * (d / w)));
  return canvasTexture(W, Math.min(1024, H), (c, cw, ch) => {
    const img = c.createImageData(cw, ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const n = 0.82 + Math.random() * 0.18 - (Math.sin(x * 0.07) * Math.cos(y * 0.05) > 0.6 ? 0.25 : 0); // 발자국/얼룩
      // 가림막 쪽 0.35m에 걸쳐 투명→불투명
      const edgeM = fadeSide === 'right' ? (cw - x) / cw * w : x / cw * w;
      const fade = Math.min(1, edgeM / 0.35);
      const i = (y * cw + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 245;
      img.data[i + 3] = 255 * Math.max(0, Math.min(1, n)) * fade;
    }
    c.putImageData(img, 0, 0);
  });
}
