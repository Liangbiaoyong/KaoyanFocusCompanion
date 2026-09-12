import { describe, it, expect, vi } from 'vitest';
import { parseProbeLine, mergeSample, createProbe } from '../src/probe.mjs';

describe('parseProbeLine', () => {
  it('解析合法样本', () => {
    const line = '{"title":"数学.pdf - Microsoft Edge","process":"msedge","pid":1,"minimized":false,"idleMs":188,"at":1789219683919}';
    expect(parseProbeLine(line)).toEqual({
      process: 'msedge',
      title: '数学.pdf - Microsoft Edge',
      url: null,
      idleMs: 188,
      at: 1789219683919,
    });
  });

  it('容忍首尾空白与 CR', () => {
    expect(parseProbeLine('  {"process":"x","title":"y","idleMs":1,"at":2}\r\n')?.process).toBe('x');
  });

  it('空行返回 null', () => {
    expect(parseProbeLine('')).toBeNull();
    expect(parseProbeLine('   ')).toBeNull();
    expect(parseProbeLine(undefined)).toBeNull();
  });

  it('非法 JSON 返回 null 而不抛异常', () => {
    expect(parseProbeLine('not json')).toBeNull();
    expect(parseProbeLine('{oops')).toBeNull();
  });

  it('JSON 不是对象时返回 null', () => {
    expect(parseProbeLine('123')).toBeNull();
    expect(parseProbeLine('"str"')).toBeNull();
    expect(parseProbeLine('null')).toBeNull();
  });

  it('字段类型不对时归一为默认值', () => {
    const s = parseProbeLine('{"process":123,"title":null,"idleMs":"abc","at":{}}');
    expect(s).toEqual({ process: '', title: '', url: null, idleMs: 0, at: 0 });
  });

  it('保留 url 字段', () => {
    expect(parseProbeLine('{"process":"msedge","title":"t","url":"https://zhihu.com/x","idleMs":0,"at":1}')?.url)
      .toBe('https://zhihu.com/x');
  });
});

describe('mergeSample', () => {
  it('url 为 null 时保留上一次的值', () => {
    const prev = { process: 'msedge', title: 'a', url: 'https://x.com', idleMs: 0, at: 1 };
    const next = { process: 'msedge', title: 'a', url: null, idleMs: 5, at: 2 };
    expect(mergeSample(prev, next).url).toBe('https://x.com');
  });

  it('url 有新值时覆盖', () => {
    const prev = { process: 'msedge', title: 'a', url: 'https://old.com', idleMs: 0, at: 1 };
    const next = { process: 'msedge', title: 'a', url: 'https://new.com', idleMs: 0, at: 2 };
    expect(mergeSample(prev, next).url).toBe('https://new.com');
  });

  it('进程变化时清空上一轮的 url（避免张冠李戴）', () => {
    const prev = { process: 'msedge', title: 'a', url: 'https://old.com', idleMs: 0, at: 1 };
    const next = { process: 'WINWORD.EXE', title: 'b', url: null, idleMs: 0, at: 2 };
    expect(mergeSample(prev, next).url).toBeNull();
  });

  it('没有上一次时 url 保持 null', () => {
    const next = { process: 'msedge', title: 'a', url: null, idleMs: 0, at: 2 };
    expect(mergeSample(null, next).url).toBeNull();
  });
});

describe('createProbe', () => {
  function fakeChild() {
    const handlers = {};
    return {
      stdout: { on: (ev, fn) => { handlers[ev] = fn; } },
      on: (ev, fn) => { handlers[`child:${ev}`] = fn; },
      kill: vi.fn(),
      emit: (ev, ...args) => handlers[ev]?.(...args),
    };
  }

  it('逐行回调解析后的样本', () => {
    const child = fakeChild();
    const onSample = vi.fn();
    createProbe({
      scriptPath: 'x.ps1',
      intervalMs: 1000,
      onSample,
      spawnImpl: () => child,
    });
    child.emit('data', Buffer.from('{"process":"msedge","title":"a","idleMs":0,"at":1}\n{"process":"msedge","title":"b","idleMs":0,"at":2}\n'));
    expect(onSample).toHaveBeenCalledTimes(2);
    expect(onSample.mock.calls[1][0].title).toBe('b');
  });

  it('跨 chunk 的半行被缓冲', () => {
    const child = fakeChild();
    const onSample = vi.fn();
    createProbe({ scriptPath: 'x.ps1', intervalMs: 1000, onSample, spawnImpl: () => child });
    child.emit('data', Buffer.from('{"process":"msedge","tit'));
    expect(onSample).not.toHaveBeenCalled();
    child.emit('data', Buffer.from('le":"a","idleMs":0,"at":1}\n'));
    expect(onSample).toHaveBeenCalledTimes(1);
    expect(onSample.mock.calls[0][0].title).toBe('a');
  });

  it('stop 杀掉子进程', () => {
    const child = fakeChild();
    const probe = createProbe({ scriptPath: 'x.ps1', intervalMs: 1000, onSample: () => {}, spawnImpl: () => child });
    probe.stop();
    expect(child.kill).toHaveBeenCalled();
  });

  it('子进程报错走 onError', () => {
    const child = fakeChild();
    const onError = vi.fn();
    createProbe({ scriptPath: 'x.ps1', intervalMs: 1000, onSample: () => {}, onError, spawnImpl: () => child });
    child.emit('child:error', new Error('spawn failed'));
    expect(onError).toHaveBeenCalled();
  });
});
