const $ = (id) => document.getElementById(id);

function setStatus(text, ok = false) {
  const el = $('status');
  el.textContent = text;
  el.className = ok ? 'hint ok' : 'hint';
}

function mountOverlayInto(doc) {
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('floating/overlay.css');
  doc.head.append(link);

  const mount = doc.createElement('div');
  mount.id = 'panel';
  doc.body.append(mount);

  const script = doc.createElement('script');
  script.type = 'module';
  script.src = chrome.runtime.getURL('floating/overlay.js');
  doc.body.append(script);
}

async function openFallbackWindow() {
  await chrome.windows.create({
    url: chrome.runtime.getURL('floating/overlay.html'),
    type: 'popup',
    width: 340,
    height: 210,
    left: 60,
    top: 60,
  });
  setStatus('这个 Edge 版本不支持画中画，已改用独立小窗口（不会置顶）。');
}

async function openFloating() {
  if (!('documentPictureInPicture' in window)) {
    await openFallbackWindow();
    return;
  }

  if (documentPictureInPicture.window) {
    setStatus('悬浮窗已经开着了。', true);
    return;
  }

  $('openPip').disabled = true;
  try {
    const pip = await documentPictureInPicture.requestWindow({ width: 340, height: 200 });
    mountOverlayInto(pip.document);
    pip.addEventListener('pagehide', () => {
      $('openPip').disabled = false;
      setStatus('悬浮窗已关闭，可以再点一次打开。');
    });
    setStatus('悬浮窗已开启，拖它的标题栏可移动。', true);
  } catch (error) {
    $('openPip').disabled = false;
    setStatus(`打开失败：${error.message}。再点一次通常就好了。`);
  }
}

$('openPip').addEventListener('click', openFloating);
$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('openStats').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('stats/index.html') });
});
