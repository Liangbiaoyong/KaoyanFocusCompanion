import { describe, it, expect } from 'vitest';
import { createStore, STORAGE_KEYS } from '../src/lib/storage.js';
import { DEFAULT_STUDY_RULES } from '../src/core/sites.js';

const NOW = new Date(2026, 8, 12, 15, 0).getTime();

/** 内存版 storage area，接口与 chrome.storage.local 一致 */
function fakeArea(initial = {}) {
  let data = { ...initial };
  return {
    async get(key) {
      if (typeof key === 'string') return key in data ? { [key]: data[key] } : {};
      return { ...data };
    },
    async set(obj) {
      data = { ...data, ...obj };
    },
    snapshot: () => ({ ...data }),
  };
}

describe('createStore', () => {
  it('get 缺省时返回 fallback', async () => {
    const store = createStore(fakeArea());
    expect(await store.get('nope', 42)).toBe(42);
  });

  it('set 后能读回', async () => {
    const store = createStore(fakeArea());
    await store.set('x', { a: 1 });
    expect(await store.get('x', null)).toEqual({ a: 1 });
  });

  it('站点规则缺省为内置 PDF 规则', async () => {
    const store = createStore(fakeArea());
    const rules = await store.loadSiteRules();
    expect(rules.study).toEqual(DEFAULT_STUDY_RULES);
    expect(rules.distract).toEqual([]);
  });

  it('设置读写往返', async () => {
    const store = createStore(fakeArea());
    await store.saveSettings({ dailyGoalMinutes: 240 });
    const s = await store.loadSettings(NOW);
    expect(s.dailyGoalMs).toBe(240 * 60000);
  });

  it('state / daily / snapshot 各自独立存取', async () => {
    const store = createStore(fakeArea());
    await store.saveState({ a: 1 });
    await store.saveDaily({ '2026-09-12': { focusMs: 1 } });
    await store.saveSnapshot({ b: 2 });
    expect(await store.loadState()).toEqual({ a: 1 });
    expect(await store.loadDaily()).toEqual({ '2026-09-12': { focusMs: 1 } });
    expect(await store.loadSnapshot()).toEqual({ b: 2 });
  });

  it('写入使用约定的 storage key', async () => {
    const area = fakeArea();
    const store = createStore(area);
    await store.saveState({ a: 1 });
    await store.saveDaily({});
    await store.saveSiteRules({ study: [], distract: [] });
    expect(Object.keys(area.snapshot()).sort()).toEqual(
      [STORAGE_KEYS.state, STORAGE_KEYS.daily, STORAGE_KEYS.siteRules].sort(),
    );
  });

  it('daily 缺省为空对象', async () => {
    const store = createStore(fakeArea());
    expect(await store.loadDaily()).toEqual({});
  });
});