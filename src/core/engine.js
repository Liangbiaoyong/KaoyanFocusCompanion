export const STATUS = Object.freeze({
  IDLE: 'IDLE',
  FOCUSING: 'FOCUSING',
  PAUSED_AWAY: 'PAUSED_AWAY',
  PAUSED_DISTRACTED: 'PAUSED_DISTRACTED',
  WAITING_ACTIVITY: 'WAITING_ACTIVITY',
});

export function initialSession(now = 0) {
  return {
    status: STATUS.IDLE,
    startedAt: null,
    lastActivityAt: null,
    lastSettledAt: now,
  };
}

/**
 * 推进时间到 input.now 并按当前上下文重算状态。纯函数，不改动入参。
 *
 * 不变量：focusMs 非零时必等于 toMs - fromMs（整段计分，调用方据此按日切分入账）。
 *
 * @param {object} session
 * @param {{now:number, classification:string, focused:boolean, idle:boolean}} input
 */
export function step(session, input) {
  const { now, classification, focused, idle } = input;
  const s = { ...session };
  const fromMs = s.lastSettledAt;

  const wasFocusing = s.status === STATUS.FOCUSING;
  const focusMs = wasFocusing ? Math.max(0, now - fromMs) : 0;
  s.lastSettledAt = now;

  // 超时只在专注中判一次
  const penalties = wasFocusing && idle ? 1 : 0;

  let target;
  if (!focused || classification === 'neutral') {
    target = STATUS.PAUSED_AWAY;
  } else if (classification === 'distract') {
    target = STATUS.PAUSED_DISTRACTED;
  } else {
    target = STATUS.FOCUSING;
  }

  // 超时后必须等到有新的活动（idle 解除）才可能恢复专注
  if (target === STATUS.FOCUSING && idle) target = STATUS.WAITING_ACTIVITY;

  // 从专注切走本身就是一次"分心"的信号，扣一笔小分。
  // 超时那条已经扣过 10 分钟，不在这里叠加，否则同一动作被罚两次。
  const awayPenalties = wasFocusing && target !== STATUS.FOCUSING && penalties === 0 ? 1 : 0;

  const distractions =
    target === STATUS.PAUSED_DISTRACTED && s.status !== STATUS.PAUSED_DISTRACTED ? 1 : 0;

  if (target === STATUS.FOCUSING) {
    if (s.status !== STATUS.FOCUSING) s.startedAt = now;
    s.lastActivityAt = now;
  } else {
    s.startedAt = null;
  }
  s.status = target;

  return { session: s, focusMs, fromMs, toMs: now, penalties, awayPenalties, distractions };
}
