const PDF_SUFFIX = '.pdf';

export const DEFAULT_STUDY_RULES = ['file:///*.pdf', '*://*/*.pdf'];

/** 规则是否为 PDF 路径后缀型 */
function isPdfRule(rule) {
  return rule.trim().toLowerCase().endsWith(PDF_SUFFIX);
}

/** 从规则串里取出主机段：去掉 scheme、路径、查询、hash 与前导 *. */
function hostOfRule(rule) {
  let s = rule.trim();
  const schemeAt = s.indexOf('://');
  if (schemeAt !== -1) s = s.slice(schemeAt + 3);
  const cut = s.search(/[/?#]/);
  if (cut !== -1) s = s.slice(0, cut);
  if (s.startsWith('*.')) s = s.slice(2);
  return s.toLowerCase();
}

function hostOfUrl(url) {
  try {
    return new URL(url).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

function pathnameOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return String(url).split(/[?#]/)[0];
  }
}

function compileHostRules(rules) {
  const hosts = [];
  for (const rule of rules ?? []) {
    if (typeof rule !== 'string' || rule.trim() === '') continue;
    if (isPdfRule(rule)) continue;
    const host = hostOfRule(rule);
    if (host && host !== '*') hosts.push(host);
  }
  return hosts;
}

function hasPdfRule(rules) {
  for (const rule of rules ?? []) {
    if (typeof rule === 'string' && rule.trim() !== '' && isPdfRule(rule)) return true;
  }
  return false;
}

function compile(rules) {
  const pdf = hasPdfRule(rules);
  const hosts = compileHostRules(rules);
  if (!pdf && hosts.length === 0) return () => false;
  return (url) => {
    if (typeof url !== 'string' || url === '') return false;
    if (pdf && pathnameOf(url).toLowerCase().endsWith(PDF_SUFFIX)) return true;
    if (hosts.length > 0) {
      const host = hostOfUrl(url);
      if (host && hosts.some((h) => host === h || host.endsWith('.' + h))) return true;
    }
    return false;
  };
}

/**
 * 把站点规则编译成分类函数。规则表变化时才需要重新编译。
 * @returns {(url: string) => 'study' | 'neutral' | 'distract'}
 */
export function createClassifier(siteRules) {
  const studyHit = compile(siteRules?.study);
  const distractHit = compile(siteRules?.distract);
  return (url) => {
    if (distractHit(url)) return 'distract';
    if (studyHit(url)) return 'study';
    return 'neutral';
  };
}
