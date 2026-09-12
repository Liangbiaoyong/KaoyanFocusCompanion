import { judge } from './rules.mjs';

/**
 * 把前台样本翻译成 engine.step 的输入。
 * 前台是本程序自身时返回 skip，调用方必须整帧跳过——否则点一下桌宠就会打断计时。
 */
export function toEngineInput(sample, rules) {
  const verdict = judge(sample, rules);
  if (verdict.self) return { skip: true, input: null };
  return {
    skip: false,
    input: {
      classification: verdict.classification,
      focused: true,
      idle: verdict.idle,
    },
  };
}

/** 维护"最近前台窗口"滚动列表，供设置页挑选要加入学习外名单的站点 */
export function pushRecentTitle(list, sample, max = 10) {
  const title = String(sample?.title ?? '').trim();
  const current = Array.isArray(list) ? list : [];
  if (title === '') return current.slice();

  const rest = current.filter((entry) => entry.title !== title);
  const next = [{ title, process: sample.process ?? '', at: sample.at ?? 0 }, ...rest];
  return next.slice(0, max);
}
