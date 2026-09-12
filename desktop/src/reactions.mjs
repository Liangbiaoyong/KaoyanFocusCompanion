/**
 * 把一次 tick 的前后差异翻译成桌宠该做的反馈动作。
 *
 * 为什么需要：只扣成长值是"安静"的惩罚，你根本感觉不到，也就不会改。
 * 反馈必须在事件发生的那一秒就有视觉响应。
 *
 * 纯函数：只描述"发生了什么"，不关心怎么画。
 */

const KIND = Object.freeze({
  TIMEOUT: 'timeout',
  AWAY: 'away',
  AWAY_THROTTLED: 'awayThrottled',
  DISTRACT: 'distract',
  RESUME: 'resume',
  EVOLVE: 'evolve',
  DEGRADE: 'degrade',
  GOAL: 'goal',
});

export { KIND };

/**
 * @param {{status: string, stageIndex: number, stageName: string, metGoal: boolean}} before
 * @param {{status: string, stageIndex: number, stageName: string, metGoal: boolean}} after
 * @param {{penalties: number, awayPenalties: number, distractions: number}} result
 * @param {{awayPenaltyMs: number}} settings
 * @returns {Array<{kind: string, penaltyMinutes?: number, stageName?: string}>}
 */
export function deriveReactions(before, after, result, settings) {
  const events = [];

  // 超时和切走互斥：超时那条已经扣了 10 分钟，不再报"切走"
  if (result.penalties > 0) {
    events.push({ kind: KIND.TIMEOUT, penaltyMinutes: 10 });
  } else if (result.awayPenalties > 0) {
    events.push({
      kind: KIND.AWAY,
      penaltyMinutes: Math.round((settings?.awayPenaltyMs ?? 0) / 60000),
    });
  } else if (result.awayPenaltyThrottled) {
    // 节流窗口内不再扣分。仍然提醒一句，但**不能**声称扣了分钟数——
    // 那是骗人，下次你就不会信这个提示了。
    events.push({ kind: KIND.AWAY_THROTTLED });
  }

  if (result.distractions > 0) {
    events.push({ kind: KIND.DISTRACT });
  }

  if (before.status !== 'FOCUSING' && after.status === 'FOCUSING') {
    events.push({ kind: KIND.RESUME });
  }

  if (after.stageIndex > before.stageIndex) {
    events.push({ kind: KIND.EVOLVE, stageName: after.stageName });
  } else if (after.stageIndex < before.stageIndex) {
    events.push({ kind: KIND.DEGRADE, stageName: after.stageName });
  }

  if (!before.metGoal && after.metGoal) {
    events.push({ kind: KIND.GOAL });
  }

  return events;
}

/** 每条反馈配一个中文短语，供浮层直接显示 */
export function reactionLabel(event) {
  switch (event.kind) {
    case KIND.TIMEOUT: return '发呆超时 · 扣 10 分钟';
    case KIND.AWAY: return `切走了 · 扣 ${event.penaltyMinutes} 分钟`;
    case KIND.AWAY_THROTTLED: return '又切走了';
    case KIND.DISTRACT: return '走神 +1';
    case KIND.RESUME: return '回来了';
    case KIND.EVOLVE: return `进化 · ${event.stageName}`;
    case KIND.DEGRADE: return `退回 ${event.stageName}`;
    case KIND.GOAL: return '今天达标了';
    default: return '';
  }
}

/** 每条反馈对应的情绪基调，决定配色 */
export function reactionTone(event) {
  switch (event.kind) {
    case KIND.TIMEOUT:
    case KIND.DEGRADE: return 'bad';
    case KIND.AWAY:
    case KIND.DISTRACT: return 'warn';
    case KIND.AWAY_THROTTLED: return 'neutral';
    case KIND.RESUME:
    case KIND.EVOLVE:
    case KIND.GOAL: return 'good';
    default: return 'neutral';
  }
}
