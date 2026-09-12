import { STORAGE_KEYS } from '../lib/storage.js';
import { dayKey } from '../core/time.js';

const $ = (id) => document.getElementById(id);
const DAYS = 30;

function lastNDays(now, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const ms = new Date(now).setHours(0, 0, 0, 0) - i * 86400000;
    out.push(dayKey(ms));
  }
  return out;
}

function render(daily, snapshot) {
  const now = Date.now();
  const days = lastNDays(now, DAYS);
  const goalMs = snapshot?.settings?.dailyGoalMs ?? 0;

  const bars = $('bars');
  bars.textContent = '';
  let maxMs = 1;
  for (const d of days) maxMs = Math.max(maxMs, daily[d]?.focusMs ?? 0);

  let metDays = 0;
  for (const d of days) {
    const rec = daily[d];
    const ms = rec?.focusMs ?? 0;
    const el = document.createElement('div');
    el.className = 'bar';
    if (ms === 0) el.classList.add('empty');
    else if (goalMs > 0 && ms < goalMs) el.classList.add('miss');
    el.style.height = `${Math.max(2, (ms / maxMs) * 100)}%`;
    el.title = `${d}：${(ms / 3600000).toFixed(1)} 小时`;
    bars.append(el);
    if (goalMs > 0 && ms >= goalMs) metDays += 1;
  }

  const totalMs = days.reduce((s, d) => s + (daily[d]?.focusMs ?? 0), 0);
  $('barsHint').textContent =
    `30 天合计 ${(totalMs / 3600000).toFixed(1)} 小时 · 达标 ${metDays} 天 · 日均 ${(totalMs / 3600000 / DAYS).toFixed(1)} 小时`;

  const dist = $('distractions');
  dist.textContent = '';
  const rows = days
    .map((d) => ({ d, n: daily[d]?.distractions ?? 0 }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);
  if (rows.length === 0) {
    const li = document.createElement('li');
    li.textContent = '最近 30 天没有走神记录';
    dist.append(li);
  }
  for (const r of rows) {
    const li = document.createElement('li');
    const a = document.createElement('span');
    a.textContent = r.d;
    const b = document.createElement('span');
    b.textContent = `${r.n} 次`;
    li.append(a, b);
    dist.append(li);
  }

  const totals = $('totals');
  totals.textContent = '';
  const items = [
    ['累计专注', `${((snapshot?.account?.lifetimeFocusMs ?? 0) / 3600000).toFixed(0)} 小时`],
    ['当前阶段', snapshot?.stage?.stage?.name ?? '—'],
    ['当前连续', `${snapshot?.account?.streak ?? 0} 天`],
    ['最长连续', `${snapshot?.account?.bestStreak ?? 0} 天`],
    ['距考试', `${snapshot?.mountain?.daysLeft ?? '—'} 天`],
    [snapshot?.mountain?.deltaHours >= 0 ? '进度领先' : '进度欠账',
      `${Math.abs(snapshot?.mountain?.deltaHours ?? 0).toFixed(1)} 小时`],
  ];
  for (const [k, v] of items) {
    const li = document.createElement('li');
    const a = document.createElement('span');
    a.textContent = k;
    const b = document.createElement('span');
    b.textContent = v;
    li.append(a, b);
    totals.append(li);
  }
}

async function refresh() {
  const obj = await chrome.storage.local.get([STORAGE_KEYS.daily, STORAGE_KEYS.snapshot]);
  render(obj[STORAGE_KEYS.daily] ?? {}, obj[STORAGE_KEYS.snapshot]);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') refresh();
});

refresh();
