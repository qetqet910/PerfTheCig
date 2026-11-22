import * as THREE from 'three';

export const FONT = "'Pretendard','Apple SD Gothic Neo','Malgun Gothic',sans-serif";

export function hash2(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Canvas -> sRGB texture */
export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** 말풍선 */
export function bubbleTexture(text) {
  const font = `600 40px ${FONT}`;
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = font;
  const tw = Math.ceil(meas.measureText(text).width);
  const W = tw + 56, H = 92;
  return canvasTexture(W, H, (x) => {
    x.fillStyle = 'rgba(250,250,252,0.94)';
    x.beginPath();
    x.roundRect(2, 2, W - 4, H - 22, 26);
    x.moveTo(W / 2 - 12, H - 21);
    x.lineTo(W / 2, H - 4);
    x.lineTo(W / 2 + 12, H - 21);
    x.fill();
    x.fillStyle = '#16181d';
    x.font = font;
    x.textBaseline = 'middle';
    x.fillText(text, 28, (H - 20) / 2 + 2);
  });
}

/** 머리 위 닉네임 */
export function nameTexture(text, color = '#ffffff') {
  const font = `700 34px ${FONT}`;
  const meas = document.createElement('canvas').getContext('2d');
  meas.font = font;
  const tw = Math.ceil(meas.measureText(text).width);
  const W = tw + 40, H = 56;
  return canvasTexture(W, H, (x) => {
    x.fillStyle = 'rgba(8,10,16,0.55)';
    x.beginPath();
    x.roundRect(0, 0, W, H, 14);
    x.fill();
    x.fillStyle = color;
    x.beginPath();
    x.arc(16, H / 2, 6, 0, 7);
    x.fill();
    x.fillStyle = '#f2f4f8';
    x.font = font;
    x.textBaseline = 'middle';
    x.fillText(text, 30, H / 2 + 2);
  });
}
