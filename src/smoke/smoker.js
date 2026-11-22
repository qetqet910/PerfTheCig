import { PAPER } from './props.js';

/**
 * 내 흡연 상태 머신 (렌더링과 무관한 순수 로직).
 *
 * 기기 3종 (device)
 *   'cig'   궐련     none ─물기→ lighting ─(라이터 불 + 빨기)→ lit ─다 탐→ done ─버리기→ none
 *                   라이터는 가끔 안 켜지고(비 오면 더), 불 대고 빨아야 붙음. 재가 쌓이고 털어야 함.
 *   'heat'  궐련형   none ─스틱 꽂기→ lighting(예열 HEAT_TIME초, 끝나면 징-) → lit ─14모금 또는 6분→ done ─스틱 빼기→ none
 *                   불·재 없음. 연기(증기)는 적고 금방 사라짐.
 *   'vape'  액상     none ─꺼내기→ lit (바로 사용) ─액상 다 쓰면→ done ─채우기→ lit / lit에서 넣기→ none
 *                   꽁초·재 없음. 증기가 아주 많음.
 *
 * 이벤트는 on(name, data) 콜백으로 밖에 알림 → 오디오/네트워크/HUD/연출
 */
export const PACK_SIZE = 20;
const BASE_BURN = 1 / 420;   // 궐련: 가만히 둬도 7분이면 다 탐
const DRAG_BURN = 1 / 11;    // 궐련: 빨 때 추가로 타는 속도
const ASH_DROP = 0.024;      // 재가 이만큼(m) 쌓이면 저절로 떨어짐
const COUGH_AT = { cig: 2.9, heat: 3.2, vape: 3.8 }; // 이 이상 연속으로 빨면 콜록
const IGNITE_TIME = 0.9;     // 불꽃 대고 이만큼 빨아야 붙음
const FLAME_HOT = 5;         // 안 빨고 라이터를 이만큼 켜두면 뜨거워서 놓침
export const HEAT_TIME = 6;  // 궐련형 예열
export const HEAT_PUFFS = 14;
const HEAT_SESSION = 360;
const VAPE_USE = 1 / 90;     // 액상: 빠는 1초당 소모량 (90초 분량)

export const CIG = { NONE: 0, LIGHTING: 1, LIT: 2, DONE: 3 };
export const DEVICES = {
  cig: { code: 0, name: '궐련' },
  heat: { code: 1, name: '궐련형 전자담배' },
  vape: { code: 2, name: '액상 전자담배' },
};

export class Smoker {
  constructor(on = () => {}, device = 'cig') {
    this.on = on;
    this.device = device;
    this.state = 'none';
    this.pack = PACK_SIZE;   // 궐련/스틱 갑
    this.liquid = 1;         // 액상 잔량
    this.today = 0;
    this.len = 1;
    this.ash = 0;
    this.inhale = 0;
    this.inhaleTime = 0;
    this.holding = null; // 'puff' | 'ring' | null
    this.lightT = 0;
    this.lightTries = 0;
    this.nextStrike = 0;
    this.lastStrike = -9;
    this.flame = false;   // 라이터 불꽃 켜짐
    this.flameT = 0;
    this.igniteP = 0;     // 불 붙는 진행도 0..1
    this.heatT = 0;       // 궐련형 예열 진행
    this.puffs = 0;       // 궐련형 모금 수
    this.litT = 0;
    this.coughUntil = 0;
    this.t = 0;
  }

  get code() { return { none: CIG.NONE, lighting: CIG.LIGHTING, lit: CIG.LIT, done: CIG.DONE }[this.state]; }
  get canInhale() {
    if (this.t < this.coughUntil) return false;
    if (this.state === 'lit') return true;
    return this.state === 'lighting' && this.device === 'cig'; // 궐련은 불 붙일 때도 빨아야 함
  }

  /** 기기 바꾸기 (손에 아무것도 없을 때만) */
  setDevice(d) {
    if (this.state !== 'none' || !DEVICES[d]) return false;
    this.device = d;
    this.on('device', { device: d });
    return true;
  }

  /** 좌클릭/G: 상황에 따라 꺼내기/버리기/빌리기/채우기 */
  context(ctx) {
    const dev = this.device;
    if (this.state === 'none') {
      if (dev === 'vape') {
        this.state = 'lit';
        this.len = this.liquid;
        this.litT = 0;
        this.on('vapeOn', {});
        if (this.liquid <= 0) this.state = 'done';
        return;
      }
      if (this.pack > 0) {
        this.pack--;
        this.state = 'lighting';
        this.len = 1; this.ash = 0;
        this.lightT = 0; this.lightTries = 0; this.nextStrike = 0.35;
        this.flame = false; this.flameT = 0; this.igniteP = 0;
        this.heatT = 0; this.puffs = 0; this.litT = 0;
        this.on(dev === 'heat' ? 'insert' : 'takeout', { pack: this.pack });
      } else if (ctx.borrowFrom) {
        this.pack++;
        this.on('borrow', { from: ctx.borrowFrom });
      } else {
        this.on('empty', {});
      }
    } else if (dev === 'vape') {
      if (this.state === 'done') { // 액상 채우기
        this.liquid = 1; this.len = 1; this.state = 'lit';
        this.on('refill', {});
      } else {
        this.state = 'none';
        this.holding = null;
        this.inhale = 0;
        this.on('vapeOff', {});
      }
    } else if (this.state === 'lit' || this.state === 'done') {
      const inTray = ctx.ashtrayDist < 1.1;
      this.state = 'none';
      this.holding = null;
      this.inhale = 0;
      this.today++;
      this.on('butt', { inTray, wasted: this.len, tray: ctx.trayIdx, device: dev });
    }
  }

