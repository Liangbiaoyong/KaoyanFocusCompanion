import { STORAGE_KEYS } from '../../src/lib/storage.js';

const MOOD_EMOJI = { alive: '\u{1F426}', dozing: '\u{1F425}', wilted: '\u{1F423}' };
const STATE_TEXT = {
  FOCUSING: '专注中',
  PAUSED_AWAY: '暂停 · 不在学习内容',
  PAUSED_DISTRACTED: '暂停 · 在分心站点',
  WAITING_ACTIVITY: '打盹中，动一下鼠标就回来',
  IDLE: '未开始',
};

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);

function hhmmss(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function deltaText(hours) {
  const abs = Math.abs(hours);
  const value = abs >= 1 ? abs.toFixed(1) : (abs * 60).toFixed(0);
  const unit = abs >= 1 ? '小时' : '分钟';
  return hours >= 0 ? `领先 ${value} ${unit}` : `欠 ${value} ${unit}`;
}

function panelHtml(snap) {
  const { account, settings, session, stage, mountain, mood, today } = snap;
  const goalMs = settings.dailyGoalMs;
  const goalPct = goalMs > 0 ? Math.min(100, Math.round((today.focusMs / goalMs) * 100)) : 0;
  const stageLabel = stage.next
    ? `${esc(stage.stage.name)} · ${Math.round(stage.progress * 100)}%`
    : `${esc(stage.stage.name)} · 已满级`;

  return `
    <div class="row">
      <span class="time">${hhmmss(today.focusMs)}</span>
      <span class="dim">今日 ${goalPct}%</span>
    </div>
    <div class="bar"><i style="width:${Math.round(account.spirit)}%"></i></div>
    <div class="companion" data-mood="${esc(mood)}">
      <span class="emoji">${MOOD_EMOJI[mood] ?? MOOD_EMOJI.dozing}</span>
      <span class="small">${esc(settings.companionName)} · ${stageLabel}</span>
    </div>
    <div class="state">${esc(STATE_TEXT[session.status] ?? session.status)}</div>
    <div class="mountain">
      <div class="rail"></div>
      <div class="time-mark" style="left:${Math.round(mountain.pTime * 100)}%"></div>
      <div class="you-mark" style="left:${Math.round(mountain.pYou * 100)}%"></div>
    </div>
    <div class="peaks"><span>山脚</span><span>${deltaText(mountain.deltaHours)}</span><span>山巅</span></div>
    <div class="foot">
      <span>海拔 ${Math.round(mountain.pYou * 100)}% · 距考试 ${mountain.daysLeft} 天</span>
      <span>\u{1F525} ${account.streak} 天 · ${(account.lifetimeFocusMs / 3600000).toFixed(0)}h</span>
    </div>
  `;
}

function render(snap) {
  const root = document.getElementById('panel');
  if (!root) return;
  root.innerHTML = snap ? panelHtml(snap) : '<p class="hint">还没有数据，先打开一个 PDF。</p>';
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
