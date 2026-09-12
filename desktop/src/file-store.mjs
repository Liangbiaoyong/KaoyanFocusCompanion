/**
 * 把一份内存对象包装成 chrome.storage.local 形状的 area，
 * 使 src/lib/storage.js 的 createStore 可以直接注入，无需改动。
 *
 * set 之后立刻同步落盘；落盘失败只上报，不影响内存状态（计分不能因为磁盘问题中断）。
 */
export function createFileArea({ load, save, onError } = {}) {
  let data = load?.() ?? {};
  if (typeof data !== 'object' || data === null) data = {};

  const report = (error) => {
    if (typeof onError === 'function') onError(error);
  };

  return {
    async get(key) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(obj) {
      if (obj && typeof obj === 'object') {
        Object.assign(data, obj);
        try {
          save?.(data);
        } catch (error) {
          report(error);
        }
      }
    },
  };
}
