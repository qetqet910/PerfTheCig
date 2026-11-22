import * as THREE from 'three';

/**
 * 눈싸움: 던진 눈뭉치가 포물선으로 날아가 사람(NPC/원격 플레이어/나) 또는 바닥·벽에 맞으면 철퍽.
 * 모든 클라이언트가 같은 궤적을 각자 계산 (던질 때 위치·방향만 네트워크로 보냄).
 *
 * targets(): [{ pos: Vector3(발 위치), onHit(ball) }]  — 맞았는지는 몸통 높이(0.3~1.5m) 원기둥으로 판정
 * onHitMe(ball): 내 화면에 눈 맞음 연출
 */
export function createSnowballs({ scene, smoke, colliders = null, onHitMe, onSplat }) {
  const geo = new THREE.IcosahedronGeometry(0.055, 1);
  const mat = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 1 });
  const balls = [];
  const tmp = new THREE.Vector3();

  function splat(p) {
    // 하얀 가루가 확 퍼짐
    for (let i = 0; i < 18; i++) {
      tmp.set((Math.random() - 0.5) * 1.2, Math.random() * 0.9, (Math.random() - 0.5) * 1.2);
      smoke.emit(p, tmp, { size: 0.025, grow: 0.08, life: 0.9, alpha: 0.5, turb: 0.2, mode: 1, tint: 1 });
    }
    onSplat?.(p);
  }

  return {
    /** p: 출발 위치, d: 방향(정규화), mine: 내가 던짐(나한테는 안 맞음) */
    throw(p, d, { mine = false, owner = null } = {}) {
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(p);
      m.castShadow = true;
      scene.add(m);
      const v = d.clone().normalize().multiplyScalar(10.5);
      v.y += 2.2;
      balls.push({ m, v, t: 0, mine, owner });
    },
    update(dt, camera, targets = []) {
      for (const b of balls) {
        b.t += dt;
        b.v.y -= 9.8 * dt;
        b.m.position.addScaledVector(b.v, dt);
        b.m.rotation.x += dt * 8;
        const p = b.m.position;
        let hit = p.y < 0.05 || b.t > 4;
        // 사람 먼저 (사람 주변엔 걸어서 못 지나가게 하는 충돌 원이 있어서, 벽 판정을 먼저 하면 사람한테 안 맞음)
        if (!hit) {
          for (const t of targets) {
            if (t.owner && t.owner === b.owner) continue; // 던진 사람 본인 제외
            const dx = p.x - t.pos.x, dz = p.z - t.pos.z;
            if (dx * dx + dz * dz < 0.36 * 0.36 && p.y > 0.2 && p.y < 1.6) { t.onHit(b); hit = true; break; }
          }
        }
        // 벽/물체 (높이 2m 아래만)
        if (!hit && colliders && p.y < 2.0) {
          const q = { x: p.x, z: p.z };
          colliders.resolve(q, 0.06);
          if (Math.hypot(q.x - p.x, q.z - p.z) > 1e-4) {
            // 사람 충돌 원이면 무시하고 계속 날아감 (사람 판정은 위에서 함)
            const nearPerson = targets.some((t) => Math.hypot(p.x - t.pos.x, p.z - t.pos.z) < 0.5);
            if (!nearPerson) hit = true;
          }
        }
        // 나
        if (!hit && !b.mine && camera) {
          const dx = p.x - camera.position.x, dz = p.z - camera.position.z;
          if (dx * dx + dz * dz < 0.3 * 0.3 && Math.abs(p.y - (camera.position.y - 0.25)) < 0.6) { onHitMe?.(b); hit = true; }
        }
        if (hit) { splat(p.clone()); scene.remove(b.m); b.dead = true; }
      }
      for (let i = balls.length - 1; i >= 0; i--) if (balls[i].dead) balls.splice(i, 1);
    },
  };
}

/** 손에 드는 눈뭉치 / 우산 메시 */
export function createSnowballMesh(scale = 1) {
  const g = new THREE.Group();
  const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05 * scale, 1), new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 1 }));
  m.position.y = 0.05 * scale;
  m.castShadow = true;
  g.add(m);
  return { group: g, height: 0.1 * scale };
}

export function createUmbrellaMesh(color = 0x1d3a6b, scale = 1) {
  const g = new THREE.Group();
  const s = scale;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.008 * s, 0.008 * s, 0.8 * s, 6), new THREE.MeshStandardMaterial({ color: 0x333333 }));
  shaft.position.y = 0.4 * s;
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.5 * s, 0.22 * s, 10, 1, true), new THREE.MeshStandardMaterial({ color, roughness: 0.5, side: THREE.DoubleSide }));
  canopy.position.y = 0.78 * s;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.01 * s, 0.06 * s, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  tip.position.y = 0.92 * s;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.03 * s, 0.008 * s, 6, 12, Math.PI), new THREE.MeshStandardMaterial({ color: 0x5a3a24 }));
  handle.rotation.z = Math.PI;
  g.add(shaft, canopy, tip, handle);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  // 눈이 살짝 쌓인 우산 위
  const snowCap = new THREE.Mesh(new THREE.ConeGeometry(0.42 * s, 0.12 * s, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xeef2f8, roughness: 1, transparent: true, opacity: 0.85 }));
  snowCap.position.y = 0.84 * s;
  g.add(snowCap);
  return { group: g, height: 0.95 * s };
}
