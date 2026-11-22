import * as THREE from 'three';

/**
 * 담배 연기 파티클.
 * CPU 시뮬(부력 + 난류) → Points + 소프트 스프라이트 셰이더.
 */
export class SmokeSystem {
  constructor(max = 2400) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.age = new Float32Array(max).fill(1e9);
    this.life = new Float32Array(max).fill(1);
    this.size0 = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.alpha0 = new Float32Array(max);
    this.seed = new Float32Array(max).map(() => Math.random());
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.turb = new Float32Array(max).fill(1); // 난류 세기 (도넛은 작게)
    this.mode = new Uint8Array(max);           // 0 연기, 1 재(중력)
    this.cursor = 0;
    this.time = 0;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    this.geometry = g;

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uMap: { value: puffTexture() },
          uScale: { value: 800 },
          uTime: { value: 0 },
          uColor: { value: new THREE.Color(0.42, 0.44, 0.48) },
        },
      ]),
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aAlpha; attribute float aSeed;
        uniform float uScale;
        varying float vAlpha; varying float vSeed;
        #include <fog_pars_vertex>
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * uScale / max(-mvPosition.z, 0.05);
          vAlpha = aAlpha; vSeed = aSeed;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform vec3 uColor; uniform float uTime;
        varying float vAlpha; varying float vSeed;
        #include <fog_pars_fragment>
        void main() {
          float a = vSeed * 6.2831 + uTime * (vSeed - 0.5) * 0.6;
          vec2 p = gl_PointCoord - 0.5;
          p = mat2(cos(a), -sin(a), sin(a), cos(a)) * p + 0.5;
          float m = texture2D(uMap, p).r;
          float alpha = m * vAlpha;
          if (alpha < 0.003) discard;
          gl_FragColor = vec4(uColor, alpha);
          #include <fog_fragment>
        }`,
    });

    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  setViewport(height, fov) {
    this.material.uniforms.uScale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  }

  emit(p, v, { size = 0.05, grow = 0.35, life = 4, alpha = 0.35, turb = 1, mode = 0 } = {}) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.age[i] = 0;
    this.life[i] = life * (0.8 + Math.random() * 0.4);
    this.size0[i] = size;
    this.grow[i] = grow * (0.7 + Math.random() * 0.6);
    this.alpha0[i] = alpha;
    this.turb[i] = turb;
    this.mode[i] = mode;
  }

  /** 도넛 연기: dir 방향으로 날아가며 천천히 커지는 고리 */
  ring(p, dir, strength = 1) {
    const d = dir.clone().normalize();
    const a = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(d, a).normalize();
    const w = new THREE.Vector3().crossVectors(d, u).normalize();
    const n = 70, r = 0.035, pos = new THREE.Vector3(), vel = new THREE.Vector3(), rad = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      const th = (k / n) * Math.PI * 2;
      rad.copy(u).multiplyScalar(Math.cos(th)).addScaledVector(w, Math.sin(th));
      pos.copy(p).addScaledVector(rad, r);
      vel.copy(d).multiplyScalar(0.75 * strength).addScaledVector(rad, 0.1);
      vel.y += 0.03;
      this.emit(pos, vel, { size: 0.045, grow: 0.07, life: 3.6, alpha: 0.32, turb: 0.08 });
    }
  }

  /** 재: 회색 부스러기가 떨어짐 */
  ash(p, amount = 0.02) {
    const n = Math.round(4 + amount * 300);
    const v = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      v.set((Math.random() - 0.5) * 0.25, -0.1 - Math.random() * 0.3, (Math.random() - 0.5) * 0.25);
      this.emit(p, v, { size: 0.012 + Math.random() * 0.01, grow: 0, life: 2.2, alpha: 0.9, turb: 0.3, mode: 1 });
    }
  }

  /** 들숨 뒤 내뱉는 연기 한 모금 */
  puff(p, dir, strength = 1) {
    const n = Math.round(26 * strength);
    const v = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      const s = (0.5 + Math.random()) * 1.1 * strength;
      v.copy(dir).multiplyScalar(s);
      v.x += (Math.random() - 0.5) * 0.35;
      v.y += (Math.random() - 0.3) * 0.3;
      v.z += (Math.random() - 0.5) * 0.35;
      this.emit(p, v, { size: 0.08, grow: 0.5, life: 4.5, alpha: 0.11 });
    }
  }

  update(dt) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    const t = this.time;
    const drag = Math.exp(-1.6 * dt);
    for (let i = 0; i < this.max; i++) {
      const age = (this.age[i] += dt);
      const life = this.life[i];
      if (age > life) { this.alpha[i] = 0; continue; }
      const j = i * 3, s = this.seed[i] * 40;
      let vx = this.vel[j], vy = this.vel[j + 1], vz = this.vel[j + 2];
      const tb = this.turb[i];
      if (this.mode[i] === 1) {
        // 재: 중력, 바닥에 닿으면 멈춤
        vy -= 2.2 * dt;
        vx *= drag; vz *= drag;
      } else {
        // 부력 + 저주파 난류(연기가 꼬불꼬불 올라가는 느낌)
        vy += (0.22 * tb + 0.02 - vy * 0.6 * tb) * dt;
        vx += Math.sin(t * 1.3 + s + this.pos[j + 1] * 3.1) * 0.35 * tb * dt;
        vz += Math.cos(t * 1.1 + s * 1.7 + this.pos[j + 1] * 2.7) * 0.35 * tb * dt;
        const dd = tb < 0.5 ? Math.exp(-0.35 * dt) : drag;
        vx *= dd; vz *= dd;
      }
      const x = this.pos[j] + vx * dt, z = this.pos[j + 2] + vz * dt;
      let y = this.pos[j + 1] + vy * dt;
      if (this.mode[i] === 1 && y < 0.04) { y = 0.04; vx = vy = vz = 0; }
      this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
      this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
      const k = age / life;
      this.size[i] = this.size0[i] + this.grow[i] * Math.sqrt(age);
      this.alpha[i] = this.alpha0[i] * Math.min(1, age * 6) * Math.pow(1 - k, 1.6);
    }
    const a = this.geometry.attributes;
    a.position.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = true;
  }
}

function puffTexture() {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  // 둥근 그라데이션 몇 개를 겹쳐서 뭉게뭉게한 실루엣
  for (let k = 0; k < 14; k++) {
    const r = S * (0.12 + Math.random() * 0.18);
    const cx = S / 2 + (Math.random() - 0.5) * S * 0.35;
    const cy = S / 2 + (Math.random() - 0.5) * S * 0.35;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, S, S);
  }
  // 가장자리는 반드시 0으로
  const img = x.getImageData(0, 0, S, S);
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const d = Math.hypot(px - S / 2, py - S / 2) / (S / 2);
    const i = (py * S + px) * 4;
    const v = img.data[i + 3] * Math.max(0, 1 - d * d);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v * 1.6);
    img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
