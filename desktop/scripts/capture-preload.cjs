// 截图专用：给三个界面提供假数据，让它们能脱离主进程独立渲染。
// 只在 scripts/capture-screenshots.cjs 里使用，不参与打包。
const { contextBridge } = require('electron');

const MIN = 60000;
const HOUR = 3600000;

// 以"今天"为基准往前铺 30 天数据，保证截图里图表是满的
const today = new Date();
today.setHours(0, 0, 0, 0);
const dayMs = 24 * HOUR;
const dayKeyOf = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const daily = {};
for (let i = 29; i >= 0; i -= 1) {
  const dayStart = today.getTime() - i * dayMs;
  const key = dayKeyOf(dayStart);
  // 周日休息，其余按作息波动
  const weekday = new Date(dayStart).getDay();
  const hours = weekday === 0 ? 0 : 3 + ((i * 7) % 5) * 0.8;
  const focusMs = Math.round(hours * HOUR);

  const segments = [];
  if (focusMs > 0) {
    const blocks = [
      { from: 8 * 60 + 40 + (i % 3) * 10, minutes: Math.round(hours * 26) },
      { from: 14 * 60 + 10 + (i % 4) * 8, minutes: Math.round(hours * 22) },
      { from: 19 * 60 + 20 + (i % 5) * 6, minutes: Math.round(hours * 18) },
    ];
    for (const b of blocks) {
      if (b.minutes <= 0) continue;
      const start = dayStart + b.from * MIN;
      segments.push({ start, end: start + b.minutes * MIN });
    }
  }

  // 走神时刻要散落在一天里、带一点午后偏重，否则直方图会出现一根假得扎眼的巨柱
  const distractionSlots = [
    [9, 12], [10, 5], [10, 40], [14, 20], [14, 55],
    [15, 30], [16, 10], [16, 45], [20, 25], [21, 5],
  ];
  const distractionTimes = [];
  const count = i % 5 === 0 ? 0 : (i % 4) + 1;
  for (let k = 0; k < count; k += 1) {
    const [hh, mm] = distractionSlots[(i * 3 + k * 2) % distractionSlots.length];
    distractionTimes.push(dayStart + (hh * 60 + mm) * MIN);
  }

  daily[key] = {
    focusMs,
    distractions: count,
    segments,
    distractionTimes,
    penaltyMs: i % 6 === 0 ? 3 * MIN : 0,
    spiritEnd: 50 + ((i * 3) % 40),
    metGoal: focusMs >= 5 * HOUR,
  };
}

const todayKey = dayKeyOf(today.getTime());
const todayRecord = daily[todayKey];
// 计入必须 = 活动 − 惩罚，否则统计页会出现"计入比活动还多"这种一眼假的数据
const todaySegments = [
  { start: today.getTime() + 8 * 60 * MIN + 45 * MIN, end: today.getTime() + 8 * 60 * MIN + 45 * MIN + 62 * MIN },
  { start: today.getTime() + 14 * 60 * MIN + 15 * MIN, end: today.getTime() + 14 * 60 * MIN + 15 * MIN + 48 * MIN },
];
const todayActivityMs = todaySegments.reduce((sum, s) => sum + (s.end - s.start), 0);
todayRecord.segments = todaySegments;
todayRecord.penaltyMs = 2 * MIN;
todayRecord.focusMs = todayActivityMs - todayRecord.penaltyMs;
todayRecord.distractions = 3;
todayRecord.distractionTimes = [
  today.getTime() + (10 * 60 + 40) * MIN,
  today.getTime() + (15 * 60 + 30) * MIN,
  today.getTime() + (20 * 60 + 25) * MIN,
];

const settings = {
  examDateMs: new Date(2026, 11, 20).getTime(),
  startDateMs: new Date(2026, 8, 1).getTime(),
  dailyGoalMs: 5 * HOUR,
  dailyCapMs: 8 * HOUR,
  watchdogMs: 10 * MIN,
  awayPenaltyMs: MIN,
  awayPenaltyWindowMs: 3 * MIN,
  targetLabel: '考研初试',
  companionName: '小凤',
};

