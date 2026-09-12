import { describe, it, expect } from 'vitest';
import { STATUS, initialSession, step } from '../src/core/engine.js';

const MIN = 60 * 1000;
const T0 = new Date(2026, 8, 12, 10, 0, 0, 0).getTime();

const base = { now: T0, classification: 'study', focused: true, idle: false };

describe('initialSession', () => {
  it('从 IDLE 开始', () => {
    const s = initialSession(T0);
    expect(s).toEqual({
      status: STATUS.IDLE, startedAt: null, lastActivityAt: null, lastSettledAt: T0,
    });
  });
});

describe('step — 进入专注', () => {
  it('学习内容 + 有焦点 + 未超时 → FOCUSING，首帧不计分', () => {
    const r = step(initialSession(T0), base);
    expect(r.session.status).toBe(STATUS.FOCUSING);
    expect(r.focusMs).toBe(0);
    expect(r.session.startedAt).toBe(T0);
    expect(r.penalties).toBe(0);
    expect(r.distractions).toBe(0);
  });

  it('连续两次 tick，第二次整段计分', () => {
    const first = step(initialSession(T0), base);
    const second = step(first.session, { ...base, now: T0 + MIN });
    expect(second.focusMs).toBe(MIN);
    expect(second.fromMs).toBe(T0);
    expect(second.toMs).toBe(T0 + MIN);
    expect(second.session.status).toBe(STATUS.FOCUSING);
  });
});

describe('step — 暂停与恢复', () => {
  it('切到中性站点 → PAUSED_AWAY，暂停期间不计分', () => {
    const focusing = step(initialSession(T0), base).session;
    const paused = step(focusing, { ...base, now: T0 + MIN, classification: 'neutral' });
    expect(paused.session.status).toBe(STATUS.PAUSED_AWAY);
    expect(paused.focusMs).toBe(MIN);

    const stillPaused = step(paused.session, { ...base, now: T0 + 5 * MIN, classification: 'neutral' });
    expect(stillPaused.focusMs).toBe(0);

    const resumed = step(stillPaused.session, { ...base, now: T0 + 6 * MIN });
    expect(resumed.session.status).toBe(STATUS.FOCUSING);
    expect(resumed.focusMs).toBe(0);
  });

  it('Edge 失去焦点 → PAUSED_AWAY', () => {
    const focusing = step(initialSession(T0), base).session;
    const r = step(focusing, { ...base, now: T0 + MIN, focused: false });
    expect(r.session.status).toBe(STATUS.PAUSED_AWAY);
    expect(r.focusMs).toBe(MIN);
  });

  it('Edge 失焦且是分心站点时，走分心而非离开', () => {
    const focusing = step(initialSession(T0), base).session;
    const r = step(focusing, { ...base, now: T0 + MIN, focused: false, classification: 'distract' });
    expect(r.session.status).toBe(STATUS.PAUSED_AWAY);
    expect(r.distractions).toBe(0);
  });
});

describe('step — 走神', () => {
  it('切到分心站点记一次走神，且暂停期间不再重复记', () => {
    const focusing = step(initialSession(T0), base).session;
    const d1 = step(focusing, { ...base, now: T0 + MIN, classification: 'distract' });
    expect(d1.session.status).toBe(STATUS.PAUSED_DISTRACTED);
    expect(d1.distractions).toBe(1);
    expect(d1.focusMs).toBe(MIN);

    const d2 = step(d1.session, { ...base, now: T0 + 2 * MIN, classification: 'distract' });
    expect(d2.distractions).toBe(0);
    expect(d2.focusMs).toBe(0);
  });

  it('回到学习内容后再次分心，再记一次', () => {
    const focusing = step(initialSession(T0), base).session;
    const d1 = step(focusing, { ...base, now: T0 + MIN, classification: 'distract' });
    const back = step(d1.session, { ...base, now: T0 + 2 * MIN });
    const d2 = step(back.session, { ...base, now: T0 + 3 * MIN, classification: 'distract' });
    expect(d2.distractions).toBe(1);
  });
});

