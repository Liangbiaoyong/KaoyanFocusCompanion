import { createStore, STORAGE_KEYS } from '../../src/lib/storage.js';
import { defaultSettings, normalizeSettings } from '../../src/lib/settings.js';
import { dayKey } from '../../src/core/time.js';
import { DEFAULT_STUDY_RULES } from '../../src/core/sites.js';

const store = createStore(chrome.storage.local);
const $ = (id) => document.getElementById(id);

let raw = null;
let rules = { study: [], distract: [] };

function renderRules() {
  for (const kind of ['study', 'distract']) {
    const ul = $(`${kind}List`);
    ul.textContent = '';
    rules[kind].forEach((rule, i) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = rule;
      const del = document.createElement('button');
      del.textContent = '删除';
      del.addEventListener('click', () => {
        rules[kind].splice(i, 1);
        renderRules();
      });
      li.append(span, del);
      ul.append(li);
    });
  }
}

function readForm() {
  return {
    examDate: $('examDate').value,
    startDate: raw.startDate,
    dailyGoalMinutes: Number($('dailyGoalMinutes').value),
    dailyCapMinutes: Number($('dailyCapMinutes').value),
    watchdogMinutes: Number($('watchdogMinutes').value),
    companionName: $('companionName').value.trim(),
  };
}

function fillForm() {
  $('examDate').value = raw.examDate;
  $('dailyGoalMinutes').value = raw.dailyGoalMinutes;
  $('dailyCapMinutes').value = raw.dailyCapMinutes;
  $('watchdogMinutes').value = raw.watchdogMinutes;
  $('companionName').value = raw.companionName;
  $('startDateHint').textContent = `起算日：${raw.startDate}（首次安装日，不可更改）`;
  renderRules();
}

async function load() {
  const now = Date.now();
  const stored = await store.get(STORAGE_KEYS.settings, null);
  raw = { ...defaultSettings(now), ...(stored ?? {}) };
  rules = await store.loadSiteRules();
  fillForm();
}

async function save() {
  const form = readForm();
  const normalized = normalizeSettings(form, Date.now());
  if (normalized.examDateMs <= normalized.startDateMs) {
    $('status').textContent = '考试日期必须晚于起算日';
    return;
  }
  raw = form;
  await store.saveSettings(form);
  await store.saveSiteRules(rules);
  $('status').textContent = '已保存';
  setTimeout(() => { $('status').textContent = ''; }, 1500);
}

for (const kind of ['study', 'distract']) {
  $(`${kind}Add`).addEventListener('click', () => {
    const input = $(`${kind}Input`);
    const value = input.value.trim();
    if (value === '' || rules[kind].includes(value)) return;
    rules[kind].push(value);
    input.value = '';
    renderRules();
  });
  $(`${kind}Input`).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $(`${kind}Add`).click();
  });
}

$('save').addEventListener('click', save);

// 首次打开时确保 study 名单里带上内置 PDF 规则
load().then(() => {
  if (rules.study.length === 0) {
    rules.study = [...DEFAULT_STUDY_RULES];
    renderRules();
  }
  $('status').textContent = `今天：${dayKey(Date.now())}`;
});
