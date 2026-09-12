import { describe, it, expect } from 'vitest';
import {
  createAccount, emptyDay, applyStep, settleDay,
  PENALTY_MS, SPIRIT_START, SPIRIT_DISTRACTION, MAKEUP_PER_MONTH,
} from '../src/core/account.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const at = (y, m, d, h = 0) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();

const settings = {
  dailyCapMs: 8 * HOUR,
  dailyGoalMs: 5 * HOUR,
};

/** 造一个从 fromMs 起、持续 ms 毫秒的专注 step 结果 */
function focusResult(fromMs, ms, extra = {}) {
  return {
    focusMs: ms, fromMs, toMs: fromMs + ms,
    penalties: 0, awayPenalties: 0, distractions: 0,
    ...extra,
  };
}

describe('createAccount', () => {
  it('初始为零值', () => {
    const a = createAccount('2026-09-12');
    expect(a.growthMs).toBe(0);
    expect(a.lifetimeFocusMs).toBe(0);
    expect(a.todayFocusMs).toBe(0);
    expect(a.todayDate).toBe('2026-09-12');
    expect(a.spirit).toBe(SPIRIT_START);
    expect(a.streak).toBe(0);
    expect(a.bestStreak).toBe(0);
    expect(a.makeupMonth).toBe('2026-09');
  });
});

describe('applyStep — 计分', () => {
  it('专注毫秒进入增长与累计', () => {
    const a = createAccount('2026-09-12');
    const t = at(2026, 9, 12, 10);
    const { account, daily } = applyStep(a, {}, focusResult(t, 10 * MIN), settings);
    expect(account.growthMs).toBe(10 * MIN);
    expect(account.lifetimeFocusMs).toBe(10 * MIN);
    expect(account.todayFocusMs).toBe(10 * MIN);
    expect(daily['2026-09-12'].focusMs).toBe(10 * MIN);
  });

  it('focusMs 为 0 且无副作用时不产生任何变化', () => {
    const a = createAccount('2026-09-12');
    const t = at(2026, 9, 12, 10);
    const r = applyStep(a, {}, { focusMs: 0, fromMs: t, toMs: t, penalties: 0, distractions: 0 }, settings);
    expect(r.account.growthMs).toBe(0);
    expect(r.daily).toEqual({});
  });

  it('不改动入参', () => {
    const a = createAccount('2026-09-12');
    const snap = JSON.stringify(a);
    applyStep(a, {}, focusResult(at(2026, 9, 12, 10), 5 * MIN), settings);
    expect(JSON.stringify(a)).toBe(snap);
  });
});

describe('applyStep — 跨天切分', () => {
  it('跨天时按日分别入账', () => {
    const a = createAccount('2026-09-12');
    const start = at(2026, 9, 12, 23);
    const { account, daily } = applyStep(a, {}, focusResult(start, 2 * HOUR), settings);
    expect(daily['2026-09-12'].focusMs).toBe(1 * HOUR);
    expect(daily['2026-09-13'].focusMs).toBe(1 * HOUR);
    expect(account.growthMs).toBe(2 * HOUR);
    expect(account.lifetimeFocusMs).toBe(2 * HOUR);
  });

  it('跨天时结算旧日并重置今日与精神值', () => {
    const a = createAccount('2026-09-12');
    a.todayFocusMs = 1 * HOUR;
    a.spirit = 90;
    const start = at(2026, 9, 13, 10);
    const { account, daily } = applyStep(a, {}, focusResult(start, MIN), settings);
    expect(daily['2026-09-12'].spiritEnd).toBe(90);
    expect(daily['2026-09-12'].metGoal).toBe(false);
    expect(account.todayDate).toBe('2026-09-13');
    expect(account.todayFocusMs).toBe(MIN);
    expect(account.spirit).toBe(SPIRIT_START);
  });

  it('隔了多天没打开，每一天都被结算（连续天数归零）', () => {
    const a = createAccount('2026-09-12');
    a.streak = 7;
    a.bestStreak = 7;
    const start = at(2026, 9, 16, 10);
    const { account, daily } = applyStep(a, {}, focusResult(start, 10 * MIN), settings);
    expect(Object.keys(daily).sort()).toEqual([
      '2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16',
    ]);
    expect(account.streak).toBe(0);
    expect(account.bestStreak).toBe(7);
  });
});

