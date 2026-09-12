const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, Menu } = require('electron');

/** 数据文件位置与读写。内联在主进程里，避免多一个模块。 */
function dataFilePath(userDataDir) {
  return path.join(userDataDir, 'kaoyan-focus-state.json');
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/** 动态加载 ESM 模块。主进程是 CJS，必须转成 file URL 才能 import。 */
const load = (filePath) => import(pathToFileURL(filePath).href);

/**
 * Windows 上 Electron 的主进程 stdout 不会进父进程终端，
 * 所以错误必须自己落盘，否则只能靠猜。
 */
let logFile = null;
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map((a) => (a instanceof Error ? a.stack : String(a))).join(' ')}\n`;
  try {
    if (logFile) {
      fs.mkdirSync(path.dirname(logFile), { recursive: true });
      fs.appendFileSync(logFile, line);
    }
  } catch {
    /* 日志写不了也不能影响运行 */
  }
  console.log(...args);
}

const ROOT = path.join(__dirname, '..');

let petWindow = null;
let settingsWindow = null;
let probe = null;
let urlProbe = null;
let paused = false;
let disposed = false;
let busy = false;

let session = null;
let account = null;
let daily = {};
let settings = null;
let rules = null;
let recentWindows = [];
let lastSample = null;
let pendingUrl = null;
let sawFirstSample = false;
let store = null;

let createStore = null;
let normalizeSettings = null;
let step = null;
let initialSession = null;
let applyStep = null;
let createAccount = null;
let buildSnapshot = null;
let dayKey = null;
let createFileArea = null;
let createProbe = null;
let mergeSample = null;
let toEngineInput = null;
let pushRecentTitle = null;
let DEFAULT_RULES = null;

async function loadModules() {
  const core = (p) => load(path.join(ROOT, 'src', p));
  const own = (p) => load(path.join(__dirname, 'src', p));

  ({ createStore } = await core('lib/storage.js'));
  ({ normalizeSettings } = await core('lib/settings.js'));
  ({ step, initialSession } = await core('core/engine.js'));
  ({ applyStep, createAccount } = await core('core/account.js'));
  ({ buildSnapshot } = await core('lib/snapshot.js'));
  ({ dayKey } = await core('core/time.js'));

  ({ createFileArea } = await own('file-store.mjs'));
  ({ createProbe, mergeSample } = await own('probe.mjs'));
  ({ toEngineInput, pushRecentTitle } = await own('detect.mjs'));
  ({ DEFAULT_RULES } = await own('rules.mjs'));
}

// —— 窗口 ——

function createPetWindow(savedBounds) {
  petWindow = new BrowserWindow({
    width: 220,
    height: 260,
    x: savedBounds?.x,
    y: savedBounds?.y,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-pet.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.loadFile(path.join(__dirname, 'pet/index.html'));
  petWindow.on('moved', () => {
    const [x, y] = petWindow.getPosition();
    persistBounds({ x, y });
  });
  petWindow.on('closed', () => { petWindow = null; });
}

function persistBounds(bounds) {
  try {
    const file = dataFilePath(app.getPath('userData'));
    const data = loadJson(file);
    data.petBounds = bounds;
    saveJson(file, data);
  } catch {
    /* 位置存不下不影响计时 */
  }
}

function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 560,
    height: 680,
    title: '考研专注养成 · 设置',
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings/index.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function broadcastSnapshot() {
  if (!petWindow || !account) return;
  if (paused) {
    petWindow.webContents.send('pet:snapshot', { paused: true });
    return;
  }
  petWindow.webContents.send(
    'pet:snapshot',
    buildSnapshot({ account, daily, settings, session }, Date.now()),
  );
}

// —— 探针 ——

function startBaseProbe() {
  probe = createProbe({
    scriptPath: path.join(__dirname, 'native/foreground.ps1'),
    intervalMs: 1000,
    onSample,
    onError: (error) => console.error('[桌宠] 探针错误：', error.message),
  });
}

/**
 * 精确模式才跑 UIA 探针。它会唤醒浏览器的无障碍树并让浏览器常驻该模式，
 * 查询本身也远比读窗口标题贵，所以频率压到 3 秒、关掉即停。
 */
function refreshUrlProbe() {
  const wanted = rules?.exactMode === true;
  if (wanted && !urlProbe) {
    urlProbe = createProbe({
      scriptPath: path.join(__dirname, 'native/uia-url.ps1'),
      intervalMs: 3000,
      onSample: (sample) => { pendingUrl = sample.url; },
      onError: (error) => console.error('[桌宠] 精确探针错误：', error.message),
    });
  } else if (!wanted && urlProbe) {
    urlProbe.stop();
    urlProbe = null;
    pendingUrl = null;
  }
}

async function onSample(rawSample) {
  if (disposed || paused || busy) return;
  busy = true;
  try {
    if (!sawFirstSample) {
      sawFirstSample = true;
      log('收到第一个探针样本:', JSON.stringify(rawSample));
    }
    const sample = mergeSample(lastSample, {
      ...rawSample,
      url: rules.exactMode ? pendingUrl : null,
    });
    lastSample = sample;
    recentWindows = pushRecentTitle(recentWindows, sample);

    const { skip, input } = toEngineInput(sample, rules);
    if (skip) return; // 前台是桌宠自己，整帧跳过，避免点一下宠物就打断计时

    const now = Date.now();
    const result = step(session, { now, ...input });
    const next = applyStep(account, daily, result, settings);
    session = result.session;
    account = next.account;
    daily = next.daily;

    await store.saveState({ session, account });
    await store.saveDaily(daily);
    broadcastSnapshot();
  } catch (error) {
    log('计时循环出错:', error);
  } finally {
    busy = false;
  }
}

// —— 启动 ——

async function start() {
  await loadModules();
  log('模块加载完成');

  const file = dataFilePath(app.getPath('userData'));
  logFile = path.join(app.getPath('userData'), 'kaoyan-focus.log');
  const raw = loadJson(file);
  const now = Date.now();
  log('数据文件:', file, '| 已有键:', Object.keys(raw).join(',') || '(空)');

  store = createStore(createFileArea({
    load: () => raw,
    save: (data) => saveJson(file, data),
    onError: (error) => log('落盘失败:', error),
  }));

  settings = normalizeSettings(raw.settings, now);
  rules = { ...DEFAULT_RULES, ...(raw.rules ?? {}), watchdogMs: settings.watchdogMs };
  daily = raw.daily ?? {};
  const state = raw.state ?? {
    session: initialSession(now),
    account: createAccount(dayKey(now)),
  };
  session = state.session;
  account = state.account;

  createPetWindow(raw.petBounds ?? null);
  log('桌宠窗口已创建');
  startBaseProbe();
  refreshUrlProbe();
  log('探针已启动');
  broadcastSnapshot();
}

// —— IPC ——

ipcMain.handle('pet:get-snapshot', () => {
  if (!account) return null;
  if (paused) return { paused: true };
  return buildSnapshot({ account, daily, settings, session }, Date.now());
});

ipcMain.handle('pet:toggle-pause', () => {
  paused = !paused;
  broadcastSnapshot();
  return { paused };
});

ipcMain.handle('pet:open-settings', () => {
  openSettingsWindow();
});

ipcMain.handle('pet:quit', () => {
  app.quit();
});

ipcMain.on('pet:show-menu', () => {
  const menu = Menu.buildFromTemplate([
    { label: paused ? '继续计时' : '暂停计时', click: () => { paused = !paused; broadcastSnapshot(); } },
    { label: '设置…', click: openSettingsWindow },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);
  menu.popup({ window: petWindow });
});

ipcMain.handle('settings:get', () => ({ settings, rules }));

ipcMain.handle('settings:save', async (_event, payload) => {
  settings = normalizeSettings(payload.settings, Date.now());
  rules = { ...DEFAULT_RULES, ...payload.rules, watchdogMs: settings.watchdogMs };
  await store.saveSettings(payload.settings);
  await store.set('rules', rules);
  refreshUrlProbe();
  broadcastSnapshot();
  return { ok: true };
});

ipcMain.handle('settings:recent', () => recentWindows);

ipcMain.handle('settings:close', () => {
  settingsWindow?.close();
});

// —— 生命周期 ——

app.whenReady().then(start).catch((error) => {
  log('启动失败:', error);
  app.quit();
});

app.on('before-quit', () => {
  disposed = true;
  probe?.stop();
  urlProbe?.stop();
});
