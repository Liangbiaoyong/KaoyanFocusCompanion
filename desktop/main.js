const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen } = require('electron');

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
  const line = `[${new Date().toISOString()}] ${args
    .map((a) => (a instanceof Error ? a.stack : String(a)))
    .join(' ')}\n`;
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

/**
 * 共享纯逻辑（src/core、src/lib）的位置。
 * 开发态在仓库根的 src/；打包后由 --extra-resource 放进 resources/src。
 */
function coreRoot() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'src')
    : path.join(__dirname, '..', 'src');
}

let petWindow = null;
let settingsWindow = null;
let statsWindow = null;
let tray = null;
let probe = null;
let urlProbe = null;
let petBounds = null;
let paused = false;
let disposed = false;
let stopped = false;
let busy = false;
let baseProbeFailures = 0;
let urlProbeFailures = 0;

let session = null;
let account = null;
let daily = {};
let settings = null;
let rules = null;
let recentWindows = [];
let lastSample = null;
let pendingUrl = null;
let sawFirstSample = false;
let dataFile = null;
let rawData = {};
let store = null;

let createStore = null;
let normalizeSettings = null;
let step = null;
let initialSession = null;
let applyStep = null;
let createAccount = null;
let buildSnapshot = null;
let stageFor = null;
let dayKey = null;
let createFileArea = null;
let createProbe = null;
let mergeSample = null;
let toEngineInput = null;
let pushRecentTitle = null;
let buildRules = null;
let addSegment = null;
let recordSegments = null;
let addDistraction = null;
let deriveReactions = null;
let clampToWorkAreas = null;
let DEFAULT_RULES = null;

async function loadModules() {
  const core = (p) => load(path.join(coreRoot(), p));
  const own = (p) => load(path.join(__dirname, 'src', p));

  ({ createStore } = await core('lib/storage.js'));
  ({ normalizeSettings } = await core('lib/settings.js'));
  ({ step, initialSession } = await core('core/engine.js'));
  ({ applyStep, createAccount } = await core('core/account.js'));
  ({ buildSnapshot } = await core('lib/snapshot.js'));
  ({ stageFor } = await core('core/growth.js'));
  ({ dayKey } = await core('core/time.js'));

  ({ createFileArea } = await own('file-store.mjs'));
  ({ createProbe, mergeSample } = await own('probe.mjs'));
  ({ toEngineInput, pushRecentTitle } = await own('detect.mjs'));
  ({ buildRules } = await own('self.mjs'));
  ({ addSegment, recordSegments, addDistraction } = await own('segments.mjs'));
  ({ deriveReactions } = await own('reactions.mjs'));
  ({ clampToWorkAreas } = await own('placement.mjs'));
  ({ DEFAULT_RULES } = await own('rules.mjs'));
}

// —— 窗口 ——

function createPetWindow(bounds) {
  // 副屏拔掉后旧坐标会落在屏幕外，凤凰就找不回来了，启动时校正一次
  petBounds = clampToWorkAreas(
    bounds ?? petBounds,
    screen.getAllDisplays().map((display) => display.workArea),
  );
  petWindow = new BrowserWindow({
    width: 220,
    height: 252,
    x: petBounds?.x,
    y: petBounds?.y,
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
    petBounds = { x, y };
    persistBounds(petBounds);
  });
  petWindow.on('closed', () => { petWindow = null; });
  broadcastSnapshot();
}

