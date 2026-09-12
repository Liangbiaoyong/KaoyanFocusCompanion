import { describe, it, expect } from 'vitest';
import {
  dayKey, parseDayKey, startOfDay, nextDayStart,
  splitByDay, dayKeysFrom, daysBetween,
} from '../src/core/time.js';

// 固定用本地时间构造，避免时区假设
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();

describe('dayKey', () => {
  it('按本地时区格式化', () => {
    expect(dayKey(at(2026, 9, 12, 20, 30))).toBe('2026-09-12');
  });

  it('补零', () => {
    expect(dayKey(at(2026, 1, 5, 0, 0))).toBe('2026-01-05');
  });
});

describe('parseDayKey', () => {
  it('往返一致', () => {
    const key = '2026-09-12';
    expect(dayKey(parseDayKey(key))).toBe(key);
  });

  it('落在当天 00:00', () => {
    expect(parseDayKey('2026-09-12')).toBe(startOfDay(at(2026, 9, 12, 15, 0)));
  });
});

describe('nextDayStart', () => {
  it('跨月正确', () => {
    expect(nextDayStart(at(2026, 9, 30, 23, 59))).toBe(at(2026, 10, 1));
  });

  it('跨年正确', () => {
    expect(nextDayStart(at(2026, 12, 31, 12, 0))).toBe(at(2027, 1, 1));
  });
});

describe('splitByDay', () => {
  it('空区间返回空数组', () => {
    expect(splitByDay(at(2026, 9, 12, 10, 0), at(2026, 9, 12, 10, 0))).toEqual([]);
    expect(splitByDay(at(2026, 9, 12, 10, 0), at(2026, 9, 12, 9, 0))).toEqual([]);
  });

  it('同一天内不切分', () => {
    const out = splitByDay(at(2026, 9, 12, 10, 0), at(2026, 9, 12, 10, 30));
    expect(out).toEqual([{ day: '2026-09-12', ms: 30 * 60 * 1000 }]);
  });

  it('跨天切分并保持总和', () => {
    const start = at(2026, 9, 12, 23, 30);
    const end = at(2026, 9, 13, 0, 30);
    const out = splitByDay(start, end);
    expect(out).toEqual([
      { day: '2026-09-12', ms: 30 * 60 * 1000 },
      { day: '2026-09-13', ms: 30 * 60 * 1000 },
    ]);
    expect(out.reduce((s, x) => s + x.ms, 0)).toBe(end - start);
  });

  it('跨三天', () => {
    const out = splitByDay(at(2026, 9, 12, 22, 0), at(2026, 9, 14, 2, 0));
    expect(out.map((x) => x.day)).toEqual(['2026-09-12', '2026-09-13', '2026-09-14']);
    expect(out.reduce((s, x) => s + x.ms, 0)).toBe(at(2026, 9, 14, 2, 0) - at(2026, 9, 12, 22, 0));
  });
});

describe('dayKeysFrom', () => {
  it('不含结束日', () => {
    expect(dayKeysFrom(at(2026, 9, 12, 22, 0), at(2026, 9, 14, 1, 0)))
      .toEqual(['2026-09-12', '2026-09-13']);
  });

  it('结束日与起始日同一天时返回空（结束日不含）', () => {
    expect(dayKeysFrom(at(2026, 9, 12, 1, 0), at(2026, 9, 12, 23, 0))).toEqual([]);
  });

  it('相邻一天只返回起始日', () => {
    expect(dayKeysFrom(at(2026, 9, 12, 1, 0), at(2026, 9, 13, 0, 0))).toEqual(['2026-09-12']);
  });
});

describe('daysBetween', () => {
  it('同日为 0', () => {
    expect(daysBetween(at(2026, 9, 12, 1, 0), at(2026, 9, 12, 23, 0))).toBe(0);
  });

  it('跨天按日边界计', () => {
    expect(daysBetween(at(2026, 9, 12, 23, 0), at(2026, 9, 13, 1, 0))).toBe(1);
  });

  it('跨月', () => {
    expect(daysBetween(at(2026, 9, 12), at(2026, 12, 20))).toBe(99);
  });

  it('可为负', () => {
    expect(daysBetween(at(2026, 9, 13), at(2026, 9, 12))).toBe(-1);
  });
});
