import { createStore, STORAGE_KEYS } from '../../src/lib/storage.js';
import { defaultSettings, normalizeSettings } from '../../src/lib/settings.js';

const store = createStore(chrome.storage.local);
const $ = (id) => document.getElementById(id);

/**
 * 判断"允许访问文件网址"是否已开启。
 * 不能只看当前活动标签——用户此刻正站在本引导页上。
 * 改为扫描所有标签，看有没有任何一个 file:// 标签的地址可读。
 */
async function checkFileAccess() {
  const status = $('accessStatus');
  try {
    const tabs = await chrome.tabs.query({});
    const readable = tabs.some(
      (t) => typeof t.url === 'string' && t.url.startsWith('file://'),
    );
    if (readable) {
      status.textContent = '已开启（能读到本地文件的地址）';
      status.className = 'hint done';
    } else {
      status.textContent =
        '还没有读到任何本地文件地址。请确认已开启"允许访问文件网址"，并在 Edge 里打开一个本地 PDF，再点一次检查。';
      status.className = 'hint';
    }
  } catch {
    status.textContent = '检测失败，请手动确认权限';
    status.className = 'hint';
  }
}

$('copyExtensions').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText('edge://extensions');
    $('accessStatus').textContent = '已复制，粘贴到地址栏打开即可';
  } catch {
    $('accessStatus').textContent = '复制失败，请手动在地址栏输入 edge://extensions';
  }
});

$('checkAccess').addEventListener('click', checkFileAccess);

$('finish').addEventListener('click', async () => {
  const examDate = $('examDate').value;
  const dailyGoalMinutes = Number($('dailyGoalMinutes').value);
  const companionName = $('companionName').value.trim() || '小凤';
  const status = $('saveStatus');

  if (!examDate) {
    status.textContent = '请先选考试日期';
    return;
  }

  const now = Date.now();
  const existing = await store.get(STORAGE_KEYS.settings, null);
  const raw = {
    ...defaultSettings(now),
    ...(existing ?? {}),
    examDate,
    dailyGoalMinutes,
    companionName,
  };

  if (normalizeSettings(raw, now).examDateMs <= normalizeSettings(raw, now).startDateMs) {
    status.textContent = '考试日期必须晚于今天';
    return;
  }

  await store.saveSettings(raw);
  status.textContent = '已保存，凤凰已经在等你了。';
  status.className = 'hint done';
  $('finish').disabled = true;
});

(async () => {
  const now = Date.now();
  const existing = await store.get(STORAGE_KEYS.settings, null);
  const raw = { ...defaultSettings(now), ...(existing ?? {}) };
  $('examDate').value = raw.examDate;
  $('dailyGoalMinutes').value = raw.dailyGoalMinutes;
  $('companionName').value = raw.companionName;
  checkFileAccess();
})();
