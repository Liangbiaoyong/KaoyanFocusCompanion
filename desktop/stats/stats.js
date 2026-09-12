import { dayKey } from '../../src/core/time.js';

const $ = (id) => document.getElementById(id);
const DAYS = 30;

function lastNDays(now, count) {
  const out = [];
  const todayStart = new Date(now).setHours(0, 0, 0, 0);
  for (let i = count - 1; i >= 0; i -= 1) {
    out.push(dayKey(todayStart - i * 86400000));
  }
  return out;
}

function renderEmptyList(list, text) {
  list.textContent = '';
  const li = document.createElement('li');
  const span = document.createElement('span');
  span.textContent = text;
  li.append(span);
  list.append(li);
}

function render({ daily, snapshot }) {
  const now = Date.now();
  const days = lastNDays(now, DAYS);
  const goalMs = snapshot?.settings?.dailyGoalMs ?? 0;

  const bars = $('bars');
  bars.textContent = '';
  let maxMs = 1;
  for (const day of days) maxMs = Math.max(maxMs, daily[day]?.focusMs ?? 0);

  let metDays = 0;
  for (const day of days) {
    const ms = daily[day]?.focusMs ?? 0;
    const el = document.createElement('div');
    el.className = 'bar';
    if (ms === 0) el.classList.add('none');
    else if (goalMs > 0 && ms < goalMs) el.classList.add('short');
    el.style.height = `${Math.max(2, (ms / maxMs) * 100)}%`;
    el.title = `${day}：${(ms / 3600000).toFixed(1)} 小时`;
    bars.append(el);
    if (goalMs > 0 && ms >= goalMs) metDays += 1;
  }

  const totalMs = days.reduce((sum, day) => sum + (daily[day]?.focusMs ?? 0), 0);
  $('barsHint').textContent =
    `30 天合计 ${(totalMs / 3600000).toFixed(1)} 小时 · 达标 ${metDays} 天 · 日均 `
    + `${(totalMs / 3600000 / DAYS).toFixed(1)} 小时`;

  const dist = $('distractions');
  const rows = days
    .map((day) => ({ day, n: daily[day]?.distractions ?? 0 }))
    .filter((row) => row.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);
  if (rows.length === 0) {
    renderEmptyList(dist, '最近 30 天没有走神记录');
  } else {
    dist.textContent = '';
    for (const row of rows) {
      const li = document.createElement('li');
      const a = document.createElement('span');
      a.textContent = row.day;
      const b = document.createElement('span');
      b.textContent = `${row.n} 次`;
      li.append(a, b);
      dist.append(li);
    }
  }

  const totals = $('totals');
  totals.textContent = '';
  const account = snapshot?.account;
  const mountain = snapshot?.mountain;
  const items = [
    ['累计专注', `${((account?.lifetimeFocusMs ?? 0) / 3600000).toFixed(0)} 小时`],
    ['当前阶段', snapshot?.stage?.stage?.name ?? '—'],
    ['当前连续', `${account?.streak ?? 0} 天`],
    ['最长连续', `${account?.bestStreak ?? 0} 天`],
    ['距今累计走神', `${Object.values(daily).reduce((s, d) => s + (d?.distractions ?? 0), 0)} 次`],
    ['距考试', `${mountain?.daysLeft ?? '—'} 天`],
    [
      (mountain?.deltaHours ?? 0) >= 0 ? '进度领先' : '进度欠账',
      `${Math.abs(mountain?.deltaHours ?? 0).toFixed(1)} 小时`,
    ],
  ];
  for (const [key, value] of items) {
    const li = document.createElement('li');
    const a = document.createElement('span');
    a.textContent = key;
    const b = document.createElement('span');
    b.textContent = value;
    li.append(a, b);
    totals.append(li);
  }
}

async function refresh() {
  render(await window.statsApi.getData());
}

$('close').addEventListener('click', () => window.statsApi.close());
window.statsApi.onRefresh(refresh);
refresh();
