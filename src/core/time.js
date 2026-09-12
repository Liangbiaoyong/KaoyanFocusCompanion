const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 本地时区的 YYYY-MM-DD */
export function dayKey(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 本地时区的当天 00:00 */
export function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 本地时区次日 00:00（用 Date 运算，避免固定 86400000 的隐患） */
export function nextDayStart(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** YYYY-MM-DD → 本地 00:00 的 epoch ms */
export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/** 把 [startMs, endMs) 按本地日切分为 {day, ms} 列表 */
export function splitByDay(startMs, endMs) {
  if (!(endMs > startMs)) return [];
  const out = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const boundary = nextDayStart(cursor);
    const end = Math.min(endMs, boundary);
    out.push({ day: dayKey(cursor), ms: end - cursor });
    cursor = end;
  }
  return out;
}

/** 从 startMs 所在日起，到 endMsExclusive 所在日之前（不含）的所有日键 */
export function dayKeysFrom(startMs, endMsExclusive) {
  const out = [];
  let cursor = startOfDay(startMs);
  const limit = startOfDay(endMsExclusive);
  while (cursor < limit) {
    out.push(dayKey(cursor));
    cursor = nextDayStart(cursor);
  }
  return out;
}

/** 按日边界计的天数差（b - a） */
export function daysBetween(aMs, bMs) {
  return Math.round((startOfDay(bMs) - startOfDay(aMs)) / MS_PER_DAY);
}