function persistBounds(bounds) {
  try {
    rawData.petBounds = bounds;
    saveJson(dataFile, rawData);
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
    width: 580,
    height: 720,
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

function openStatsWindow() {
  if (statsWindow) {
    statsWindow.focus();
    statsWindow.webContents.send('stats:refresh');
    return;
  }
  statsWindow = new BrowserWindow({
    width: 560,
    height: 660,
    title: '考研专注养成 · 统计',
    webPreferences: {
      preload: path.join(__dirname, 'preload-stats.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  statsWindow.loadFile(path.join(__dirname, 'stats/index.html'));
  statsWindow.on('closed', () => { statsWindow = null; });
}

function snapshotNow() {
  if (!account) return null;
  if (paused) return { paused: true };
  return buildSnapshot({ account, daily, settings, session }, Date.now());
}

function broadcastSnapshot() {
  if (!petWindow) return;
  petWindow.webContents.send('pet:snapshot', snapshotNow());
  if (statsWindow) statsWindow.webContents.send('stats:refresh');
}

// —— 托盘 ——

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: paused ? '继续计时' : '暂停计时', click: togglePause },
    { type: 'separator' },
    { label: '显示 / 隐藏凤凰', click: togglePetVisibility },
    { label: '设置…', click: openSettingsWindow },
    { label: '统计…', click: openStatsWindow },
    { type: 'separator' },
    {
      label: '开机自启动',
      type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => setAutoStart(item.checked),
    },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]));
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets/tray.png');
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    log('托盘图标读取失败:', iconPath);
  }
  tray = new Tray(image);
  tray.setToolTip('考研专注养成');
  tray.on('click', togglePetVisibility);
  refreshTrayMenu();
}

/**
 * 开机自启动。开发态下 process.execPath 是 electron.exe 本身，
 * 直接注册会开机拉起一个没有项目的 Electron，所以补上应用路径作为参数。
 */
function setAutoStart(enabled) {
  const options = { openAtLogin: !!enabled };
  if (!app.isPackaged) {
    options.path = process.execPath;
    options.args = [path.resolve(__dirname)];
  }
  app.setLoginItemSettings(options);
  log('开机自启动 ->', enabled);
  refreshTrayMenu();
}

function togglePause() {
  paused = !paused;
  refreshTrayMenu();
  broadcastSnapshot();
}

function togglePetVisibility() {
  if (petWindow && petWindow.isVisible()) {
    petWindow.hide();
    return;
  }
  if (petWindow) {
    petWindow.show();
    petWindow.focus();
    return;
  }
  createPetWindow(petBounds);
  refreshTrayMenu();
}

function notify(title, content) {
  log('提示:', title, content);
  try {
    if (tray) tray.displayBalloon({ title, content });
  } catch (error) {
    log('气泡提示失败:', error);
  }
}

// —— 反馈 ——

/**
 * 把事件变成看得见的反应：桌宠上的动画 + 关键节点的托盘气泡。
 * 只扣成长值是"安静"的惩罚，感觉不到就改不掉。
 */
async function handleReactions(events) {
  if (events.length > 0) log('反馈:', events.map((e) => e.kind).join(','));
  for (const event of events) {
    if (petWindow) petWindow.webContents.send('pet:event', event);
    if (event.kind === 'timeout') notify('发呆超时', '扣了 10 分钟，回来吧');
    if (event.kind === 'evolve') notify('进化了', `凤凰成长为「${event.stageName}」`);
    if (event.kind === 'degrade') notify('掉了一层', `凤凰退回了「${event.stageName}」`);
    if (event.kind === 'goal') notify('今天达标了', '今日专注已达成目标');
  }
}

// —— 探针 ——

/**
 * 探针崩了必须自动重启并最终告知使用者。
 * 静默失效是这类工具最糟的失败方式——计时停了但你毫不知情，还以为自己在学。
 */
function restartWithBackoff(label, attempt, restart) {
  if (stopped || disposed) return;
  const delay = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
  log(`${label} 将在 ${delay}ms 后重启（第 ${attempt} 次）`);
  setTimeout(() => {
    if (stopped || disposed) return;
    try {
      restart();
    } catch (error) {
      log(`${label} 重启失败:`, error);
    }
  }, delay);
}

