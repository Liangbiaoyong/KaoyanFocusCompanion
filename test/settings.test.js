import { describe, it, expect } from 'vitest';
import { MINUTE, HOUR, defaultSettings, normalizeSettings } from '../src/lib/settings.js';
import { dayKey, parseDayKey } from '../src/core/time.js';

const NOW = new Date(2026, 8, 12, 15, 0).getTime();

describe('默认设置', () => {
  it('起算日就是今天', () => {
    expect(defaultSettings(NOW).startDate).toBe('2026-09-12');
  });

  it('默认值与 spec 一致', () => {
    const d = defaultSettings(NOW);
    expect(d.dailyGoalMinutes).toBe(300);
    expect(d.dailyCapMinutes).toBe(480);
    expect(d.watchdogMinutes).toBe(10);
  });

  it('常量正确', () => {
    expect(MINUTE).toBe(60000);
    expect(HOUR).toBe(3600000);
  });
});

describe('normalizeSettings', () => {
  it('把分钟换算为毫秒', () => {
    const s = normalizeSettings({ dailyGoalMinutes: 240, dailyCapMinutes: 600, watchdogMinutes: 5 }, NOW);
    expect(s.dailyGoalMs).toBe(4 * HOUR);
    expect(s.dailyCapMs).toBe(10 * HOUR);
    expect(s.watchdogMs).toBe(5 * MINUTE);
  });

  it('日期键换算为本地 00:00 毫秒', () => {
    const s = normalizeSettings({ examDate: '2026-12-20', startDate: '2026-09-12' }, NOW);
    expect(s.examDateMs).toBe(parseDayKey('2026-12-20'));
    expect(dayKey(s.startDateMs)).toBe('2026-09-12');
  });

  it('缺失字段回落到默认', () => {
    const s = normalizeSettings({}, NOW);
    const d = defaultSettings(NOW);
    expect(dayKey(s.startDateMs)).toBe(d.startDate);
    expect(s.dailyGoalMs).toBe(d.dailyGoalMinutes * MINUTE);
    expect(s.companionName).toBe(d.companionName);
  });

  it('null / undefined 不抛异常', () => {
    expect(() => normalizeSettings(null, NOW)).not.toThrow();
    expect(() => normalizeSettings(undefined, NOW)).not.toThrow();
  });

  it('名字为空时回落默认', () => {
    expect(normalizeSettings({ companionName: '' }, NOW).companionName).toBe('小凤');
  });
});

describe('切走惩罚额度', () => {
  it('默认 1 分钟', () => {
    expect(defaultSettings(NOW).awayPenaltyMinutes).toBe(1);
    expect(normalizeSettings({}, NOW).awayPenaltyMs).toBe(MINUTE);
  });

  it('可配置', () => {
    expect(normalizeSettings({ awayPenaltyMinutes: 5 }, NOW).awayPenaltyMs).toBe(5 * MINUTE);
  });

  it('0 表示关闭', () => {
    expect(normalizeSettings({ awayPenaltyMinutes: 0 }, NOW).awayPenaltyMs).toBe(0);
  });

  it('负数归零', () => {
    expect(normalizeSettings({ awayPenaltyMinutes: -3 }, NOW).awayPenaltyMs).toBe(0);
  });
});

describe('切走惩罚的节流窗口', () => {
  it('默认 3 分钟', () => {
    expect(defaultSettings(NOW).awayPenaltyWindowMinutes).toBe(3);
    expect(normalizeSettings({}, NOW).awayPenaltyWindowMs).toBe(3 * MINUTE);
  });

  it('可配置', () => {
    expect(normalizeSettings({ awayPenaltyWindowMinutes: 10 }, NOW).awayPenaltyWindowMs).toBe(10 * MINUTE);
  });

  it('0 表示不节流', () => {
    expect(normalizeSettings({ awayPenaltyWindowMinutes: 0 }, NOW).awayPenaltyWindowMs).toBe(0);
  });

  it('负数归零', () => {
    expect(normalizeSettings({ awayPenaltyWindowMinutes: -1 }, NOW).awayPenaltyWindowMs).toBe(0);
  });
});

describe('目标名称可自定义（不一定是考研）', () => {
  it('默认是"考试"', () => {
    expect(defaultSettings(NOW).targetLabel).toBe('考试');
    expect(normalizeSettings({}, NOW).targetLabel).toBe('考试');
  });

  it('可以改成任意名称', () => {
    expect(normalizeSettings({ targetLabel: '考研初试' }, NOW).targetLabel).toBe('考研初试');
    expect(normalizeSettings({ targetLabel: '项目截止' }, NOW).targetLabel).toBe('项目截止');
    expect(normalizeSettings({ targetLabel: '婚礼' }, NOW).targetLabel).toBe('婚礼');
  });

  it('去掉首尾空白', () => {
    expect(normalizeSettings({ targetLabel: '  期末考  ' }, NOW).targetLabel).toBe('期末考');
  });

  it('空白回落默认', () => {
    expect(normalizeSettings({ targetLabel: '   ' }, NOW).targetLabel).toBe('考试');
    expect(normalizeSettings({ targetLabel: null }, NOW).targetLabel).toBe('考试');
  });

  it('过长时截断，避免撑坏桌宠那一行', () => {
    const long = '一二三四五六七八九十';
    expect(normalizeSettings({ targetLabel: long }, NOW).targetLabel.length).toBeLessThanOrEqual(8);
  });

  it('名字字段同样处理', () => {
    expect(normalizeSettings({ companionName: '  小凤  ' }, NOW).companionName).toBe('小凤');
  });
});