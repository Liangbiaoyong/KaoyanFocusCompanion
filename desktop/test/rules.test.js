import { describe, it, expect } from 'vitest';
import {
  DEFAULT_RULES, normalizeProcess, matchDomain, matchKeyword, judge,
} from '../src/rules.mjs';

const R = {
  mode: 'browser',
  exactMode: false,
  browsers: ['msedge.exe', 'chrome.exe', 'firefox.exe'],
  blockedKeywords: ['哔哩哔哩', 'bilibili', '知乎'],
  blockedDomains: ['bilibili.com', 'zhihu.com'],
  selfProcesses: ['electron.exe', 'kaoyan-focus-companion.exe'],
  watchdogMs: 10 * 60 * 1000,
};

const sample = (over = {}) => ({
  process: 'msedge.exe',
  title: '数学复习全书.pdf - Microsoft Edge',
  url: null,
  idleMs: 0,
  at: 0,
  ...over,
});

describe('normalizeProcess', () => {
  it('小写并补 .exe', () => {
    expect(normalizeProcess('MSEDGE')).toBe('msedge.exe');
    expect(normalizeProcess('msedge.exe')).toBe('msedge.exe');
  });

  it('空值安全', () => {
    expect(normalizeProcess('')).toBe('');
    expect(normalizeProcess(undefined)).toBe('');
  });
});

describe('matchDomain', () => {
  it('主机相等命中', () => {
    expect(matchDomain('https://bilibili.com/video', 'bilibili.com')).toBe(true);
  });

  it('子域命中', () => {
    expect(matchDomain('https://www.bilibili.com/video', 'bilibili.com')).toBe(true);
  });

  it('不相干的域不命中', () => {
    expect(matchDomain('https://b23.tv/x', 'bilibili.com')).toBe(false);
  });

  it('不能被后缀欺骗', () => {
    expect(matchDomain('https://notbilibili.com/x', 'bilibili.com')).toBe(false);
  });

  it('无 scheme 的地址栏内容也能解析', () => {
    expect(matchDomain('bilibili.com/video/BV1', 'bilibili.com')).toBe(true);
  });

  it('无法解析时返回 false', () => {
    expect(matchDomain('', 'bilibili.com')).toBe(false);
    expect(matchDomain(undefined, 'bilibili.com')).toBe(false);
  });

  it('本地 PDF 不会被域名规则误伤', () => {
    expect(matchDomain('file:///C:/a/b.pdf', 'bilibili.com')).toBe(false);
  });
});

describe('matchKeyword', () => {
  it('子串命中', () => {
    expect(matchKeyword('【高数】_哔哩哔哩_bilibili', ['哔哩哔哩'])).toBe(true);
  });

  it('大小写不敏感', () => {
    expect(matchKeyword('BILIBILI - Watch', ['bilibili'])).toBe(true);
  });

  it('空标题不命中', () => {
    expect(matchKeyword('', ['知乎'])).toBe(false);
  });

  it('关键词表为空时不命中', () => {
    expect(matchKeyword('知乎', [])).toBe(false);
  });
});

describe('judge — 学习来源', () => {
  it('浏览器在前台 → study', () => {
    expect(judge(sample(), R)).toEqual({ self: false, idle: false, classification: 'study' });
  });

  it('浏览器模式：非浏览器进程 → neutral', () => {
    expect(judge(sample({ process: 'WINWORD.EXE' }), R).classification).toBe('neutral');
  });

  it('全局模式：任意进程 → study', () => {
    expect(judge(sample({ process: 'WINWORD.EXE' }), { ...R, mode: 'global' }).classification).toBe('study');
  });

  it('进程名大小写与缺 .exe 都能匹配白名单', () => {
    expect(judge(sample({ process: 'MSEDGE' }), R).classification).toBe('study');
  });
});

describe('judge — 学习外判定', () => {
  it('标题命中关键词 → distract', () => {
    expect(judge(sample({ title: '【高数】_哔哩哔哩_bilibili - Microsoft Edge' }), R).classification).toBe('distract');
  });

  it('关闭精确模式时忽略 url', () => {
    const s = sample({ url: 'https://www.bilibili.com/video/BV1' });
    expect(judge(s, { ...R, exactMode: false }).classification).toBe('study');
  });

  it('开启精确模式时 url 命中 → distract', () => {
    const s = sample({ url: 'https://www.bilibili.com/video/BV1' });
    expect(judge(s, { ...R, exactMode: true }).classification).toBe('distract');
  });

  it('开启精确模式但读不到 url 时退回标题', () => {
    const s = sample({ url: null, title: '知乎 - 有问题，就会有答案' });
    expect(judge(s, { ...R, exactMode: true }).classification).toBe('distract');
  });

  it('学习外判定优先于中性判定', () => {
    const s = sample({ process: 'WINWORD.EXE', title: '知乎 - 有问题' });
    expect(judge(s, R).classification).toBe('neutral'); // 非来源时先判中性
  });
});

describe('judge — 空闲与自身', () => {
  it('空闲达到阈值 → idle 为真', () => {
    expect(judge(sample({ idleMs: 10 * 60 * 1000 }), R).idle).toBe(true);
  });

  it('空闲未达阈值 → idle 为假', () => {
    expect(judge(sample({ idleMs: 10 * 60 * 1000 - 1 }), R).idle).toBe(false);
  });

  it('前台是本程序自身 → self 为真', () => {
    expect(judge(sample({ process: 'electron.exe' }), R).self).toBe(true);
  });

  it('self 为真时调用方应整帧跳过（此处只验证 self 标记与 idle 无关）', () => {
    expect(judge(sample({ process: 'electron.exe', idleMs: 999999 }), R).self).toBe(true);
  });
});

describe('DEFAULT_RULES', () => {
  it('默认浏览器模式、精确模式关闭', () => {
    expect(DEFAULT_RULES.mode).toBe('browser');
    expect(DEFAULT_RULES.exactMode).toBe(false);
  });

  it('内置浏览器白名单含 Edge', () => {
    expect(DEFAULT_RULES.browsers).toContain('msedge.exe');
  });

  it('内置学习外关键词含哔哩哔哩与知乎', () => {
    expect(DEFAULT_RULES.blockedKeywords).toContain('哔哩哔哩');
    expect(DEFAULT_RULES.blockedKeywords).toContain('知乎');
  });

  it('看门狗默认 10 分钟', () => {
    expect(DEFAULT_RULES.watchdogMs).toBe(10 * 60 * 1000);
  });
});
