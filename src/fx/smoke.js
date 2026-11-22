import * as THREE from 'three';

/**
 * 담배 연기 파티클.
 *
 * 종류(mode)
 *   0 생연기   : 불씨에서 피어오르는 가는 연기 (푸르스름, 부력 + 난류)
 *   1 재       : 중력으로 떨어지는 부스러기
 *   2 날숨     : 입에서 뿜어지는 연기. 처음엔 빠르게 나가다(제트) 금방 느려지고,
 *                뭉게뭉게 퍼지며 천천히 말려 올라감 (희뿌연 회색)
 *
 * 날숨은 exhale({ origin, v })로 "흐름"을 만들어 여러 프레임에 걸쳐 내보낸다.
 *   v = 빤 양(0..1). 짧게 빨면 가늘고 짧게, 길게 빨면 진하고 길게.
 *   origin() 은 매 프레임 { p, d } (입 위치, 바라보는 방향)을 돌려줌 → 걸으면서 뱉어도 입을 따라감.
 *
 * 셰이더: 노이즈 텍스처 두 겹을 서로 다르게 돌려서 연기 속이 꿈틀거리게,
 *        가로등 위치 기준으로 가까울수록 밝게(빛 받은 연기).
 */
const MODE = { SMOKE: 0, ASH: 1, BREATH: 2 };

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
    this.tint = new Float32Array(max);           // 0 생연기(푸른빛) ~ 1 날숨(희뿌연)
    this.ageN = new Float32Array(max);           // 0..1 수명 진행 (셰이더 애니메이션용)
    this.turb = new Float32Array(max).fill(1);
    this.mode = new Uint8Array(max);
    this.cursor = 0;
    this.time = 0;
    this.streams = [];
    this.roof = null;

    const g = new THREE.BufferGeometry();
    const dyn = (arr, n) => new THREE.BufferAttribute(arr, n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', dyn(this.pos, 3));
    g.setAttribute('aSize', dyn(this.size, 1));
    g.setAttribute('aAlpha', dyn(this.alpha, 1));
    g.setAttribute('aTint', dyn(this.tint, 1));
    g.setAttribute('aAge', dyn(this.ageN, 1));
    g.setAttribute('aSeed', new THREE.BufferAttribute(this.seed, 1));
    this.geometry = g;

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uMap: { value: noiseTexture() },
          uScale: { value: 800 },
          uTime: { value: 0 },
          uSide: { value: new THREE.Color(0.46, 0.5, 0.6) },     // 생연기: 푸르스름
          uBreath: { value: new THREE.Color(0.66, 0.66, 0.65) }, // 날숨: 밝은 회백색
          uLampPos: { value: [new THREE.Vector3(0, -100, 0), new THREE.Vector3(0, -100, 0)] },
          uLampColor: { value: new THREE.Color(1.0, 0.82, 0.6) },
        },
      ]),
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aAlpha; attribute float aSeed; attribute float aTint; attribute float aAge;
        uniform float uScale;
        uniform vec3 uLampPos[2];
        varying float vAlpha; varying float vSeed; varying float vTint; varying float vAge; varying float vLit;
        #include <fog_pars_vertex>
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vec4 mvPosition = viewMatrix * world;
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = aSize * uScale / max(-mvPosition.z, 0.05);
          // 가로등에 가까울수록 밝게 (아래쪽 원뿔 안이면 더)
          float lit = 0.0;
          for (int i = 0; i < 2; i++) {
            vec3 d = world.xyz - uLampPos[i];
            float cone = smoothstep(-0.2, -0.75, normalize(d).y);
            lit += cone * 9.0 / (1.0 + dot(d, d) * 0.35);
          }
          vLit = lit;
          vAlpha = aAlpha; vSeed = aSeed; vTint = aTint; vAge = aAge;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform float uTime;
        uniform vec3 uSide; uniform vec3 uBreath; uniform vec3 uLampColor;
        varying float vAlpha; varying float vSeed; varying float vTint; varying float vAge; varying float vLit;
        #include <fog_pars_fragment>
        mat2 rot(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float r = length(p) * 2.0;
          // 노이즈 두 겹을 반대로 돌림 → 연기 속이 꿈틀거림
          float a = vSeed * 6.2831 + vAge * (vSeed - 0.5) * 3.0;
          float n1 = texture2D(uMap, rot(a) * p * (0.9 + vAge * 0.3) + 0.5 + vSeed).r;
          float n2 = texture2D(uMap, rot(-a * 1.3 + 1.7) * p * 1.6 + 0.5 - vSeed * 0.7).r;
          float n = n1 * 0.65 + n2 * 0.55;
          // 가장자리는 부드럽게, 나이 들수록 더 성기게(흩어짐)
          float edge = 1.0 - smoothstep(0.2, 1.0, r);
          float body = smoothstep(0.38 + vAge * 0.22, 0.95, n);
          float alpha = edge * body * body * vAlpha * 1.6;
          if (alpha < 0.003) discard;
          vec3 base = mix(uSide, uBreath, vTint);
          vec3 col = base * (0.7 + 0.3 * n) + uLampColor * vLit * 0.18 * (0.6 + n);
          gl_FragColor = vec4(col, alpha);
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

  /** 연기를 비추는 가로등 위치 (최대 2개) */
  setLamps(list) {
    list.slice(0, 2).forEach((p, i) => this.material.uniforms.uLampPos.value[i].copy(p));
  }

  emit(p, v, { size = 0.05, grow = 0.35, life = 4, alpha = 0.35, turb = 1, mode = 0, tint = 0 } = {}) {
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
    this.tint[i] = tint;
  }

  /**
   * 날숨 흐름 시작.
   * @param origin () => ({ p: Vector3, d: Vector3 })  입 위치/방향 (매 프레임 호출)
   * @param v      빤 양 0..1
   * @param nose   코로도 조금 (두 줄기, 아래로)
   */
  exhale(origin, v = 0.5, { nose = false } = {}) {
    v = THREE.MathUtils.clamp(v, 0.05, 1);
    this.streams.push({ origin, v, t: 0, dur: 0.35 + v * 1.65, acc: 0, nose, linger: 1.4 + v });
  }

  /** (호환) 한 지점에서 한 번에 내뱉기 → 고정 위치 흐름으로 */
  puff(p, dir, strength = 1) {
    const P = p.clone(), D = dir.clone().normalize();
    this.exhale(() => ({ p: P, d: D }), THREE.MathUtils.clamp((strength - 0.4) / 1.1, 0.1, 1));
  }

  /** 도넛 연기: dir 방향으로 날아가며 천천히 커지는 고리 */
  ring(p, dir, strength = 1) {
    const d = dir.clone().normalize();
    const a = Math.abs(d.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const u = new THREE.Vector3().crossVectors(d, a).normalize();
    const w = new THREE.Vector3().crossVectors(d, u).normalize();
    const n = 80, r = 0.035, pos = new THREE.Vector3(), vel = new THREE.Vector3(), rad = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      const th = (k / n) * Math.PI * 2;
      rad.copy(u).multiplyScalar(Math.cos(th)).addScaledVector(w, Math.sin(th));
      pos.copy(p).addScaledVector(rad, r);
      vel.copy(d).multiplyScalar(0.75 * strength).addScaledVector(rad, 0.1);
      vel.y += 0.03;
      pos.addScaledVector(rad, (Math.random() - 0.5) * 0.012); // 고리 두께
      this.emit(pos, vel, { size: 0.055, grow: 0.08, life: 4.0, alpha: 0.28, turb: 0.08, tint: 1 });
    }
  }

  /** 재: 회색 부스러기가 떨어짐 */
  ash(p, amount = 0.02) {
    const n = Math.min(14, Math.round(3 + amount * 150));
    const v = new THREE.Vector3();
    for (let k = 0; k < n; k++) {
      v.set((Math.random() - 0.5) * 0.25, -0.1 - Math.random() * 0.3, (Math.random() - 0.5) * 0.25);
      this.emit(p, v, { size: 0.012 + Math.random() * 0.01, grow: 0, life: 2.2, alpha: 0.9, turb: 0.3, mode: MODE.ASH, tint: 0.6 });
    }
  }

  updateStreams(dt) {
    const v3 = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const s of this.streams) {
      s.t += dt;
      const { p, d } = s.origin();
      if (s.t < s.dur) {
        // f: 처음엔 세게, 끝으로 갈수록 약하게 (폐에서 다 빠져나가는 느낌)
        const k = s.t / s.dur;
        const f = Math.pow(1 - k, 0.7) * Math.min(1, s.t / 0.06);
        s.acc += dt * (48 + 82 * s.v) * f;
        side.crossVectors(d, up).normalize();
        while (s.acc > 1) {
          s.acc -= 1;
          const speed = (0.8 + 1.8 * s.v) * (0.35 + 0.65 * f) * (0.7 + Math.random() * 0.6);
          v3.copy(d).multiplyScalar(speed);
          // 원뿔 모양으로 살짝 퍼지게
          const spread = 0.2 + 0.16 * (1 - f);
          v3.addScaledVector(side, (Math.random() - 0.5) * spread * 2);
          v3.y += (Math.random() - 0.5) * spread * 1.5;
          this.emit(p, v3, {
            size: 0.07 + 0.035 * s.v, grow: 0.56 + 0.4 * s.v, life: 5 + 3.5 * s.v,
            alpha: (0.042 + 0.032 * s.v) * (0.55 + 0.45 * f), turb: 1.3, mode: MODE.BREATH, tint: 1,
          });
        }
        // 코로도 (두 줄기, 아래로 가늘게)
        if (s.nose && Math.random() < dt * 35 * f) {
          for (const sx of [-1, 1]) {
            const np = v3.copy(p).addScaledVector(side, sx * 0.012);
            np.y += 0.035;
            const nv = d.clone().multiplyScalar(0.25).add(new THREE.Vector3(0, -0.35, 0)).addScaledVector(side, sx * 0.05);
            this.emit(np, nv, { size: 0.035, grow: 0.3, life: 3.8, alpha: 0.05, turb: 0.8, mode: MODE.BREATH, tint: 1 });
          }
        }
      } else if (s.t < s.dur + s.linger) {
        // 다 뱉은 뒤 입가에 남는 잔연기
        const k = (s.t - s.dur) / s.linger;
        if (Math.random() < dt * 18 * (1 - k) * (0.3 + s.v)) {
          v3.set((Math.random() - 0.5) * 0.03, 0.05 + Math.random() * 0.03, (Math.random() - 0.5) * 0.03).addScaledVector(d, 0.03);
          this.emit(p, v3, { size: 0.04, grow: 0.3, life: 3.2, alpha: 0.04 + 0.025 * s.v, turb: 1, mode: MODE.BREATH, tint: 1 });
        }
      }
    }
    this.streams = this.streams.filter((s) => s.t < s.dur + s.linger);
  }

  update(dt) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    this.updateStreams(dt);
    const t = this.time;
    const drag = Math.exp(-1.6 * dt);
    const R = this.roof;
    for (let i = 0; i < this.max; i++) {
      const age = (this.age[i] += dt);
      const life = this.life[i];
      if (age > life) { this.alpha[i] = 0; continue; }
      const j = i * 3, s = this.seed[i] * 40;
      let vx = this.vel[j], vy = this.vel[j + 1], vz = this.vel[j + 2];
      const tb = this.turb[i];
      const mode = this.mode[i];
      const px = this.pos[j], py = this.pos[j + 1], pz = this.pos[j + 2];
      if (mode === MODE.ASH) {
        vy -= 2.2 * dt;
        vx *= drag; vz *= drag;
      } else {
        // 소용돌이 느낌의 저주파 난류 (위치·시간에 따라 방향이 꼬임)
        const cx = Math.sin(py * 3.1 + t * 1.3 + s) + Math.cos(pz * 2.3 - t * 0.9 + s * 0.7);
        const cz = Math.cos(py * 2.7 + t * 1.1 + s * 1.7) + Math.sin(px * 2.1 + t * 0.8 - s);
        const cy = Math.sin(px * 1.7 + pz * 1.9 + t * 0.6 + s) * 0.5;
        if (mode === MODE.BREATH) {
          // 날숨: 입에서 나온 제트가 공기 저항으로 금방 느려짐 → 그 뒤 천천히 뜨며 퍼짐
          const jet = Math.exp(-(2.4 - Math.min(age, 1.2) * 1.3) * dt);
          vx *= jet; vy *= jet; vz *= jet;
          vy += (0.07 - vy * 0.25) * dt * Math.min(1, age * 1.5);
          const k = 0.32 * tb * Math.min(1, age * 1.5);
          vx += cx * k * dt; vz += cz * k * dt; vy += cy * k * dt;
        } else {
          vy += (0.22 * tb + 0.02 - vy * 0.6 * tb) * dt;
          vx += cx * 0.18 * tb * dt;
          vz += cz * 0.18 * tb * dt;
          const dd = tb < 0.5 ? Math.exp(-0.35 * dt) : drag;
          vx *= dd; vz *= dd;
        }
      }
      const x = px + vx * dt, z = pz + vz * dt;
      let y = py + vy * dt;
      if (mode === MODE.ASH && y < 0.04) { y = 0.04; vx = vy = vz = 0; }
      // 가림막 밑에 고였다가 옆으로 빠짐
      if (R && mode !== MODE.ASH && x > R.x0 && x < R.x1 && z > R.z0 && z < R.z1) {
        const ceil = R.y - z * 0.06 - 0.12;
        if (y > ceil) { y = ceil; vy = Math.min(vy, 0) * 0.2; vx += (Math.random() - 0.5) * 0.25 * dt; }
      }
      this.pos[j] = x; this.pos[j + 1] = y; this.pos[j + 2] = z;
      this.vel[j] = vx; this.vel[j + 1] = vy; this.vel[j + 2] = vz;
      const k = age / life;
      this.ageN[i] = k;
      if (mode === MODE.BREATH) {
        // 날숨: 처음 0.15초 진하게 → 길게 옅어지며 커짐
        this.size[i] = this.size0[i] + this.grow[i] * Math.pow(age, 0.6);
        this.alpha[i] = this.alpha0[i] * Math.min(1, age * 10) * Math.pow(1 - k, 1.3);
      } else {
        this.size[i] = this.size0[i] + this.grow[i] * Math.sqrt(age);
        this.alpha[i] = this.alpha0[i] * Math.min(1, age * 6) * Math.pow(1 - k, 1.6);
      }
    }
    const a = this.geometry.attributes;
    a.position.needsUpdate = a.aSize.needsUpdate = a.aAlpha.needsUpdate = a.aTint.needsUpdate = a.aAge.needsUpdate = true;
  }
}

/** 타일링되는 fbm 값 노이즈 (연기 결) */
function noiseTexture() {
  const S = 128;
  const grid = (n) => {
    const g = new Float32Array(n * n);
    for (let i = 0; i < g.length; i++) g[i] = Math.random();
    return (x, y) => {
      const xi = Math.floor(x) % n, yi = Math.floor(y) % n, xf = x - Math.floor(x), yf = y - Math.floor(y);
      const at = (a, b) => g[((b + n) % n) * n + ((a + n) % n)];
      const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
      const top = at(xi, yi) * (1 - sx) + at(xi + 1, yi) * sx;
      const bot = at(xi, yi + 1) * (1 - sx) + at(xi + 1, yi + 1) * sx;
      return top * (1 - sy) + bot * sy;
    };
  };
  const octs = [[4, 0.5], [8, 0.25], [16, 0.15], [32, 0.1]].map(([f, w]) => ({ f, w, n: grid(f) }));
  const data = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (const o of octs) v += o.n((x / S) * o.f, (y / S) * o.f) * o.w;
    v = Math.min(1, Math.max(0, (v - 0.25) * 1.6));
    const i = (y * S + x) * 4;
    data[i] = data[i + 1] = data[i + 2] = v * 255;
    data[i + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
