import { normalizeSettings } from './settings.js';
import { DEFAULT_STUDY_RULES } from '../core/sites.js';

export const STORAGE_KEYS = {
  settings: 'settings',
  state: 'state',
  daily: 'daily',
  siteRules: 'siteRules',
  snapshot: 'snapshot',
};

/**
 * @param {{get: Function, set: Function}} area  chrome.storage.local 或测试替身
 */
export function createStore(area) {
  const get = async (key, fallback) => {
    const obj = await area.get(key);
    return obj[key] ?? fallback;
  };
  const set = (key, value) => area.set({ [key]: value });

  return {
    get,
    set,
    async loadSettings(now) {
      return normalizeSettings(await get(STORAGE_KEYS.settings, null), now);
    },
    saveSettings(raw) {
      return set(STORAGE_KEYS.settings, raw);
    },
    loadState() {
      return get(STORAGE_KEYS.state, null);
    },
    saveState(state) {
      return set(STORAGE_KEYS.state, state);
    },
    loadDaily() {
      return get(STORAGE_KEYS.daily, {});
    },
    saveDaily(daily) {
      return set(STORAGE_KEYS.daily, daily);
    },
    async loadSiteRules() {
      const rules = await get(STORAGE_KEYS.siteRules, null);
      return {
        study: rules?.study ?? DEFAULT_STUDY_RULES,
        distract: rules?.distract ?? [],
      };
    },
    saveSiteRules(rules) {
      return set(STORAGE_KEYS.siteRules, rules);
    },
    loadSnapshot() {
      return get(STORAGE_KEYS.snapshot, null);
    },
    saveSnapshot(data) {
      return set(STORAGE_KEYS.snapshot, data);
    },
  };
}