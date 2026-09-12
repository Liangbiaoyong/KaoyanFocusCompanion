import { describe, it, expect, vi } from 'vitest';
import { createFileArea } from '../src/file-store.mjs';

describe('createFileArea', () => {
  it('get 返回 {key: value} 形状，兼容 chrome.storage', async () => {
    const area = createFileArea({ load: () => ({ settings: { a: 1 } }), save: () => {} });
    expect(await area.get('settings')).toEqual({ settings: { a: 1 } });
  });

  it('缺失的 key 返回空对象', async () => {
    const area = createFileArea({ load: () => ({}), save: () => {} });
    expect(await area.get('nope')).toEqual({});
  });

  it('set 合并写入并落盘', async () => {
    const saved = [];
    const area = createFileArea({ load: () => ({ a: 1 }), save: (d) => saved.push({ ...d }) });
    await area.set({ b: 2 });
    await area.set({ a: 9 });
    expect(saved[saved.length - 1]).toEqual({ a: 9, b: 2 });
    expect(await area.get('a')).toEqual({ a: 9 });
  });

  it('load 返回 null / undefined 时按空对象处理', async () => {
    const area = createFileArea({ load: () => null, save: () => {} });
    expect(await area.get('x')).toEqual({});
  });

  it('save 抛错不影响 set 成功', async () => {
    const onError = vi.fn();
    const area = createFileArea({
      load: () => ({}),
      save: () => { throw new Error('disk full'); },
      onError,
    });
    await expect(area.set({ a: 1 })).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalled();
    expect(await area.get('a')).toEqual({ a: 1 });
  });

  it('多次 set 共享同一份内存状态', async () => {
    const area = createFileArea({ load: () => ({}), save: () => {} });
    await area.set({ a: 1 });
    await area.set({ b: 2 });
    expect(await area.get('b')).toEqual({ b: 2 });
  });
});
