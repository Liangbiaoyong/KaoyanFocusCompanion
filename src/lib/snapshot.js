import { stageFor, mountain, spiritMood } from '../core/growth.js';
import { emptyDay } from '../core/account.js';

/**
 * 把持久化的原始状态组合成 UI 直接可渲染的快照。纯函数。
 */
export function buildSnapshot({ account, daily, settings, session }, now) {
  return {
    account,
    settings,
    session,
    stage: stageFor(account.growthMs),
    mountain: mountain({ lifetimeFocusMs: account.lifetimeFocusMs, settings, now }),
    mood: spiritMood(account.spirit),
    today: daily?.[account.todayDate] ?? emptyDay(),
    updatedAt: now,
  };
}
