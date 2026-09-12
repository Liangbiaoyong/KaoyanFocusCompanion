import { describe, it, expect } from 'vitest';
import { createClassifier, DEFAULT_STUDY_RULES } from '../src/core/sites.js';

describe('createClassifier', () => {
  it('内置 PDF 规则命中本地 file:// PDF', () => {
    const c = createClassifier({ study: DEFAULT_STUDY_RULES, distract: [] });
    expect(c('file:///C:/Users/x/kaoyan/math.pdf')).toBe('study');
  });

  it('内置 PDF 规则命中网页 PDF', () => {
    const c = createClassifier({ study: DEFAULT_STUDY_RULES, distract: [] });
    expect(c('https://example.com/papers/linear-algebra.PDF')).toBe('study');
  });

  it('忽略查询串判断 PDF', () => {
    const c = createClassifier({ study: DEFAULT_STUDY_RULES, distract: [] });
    expect(c('https://example.com/a.pdf?token=abc#page=3')).toBe('study');
  });

  it('普通网页是中性', () => {
    const c = createClassifier({ study: DEFAULT_STUDY_RULES, distract: [] });
    expect(c('https://www.baidu.com/s?wd=kaoyan')).toBe('neutral');
  });

  it('主机规则命中该主机及其子域', () => {
    const c = createClassifier({ study: ['*://*.bilibili.com/*'], distract: [] });
    expect(c('https://www.bilibili.com/video/BV1')).toBe('study');
    expect(c('https://bilibili.com/video/BV1')).toBe('study');
    expect(c('https://b23.tv/abc')).toBe('neutral');
  });

  it('分心优先于学习', () => {
    const c = createClassifier({ study: DEFAULT_STUDY_RULES, distract: ['*://*.xiaohongshu.com/*'] });
    expect(c('https://www.xiaohongshu.com/explore')).toBe('distract');
  });

  it('同一 URL 同时命中时以 distract 为准', () => {
    const c = createClassifier({ study: ['*://*.example.com/*'], distract: ['*://*.example.com/*'] });
    expect(c('https://a.example.com/x')).toBe('distract');
  });

  it('空规则表全是中性', () => {
    const c = createClassifier({});
    expect(c('file:///C:/a/b.pdf')).toBe('neutral');
    expect(c('https://x.com')).toBe('neutral');
  });

  it('忽略空字符串规则', () => {
    const c = createClassifier({ study: ['', '   '], distract: [] });
    expect(c('https://x.com')).toBe('neutral');
  });

  it('无法解析的 URL 不抛异常', () => {
    const c = createClassifier({ study: DEFAULT_STUDY_RULES, distract: [] });
    expect(c('not a url')).toBe('neutral');
    expect(c('')).toBe('neutral');
    expect(c(undefined)).toBe('neutral');
  });

  it('通配主机 * 不误伤', () => {
    const c = createClassifier({ study: ['*://*/*'], distract: [] });
    expect(c('https://anything.com/')).toBe('neutral');
  });
});
