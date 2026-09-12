import { describe, it, expect } from 'vitest';
import { toEngineInput, pushRecentTitle } from '../src/detect.mjs';

const R = {
  mode: 'browser',
  exactMode: false,
  browsers: ['msedge.exe'],
  blockedKeywords: ['知乎'],
  blockedDomains: ['zhihu.com'],
  selfProcesses: ['electron.exe'],
  watchdogMs: 10 * 60 * 1000,
};

const sample = (over = {}) => ({
  process: 'msedge.exe', title: '数学.pdf', url: null, idleMs: 0, at: 1, ...over,
});

describe('toEngineInput', () => {
  it('学习内容 → classification=study, focused=true, idle=false', () => {
    expect(toEngineInput(sample(), R)).toEqual({
      skip: false,
      input: { classification: 'study', focused: true, idle: false },
    });
  });

  it('学习外 → classification=distract', () => {
    expect(toEngineInput(sample({ title: '知乎 - 有问题' }), R).input.classification).toBe('distract');
  });

  it('非学习来源 → classification=neutral', () => {
    expect(toEngineInput(sample({ process: 'WINWORD.EXE' }), R).input.classification).toBe('neutral');
  });

  it('空闲 → idle=true 且 classification 仍为 study', () => {
    const r = toEngineInput(sample({ idleMs: 10 * 60 * 1000 }), R);
    expect(r.input).toEqual({ classification: 'study', focused: true, idle: true });
  });

  it('前台是本程序自身 → skip=true 且不产出 input', () => {
    const r = toEngineInput(sample({ process: 'electron.exe' }), R);
    expect(r.skip).toBe(true);
    expect(r.input).toBeNull();
  });

  it('focused 恒为 true（桌面端总有前台窗口）', () => {
    expect(toEngineInput(sample({ process: 'WINWORD.EXE' }), R).input.focused).toBe(true);
  });
});

describe('pushRecentTitle', () => {
  const item = (title, process = 'msedge.exe', at = 1) => ({ title, process, at });

  it('新标题置顶', () => {
    const list = pushRecentTitle([item('a')], sample({ title: 'b', at: 2 }));
    expect(list.map((x) => x.title)).toEqual(['b', 'a']);
  });

  it('重复标题被提到最前而不是重复插入', () => {
    const list = pushRecentTitle([item('a'), item('b')], sample({ title: 'b', at: 3 }));
    expect(list.map((x) => x.title)).toEqual(['b', 'a']);
    expect(list).toHaveLength(2);
  });

  it('空标题不入列表', () => {
    expect(pushRecentTitle([item('a')], sample({ title: '  ' }))).toHaveLength(1);
  });

  it('超出上限时截断尾部', () => {
    let list = [];
    for (let i = 0; i < 15; i += 1) list = pushRecentTitle(list, sample({ title: `t${i}`, at: i }), 10);
    expect(list).toHaveLength(10);
    expect(list[0].title).toBe('t14');
    expect(list[9].title).toBe('t5');
  });

  it('不改动入参数组', () => {
    const original = [item('a')];
    const snapshot = JSON.stringify(original);
    pushRecentTitle(original, sample({ title: 'b' }));
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});
