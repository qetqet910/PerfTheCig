import * as THREE from 'three';

/** 서울 밤하늘: 별은 거의 없고 지평선이 광공해로 탁하게 밝음 */
export function createSky(fogColor) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uZenith: { value: new THREE.Color(0x04060c) },
      uHorizon: { value: fogColor.clone() },
      uGlow: { value: new THREE.Color(0x3a2a24) },
    },
    vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uZenith, uHorizon, uGlow; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(uHorizon, uZenith, pow(h, 0.45));
        c += uGlow * exp(-h * 9.0) * 0.8;
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
  sky.renderOrder = -1;
  return sky;
}
