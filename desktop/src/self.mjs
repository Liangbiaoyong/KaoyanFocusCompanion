import path from 'node:path';

/** 当前可执行文件名（小写）。开发态是 electron.exe，打包后是 KaoyanFocusCompanion.exe。 */
export function selfProcessName(execPath) {
  const base = path.basename(String(execPath ?? '')).toLowerCase();
  return base;
}

/**
 * 组装判定规则。
 *
 * 为什么必须动态并入自身进程名：写死名单只能覆盖一种运行形态。
 * 开发态进程是 electron.exe、打包后是 KaoyanFocusCompanion.exe，
 * 漏掉哪个，哪个形态下"点一下桌宠自己"就会被判成离开学习内容而打断计时。
 */
export function buildRules(defaults, rawRules, watchdogMs, execPath) {
  const merged = { ...defaults, ...(rawRules ?? {}) };
  const self = selfProcessName(execPath);
  const list = [...(merged.selfProcesses ?? [])];
  if (self !== '' && !list.some((p) => String(p).toLowerCase() === self)) list.push(self);
  merged.selfProcesses = list;
  if (watchdogMs) merged.watchdogMs = watchdogMs;
  return merged;
}