describe('step — 看门狗', () => {
  it('专注中 idle → 扣一次分并进入 WAITING_ACTIVITY', () => {
    const focusing = step(initialSession(T0), base).session;
    const r = step(focusing, { ...base, now: T0 + MIN, idle: true });
    expect(r.session.status).toBe(STATUS.WAITING_ACTIVITY);
    expect(r.penalties).toBe(1);
    expect(r.focusMs).toBe(MIN);
  });

  it('WAITING_ACTIVITY 期间不计分、不重复扣分', () => {
    const focusing = step(initialSession(T0), base).session;
    const timedOut = step(focusing, { ...base, now: T0 + MIN, idle: true }).session;
    const later = step(timedOut, { ...base, now: T0 + 20 * MIN, idle: true });
    expect(later.penalties).toBe(0);
    expect(later.focusMs).toBe(0);
    expect(later.session.status).toBe(STATUS.WAITING_ACTIVITY);
  });

  it('idle 解除后恢复 FOCUSING', () => {
    const focusing = step(initialSession(T0), base).session;
    const timedOut = step(focusing, { ...base, now: T0 + MIN, idle: true }).session;
    const resumed = step(timedOut, { ...base, now: T0 + 21 * MIN, idle: false });
    expect(resumed.session.status).toBe(STATUS.FOCUSING);
    expect(resumed.focusMs).toBe(0);
  });

  it('非专注状态下 idle 不扣分', () => {
    const paused = step(initialSession(T0), { ...base, classification: 'neutral' }).session;
    const r = step(paused, { ...base, now: T0 + MIN, classification: 'neutral', idle: true });
    expect(r.penalties).toBe(0);
    expect(r.focusMs).toBe(0);
  });

  it('idle 且已切到分心站点时，判为分心而非超时', () => {
    const focusing = step(initialSession(T0), base).session;
    const r = step(focusing, { ...base, now: T0 + MIN, classification: 'distract', idle: true });
    expect(r.penalties).toBe(1);
    expect(r.session.status).toBe(STATUS.PAUSED_DISTRACTED);
    expect(r.distractions).toBe(1);
  });
});

describe('step — 切走惩罚（awayPenalties）', () => {
  const focusing = () => step(initialSession(T0), base).session;

  it('切到中性站点记一次切走', () => {
    const r = step(focusing(), { ...base, now: T0 + MIN, classification: 'neutral' });
    expect(r.awayPenalties).toBe(1);
    expect(r.session.status).toBe(STATUS.PAUSED_AWAY);
  });

  it('切到分心站点记一次切走（与走神计数独立）', () => {
    const r = step(focusing(), { ...base, now: T0 + MIN, classification: 'distract' });
    expect(r.awayPenalties).toBe(1);
    expect(r.distractions).toBe(1);
  });

  it('切到别的程序（失焦）记一次切走', () => {
    const r = step(focusing(), { ...base, now: T0 + MIN, focused: false });
    expect(r.awayPenalties).toBe(1);
  });

  it('一直专注不记切走', () => {
    const r = step(focusing(), { ...base, now: T0 + MIN });
    expect(r.awayPenalties).toBe(0);
  });

  it('超时不重复记切走——那条已经扣了 10 分钟', () => {
    const r = step(focusing(), { ...base, now: T0 + MIN, idle: true });
    expect(r.penalties).toBe(1);
    expect(r.awayPenalties).toBe(0);
    expect(r.session.status).toBe(STATUS.WAITING_ACTIVITY);
  });

  it('从暂停态恢复专注不记切走', () => {
    const paused = step(focusing(), { ...base, now: T0 + MIN, classification: 'neutral' }).session;
    const resumed = step(paused, { ...base, now: T0 + 2 * MIN });
    expect(resumed.awayPenalties).toBe(0);
    expect(resumed.session.status).toBe(STATUS.FOCUSING);
  });

  it('本来就处于暂停态不会持续记切走', () => {
    let s = step(focusing(), { ...base, now: T0 + MIN, classification: 'neutral' }).session;
    const second = step(s, { ...base, now: T0 + 2 * MIN, classification: 'neutral' });
    const third = step(second.session, { ...base, now: T0 + 3 * MIN, classification: 'neutral' });
    expect(second.awayPenalties).toBe(0);
    expect(third.awayPenalties).toBe(0);
  });

  it('从未开始学习就切窗口不算切走', () => {
    const r = step(initialSession(T0), { ...base, now: T0 + MIN, focused: false });
    expect(r.awayPenalties).toBe(0);
  });

  it('学习外名单下失焦只记一次，不叠加', () => {
    const r = step(focusing(), { ...base, now: T0 + MIN, focused: false, classification: 'distract' });
    expect(r.awayPenalties).toBe(1);
    expect(r.distractions).toBe(0);
  });
});

describe('step — 不变量', () => {
  it('focusMs 非零时必等于区间长度', () => {
    const focusing = step(initialSession(T0), base).session;
    const r = step(focusing, { ...base, now: T0 + 7 * MIN + 123 });
    expect(r.focusMs).toBe(r.toMs - r.fromMs);
  });

  it('不改动入参对象', () => {
    const s = initialSession(T0);
    const snapshot = JSON.stringify(s);
    step(s, base);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('时间倒流时不产生负计分', () => {
    const focusing = step(initialSession(T0), base).session;
    const r = step(focusing, { ...base, now: T0 - MIN });
    expect(r.focusMs).toBe(0);
  });
});
