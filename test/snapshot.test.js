import { describe, it, expect } from 'vitest';
import { buildSnapshot } from '../src/lib/snapshot.js';
import { createAccount, emptyDay } from '../src/core/account.js';
import { initialSession } from '../src/core/engine.js';

const HOUR = 3600000;
const at = (y, m, d, h = 0) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();

const settings = {
  examDateMs: at(2026, 12, 20),
  startDateMs: at(2026, 9, 12),
  dailyGoalMs: 5 * HOUR,
  dailyCapMs: 8 * HOUR,
  watchdogMs: 10 * 60000,
  companionName: '小凤',
};

describe('buildSnapshot', () => {
  it('组合出 UI 需要的全部字段', () => {
    const now = at(2026, 10, 30, 12);
    const a = createAccount('2026-10-30');
    a.growthMs = 3 * HOUR;
    a.lifetimeFocusMs = 120 * HOUR;
    a.spirit = 80;
    const s = buildSnapshot(
      {
        account: a,
        daily: { '2026-10-30': { ...emptyDay(), focusMs: 2 * HOUR } },
        settings,
        session: initialSession(now),
      },
      now,
    );
    expect(s.stage.stage.name).toBe('雏鸟');
    expect(s.mood).toBe('alive');
    expect(s.today.focusMs).toBe(2 * HOUR);
    expect(s.mountain.daysLeft).toBeGreaterThan(0);
    expect(s.settings.companionName).toBe('小凤');
    expect(s.updatedAt).toBe(now);
  });

  it('当天没有记录时用空记录兜底', () => {
    const now = at(2026, 9, 12, 12);
    const s = buildSnapshot(
      { account: createAccount('2026-09-12'), daily: {}, settings, session: initialSession(now) },
      now,
    );
    expect(s.today).toEqual(emptyDay());
  });

  it('不抛异常且不改动入参', () => {
    const now = at(2026, 9, 12, 12);
    const arg = {
      account: createAccount('2026-09-12'),
      daily: {},
      settings,
      session: initialSession(now),
    };
    const snap = JSON.stringify(arg);
    expect(() => buildSnapshot(arg, now)).not.toThrow();
    expect(JSON.stringify(arg)).toBe(snap);
  });
});