  /** 피우던 담배를 남(눈사람 등)에게 넘김: 꽁초 없이 손에서 사라짐 */
  giveAway() {
    if (this.state === 'none') return false;
    this.state = 'none';
    this.holding = null;
    this.inhale = 0;
    this.on('giveaway', {});
    return true;
  }

  press(kind) { if (this.canInhale) { this.holding = kind; this.inhaleTime = 0; } }

  release(kind) {
    if (this.holding !== kind) return;
    this.holding = null;
    if (this.state === 'lit' && this.inhale > 0.22) this.exhale(kind === 'ring' && this.inhale > 0.45 ? 'ring' : 'puff', this.inhale, this.inhaleTime);
    this.inhale = 0;
  }

  /** 내뱉기 이벤트 (연기 양 v = 빤 시간, 기기별 증기량 반영) */
  exhale(type, inhale, time, extra = {}) {
    const v = Math.min(1, Math.max(0.08, time / 2.4));
    if (this.device === 'heat') this.puffs++;
    this.on('exhale', { type, k: 0.55 + inhale * 0.9, v, nose: v > 0.6 && Math.random() < 0.35, device: this.device, ...extra });
  }

  /** 묘기용: 빨기 없이 바로 한 모금 분량 소모 (lit일 때만) */
  takeDrag(seconds = 1.2) {
    if (this.state !== 'lit' || !this.canInhale || this.holding) return false;
    if (this.device === 'cig') { this.len -= seconds * DRAG_BURN; this.ash += seconds * DRAG_BURN * PAPER; }
    else if (this.device === 'heat') this.puffs++;
    else this.liquid = Math.max(0, this.liquid - seconds * VAPE_USE);
    return true;
  }

  flick() {
    if (this.state !== 'lit' || this.device !== 'cig') return;
    if (this.ash < 0.003) { this.on('tapEmpty', {}); return; }
    this.on('ash', { amount: this.ash, flicked: true });
    this.ash = 0;
  }

  update(dt, { raining = false } = {}) {
    this.t += dt;
    const dev = this.device;
    if (this.state === 'lighting') {
      if (dev === 'heat') {
        this.heatT += dt;
        if (this.heatT >= HEAT_TIME) { this.state = 'lit'; this.litT = 0; this.on('ready', {}); }
        return;
      }
      this.lightT += dt;
      if (!this.flame) {
        // 딸깍: 꺼내고 0.35s 뒤, 실패하면 0.45s마다 다시
        if (this.lightT >= this.nextStrike) {
          this.lightTries++;
          this.lastStrike = this.t;
          const p = raining ? 0.45 : 0.72;
          const ok = Math.random() < p || this.lightTries >= 5;
          this.on('click', { ok });
          this.nextStrike = this.lightT + 0.45;
          if (ok) { this.flame = true; this.flameT = 0; this.lightTries = 0; this.on('flame', {}); }
        }
        if (this.holding) this.inhale = Math.min(0.3, this.inhale + dt / 1.5); // 불 없이 빨면 헛빨기
        return;
      }
      this.flameT += dt;
      if (this.holding && this.t > this.coughUntil) {
        this.inhale = Math.min(1, this.inhale + dt / 1.5);
        this.igniteP += dt / IGNITE_TIME;
        if (this.igniteP >= 1) {
          this.state = 'lit';
          this.flame = false;
          this.inhaleTime = 0; // 계속 빨고 있으면 그대로 첫 모금
          this.on('lit', {});
        }
      } else {
        this.igniteP = Math.max(0, this.igniteP - dt * 0.6);
        if (this.flameT > FLAME_HOT) {
          this.flame = false;
          this.nextStrike = this.lightT + 0.8;
          this.on('flameOut', {});
        }
      }
      return;
    }
    if (this.state !== 'lit') return;
    this.litT += dt;

    const drag = this.holding && this.canInhale;
    if (drag) {
      this.inhale = Math.min(1, this.inhale + dt / 1.5);
      this.inhaleTime += dt;
      if (this.inhaleTime > COUGH_AT[dev]) {
        this.holding = null;
        this.inhale = 0;
        this.coughUntil = this.t + 1.6;
        this.on('cough', {});
      }
    }
    if (dev === 'cig') {
      const burned = dt * (BASE_BURN + (drag ? DRAG_BURN : 0));
      this.len -= burned;
      this.ash += burned * PAPER;
      if (this.ash > ASH_DROP) { this.on('ash', { amount: this.ash, flicked: false }); this.ash = 0; }
    } else if (dev === 'heat') {
      // 모금 수(진행 중인 모금 포함) 또는 시간 중 먼저 다 되는 쪽
      const puffing = drag ? Math.min(1, this.inhaleTime / 1.2) : 0;
      this.len = 1 - Math.max((this.puffs + puffing) / HEAT_PUFFS, this.litT / HEAT_SESSION);
    } else {
      if (drag) this.liquid = Math.max(0, this.liquid - dt * VAPE_USE);
      this.len = this.liquid;
    }
    if (this.len <= 0) {
      this.len = 0;
      // 마지막 모금: 빨던 중이었으면 들이마신 만큼 내뱉고 끝
      const lastKind = this.holding;
      const lastInhale = this.inhale, lastTime = this.inhaleTime;
      this.state = 'done';
      this.holding = null;
      this.inhale = 0;
      this.on(dev === 'vape' ? 'liquidEmpty' : dev === 'heat' ? 'heatEnd' : 'finished', {});
      if (lastKind && lastInhale > 0.12) {
        const v = Math.min(1, Math.max(0.08, lastTime / 2.4));
        this.on('exhale', { type: 'puff', k: 0.55 + lastInhale * 0.9, v, nose: false, last: true, device: dev });
      }
    }
  }
}
