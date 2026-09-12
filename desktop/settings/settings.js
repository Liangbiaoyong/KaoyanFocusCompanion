import { dayKey } from '../../src/core/time.js';

const $ = (id) => document.getElementById(id);

let settings = null;
let rules = null;
let recent = [];

function renderList(kind) {
  const list = $(`${kind}List`);
  list.textContent = '';
  rules[kind].forEach((value, index) => {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = value;
    span.title = value;
    const del = document.createElement('button');
    del.textContent = '删除';
    del.addEventListener('click', () => {
      rules[kind].splice(index, 1);
      renderList(kind);
    });
    li.append(span, del);
    list.append(li);
  });
}

function addRule(kind) {
  const input = $(`${kind}Input`);
  const value = input.value.trim();
  if (value === '' || rules[kind].includes(value)) return;
  rules[kind].push(value);
  input.value = '';
  renderList(kind);
}

/** 去掉浏览器后缀与标签页计数，剩下的仍然需要使用者自己收窄 */
function guessKeyword(title) {
  return String(title)
    .replace(/\s*[-–—]\s*(Microsoft\s*Edge|Google\s*Chrome|Mozilla\s*Firefox)\s*$/i, '')
    .replace(/和另外\s*\d+\s*个页面.*$/, '')
    .trim()
    .slice(0, 16);
}

function renderRecent() {
  const list = $('recentList');
  list.textContent = '';
  if (recent.length === 0) {
    const li = document.createElement('li');
    li.textContent = '还没有记录，切换几次窗口再回来看看';
    list.append(li);
    return;
  }
  for (const item of recent) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = item.title;
    span.title = item.title;
    const btn = document.createElement('button');
    btn.textContent = '取关键词';
    btn.addEventListener('click', () => {
      const input = $('blockedKeywordsInput');
      input.value = guessKeyword(item.title);
      input.focus();
      input.select();
      $('status').textContent = '改好这一段再点「添加」';
    });
    li.append(span, btn);
    list.append(li);
  }
}

function fill() {
  $('mode').value = rules.mode;
  $('exactMode').checked = rules.exactMode === true;
  $('watchdogMinutes').value = Math.round(settings.watchdogMs / 60000);
  $('examDate').value = dayKey(settings.examDateMs);
  $('dailyGoalMinutes').value = Math.round(settings.dailyGoalMs / 60000);
  $('dailyCapMinutes').value = Math.round(settings.dailyCapMs / 60000);
  $('companionName').value = settings.companionName;
  $('startDateHint').textContent = `起算日：${dayKey(settings.startDateMs)}（首次启动日，不可更改）`;
  renderList('browsers');
  renderList('blockedKeywords');
  renderList('blockedDomains');
}

async function load() {
  const payload = await window.api.getConfig();
  settings = payload.settings;
  rules = payload.rules;
  recent = await window.api.getRecent();
  fill();
  renderRecent();
}

async function save() {
  const raw = {
    examDate: $('examDate').value,
    startDate: dayKey(settings.startDateMs),
    dailyGoalMinutes: Number($('dailyGoalMinutes').value),
    dailyCapMinutes: Number($('dailyCapMinutes').value),
    watchdogMinutes: Number($('watchdogMinutes').value),
    companionName: $('companionName').value.trim(),
  };
  rules.mode = $('mode').value;
  rules.exactMode = $('exactMode').checked;

  await window.api.saveConfig({ settings: raw, rules });
  settings = (await window.api.getConfig()).settings;
  $('status').textContent = '已保存';
  setTimeout(() => { $('status').textContent = ''; }, 1600);
}

for (const [kind, addId, inputId] of [
  ['browsers', 'browsersAdd', 'browsersInput'],
  ['blockedKeywords', 'blockedKeywordsAdd', 'blockedKeywordsInput'],
  ['blockedDomains', 'blockedDomainsAdd', 'blockedDomainsInput'],
]) {
  $(addId).addEventListener('click', () => addRule(kind));
  $(inputId).addEventListener('keydown', (event) => {
    if (event.key === 'Enter') $(addId).click();
  });
}

$('save').addEventListener('click', save);
$('close').addEventListener('click', () => window.api.close());

load();

setInterval(async () => {
  recent = await window.api.getRecent();
  renderRecent();
}, 3000);
