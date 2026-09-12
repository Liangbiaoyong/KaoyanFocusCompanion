import { describe, it, expect } from 'vitest';
import {
  addSegment, normalizeSegments, segmentBars, formatSegment, recordSegments,
  addDistraction, hourlyHistogram, peakBucket,
} from '../src/segments.mjs';

const at = (h, m = 0) => new Date(2026, 8, 12, h, m, 0, 0).getTime();
const MIN = 60 * 1000;

describe('addSegment', () => {
  it('空列表时新增一段', () => {
    expect(addSegment([], at(9), at(9) + 30 * MIN)).toEqual([{ start: at(9), end: at(9) + 30 * MIN }]);
  });

  it('与上一段相邻（间隔小于阈值）时延长，不新增', () => {
    const first = addSegment([], at(9), at(9) + 30 * MIN);
    const second = addSegment(first, at(9) + 30 * MIN, at(9) + 50 * MIN);
    expect(second).toEqual([{ start: at(9), end: at(9) + 50 * MIN }]);
  });

  it('间隔在阈值内（2 分钟）仍然合并', () => {
    const first = addSegment([], at(9), at(9) + 30 * MIN);
    const second = addSegment(first, at(9) + 31 * MIN, at(9) + 40 * MIN);
    expect(second).toHaveLength(1);
    expect(second[0].end).toBe(at(9) + 40 * MIN);
  });

  it('间隔超过阈值时新增一段', () => {
    const first = addSegment([], at(9), at(9) + 30 * MIN);
    const second = addSegment(first, at(11), at(11) + 20 * MIN);
    expect(second).toHaveLength(2);
    expect(second[1]).toEqual({ start: at(11), end: at(11) + 20 * MIN });
  });

  it('空区间被忽略', () => {
    expect(addSegment([], at(9), at(9))).toEqual([]);
    expect(addSegment([], at(9) + MIN, at(9))).toEqual([]);
  });

  it('不改动入参数组', () => {
    const original = [{ start: at(9), end: at(9) + 30 * MIN }];
    const snapshot = JSON.stringify(original);
    addSegment(original, at(9) + 31 * MIN, at(9) + 40 * MIN);
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('非法输入按空列表处理', () => {
    expect(addSegment(null, at(9), at(9) + MIN)).toEqual([{ start: at(9), end: at(9) + MIN }]);
  });

  it('连续多片逐次并入同一段', () => {
    let list = [];
    for (let i = 0; i < 10; i += 1) {
      list = addSegment(list, at(9) + i * MIN, at(9) + (i + 1) * MIN);
    }
    expect(list).toHaveLength(1);
    expect(list[0].end).toBe(at(9) + 10 * MIN);
  });
});

describe('normalizeSegments', () => {
  const dayStart = at(0);
  const DAY = 24 * 60 * MIN;

  it('裁剪到当天范围', () => {
    const prevDay = at(0) - 60 * MIN;
    const out = normalizeSegments([{ start: prevDay, end: at(1) }], dayStart, DAY);
    expect(out).toEqual([{ start: at(0), end: at(1) }]);
  });

  it('丢掉完全不在当天的片段', () => {
    const out = normalizeSegments([{ start: at(0) - 120 * MIN, end: at(0) - 60 * MIN }], dayStart, DAY);
    expect(out).toEqual([]);
  });

  it('排序后合并重叠片段', () => {
    const out = normalizeSegments(
      [{ start: at(10), end: at(11) }, { start: at(9), end: at(10) + 30 * MIN }],
      dayStart,
      DAY,
    );
    expect(out).toEqual([{ start: at(9), end: at(11) }]);
  });

  it('gapMs 为 0 时首尾相接的片段合并为一段（时间轴上应连续）', () => {
    const out = normalizeSegments(
      [{ start: at(9), end: at(10) }, { start: at(10), end: at(11) }],
      dayStart,
      DAY,
      0,
    );
    expect(out).toEqual([{ start: at(9), end: at(11) }]);
  });

  it('确实有空隙时不合并', () => {
    const out = normalizeSegments(
      [{ start: at(9), end: at(10) }, { start: at(10) + MIN, end: at(11) }],
      dayStart,
      DAY,
      0,
    );
    expect(out).toHaveLength(2);
  });

  it('空输入安全', () => {
    expect(normalizeSegments(null, dayStart, DAY)).toEqual([]);
    expect(normalizeSegments([], dayStart, DAY)).toEqual([]);
  });

  it('非法片段被跳过', () => {
    expect(normalizeSegments([{ start: 'x', end: null }], dayStart, DAY)).toEqual([]);
  });
});

describe('segmentBars', () => {
  const dayStart = at(0);
  const DAY = 24 * 60 * MIN;

  it('半夜到中午的一段落在左半边', () => {
    const bars = segmentBars([{ start: at(0), end: at(12) }], dayStart, DAY);
    expect(bars).toHaveLength(1);
    expect(bars[0].left).toBe(0);
    expect(bars[0].width).toBeCloseTo(0.5, 5);
  });

  it('9 点到 10 点占 1/24', () => {
    const bars = segmentBars([{ start: at(9), end: at(10) }], dayStart, DAY);
    expect(bars[0].left).toBeCloseTo(9 / 24, 5);
    expect(bars[0].width).toBeCloseTo(1 / 24, 5);
  });

  it('比例不会超出 0~1', () => {
    const bars = segmentBars([{ start: at(0) - MIN, end: at(0) + 25 * 60 * MIN }], dayStart, DAY);
    expect(bars[0].left).toBeGreaterThanOrEqual(0);
    expect(bars[0].left + bars[0].width).toBeLessThanOrEqual(1.0000001);
  });

  it('dayMs 为 0 时不除零', () => {
    expect(() => segmentBars([{ start: at(9), end: at(10) }], dayStart, 0)).not.toThrow();
  });
});

describe('formatSegment', () => {
  it('输出起止与分钟数', () => {
    expect(formatSegment({ start: at(14, 5), end: at(15, 32) })).toBe('14:05–15:32（87 分钟）');
  });

  it('补零', () => {
    expect(formatSegment({ start: at(9, 0), end: at(9, 5) })).toBe('09:00–09:05（5 分钟）');
  });
});

describe('recordSegments', () => {
  it('写入当天时段，并建立缺失的 daily 记录', () => {
    const daily = {};
    recordSegments(daily, at(9), at(9) + 30 * MIN);
    expect(daily['2026-09-12'].segments).toEqual([{ start: at(9), end: at(9) + 30 * MIN }]);
  });

  it('就地修改并返回同一个对象', () => {
    const daily = {};
    expect(recordSegments(daily, at(9), at(9) + MIN)).toBe(daily);
  });

  it('空区间不产生任何记录', () => {
    const daily = {};
    recordSegments(daily, at(9), at(9));
    recordSegments(daily, at(9) + MIN, at(9));
    expect(daily).toEqual({});
  });

  it('跨天时按天切开', () => {
    const daily = {};
    recordSegments(daily, at(23, 30), at(23, 30) + 60 * MIN);
    expect(daily['2026-09-12'].segments).toEqual([{ start: at(23, 30), end: at(0) + 24 * 60 * MIN }]);
    expect(daily['2026-09-13'].segments).toEqual([
      { start: at(0) + 24 * 60 * MIN, end: at(0) + 24 * 60 * MIN + 30 * MIN },
    ]);
  });

  it('连续帧并入同一段', () => {
    const daily = {};
    for (let i = 0; i < 5; i += 1) {
      recordSegments(daily, at(9) + i * MIN, at(9) + (i + 1) * MIN);
    }
    expect(daily['2026-09-12'].segments).toHaveLength(1);
    expect(daily['2026-09-12'].segments[0].end).toBe(at(9) + 5 * MIN);
  });

  it('中间断了超过阈值就分成两段', () => {
    const daily = {};
    recordSegments(daily, at(9), at(10));
    recordSegments(daily, at(11), at(12));
    expect(daily['2026-09-12'].segments).toHaveLength(2);
  });

  it('已有 segments 时追加而不是覆盖', () => {
    const daily = { '2026-09-12': { focusMs: 1, segments: [{ start: at(7), end: at(8) }] } };
    recordSegments(daily, at(9), at(10));
    expect(daily['2026-09-12'].segments).toHaveLength(2);
  });

  it('daily 为空值时安全', () => {
    expect(() => recordSegments(null, at(9), at(10))).not.toThrow();
  });
});

describe('addDistraction', () => {
  it('追加时刻', () => {
    expect(addDistraction([], at(15))).toEqual([at(15)]);
  });

  it('超过上限时丢掉最早的', () => {
    let list = [];
    for (let i = 0; i < 10; i += 1) list = addDistraction(list, at(9) + i * MIN, 3);
    expect(list).toEqual([at(9) + 7 * MIN, at(9) + 8 * MIN, at(9) + 9 * MIN]);
  });

  it('非法时刻被忽略', () => {
    expect(addDistraction([at(9)], NaN)).toEqual([at(9)]);
    expect(addDistraction([at(9)], 'x')).toEqual([at(9)]);
  });

  it('不改动入参数组', () => {
    const original = [at(9)];
    const snapshot = JSON.stringify(original);
    addDistraction(original, at(10));
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  it('null 输入按空数组处理', () => {
    expect(addDistraction(null, at(9))).toEqual([at(9)]);
  });
});

describe('hourlyHistogram', () => {
  it('按小时分桶计数', () => {
    const hist = hourlyHistogram([at(9, 5), at(9, 40), at(15, 0)]);
    expect(hist).toHaveLength(24);
    expect(hist[9]).toBe(2);
    expect(hist[15]).toBe(1);
    expect(hist[0]).toBe(0);
  });

  it('空输入返回全零', () => {
    expect(hourlyHistogram([]).every((n) => n === 0)).toBe(true);
    expect(hourlyHistogram(null)).toHaveLength(24);
  });

  it('非法值被跳过', () => {
    const hist = hourlyHistogram([NaN, 'x', at(1)]);
    expect(hist.reduce((a, b) => a + b, 0)).toBe(1);
  });
});

describe('peakBucket', () => {
  it('返回计数最高的桶', () => {
    const hist = new Array(24).fill(0);
    hist[15] = 7;
    hist[9] = 3;
    expect(peakBucket(hist)).toEqual({ index: 15, count: 7 });
  });

  it('全零返回 null', () => {
    expect(peakBucket(new Array(24).fill(0))).toBeNull();
  });

  it('空输入返回 null', () => {
    expect(peakBucket([])).toBeNull();
    expect(peakBucket(null)).toBeNull();
  });
});
