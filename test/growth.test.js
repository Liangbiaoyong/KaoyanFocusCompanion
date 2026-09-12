import { describe, it, expect } from 'vitest';
import { STAGES, stageFor, mountain, spiritMood } from '../src/core/growth.js';

const HOUR = 3600000;
const at = (y, m, d, h = 0) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();

describe('STAGES', () => {
  it('12 级且阈值严格递增', () => {
    expect(STAGES).toHaveLength(12);
    for (let i = 1; i < STAGES.length; i += 1) {
      expect(STAGES[i].hours).toBeGreaterThan(STAGES[i - 1].hours);
    }
  });

  it('阈值与 spec 一致', () => {
    expect(STAGES.map((s) => s.hours)).toEqual([0, 0.5, 2, 6, 14, 26, 44, 70, 105, 150, 210, 300]);
  });

  it('首级为蛋，末级为凤凰', () => {
    expect(STAGES[0].name).toBe('蛋');
    expect(STAGES[11].name).toBe('凤凰');
  });
});

describe('stageFor', () => {
  it('0 小时是第 1 级', () => {
    expect(stageFor(0).index).toBe(0);
    expect(stageFor(0).stage.name).toBe('蛋');
  });

  it('恰好到阈值即升级', () => {
    expect(stageFor(2 * HOUR).index).toBe(2);
    expect(stageFor(2 * HOUR).stage.name).toBe('雏鸟');
  });

  it('差 1 毫秒不到阈值仍是上一级', () => {
    expect(stageFor(2 * HOUR - 1).index).toBe(1);
  });

  it('progress 在级内线性', () => {
    const r = stageFor(1 * HOUR); // 0.5h → 2h 区间的中点
    expect(r.index).toBe(1);
    expect(r.progress).toBeCloseTo(1 / 3, 5);
  });

  it('满级 progress 为 1 且 next 为 null', () => {
    const r = stageFor(500 * HOUR);
    expect(r.index).toBe(11);
    expect(r.next).toBeNull();
    expect(r.progress).toBe(1);
  });

  it('负数视为 0', () => {
    expect(stageFor(-5).index).toBe(0);
  });
});

describe('mountain', () => {
  const settings = {
    startDateMs: at(2026, 9, 12),
    examDateMs: at(2026, 12, 20),
    dailyGoalMs: 5 * HOUR,
  };

  it('刚起步时两条线都在起点', () => {
    const r = mountain({ lifetimeFocusMs: 0, settings, now: at(2026, 9, 12, 12) });
    expect(r.pYou).toBe(0);
    expect(r.pTime).toBeCloseTo(0, 5);
    expect(r.totalDays).toBe(99);
    expect(r.daysLeft).toBe(99);
  });

  it('时间过半时 pTime 约 0.5', () => {
    const r = mountain({ lifetimeFocusMs: 0, settings, now: at(2026, 10, 30) });
    expect(r.pTime).toBeGreaterThan(0.45);
    expect(r.pTime).toBeLessThan(0.55);
  });

  it('落后时 deltaHours 为负', () => {
    const r = mountain({ lifetimeFocusMs: 10 * HOUR, settings, now: at(2026, 10, 30) });
    expect(r.deltaHours).toBeLessThan(0);
  });

  it('领先时 deltaHours 为正', () => {
    const now = at(2026, 10, 30);
    const r = mountain({ lifetimeFocusMs: 1000 * HOUR, settings, now });
    expect(r.deltaHours).toBeGreaterThan(0);
    expect(r.pYou).toBe(1); // 截断
  });

  it('考试当天不除零', () => {
    const r = mountain({ lifetimeFocusMs: 0, settings, now: at(2026, 12, 20, 9) });
    expect(Number.isFinite(r.pYou)).toBe(true);
    expect(r.daysLeft).toBe(1);
    expect(r.pTime).toBe(1);
  });

  it('考试日已过也不除零', () => {
    const r = mountain({ lifetimeFocusMs: 0, settings, now: at(2027, 1, 10) });
    expect(Number.isFinite(r.pYou)).toBe(true);
    expect(r.daysLeft).toBe(1);
  });
});

describe('spiritMood', () => {
  it('分档正确', () => {
    expect(spiritMood(100)).toBe('alive');
    expect(spiritMood(60)).toBe('alive');
    expect(spiritMood(59)).toBe('dozing');
    expect(spiritMood(25)).toBe('dozing');
    expect(spiritMood(24)).toBe('wilted');
    expect(spiritMood(0)).toBe('wilted');
  });
});