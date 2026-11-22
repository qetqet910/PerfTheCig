/**
 * 2D(XZ) 충돌 월드. 플레이어는 반지름 r의 원.
 * - polygons: 닫힌 외곽선(건물). 바운딩박스로 1차 필터.
 * - segments: 얇은 벽(부스 유리 등) [ax, az, bx, bz]
 * - circles:  [x, z, r] (기둥, 사람, 재떨이…)
 * - boxes:    [cx, cz, hw, hd, rotY] → segments로 변환
 */
export class CollisionWorld {
  constructor() {
    this.segments = [];
    this.circles = [];
    this.polys = []; // { minX, maxX, minZ, maxZ, from, to } → segments 인덱스 범위
  }

  add({ polygons = [], segments = [], circles = [], boxes = [] }) {
    for (const p of polygons) {
      const from = this.segments.length;
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        this.segments.push([a[0], a[1], b[0], b[1]]);
        minX = Math.min(minX, a[0]); maxX = Math.max(maxX, a[0]);
        minZ = Math.min(minZ, a[1]); maxZ = Math.max(maxZ, a[1]);
      }
      this.polys.push({ minX, maxX, minZ, maxZ, from, to: this.segments.length });
    }
    const loose = { minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity, from: this.segments.length };
    for (const s of segments) this.segments.push(s);
    for (const [cx, cz, hw, hd, ry = 0] of boxes) {
      const c = Math.cos(ry), s = Math.sin(ry);
      // three.js rotation.y: x' = x cos + z sin, z' = -x sin + z cos
      const pt = (x, z) => [cx + x * c + z * s, cz - x * s + z * c];
      const q = [pt(-hw, -hd), pt(hw, -hd), pt(hw, hd), pt(-hw, hd)];
      for (let i = 0; i < 4; i++) this.segments.push([...q[i], ...q[(i + 1) % 4]]);
    }
    loose.to = this.segments.length;
    if (loose.to > loose.from) this.polys.push(loose);
    for (const c of circles) this.circles.push(c);
  }

  /** pos {x,z}를 충돌 밖으로 밀어냄 (in-place) */
  resolve(pos, r) {
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      for (const p of this.polys) {
        if (pos.x < p.minX - r || pos.x > p.maxX + r || pos.z < p.minZ - r || pos.z > p.maxZ + r) continue;
        for (let i = p.from; i < p.to; i++) moved = pushFromSegment(pos, this.segments[i], r) || moved;
      }
      for (const [cx, cz, cr] of this.circles) {
        const dx = pos.x - cx, dz = pos.z - cz, d = Math.hypot(dx, dz), min = r + cr;
        if (d < min && d > 1e-6) { pos.x = cx + (dx / d) * min; pos.z = cz + (dz / d) * min; moved = true; }
      }
      if (!moved) break;
    }
  }
}

function pushFromSegment(pos, [ax, az, bx, bz], r) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz || 1;
  let t = ((pos.x - ax) * dx + (pos.z - az) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + dx * t, qz = az + dz * t;
  const ox = pos.x - qx, oz = pos.z - qz, d = Math.hypot(ox, oz);
  if (d >= r || d < 1e-6) return false;
  pos.x = qx + (ox / d) * r;
  pos.z = qz + (oz / d) * r;
  return true;
}