describe('applyStep — 每日上限', () => {
  it('超出上限的部分不进增长值但仍进累计', () => {
    const a = createAccount('2026-09-12');
    const t = at(2026, 9, 12, 0);
    const { account, daily } = applyStep(a, {}, focusResult(t, 10 * HOUR), settings);
    expect(daily['2026-09-12'].focusMs).toBe(10 * HOUR);
    expect(account.growthMs).toBe(8 * HOUR);
    expect(account.lifetimeFocusMs).toBe(10 * HOUR);
    expect(account.todayFocusMs).toBe(10 * HOUR);
  });

  it('跨过上限的那一帧只计到上限', () => {
    const a = createAccount('2026-09-12');
    const t = at(2026, 9, 12, 0);
    const first = applyStep(a, {}, focusResult(t, 7 * HOUR), settings);
    const second = applyStep(first.account, first.daily, focusResult(t + 7 * HOUR, 3 * HOUR), settings);
    expect(second.account.growthMs).toBe(8 * HOUR);
    expect(second.account.lifetimeFocusMs).toBe(10 * HOUR);
  });
});

describe('applyStep — 精神值', () => {
  it('每 2 分钟 +1', () => {
    const a = createAccount('2026-09-12');
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, 10 * MIN), settings);
    expect(account.spirit).toBe(SPIRIT_START + 5);
  });

  it('分帧累加不丢零头', () => {
    const a = createAccount('2026-09-12');
    const t = at(2026, 9, 12, 10);
    let acc = a;
    let daily = {};
    for (let i = 0; i < 4; i += 1) {
      const r = applyStep(acc, daily, focusResult(t + i * MIN, MIN), settings);
      acc = r.account;
      daily = r.daily;
    }
    expect(acc.spirit).toBe(SPIRIT_START + 2);
  });

  it('上限 100', () => {
    const a = createAccount('2026-09-12');
    a.spirit = 99;
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, 10 * MIN), settings);
    expect(account.spirit).toBe(100);
  });

  it('超时扣 20 且下限为 0', () => {
    const a = createAccount('2026-09-12');
    a.spirit = 10;
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, MIN, { penalties: 1 }), settings);
    expect(account.spirit).toBe(0);
  });

  it('走神扣 5 并记入当日', () => {
    const a = createAccount('2026-09-12');
    const t = at(2026, 9, 12, 10);
    const { account, daily } = applyStep(a, {}, focusResult(t, 0, { distractions: 2 }), settings);
    expect(account.spirit).toBe(SPIRIT_START - 2 * SPIRIT_DISTRACTION);
    expect(daily['2026-09-12'].distractions).toBe(2);
  });
});

describe('applyStep — 惩罚', () => {
  it('超时从增长值扣 10 分钟，下限为 0', () => {
    const a = createAccount('2026-09-12');
    a.growthMs = 3 * MIN;
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, 0, { penalties: 1 }), settings);
    expect(account.growthMs).toBe(0);
    expect(account.todayFocusMs).toBe(0);
  });

  it('惩罚不削减累计专注', () => {
    const a = createAccount('2026-09-12');
    a.lifetimeFocusMs = 50 * HOUR;
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, 0, { penalties: 1 }), settings);
    expect(account.lifetimeFocusMs).toBe(50 * HOUR);
    expect(account.growthMs).toBe(0);
  });

  it('扣分额度为 PENALTY_MS', () => {
    const a = createAccount('2026-09-12');
    a.growthMs = 5 * HOUR;
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, 0, { penalties: 1 }), settings);
    expect(account.growthMs).toBe(5 * HOUR - PENALTY_MS);
  });
});

