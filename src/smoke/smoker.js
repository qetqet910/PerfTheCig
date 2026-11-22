import { PAPER } from './props.js';

/**
 * 내 흡연 상태 머신 (렌더링과 무관한 순수 로직).
 *
 *   none ──G──▶ lighting ──성공──▶ lit ──다 탐──▶ done ──G──▶ none
 *                  │ (가끔 안 켜짐, 비 오면 더 자주)        ▲
 *                  └──────── 재시도 ────────┘              │ G(끄고 버리기)
 *
 * 입력: E/좌클릭 꾹 = 빨기, Q/우클릭 꾹 = 도넛용으로 빨기, X = 재 털기
 * 이벤트는 on(name, data) 콜백으로 밖에 알림 → 오디오/네트워크/HUD/연출
 */
export const PACK_SIZE = 20;
const BASE_BURN = 1 / 420;   // 가만히 둬도 7분이면 다 탐
const DRAG_BURN = 1 / 11;    // 빨 때 추가로 타는 속도
const ASH_DROP = 0.024;      // 재가 이만큼(m) 쌓이면 저절로 떨어짐
const COUGH_AT = 2.9;        // 이 이상 연속으로 빨면 콜록

export const CIG = { NONE: 0, LIGHTING: 1, LIT: 2, DONE: 3 };

export class Smoker {
  constructor(on = () => {}) {
    this.on = on;
    this.state = 'none';
    this.pack = PACK_SIZE;
    this.today = 0;
    this.len = 1;
    this.ash = 0;
    this.inhale = 0;
    this.inhaleTime = 0;
    this.holding = null; // 'puff' | 'ring' | null
    this.lightT = 0;
    this.lightTries = 0;
    this.lightOkAt = -1;
    this.coughUntil = 0;
    this.t = 0;
  }

  get code() { return { none: CIG.NONE, lighting: CIG.LIGHTING, lit: CIG.LIT, done: CIG.DONE }[this.state]; }
  get canInhale() { return this.state === 'lit' && this.t > this.coughUntil; }

  /** G: 상황에 따라 꺼내기/불붙이기/버리기/빌리기 */
  context(ctx) {
    if (this.state === 'none') {
      if (this.pack > 0) {
        this.pack--;
        this.state = 'lighting';
        this.len = 1; this.ash = 0;
        this.lightT = 0; this.lightTries = 0; this.lightOkAt = -1;
        this.on('takeout', { pack: this.pack });
      } else if (ctx.borrowFrom) {
        this.pack++;
        this.on('borrow', { from: ctx.borrowFrom });
      } else {
        this.on('empty', {});
      }
    } else if (this.state === 'lit' || this.state === 'done') {
      const inTray = ctx.ashtrayDist < 1.1;
      this.state = 'none';
      this.holding = null;
      this.inhale = 0;
      this.today++;
      this.on('butt', { inTray, wasted: this.len });
    }
  }

  press(kind) { if (this.canInhale) { this.holding = kind; this.inhaleTime = 0; } }

  release(kind) {
    if (this.holding !== kind) return;
    this.holding = null;
    if (this.inhale > 0.22) {
      const type = kind === 'ring' && this.inhale > 0.45 ? 'ring' : 'puff';
      this.on('exhale', { type, k: 0.55 + this.inhale * 0.9 });
    }
    this.inhale = 0;
  }

  flick() {
    if (this.state !== 'lit' || this.ash < 0.003) return;
    this.on('ash', { amount: this.ash, flicked: true });
    this.ash = 0;
  }

  update(dt, { raining = false } = {}) {
    this.t += dt;
    if (this.state === 'lighting') {
      this.lightT += dt;
      // 딸깍: 0.35s, 이후 실패하면 0.45s마다 다시
      const nextClick = 0.35 + this.lightTries * 0.45;
      if (this.lightOkAt < 0 && this.lightT >= nextClick) {
        this.lightTries++;
        const p = raining ? 0.45 : 0.72;
        const ok = Math.random() < p || this.lightTries >= 5;
        this.on('click', { ok });
        if (ok) this.lightOkAt = this.lightT;
      }
      if (this.lightOkAt >= 0 && this.lightT - this.lightOkAt > 0.7) {
        this.state = 'lit';
        this.on('lit', {});
      }
      return;
    }
    if (this.state !== 'lit') return;

    const drag = this.holding && this.canInhale;
    if (drag) {
      this.inhale = Math.min(1, this.inhale + dt / 1.5);
      this.inhaleTime += dt;
      if (this.inhaleTime > COUGH_AT) {
        this.holding = null;
        this.inhale = 0;
        this.coughUntil = this.t + 1.6;
        this.on('cough', {});
      }
    }
    const burned = dt * (BASE_BURN + (drag ? DRAG_BURN : 0));
    this.len -= burned;
    this.ash += burned * PAPER;
    if (this.ash > ASH_DROP) { this.on('ash', { amount: this.ash, flicked: false }); this.ash = 0; }
    if (this.len <= 0) {
      this.len = 0;
      this.state = 'done';
      this.holding = null;
      this.inhale = 0;
      this.on('finished', {});
    }
  }
}
