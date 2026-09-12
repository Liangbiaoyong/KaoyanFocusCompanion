import { createStore, STORAGE_KEYS } from '../../src/lib/storage.js';
import { createClassifier } from '../../src/core/sites.js';
import { initialSession, step } from '../../src/core/engine.js';
import { createAccount, applyStep } from '../../src/core/account.js';
import { buildSnapshot } from '../../src/lib/snapshot.js';
import { dayKey } from '../../src/core/time.js';

const store = createStore(chrome.storage.local);

let classifier = createClassifier({ study: [], distract: [] });
let settingsCache = null;
let rulesLoaded = false;
let tickQueue = Promise.resolve();

async function ensureLoaded(now) {
  if (!settingsCache) settingsCache = await store.loadSettings(now);
  if (!rulesLoaded) {
    classifier = createClassifier(await store.loadSiteRules());
    rulesLoaded = true;
  }
  return settingsCache;
}

function applyWatchdog(settings) {
  const seconds = Math.max(15, Math.round(settings.watchdogMs / 1000));
  chrome.idle.setDetectionInterval(seconds);
  return seconds;
}

/**
 * 把浏览器状态换算成 engine.step 的输入。
 * idle 的初值是 false：idle API 出错时按"未超时"处理，避免凭空扣分。
 */
async function readInput(settings, now) {
  let classification = 'neutral';
  let focused = false;
  let idle = false;

  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    classification = classifier(tab?.url ?? '');
  } catch {
    /* 无窗口、无标签时按中性处理 */
  }

  try {
    const win = await chrome.windows.getLastFocused();
    focused = win?.focused === true && win?.state !== 'minimized';
  } catch {
    /* 无窗口 */
  }

  try {
    const seconds = Math.max(15, Math.round(settings.watchdogMs / 1000));
    idle = (await chrome.idle.queryState(seconds)) !== 'active';
  } catch {
    /* 见函数注释 */
  }

  return { now, classification, focused, idle };
}

async function tick() {
  const now = Date.now();
  const settings = await ensureLoaded(now);

  const raw = (await store.loadState()) ?? {
    session: initialSession(now),
    account: createAccount(dayKey(now)),
  };
  const daily = await store.loadDaily();

  const result = step(raw.session, await readInput(settings, now));
  const next = applyStep(raw.account, daily, result, settings);

  await store.saveState({ session: result.session, account: next.account });
  await store.saveDaily(next.daily);
  await store.saveSnapshot(
    buildSnapshot(
      { account: next.account, daily: next.daily, settings, session: result.session },
      now,
    ),
  );
}

/** 事件可能并发触发，串行化避免读到半写状态 */
function kick() {
  tickQueue = tickQueue.then(tick, tick);
}

chrome.alarms.create('tick', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'tick') kick();
});

for (const event of [chrome.tabs.onActivated, chrome.tabs.onUpdated, chrome.windows.onFocusChanged]) {
  event.addListener(() => kick());
}

chrome.idle.onStateChanged.addListener(() => kick());

const LAUNCHER_KEY = 'launcherWindowId';

/**
 * 点扩展图标 → 打开（或唤回）控制台小窗口。
 * 悬浮窗必须由一个活着的文档发起，所以控制台窗口不能关，只能最小化。
 */
async function openLauncher() {
  const stored = await chrome.storage.local.get(LAUNCHER_KEY);
  const id = stored[LAUNCHER_KEY];
  if (typeof id === 'number') {
    try {
      await chrome.windows.update(id, { focused: true });
      return;
    } catch {
      /* 窗口已关闭，往下走新建一个 */
    }
  }
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL('floating/launcher.html'),
    type: 'popup',
    width: 380,
    height: 340,
    left: 60,
    top: 60,
  });
  await chrome.storage.local.set({ [LAUNCHER_KEY]: win.id });
}

chrome.action.onClicked.addListener(() => {
  openLauncher();
});

chrome.windows.onRemoved.addListener(async (windowId) => {
  const stored = await chrome.storage.local.get(LAUNCHER_KEY);
  if (stored[LAUNCHER_KEY] === windowId) {
    await chrome.storage.local.remove(LAUNCHER_KEY);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[STORAGE_KEYS.settings]) {
    store.loadSettings(Date.now()).then((settings) => {
      settingsCache = settings;
      applyWatchdog(settings);
      kick();
    });
  }
  if (changes[STORAGE_KEYS.siteRules]) {
    store.loadSiteRules().then((rules) => {
      classifier = createClassifier(rules);
      kick();
    });
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  const now = Date.now();
  if (!(await store.loadState())) {
    await store.saveState({
      session: initialSession(now),
      account: createAccount(dayKey(now)),
    });
  }
  settingsCache = await store.loadSettings(now);
  applyWatchdog(settingsCache);
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding/index.html') });
  }
  kick();
});

(async () => {
  const now = Date.now();
  const settings = await ensureLoaded(now);
  applyWatchdog(settings);
  kick();
})();
