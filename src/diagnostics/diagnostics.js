async function probe() {
  const result = {};

  // 1. sidePanel API
  result.sidePanelApi = typeof chrome?.sidePanel?.open === 'function';

  // 2. 活动标签的 URL（本地 PDF 是否可读）
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    result.activeTabUrl = tab?.url ?? null;
    result.activeTabUrlReadable = typeof tab?.url === 'string' && tab.url.length > 0;
    result.isFileUrl = typeof tab?.url === 'string' && tab.url.startsWith('file://');
  } catch (e) {
    result.activeTabError = String(e);
  }

  // 3. idle API
  try {
    result.idleState = await chrome.idle.queryState(60);
  } catch (e) {
    result.idleError = String(e);
  }

  // 4. windows API 焦点
  try {
    const win = await chrome.windows.getLastFocused();
    result.windowFocused = win?.focused === true;
    result.windowState = win?.state ?? null;
  } catch (e) {
    result.windowError = String(e);
  }

  // 5. storage 可写
  try {
    await chrome.storage.local.set({ __probe: Date.now() });
    const back = await chrome.storage.local.get('__probe');
    result.storageWritable = typeof back.__probe === 'number';
    await chrome.storage.local.remove('__probe');
  } catch (e) {
    result.storageError = String(e);
  }

  return result;
}

async function render() {
  const out = document.getElementById('out');
  out.textContent = '检测中…';
  out.textContent = JSON.stringify(await probe(), null, 2);
}

document.getElementById('run').addEventListener('click', render);
render();
