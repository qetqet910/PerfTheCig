import * as THREE from 'three';

/**
 * 눈: 카메라를 따라다니는 상자 안에서 천천히 흩날리며 떨어지는 눈송이.
 * 가림막 아래로는 안 들어옴 (rain과 같은 shelters).
 */
export function createSnow(count = 2600, { shelters = [] } = {}) {
  const R = 22, TOP = 16;
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  const speed = new Float32Array(count);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));

  // 부드러운 동그란 눈송이
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.8)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uMap: { value: tex }, uScale: { value: 600 }, uOpacity: { value: 0 } }]),
    vertexShader: /* glsl */ `
      attribute float aSeed; uniform float uScale;
      varying float vA;
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = (0.03 + aSeed * 0.035) * uScale / max(-mvPosition.z, 0.1);
        vA = 0.55 + aSeed * 0.45;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform float uOpacity; varying float vA;
      #include <fog_pars_fragment>
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a * vA * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(0.92, 0.94, 0.98), a);
        #include <fog_fragment>
      }`,
  });
  const points = new THREE.Points(g, mat);
  points.frustumCulled = false;

  const floorAt = (px, pz) => {
    for (const s of shelters) if (px > s.x0 && px < s.x1 && pz > s.z0 && pz < s.z1) return s.y + 0.05;
    return 0;
  };
  const respawn = (i, cx, cz, anyY) => {
    pos[i * 3] = cx + (Math.random() * 2 - 1) * R;
    pos[i * 3 + 2] = cz + (Math.random() * 2 - 1) * R;
    pos[i * 3 + 1] = anyY ? Math.random() * TOP : TOP + Math.random() * 2;
    seed[i] = Math.random();
    speed[i] = 0.55 + Math.random() * 0.6;
  };
  let init = false, t = 0, level = 0;

  return {
    object: points,
    /** 0..1 (서서히 내리기 시작/그침) */
    set level(v) { level = v; },
    get level() { return level; },
    setViewport(height, fov) { mat.uniforms.uScale.value = height / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2)); },
    update(dt, camera) {
      mat.uniforms.uOpacity.value = level;
      points.visible = level > 0.01;
      if (!points.visible) return;
      t += dt;
      const cx = camera.position.x, cz = camera.position.z;
      if (!init) { for (let i = 0; i < count; i++) respawn(i, cx, cz, true); init = true; }
      for (let i = 0; i < count; i++) {
        const j = i * 3, s = seed[i] * 50;
        pos[j + 1] -= speed[i] * dt;
        // 바람에 하늘하늘
        pos[j] += (Math.sin(t * 0.7 + s) * 0.35 + 0.25) * dt;
        pos[j + 2] += Math.cos(t * 0.5 + s * 1.3) * 0.25 * dt;
        if (pos[j + 1] < floorAt(pos[j], pos[j + 2]) || Math.abs(pos[j] - cx) > R || Math.abs(pos[j + 2] - cz) > R) respawn(i, cx, cz, false);
      }
      g.attributes.position.needsUpdate = true;
    },
  };
}

/**
 * 날씨: 겨울이라 항상 눈. (예전엔 10분마다 비 ↔ 눈)
 * URL에 ?weather=snow / ?weather=rain 이면 고정 (테스트용).
 */
const PERIOD = 10 * 60 * 1000;
export function currentWeather(now = Date.now()) {
  const force = new URLSearchParams(location.search).get('weather');
  if (force === 'snow' || force === 'rain') return { kind: force, nextIn: Infinity };
  void now; void PERIOD;
  return { kind: 'snow', nextIn: Infinity }; // 겨울: 눈만 내림
}