describe('applyStep — 切走惩罚额度可配', () => {
  const withAway = (minutes) => ({ ...settings, awayPenaltyMs: minutes * MIN });

  it('默认扣 1 分钟', () => {
    const a = createAccount('2026-09-12');
    a.growthMs = 10 * MIN;
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, 0, { awayPenalties: 1 }), withAway(1));
    expect(account.growthMs).toBe(9 * MIN);
  });

  it('额度可改成 3 分钟', () => {
    const a = createAccount('2026-09-12');
    a.growthMs = 10 * MIN;
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, 0, { awayPenalties: 1 }), withAway(3));
    expect(account.growthMs).toBe(7 * MIN);
  });

  it('额度为 0 等于关闭', () => {
    const a = createAccount('2026-09-12');
    a.growthMs = 10 * MIN;
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, 0, { awayPenalties: 2 }), withAway(0));
    expect(account.growthMs).toBe(10 * MIN);
  });

  it('下限为 0，不会变负', () => {
    const a = createAccount('2026-09-12');
    a.growthMs = 30 * 1000;
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, 0, { awayPenalties: 1 }), withAway(5));
    expect(account.growthMs).toBe(0);
  });

  it('不削减累计专注', () => {
    const a = createAccount('2026-09-12');
    a.lifetimeFocusMs = 50 * HOUR;
    a.growthMs = 10 * MIN;
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, 0, { awayPenalties: 1 }), withAway(1));
    expect(account.lifetimeFocusMs).toBe(50 * HOUR);
  });

  it('旧数据没有 awayPenaltyMs 字段时不报错也不扣分', () => {
    const a = createAccount('2026-09-12');
    a.growthMs = 10 * MIN;
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, 0, { awayPenalties: 1 }), settings);
    expect(account.growthMs).toBe(10 * MIN);
  });

  it('两次切走扣两次', () => {
    const a = createAccount('2026-09-12');
    a.growthMs = 10 * MIN;
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, 0, { awayPenalties: 2 }), withAway(1));
    expect(account.growthMs).toBe(8 * MIN);
  });

  it('切走不扣精神值（与超时惩罚区分）', () => {
    const a = createAccount('2026-09-12');
    a.growthMs = 10 * MIN;
    a.spirit = 50;
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, 0, { awayPenalties: 1 }), withAway(1));
    expect(account.spirit).toBe(50);
  });
});

describe('applyStep — 惩罚必须同时打在今日计时上', () => {
  it('切走同时减少今日计时与成长值', () => {
    const a = createAccount('2026-09-12');
    a.growthMs = 10 * MIN;
    const t = at(2026, 9, 12, 10);
    const daily = { '2026-09-12': { ...emptyDay(), focusMs: 10 * MIN } };
    const out = applyStep(a, daily, focusResult(t, 0, { awayPenalties: 1 }), { ...settings, awayPenaltyMs: MIN });
    expect(out.account.growthMs).toBe(9 * MIN);
    expect(out.daily['2026-09-12'].focusMs).toBe(9 * MIN);
    expect(out.account.todayFocusMs).toBe(9 * MIN);
  });

  it('记录 penaltyMs，供统计页解释时长为何比活动时段少', () => {
    const a = createAccount('2026-09-12');
    a.growthMs = 10 * MIN;
    const t = at(2026, 9, 12, 10);
    const daily = { '2026-09-12': { ...emptyDay(), focusMs: 10 * MIN } };
    const out = applyStep(a, daily, focusResult(t, 0, { awayPenalties: 1 }), { ...settings, awayPenaltyMs: MIN });
    expect(out.daily['2026-09-12'].penaltyMs).toBe(MIN);
  });

  it('超时也同时减少今日计时（10 分钟）', () => {
    const a = createAccount('2026-09-12');
    a.growthMs = 20 * MIN;
    const t = at(2026, 9, 12, 10);
    const daily = { '2026-09-12': { ...emptyDay(), focusMs: 20 * MIN } };
    const out = applyStep(a, daily, focusResult(t, 0, { penalties: 1 }), settings);
    expect(out.daily['2026-09-12'].focusMs).toBe(10 * MIN);
    expect(out.account.todayFocusMs).toBe(10 * MIN);
  });

  it('今日计时的下限也是 0，不会变负', () => {
    const a = createAccount('2026-09-12');
    a.growthMs = 20 * MIN;
    const t = at(2026, 9, 12, 10);
    const daily = { '2026-09-12': { ...emptyDay(), focusMs: 30 * 1000 } };
    const out = applyStep(a, daily, focusResult(t, 0, { penalties: 1 }), settings);
    expect(out.daily['2026-09-12'].focusMs).toBe(0);
    expect(out.account.todayFocusMs).toBe(0);
  });

  it('今日没有记录时也能扣（建立记录，不会崩）', () => {
    const a = createAccount('2026-09-12');
    a.growthMs = 20 * MIN;
    const t = at(2026, 9, 12, 10);
    const out = applyStep(a, {}, focusResult(t, 0, { awayPenalties: 1 }), { ...settings, awayPenaltyMs: MIN });
    expect(out.daily['2026-09-12'].focusMs).toBe(0);
    expect(out.daily['2026-09-12'].penaltyMs).toBe(MIN);
  });

  it('先计分再扣分：一帧里既专注又切走，净额正确', () => {
    const a = createAccount('2026-09-12');
    const t = at(2026, 9, 12, 10);
    // 这一帧计了 5 分钟专注，同时判定切走（扣 1 分钟）
    const out = applyStep(a, {}, focusResult(t, 5 * MIN, { awayPenalties: 1 }), { ...settings, awayPenaltyMs: MIN });
    expect(out.daily['2026-09-12'].focusMs).toBe(4 * MIN);
    expect(out.account.growthMs).toBe(4 * MIN);
  });
});

