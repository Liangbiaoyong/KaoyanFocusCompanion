import { splitByDay } from '../../src/core/time.js';

/**
 * 时段与走神记录。
 *
 * 只记录"总量"看不出模式——想到"我晚上效率高"或"下午三点必走神"，
 * 必须有时间信息。片段/时刻都按相邻合并或限量，否则每次 tick 都会留下一条。
 */

/** 把一段专注并入当日时段列表。与上一段间隔小于 gapMs 就延长它。 */
export function addSegment(segments, startMs, endMs, gapMs = 120000) {
  const list = Array.isArray(segments) ? segments.map((s) => ({ ...s })) : [];
  if (!(endMs > startMs)) return list;

  const last = list[list.length - 1];
  if (last && startMs - last.end <= gapMs) {
    last.end = Math.max(last.end, endMs);
    return list;
  }
  list.push({ start: startMs, end: endMs });
  return list;
}

/**
 * 把时段裁剪到指定的一天并合并，供画时间轴用。
 * 返回的片段保证落在 [dayStartMs, dayStartMs + dayMs) 内且按时间有序。
 */
export function normalizeSegments(segments, dayStartMs, dayMs, gapMs = 0) {
  const dayEnd = dayStartMs + dayMs;
  const clipped = [];
  for (const seg of segments ?? []) {
    const start = Math.max(Number(seg?.start ?? 0), dayStartMs);
    const end = Math.min(Number(seg?.end ?? 0), dayEnd);
    if (end > start) clipped.push({ start, end });
  }
  clipped.sort((a, b) => a.start - b.start);

  const merged = [];
  for (const seg of clipped) {
    const last = merged[merged.length - 1];
    if (last && seg.start - last.end <= gapMs) {
      last.end = Math.max(last.end, seg.end);
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

/** 像素定位用的比例区间：返回 [{left, width}]，均为 0~1。 */
export function segmentBars(segments, dayStartMs, dayMs) {
  const total = dayMs > 0 ? dayMs : 1;
  return normalizeSegments(segments, dayStartMs, dayMs).map((seg) => ({
    left: (seg.start - dayStartMs) / total,
    width: (seg.end - seg.start) / total,
    start: seg.start,
    end: seg.end,
  }));
}

/** 便于展示：把毫秒区间说成 "14:05–15:32（87 分钟）" */
export function formatSegment(seg) {
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (ms) => {
    const d = new Date(ms);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const minutes = Math.round((seg.end - seg.start) / 60000);
  return `${clock(seg.start)}–${clock(seg.end)}（${minutes} 分钟）`;
}

/**
 * 把一段专注并入 daily 里对应日期的时段。跨天时按天切开。
 * 就地修改并返回 daily。
 */
export function recordSegments(daily, fromMs, toMs, gapMs = 120000) {
  if (!(toMs > fromMs) || !daily) return daily;
  let cursor = fromMs;
  for (const slice of splitByDay(fromMs, toMs)) {
    const start = cursor;
    cursor += slice.ms;
    const record = daily[slice.day] ?? (daily[slice.day] = {});
    record.segments = addSegment(record.segments, start, cursor, gapMs);
  }
  return daily;
}

/** 记录一次走神的时刻。上限之外丢掉最早的，避免单日数组无限增长。 */
export function addDistraction(times, atMs, max = 500) {
  const list = Array.isArray(times) ? times.slice() : [];
  if (!Number.isFinite(atMs)) return list;
  list.push(atMs);
  return list.length > max ? list.slice(list.length - max) : list;
}

/** 把若干时刻按"一天中的第几小时"聚合，用于找出走神热点 */
export function hourlyHistogram(times, buckets = 24) {
  const out = new Array(buckets).fill(0);
  for (const t of times ?? []) {
    if (!Number.isFinite(t)) continue;
    const hour = new Date(t).getHours();
    if (hour >= 0 && hour < buckets) out[hour] += 1;
  }
  return out;
}

/** 找出计数最高的桶；全为 0 时返回 null */
export function peakBucket(histogram) {
  let best = null;
  let bestCount = 0;
  (histogram ?? []).forEach((count, index) => {
    if (count > bestCount) {
      bestCount = count;
      best = index;
    }
  });
  return best === null ? null : { index: best, count: bestCount };
}
