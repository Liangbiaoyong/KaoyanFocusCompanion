export const DEFAULT_RULES = {
  mode: 'browser',
  exactMode: false,
  browsers: ['msedge.exe', 'chrome.exe', 'firefox.exe'],
  blockedKeywords: ['哔哩哔哩', 'bilibili', '知乎'],
  blockedDomains: ['bilibili.com', 'zhihu.com'],
  selfProcesses: ['electron.exe', 'kaoyan-focus-companion.exe'],
  watchdogMs: 10 * 60 * 1000,
};

export function normalizeProcess(name) {
  const s = String(name ?? '').trim().toLowerCase();
  if (s === '') return '';
  return s.endsWith('.exe') ? s : `${s}.exe`;
}

/** 取主机名；地址栏内容常常没有 scheme（Chromium 会省略 https://） */
function hostOf(url) {
  const raw = String(url ?? '').trim();
  if (raw === '') return null;
  try {
    const parsed = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return parsed.hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

export function matchDomain(url, domain) {
  const host = hostOf(url);
  const target = String(domain ?? '').trim().toLowerCase();
  if (!host || target === '') return false;
  return host === target || host.endsWith(`.${target}`);
}

export function matchKeyword(title, keywords) {
  const text = String(title ?? '').toLowerCase();
  if (text === '') return false;
  return (keywords ?? []).some((k) => {
    const needle = String(k ?? '').trim().toLowerCase();
    return needle !== '' && text.includes(needle);
  });
}

/**
 * 判定当前前台样本。纯函数。
 * @returns {{self: boolean, idle: boolean, classification: 'study'|'neutral'|'distract'}}
 */
export function judge(sample, rules) {
  const r = rules ?? DEFAULT_RULES;
  const proc = normalizeProcess(sample?.process);

  const self = (r.selfProcesses ?? []).some((p) => normalizeProcess(p) === proc);
  if (self) return { self: true, idle: false, classification: 'neutral' };

  const idle = Number(sample?.idleMs ?? 0) >= r.watchdogMs;

  const isSource = r.mode === 'global'
    ? proc !== ''
    : (r.browsers ?? []).some((p) => normalizeProcess(p) === proc);

  let classification = 'study';
  if (!isSource) {
    classification = 'neutral';
  } else if (r.exactMode && (r.blockedDomains ?? []).some((d) => matchDomain(sample?.url, d))) {
    classification = 'distract';
  } else if (matchKeyword(sample?.title, r.blockedKeywords)) {
    classification = 'distract';
  }

  return { self: false, idle, classification };
}
