import { describe, it, expect } from 'vitest';
import { selfProcessName, buildRules } from '../src/self.mjs';
import { judge, normalizeProcess } from '../src/rules.mjs';

const DEFAULTS = {
  mode: 'browser',
  exactMode: false,
  browsers: ['msedge.exe'],
  blockedKeywords: [],
  blockedDomains: [],
  selfProcesses: ['electron.exe'],
  watchdogMs: 600000,
};

describe('selfProcessName', () => {
  it('取小写文件名', () => {
    expect(selfProcessName('D:\\app\\KaoyanFocusCompanion.exe')).toBe('kaoyanfocuscompanion.exe');
  });

  it('POSIX 路径也行', () => {
    expect(selfProcessName('/usr/bin/node')).toBe('node');
  });

  it('空值返回空串', () => {
    expect(selfProcessName('')).toBe('');
    expect(selfProcessName(undefined)).toBe('');
  });
});

describe('buildRules', () => {
  it('用户规则覆盖默认值', () => {
    const rules = buildRules(DEFAULTS, { mode: 'global' }, 600000, 'D:\\a\\app.exe');
    expect(rules.mode).toBe('global');
  });

  it('把自身进程名并进 selfProcesses —— 打包态', () => {
    const rules = buildRules(DEFAULTS, {}, 600000, 'D:\\x\\KaoyanFocusCompanion.exe');
    expect(rules.selfProcesses).toContain('kaoyanfocuscompanion.exe');
  });

  it('把自身进程名并进 selfProcesses —— 开发态', () => {
    const rules = buildRules(DEFAULTS, {}, 600000, 'C:\\node_modules\\electron\\dist\\electron.exe');
    expect(rules.selfProcesses).toContain('electron.exe');
  });

  it('不产生重复项', () => {
    const rules = buildRules(DEFAULTS, {}, 600000, 'C:\\x\\electron.exe');
    expect(rules.selfProcesses.filter((p) => p === 'electron.exe')).toHaveLength(1);
  });

  it('路径为空时不塞空串进名单（空串会误判所有样本为自身）', () => {
    const rules = buildRules(DEFAULTS, {}, 600000, '');
    expect(rules.selfProcesses).not.toContain('');
  });

  it('watchdogMs 由设置驱动', () => {
    expect(buildRules(DEFAULTS, {}, 1234, 'x.exe').watchdogMs).toBe(1234);
  });

  it('不传 watchdogMs 时保留原值', () => {
    expect(buildRules(DEFAULTS, {}, null, 'x.exe').watchdogMs).toBe(600000);
  });

  it('不改动入参', () => {
    const snapshot = JSON.stringify(DEFAULTS);
    buildRules(DEFAULTS, {}, 1, 'D:\\a\\b.exe');
    expect(JSON.stringify(DEFAULTS)).toBe(snapshot);
  });
});

describe('端到端：打包态的自身样本必须被判为 self', () => {
  it('KaoyanFocusCompanion.exe 在前台时 judge 返回 self', () => {
    const rules = buildRules(DEFAULTS, {}, 600000, 'D:\\dist\\KaoyanFocusCompanion.exe');
    const verdict = judge(
      { process: 'KaoyanFocusCompanion', title: '考研专注养成', url: null, idleMs: 0, at: 1 },
      rules,
    );
    expect(verdict.self).toBe(true);
  });

  it('对照：名单没并进自身时会误判成 neutral（这个 bug 的实际后果）', () => {
    const stale = { ...DEFAULTS }; // 只有 electron.exe，没有打包名
    const verdict = judge(
      { process: 'KaoyanFocusCompanion', title: '考研专注养成', url: null, idleMs: 0, at: 1 },
      stale,
    );
    expect(verdict.self).toBe(false);
    expect(verdict.classification).toBe('neutral');
  });

  it('正常浏览器样本仍然计分', () => {
    const rules = buildRules(DEFAULTS, {}, 600000, 'D:\\dist\\KaoyanFocusCompanion.exe');
    const verdict = judge(
      { process: 'msedge.exe', title: '数学.pdf', url: null, idleMs: 0, at: 1 },
      rules,
    );
    expect(verdict.self).toBe(false);
    expect(verdict.classification).toBe('study');
    expect(normalizeProcess('msedge.exe')).toBe('msedge.exe');
  });
});
