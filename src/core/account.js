import { dayKey, splitByDay, dayKeysFrom, parseDayKey } from './time.js';

export const PENALTY_MS = 10 * 60 * 1000;
export const SPIRIT_PER_MS = 2 * 60 * 1000;
export const SPIRIT_START = 50;
export const SPIRIT_MAX = 100;
export const SPIRIT_PENALTY = 20;
export const SPIRIT_DISTRACTION = 5;
export const MAKEUP_PER_MONTH = 2;

export function emptyDay() {
  return { focusMs: 0, distractions: 0, spiritEnd: null, metGoal: false };
}

export function createAccount(todayKey) {
  return {
    growthMs: 0,
    lifetimeFocusMs: 0,
    todayFocusMs: 0,
    todayDate: todayKey,
    spirit: SPIRIT_START,
    spiritCarryMs: 0,
    streak: 0,
    bestStreak: 0,
    makeupUsed: 0,
    makeupMonth: todayKey.slice(0, 7),
  };
}

/** 把一段专注毫秒记入某一天，返回其中"未超上限"的部分 */
function creditDay(a, daily, day, ms, settings) {
  const rec = daily[day] ?? emptyDay();
  const before = rec.focusMs;
  const after = before + ms;
  rec.focusMs = after;
  daily[day] = rec;

  const cap = settings.dailyCapMs;
  const creditable = Math.max(0, Math.min(after, cap) - Math.min(before, cap));

  a.growthMs += creditable;
  a.lifetimeFocusMs += ms;

  a.spiritCarryMs += creditable;
  const gain = Math.floor(a.spiritCarryMs / SPIRIT_PER_MS);
  if (gain > 0) {
    a.spiritCarryMs -= gain * SPIRIT_PER_MS;
    a.spirit = Math.min(SPIRIT_MAX, a.spirit + gain);
  }
}

/**
 * 就地结算某一天：写 spiritEnd / metGoal，推进 streak 与补签卡。
 * 会修改传入的 account 与 daily。
 */
export function settleDay(a, daily, day, settings) {
  if (!day) return;
  const rec = daily[day] ?? emptyDay();
  rec.spiritEnd = a.spirit;
  rec.metGoal = rec.focusMs >= settings.dailyGoalMs;
  daily[day] = rec;

  if (rec.metGoal) {
    a.streak += 1;
  } else {
    const month = day.slice(0, 7);
    if (a.makeupMonth !== month) {
      a.makeupMonth = month;
      a.makeupUsed = 0;
    }
    if (a.makeupUsed < MAKEUP_PER_MONTH) {
      a.makeupUsed += 1;
    } else {
      a.streak = 0;
    }
  }
  a.bestStreak = Math.max(a.bestStreak, a.streak);
}

/**
 * 应用一次 engine.step 的结果。纯函数，不改动入参。
 */
export function applyStep(account, daily, result, settings) {
  const a = { ...account };
  const d = { ...daily };

  // 推进到某一天：先结算被甩在后面的日子，再重置今日与精神值。
  // 必须与计分同序推进，否则跨过午夜的那一段会记进已结算的日子，
  // 导致 metGoal 算错、新一天的精神值被重置冲掉。
  const advanceTo = (day) => {
    if (day <= a.todayDate) return;
    for (const key of dayKeysFrom(parseDayKey(a.todayDate), parseDayKey(day))) {
      settleDay(a, d, key, settings);
    }
    a.todayDate = day;
    a.spirit = SPIRIT_START;
    a.spiritCarryMs = 0;
  };

  if (result.focusMs > 0) {
    for (const slice of splitByDay(result.fromMs, result.toMs)) {
      advanceTo(slice.day);
      creditDay(a, d, slice.day, slice.ms, settings);
    }
  }

  const today = dayKey(result.toMs);
  advanceTo(today);

  if (result.distractions > 0) {
    const rec = d[today] ?? emptyDay();
    rec.distractions += result.distractions;
    d[today] = rec;
    a.spirit = Math.max(0, a.spirit - result.distractions * SPIRIT_DISTRACTION);
  }

  /**
   * 扣时间必须同时打在"今日计时"和"成长值"上。
   * 只扣成长值的话，使用者盯着的那行大字（今日计时）纹丝不动，
   * 感觉就像什么都没发生——惩罚也就失去了意义。
   * 另外单独累计 penaltyMs，供统计页解释"为什么总时长比活动时段少"。
   */
  const subtractTime = (ms) => {
    if (!(ms > 0)) return;
    a.growthMs = Math.max(0, a.growthMs - ms);
    const record = d[today] ?? (d[today] = emptyDay());
    record.focusMs = Math.max(0, (record.focusMs ?? 0) - ms);
    record.penaltyMs = (record.penaltyMs ?? 0) + ms;
  };

  if (result.penalties > 0) {
    subtractTime(result.penalties * PENALTY_MS);
    a.spirit = Math.max(0, a.spirit - result.penalties * SPIRIT_PENALTY);
  }

  // 切走的小额惩罚，额度可配（0 即关闭）
  if (result.awayPenalties > 0) {
    subtractTime(result.awayPenalties * Math.max(0, settings.awayPenaltyMs ?? 0));
  }

  a.todayFocusMs = d[a.todayDate]?.focusMs ?? 0;
  return { account: a, daily: d };
}
