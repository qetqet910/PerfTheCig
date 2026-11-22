import * as THREE from 'three';

/** 카메라를 따라다니는 빗줄기 박스 */
export function createRain(count = 7000) {
  const R = 30, TOP = 22;
  const pos = new Float32Array(count * 6);
  const drops = new Float32Array(count * 3); // x, y, z (world)
  const speed = new Float32Array(count);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.LineBasicMaterial({ color: 0x9fb0c8, transparent: true, opacity: 0.3, depthWrite: false });
  const lines = new THREE.LineSegments(g, mat);
  lines.frustumCulled = false;
  lines.visible = false;

  const respawn = (i, cx, cz, anyY) => {
    drops[i * 3] = cx + (Math.random() * 2 - 1) * R;
    drops[i * 3 + 2] = cz + (Math.random() * 2 - 1) * R;
    drops[i * 3 + 1] = anyY ? Math.random() * TOP : TOP + Math.random() * 4;
    speed[i] = 13 + Math.random() * 5;
  };
  let init = false;
  const WIND = 1.2;

  return {
    object: lines,
    get enabled() { return lines.visible; },
    set enabled(v) { lines.visible = v; },
    update(dt, camera) {
      if (!lines.visible) return;
      const cx = camera.position.x, cz = camera.position.z;
      if (!init) { for (let i = 0; i < count; i++) respawn(i, cx, cz, true); init = true; }
      for (let i = 0; i < count; i++) {
        const j = i * 3;
        drops[j + 1] -= speed[i] * dt;
        drops[j] += WIND * dt;
        const x = drops[j], y = drops[j + 1], z = drops[j + 2];
        if (y < 0 || Math.abs(x - cx) > R || Math.abs(z - cz) > R) { respawn(i, cx, cz, false); }
        const k = i * 6, len = speed[i] * 0.028;
        pos[k] = drops[j]; pos[k + 1] = drops[j + 1]; pos[k + 2] = drops[j + 2];
        pos[k + 3] = drops[j] - WIND * 0.028; pos[k + 4] = drops[j + 1] + len; pos[k + 5] = drops[j + 2];
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}
