import { STORAGE_KEYS } from '../lib/storage.js';

const MOOD_EMOJI = { alive: '\u{1F426}', dozing: '\u{1F425}', wilted: '\u{1F423}' };
const STATE_TEXT = {
  FOCUSING: '专注中',
  PAUSED_AWAY: '暂停（不在学习内容）',
  PAUSED_DISTRACTED: '暂停（在分心站点）',
  WAITING_ACTIVITY: '打盹中，动一下鼠标就回来',
  IDLE: '未开始',
};

const $ = (id) => document.getElementById(id);

function hhmmss(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function render(snap) {
  if (!snap) return;
  const { account, settings, session, stage, mountain, mood, today } = snap;

  const goalMs = settings.dailyGoalMs;
  const goalPct = goalMs > 0 ? Math.min(100, Math.round((today.focusMs / goalMs) * 100)) : 0;

  $('today-time').textContent = hhmmss(today.focusMs);
  $('today-goal').textContent = `今日 ${goalPct}%`;

  $('companion').textContent = MOOD_EMOJI[mood] ?? MOOD_EMOJI.dozing;
  $('companion').dataset.mood = mood;

  $('spirit-bar').style.width = `${account.spirit}%`;
  $('companion-line').textContent = `${settings.companionName} · 精神值 ${Math.round(account.spirit)}`;

  const stagePct = Math.round(stage.progress * 100);
  $('stage-line').textContent = stage.next
    ? `${stage.stage.name} · ${stagePct}%（下一阶段 ${stage.next.name}）`
    : `${stage.stage.name} · 已满级`;

  $('state-line').textContent = STATE_TEXT[session.status] ?? session.status;

  const d = mountain.deltaHours;
  const abs = Math.abs(d);
  const value = abs >= 1 ? abs.toFixed(1) : (abs * 60).toFixed(0);
  const unit = abs >= 1 ? '小时' : '分钟';
  $('delta-line').textContent = d >= 0 ? `领先 ${value} ${unit}` : `欠 ${value} ${unit}`;

  $('altitude').textContent =
    `海拔 ${Math.round(mountain.pYou * 100)}% · 距考试 ${mountain.daysLeft} 天`;
  $('streak-line').textContent = `\u{1F525} 连续 ${account.streak} 天`;
  $('total-line').textContent = `累计 ${(account.lifetimeFocusMs / 3600000).toFixed(0)}h`;

  document.documentElement.style.setProperty('--p-you', String(mountain.pYou));
  document.documentElement.style.setProperty('--p-time', String(mountain.pTime));
}

async function refresh() {
  const obj = await chrome.storage.local.get(STORAGE_KEYS.snapshot);
  render(obj[STORAGE_KEYS.snapshot]);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEYS.snapshot]) {
    render(changes[STORAGE_KEYS.snapshot].newValue);
  }
});

refresh();