const rules = {
  mode: 'browser',
  exactMode: false,
  browsers: ['msedge.exe', 'chrome.exe', 'firefox.exe'],
  blockedKeywords: ['哔哩哔哩', 'bilibili', '知乎'],
  blockedDomains: ['bilibili.com', 'zhihu.com'],
  selfProcesses: ['electron.exe', 'kaoyanfocuscompanion.exe'],
  watchdogMs: 10 * MIN,
};

const snapshot = {
  account: {
    growthMs: 44.5 * HOUR,        // 恰好落在"彩羽"
    lifetimeFocusMs: 168 * HOUR,
    todayFocusMs: todayRecord.focusMs,
    todayDate: todayKey,
    spirit: 78,
    spiritCarryMs: 0,
    streak: 12,
    bestStreak: 19,
    makeupUsed: 1,
    makeupMonth: todayKey.slice(0, 7),
  },
  settings,
  session: { status: 'FOCUSING', startedAt: Date.now() - 26 * MIN, lastActivityAt: Date.now(), lastSettledAt: Date.now(), lastAwayPenaltyAt: null },
  stage: { index: 6, stage: { name: '彩羽', hours: 44 }, next: { name: '灵鸟', hours: 70 }, progress: 0.02, hours: 44.5 },
  mountain: { pYou: 0.33, pTime: 0.28, deltaHours: 12.4, daysLeft: 99, totalDays: 110, elapsedDays: 11 },
  mood: 'alive',
  today: todayRecord,
  updatedAt: Date.now(),
};

const recent = [
  { title: '【强化班】线性代数第 3 讲_哔哩哔哩_bilibili', process: 'msedge', at: Date.now() - 1200000 },
  { title: '数学复习全书 · 高等数学.pdf - Microsoft Edge', process: 'msedge', at: Date.now() - 900000 },
  { title: '知乎 - 有问题，就会有答案', process: 'msedge', at: Date.now() - 600000 },
  { title: '考研英语真题逐句精解.pdf - Microsoft Edge', process: 'msedge', at: Date.now() - 300000 },
];

contextBridge.exposeInMainWorld('pet', {
  onSnapshot: (handler) => { setTimeout(() => handler(snapshot), 60); },
  onEvent: () => {},
  getSnapshot: async () => snapshot,
  togglePause: async () => ({ paused: false }),
  openSettings: async () => {},
  quit: async () => {},
  requestLayout: async () => ({ flipped: false }),
  showMenu: () => {},
});

const config = {
  settings: {
    examDate: '2026-12-20',
    startDate: '2026-09-01',
    dailyGoalMinutes: 300,
    dailyCapMinutes: 480,
    watchdogMinutes: 10,
    awayPenaltyMinutes: 1,
    awayPenaltyWindowMinutes: 3,
    targetLabel: '考研初试',
    companionName: '小凤',
  },
  rules,
  autoStart: true,
};
config.settings.awayPenaltyMs = MIN;
config.settings.awayPenaltyWindowMs = 3 * MIN;
config.settings.examDateMs = settings.examDateMs;
config.settings.startDateMs = settings.startDateMs;
config.settings.dailyGoalMs = settings.dailyGoalMs;
config.settings.dailyCapMs = settings.dailyCapMs;
config.settings.watchdogMs = settings.watchdogMs;

contextBridge.exposeInMainWorld('api', {
  getConfig: async () => config,
  saveConfig: async () => ({ ok: true }),
  getRecent: async () => recent,
  setAutoStart: async () => ({ autoStart: true }),
  openStats: async () => {},
  resetToday: async () => ({ ok: true }),
  close: async () => {},
});

contextBridge.exposeInMainWorld('statsApi', {
  getData: async () => ({ daily, snapshot }),
  close: async () => {},
  onRefresh: () => {},
});
