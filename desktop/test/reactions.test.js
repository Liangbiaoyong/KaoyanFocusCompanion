import { describe, it, expect } from 'vitest';
import { deriveReactions, reactionLabel, reactionTone, KIND } from '../src/reactions.mjs';

const settings = { awayPenaltyMs: 60000 };

const state = (over = {}) => ({
  status: 'FOCUSING', stageIndex: 2, stageName: '雏鸟', metGoal: false, ...over,
});

const result = (over = {}) => ({ penalties: 0, awayPenalties: 0, distractions: 0, ...over });

const kinds = (events) => events.map((e) => e.kind);

describe('deriveReactions', () => {
  it('一直专注、什么都没发生 → 无反馈', () => {
    expect(deriveReactions(state(), state(), result(), settings)).toEqual([]);
  });

  it('切走 → away，带上被扣的分钟数', () => {
    const events = deriveReactions(
      state(),
      state({ status: 'PAUSED_AWAY' }),
      result({ awayPenalties: 1 }),
      settings,
    );
    expect(events).toEqual([{ kind: KIND.AWAY, penaltyMinutes: 1 }]);
  });

  it('额度改成 3 分钟时反馈里也是 3', () => {
    const events = deriveReactions(
      state(), state({ status: 'PAUSED_AWAY' }), result({ awayPenalties: 1 }),
      { awayPenaltyMs: 180000 },
    );
    expect(events[0].penaltyMinutes).toBe(3);
  });

  it('超时 → timeout，且不重复报切走', () => {
    const events = deriveReactions(
      state(),
      state({ status: 'WAITING_ACTIVITY' }),
      result({ penalties: 1, awayPenalties: 0 }),
      settings,
    );
    expect(kinds(events)).toEqual([KIND.TIMEOUT]);
    expect(events[0].penaltyMinutes).toBe(10);
  });

  it('超时即使引擎同时报了切走，也只反馈超时', () => {
    const events = deriveReactions(
      state(), state({ status: 'WAITING_ACTIVITY' }), result({ penalties: 1, awayPenalties: 1 }), settings,
    );
    expect(kinds(events)).toEqual([KIND.TIMEOUT]);
  });

  it('切到学习外网站 → away + distract 两条', () => {
    const events = deriveReactions(
      state(),
      state({ status: 'PAUSED_DISTRACTED' }),
      result({ awayPenalties: 1, distractions: 1 }),
      settings,
    );
    expect(kinds(events)).toEqual([KIND.AWAY, KIND.DISTRACT]);
  });

  it('从暂停回到专注 → resume', () => {
    const events = deriveReactions(
      state({ status: 'PAUSED_AWAY' }), state(), result(), settings,
    );
    expect(kinds(events)).toEqual([KIND.RESUME]);
  });

  it('一帧里切走又切回来 → 只报切走，不报 resume（同帧开始就是专注态）', () => {
    const events = deriveReactions(
      state(), state(), result({ awayPenalties: 1 }), settings,
    );
    expect(kinds(events)).toEqual([KIND.AWAY]);
  });

  it('进化 → evolve，带新阶段名', () => {
    const events = deriveReactions(
      state({ stageIndex: 1 }), state({ stageIndex: 2, stageName: '雏鸟' }), result(), settings,
    );
    expect(events).toEqual([{ kind: KIND.EVOLVE, stageName: '雏鸟' }]);
  });

  it('掉级 → degrade', () => {
    const events = deriveReactions(
      state({ stageIndex: 3, stageName: '幼鸟' }),
      state({ stageIndex: 2, stageName: '雏鸟' }),
      result({ awayPenalties: 1 }),
      settings,
    );
    expect(kinds(events)).toEqual([KIND.AWAY, KIND.DEGRADE]);
  });

  it('达标的那一刻报一次，之后不再报', () => {
    const first = deriveReactions(state({ metGoal: false }), state({ metGoal: true }), result(), settings);
    const second = deriveReactions(state({ metGoal: true }), state({ metGoal: true }), result(), settings);
    expect(kinds(first)).toEqual([KIND.GOAL]);
    expect(second).toEqual([]);
  });

  it('同时切走又达标 → 两条都在', () => {
    const events = deriveReactions(
      state(), state({ status: 'PAUSED_AWAY', metGoal: true }), result({ awayPenalties: 1 }), settings,
    );
    expect(kinds(events)).toEqual([KIND.AWAY, KIND.GOAL]);
  });

  it('缺 settings 时不抛异常', () => {
    expect(() => deriveReactions(state(), state(), result({ awayPenalties: 1 }), undefined)).not.toThrow();
  });

  it('不改动入参', () => {
    const b = state();
    const a = state({ status: 'PAUSED_AWAY' });
    const r = result({ awayPenalties: 1 });
    const snap = JSON.stringify([b, a, r]);
    deriveReactions(b, a, r, settings);
    expect(JSON.stringify([b, a, r])).toBe(snap);
  });
});

describe('reactionLabel / reactionTone', () => {
  it('每种反馈都有中文短语', () => {
    const all = [
      { kind: KIND.TIMEOUT },
      { kind: KIND.AWAY, penaltyMinutes: 2 },
      { kind: KIND.DISTRACT },
      { kind: KIND.RESUME },
      { kind: KIND.EVOLVE, stageName: '飞鸟' },
      { kind: KIND.DEGRADE, stageName: '幼鸟' },
      { kind: KIND.GOAL },
    ];
    for (const e of all) expect(reactionLabel(e)).not.toBe('');
    expect(reactionLabel({ kind: KIND.AWAY, penaltyMinutes: 2 })).toContain('2 分钟');
    expect(reactionLabel({ kind: KIND.EVOLVE, stageName: '飞鸟' })).toContain('飞鸟');
  });

  it('未知类型返回空串而不是 undefined', () => {
    expect(reactionLabel({ kind: 'nope' })).toBe('');
    expect(reactionLabel({})).toBe('');
  });

  it('基调配色分三类', () => {
    expect(reactionTone({ kind: KIND.TIMEOUT })).toBe('bad');
    expect(reactionTone({ kind: KIND.DEGRADE })).toBe('bad');
    expect(reactionTone({ kind: KIND.AWAY })).toBe('warn');
    expect(reactionTone({ kind: KIND.DISTRACT })).toBe('warn');
    expect(reactionTone({ kind: KIND.RESUME })).toBe('good');
    expect(reactionTone({ kind: KIND.EVOLVE })).toBe('good');
    expect(reactionTone({ kind: KIND.GOAL })).toBe('good');
  });
});