function startBaseProbe() {
  probe = createProbe({
    scriptPath: path.join(__dirname, 'native/foreground.ps1'),
    intervalMs: 1000,
    onSample,
    onError: (error) => {
      log('探针错误:', error);
      baseProbeFailures += 1;
      if (baseProbeFailures === 3) {
        notify('前台探针异常', '计时可能已经停住，重启桌宠可恢复');
      }
      restartWithBackoff('基础探针', baseProbeFailures, () => {
        try { probe?.stop(); } catch { /* 已退出 */ }
        startBaseProbe();
      });
    },
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
      onError: (error) => {
        log('精确探针错误:', error);
        urlProbeFailures += 1;
        restartWithBackoff('精确探针', urlProbeFailures, () => {
          try { urlProbe?.stop(); } catch { /* 已退出 */ }
          urlProbe = null;
          refreshUrlProbe();
        });
      },
    });
  } else if (!wanted && urlProbe) {
    urlProbe.stop();
    urlProbe = null;
    pendingUrl = null;
  }
}

async function onSample(rawSample) {
  if (disposed || stopped || paused || busy) return;
  busy = true;
  try {
    if (!sawFirstSample) {
      sawFirstSample = true;
      log('收到第一个探针样本:', JSON.stringify(rawSample));
    }
    baseProbeFailures = 0; // 恢复正常，退避计数清零
    const sample = mergeSample(lastSample, {
      ...rawSample,
      url: rules.exactMode ? pendingUrl : null,
    });
    lastSample = sample;
    recentWindows = pushRecentTitle(recentWindows, sample);

    const { skip, input } = toEngineInput(sample, rules);
    if (skip) return; // 前台是桌宠自己，整帧跳过，避免点一下宠物就打断计时

    const now = Date.now();
    const stageBefore = stageFor(account.growthMs);
    const before = {
      status: session.status,
      stageIndex: stageBefore.index,
      stageName: stageBefore.stage.name,
      metGoal: (daily[account.todayDate]?.focusMs ?? 0) >= settings.dailyGoalMs,
    };

    const result = step(session, {
      now,
      ...input,
      awayPenaltyWindowMs: settings.awayPenaltyWindowMs,
    });
    const next = applyStep(account, daily, result, settings);
    session = result.session;
    account = next.account;
    daily = next.daily;
    if (result.focusMs > 0) recordSegments(daily, result.fromMs, result.toMs);
    if (result.distractions > 0) {
      const day = dayKey(result.toMs);
      const record = daily[day] ?? (daily[day] = {});
      record.distractionTimes = addDistraction(record.distractionTimes, result.toMs);
    }

    const stageAfter = stageFor(account.growthMs);
    const after = {
      status: session.status,
      stageIndex: stageAfter.index,
      stageName: stageAfter.stage.name,
      metGoal: (daily[account.todayDate]?.focusMs ?? 0) >= settings.dailyGoalMs,
    };
    const events = deriveReactions(before, after, result, settings);

    await store.saveState({ session, account });
    await store.saveDaily(daily);
    await handleReactions(events);
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

  dataFile = dataFilePath(app.getPath('userData'));
  logFile = path.join(app.getPath('userData'), 'kaoyan-focus.log');
  rawData = loadJson(dataFile);
  const now = Date.now();
  log('数据文件:', dataFile, '| 已有键:', Object.keys(rawData).join(',') || '(空)');

  store = createStore(createFileArea({
    load: () => rawData,
    save: (data) => saveJson(dataFile, data),
    onError: (error) => log('落盘失败:', error),
  }));

  const isFirstRun = !rawData.settings;
  settings = normalizeSettings(rawData.settings, now);
  rules = buildRules(DEFAULT_RULES, rawData.rules, settings.watchdogMs, process.execPath);
  log('自身进程名:', path.basename(process.execPath), '| selfProcesses:', rules.selfProcesses.join(','));
  daily = rawData.daily ?? {};
  petBounds = rawData.petBounds ?? null;

  const state = rawData.state ?? {
    session: initialSession(now),
    account: createAccount(dayKey(now)),
  };
  session = state.session;
  account = state.account;

  createPetWindow(petBounds);
  createTray();
  startBaseProbe();
  refreshUrlProbe();
  log('桌宠、托盘、探针均已启动');

  if (isFirstRun) {
    log('首次启动，打开设置页');
    openSettingsWindow();
    notify('先设一下', '填上考试日期和每日目标，凤凰才知道要往哪爬');
  }
}

// —— IPC ——

function registerIpc() {
  ipcMain.handle('pet:get-snapshot', () => snapshotNow());

  ipcMain.handle('pet:toggle-pause', () => {
    togglePause();
    return { paused };
  });

  ipcMain.handle('pet:open-settings', () => { openSettingsWindow(); });
  ipcMain.handle('pet:open-stats', () => { openStatsWindow(); });
  ipcMain.handle('pet:quit', () => { app.quit(); });

  /** 收起信息面板时把窗口一起收短，避免留一大片透明却会吃掉点击的区域 */
  ipcMain.handle('pet:set-height', (_event, height) => {
    if (!petWindow) return;
    const [width] = petWindow.getSize();
    petWindow.setSize(width, Math.max(110, Math.min(420, Math.round(Number(height) || 0))));
  });

  ipcMain.on('pet:show-menu', () => {
    const menu = Menu.buildFromTemplate([
      { label: paused ? '继续计时' : '暂停计时', click: togglePause },
      { label: '设置…', click: openSettingsWindow },
      { label: '统计…', click: openStatsWindow },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]);
    menu.popup({ window: petWindow });
  });

  ipcMain.handle('settings:get', () => ({
    settings,
    rules,
    autoStart: app.getLoginItemSettings().openAtLogin,
  }));

  ipcMain.handle('settings:save', async (_event, payload) => {
    settings = normalizeSettings(payload.settings, Date.now());
    rules = buildRules(DEFAULT_RULES, payload.rules, settings.watchdogMs, process.execPath);
    rawData.settings = payload.settings;
    await store.saveSettings(payload.settings);
    await store.set('rules', rules);
    refreshUrlProbe();
    broadcastSnapshot();
    return { ok: true };
  });

  ipcMain.handle('settings:recent', () => recentWindows);
  ipcMain.handle('settings:set-autostart', (_event, enabled) => {
    setAutoStart(enabled);
    return { autoStart: app.getLoginItemSettings().openAtLogin };
  });
  ipcMain.handle('settings:close', () => { settingsWindow?.close(); });
  ipcMain.handle('settings:open-stats', () => { openStatsWindow(); });
  ipcMain.handle('settings:reset-today', async () => {
    const today = dayKey(Date.now());
    if (daily[today]) delete daily[today];
    account.todayFocusMs = 0;
    await store.saveDaily(daily);
    broadcastSnapshot();
    return { ok: true };
  });

  ipcMain.handle('stats:get', () => ({ daily, snapshot: snapshotNow() }));
  ipcMain.handle('stats:close', () => { statsWindow?.close(); });
}

// —— 生命周期与单实例 ——

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  // 让 Windows 正确归类任务栏窗口与通知来源
  app.setAppUserModelId('KaoyanFocusCompanion');

  app.on('second-instance', () => {
    if (!petWindow) {
      createPetWindow(petBounds);
      return;
    }
    if (petWindow.isMinimized()) petWindow.restore();
    petWindow.show();
    petWindow.focus();
  });

  registerIpc();

  app.whenReady().then(start).catch((error) => {
    log('启动失败:', error);
    app.quit();
  });

  // 托盘常驻：关掉所有窗口也不退出，只能从托盘菜单退出
  app.on('window-all-closed', () => {});

  app.on('before-quit', () => {
    disposed = true;
    stopped = true;
    probe?.stop();
    urlProbe?.stop();
    tray?.destroy();
  });
}