describe('settleDay', () => {
  it('达标则连续天数 +1 并刷新最长记录', () => {
    const a = createAccount('2026-09-12');
    a.streak = 3;
    const daily = { '2026-09-12': { ...emptyDay(), focusMs: 6 * HOUR } };
    settleDay(a, daily, '2026-09-12', settings);
    expect(a.streak).toBe(4);
    expect(a.bestStreak).toBe(4);
    expect(daily['2026-09-12'].metGoal).toBe(true);
  });

  it('未达标记为 metGoal=false', () => {
    const a = createAccount('2026-09-12');
    const daily = { '2026-09-12': { ...emptyDay(), focusMs: 1 * HOUR } };
    settleDay(a, daily, '2026-09-12', settings);
    expect(daily['2026-09-12'].metGoal).toBe(false);
  });

  it('未达标时消耗补签卡，连续天数保持', () => {
    const a = createAccount('2026-09-12');
    a.streak = 5;
    const daily = { '2026-09-12': { ...emptyDay(), focusMs: 0 } };
    settleDay(a, daily, '2026-09-12', settings);
    expect(a.makeupUsed).toBe(1);
    expect(a.streak).toBe(5);
  });

  it('补签卡用尽后连续天数归零', () => {
    const a = createAccount('2026-09-12');
    a.streak = 5;
    a.bestStreak = 5;
    a.makeupUsed = MAKEUP_PER_MONTH;
    const daily = { '2026-09-12': { ...emptyDay(), focusMs: 0 } };
    settleDay(a, daily, '2026-09-12', settings);
    expect(a.streak).toBe(0);
    expect(a.bestStreak).toBe(5);
  });

  it('跨月重置补签卡额度', () => {
    const a = createAccount('2026-09-30');
    a.makeupMonth = '2026-09';
    a.makeupUsed = 2;
    const daily = { '2026-10-01': { ...emptyDay(), focusMs: 0 } };
    settleDay(a, daily, '2026-10-01', settings);
    expect(a.makeupMonth).toBe('2026-10');
    expect(a.makeupUsed).toBe(1);
  });

  it('对没有记录的日期也能结算（视为 0 分钟）', () => {
    const a = createAccount('2026-09-12');
    const daily = {};
    settleDay(a, daily, '2026-09-13', settings);
    expect(daily['2026-09-13'].metGoal).toBe(false);
    expect(daily['2026-09-13'].focusMs).toBe(0);
  });
});
