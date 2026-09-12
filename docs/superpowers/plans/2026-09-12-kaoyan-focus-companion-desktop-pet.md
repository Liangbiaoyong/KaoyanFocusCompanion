# 考研专注养成 · Windows 桌宠 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把浏览器扩展形态改成 Windows 桌宠——一只透明置顶的凤凰浮在桌面上，自己通过 Win32 判断你是否在学习，并把专注时长转化为它的成长。

**Architecture:** Electron 主进程常驻一个 PowerShell 探针子进程，每 1 秒产出「前台窗口进程名 / 标题 / 空闲时长（可选：地址栏 URL）」样本；样本经纯函数规则判定后，喂给**原样复用**的纯逻辑核心（`src/core/*`、`src/lib/*`），产出快照；桌宠渲染进程订阅快照并绘制。

**Tech Stack:** Electron 44（主进程 CJS + 动态 `import()` 复用 ESM 核心）、Windows PowerShell 5.1（`Add-Type` P/Invoke Win32 与 UI Automation）、vitest（复用现有运行器）。

**Spec:** `docs/superpowers/specs/2026-09-12-kaoyan-focus-companion-design.md`（重点第 4 节与第 14 节）

## Global Constraints

- **原样复用、不得修改**：`src/core/time.js`、`engine.js`、`account.js`、`growth.js`、`src/lib/settings.js`、`snapshot.js`、`storage.js`。现有 109 个测试必须继续全绿。
- 新增纯逻辑放 `desktop/src/`，**一律用 `.mjs` 扩展名**（原因见文件结构说明），**不得 import `electron`**，必须能在 node 下单测。
- Electron 主进程用 **CJS**（`desktop/package.json` 不设 `type: module`，preload 也必须是 CJS），通过动态 `import(pathToFileURL(...))` 加载 `.mjs` 与共享的 `src/*.js`。
- **无任何网络请求。**
- 探针**只读**：不发送输入、不修改系统设置、不写系统注册表。
- UI 一律中文。
- **桌宠自身进程的前台事件必须被忽略**，不产生状态迁移（否则点一下宠物就打断计时）。
- 每日结算、看门狗 10 分钟扣 10 分钟、每日上限 8 小时、凤凰 12 阶段、精神值、连续天数与补签卡——规则全部沿用第 4、5 节，不重新设计。
- 数据文件位于 Electron 的 `userData` 目录，不写入项目目录。

---

## 文件结构

```
KaoyanFocusCompanion/
  vitest.config.js                 # 修改：include 增加 desktop/test
  extension/                       # 新增：归档退役的浏览器扩展
    manifest.json  background/  floating/  diagnostics/  onboarding/  options/  stats/
    README.md                      # 说明：已退役，复用 src/ 的路径需调整才能复活
  src/                             # 保持不变：共享纯逻辑
    core/  lib/
  desktop/
    package.json  .npmrc           # 已存在（electron 44 + npmmirror 镜像）
    main.js                        # CJS：Electron 主进程
    preload-pet.js  preload-settings.js   # CJS（preload 必须是 CJS）
    src/                           # 全部写成 .mjs —— desktop/package.json 没有 type:module，
      rules.mjs                    #   若叫 .js 会被 Node 当成 CJS，主进程 import() 时语法错误
      file-store.mjs               # 纯：兼容 createStore 的文件后端
      probe.mjs                    # 纯解析 + spawn 胶水
      detect.mjs                   # 纯：样本 → engine input，self 忽略，最近窗口列表
    native/
      foreground.ps1               # 已存在：基础探针
      uia-url.ps1                  # 已存在：精确探针
    pet/                           # index.html  pet.css  pet.js
    settings/                      # index.html  settings.css  settings.js
  test/                            # 现有扩展测试，保持不变
```

---

## Task 1: 归档扩展 + 测试运行器支持双目录

**Files:**
- Create: `extension/`（由 `git mv` 迁移）
- Create: `extension/README.md`
- Modify: `vitest.config.js`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: 无
- Produces: `npm test` 能同时跑 `test/` 与 `desktop/test/`；`src/` 保持原位供桌宠复用。

- [ ] **Step 1: 归档扩展专有目录**

```bash
cd "D:/HRAppStoreDownload/Users/26634/Desktop/Projects/KaoyanFocusCompanion"
mkdir -p extension
git mv manifest.json extension/manifest.json
for d in background floating diagnostics onboarding options stats; do
  git mv "src/$d" "extension/$d"
done
git status --short
```

Expected: `src/` 下只剩 `core/` 与 `lib/`。

- [ ] **Step 2: 修正归档目录的相对 import 路径**

归档文件原来从 `src/<dir>/x.js` 引用 `../core/y.js` 与 `../lib/z.js`。移动后需改为 `../../src/...`。

```bash
cd "D:/HRAppStoreDownload/Users/26634/Desktop/Projects/KaoyanFocusCompanion"
grep -rlE "from '(\.\./)+(core|lib)/" extension | while read -r f; do
  sed -i -E "s|from '\.\./(core|lib)/|from '../../src/\1/|g; s|from '\.\./\.\./(core|lib)/|from '../../src/\1/|g" "$f"
done
grep -rnE "from '(\.\./)+(core|lib)/" extension || echo "已无指向 src 的旧路径"
```

- [ ] **Step 3: 语法检查归档文件**

```bash
cd "D:/HRAppStoreDownload/Users/26634/Desktop/Projects/KaoyanFocusCompanion"
find extension -name '*.js' | while read -r f; do node --check "$f" || echo "FAIL $f"; done
echo "语法检查完成"
```

- [ ] **Step 4: 写 `extension/README.md`**

```markdown
# 已退役：浏览器扩展形态

这一版是项目最初的形式（Edge MV3 扩展 + 画中画悬浮窗），已被 `desktop/` 下的 Windows 桌宠取代。

保留原因：其中的测量思路与 UI 稿仍有参考价值。

**复活需知**：目录已被迁移过，各文件对共享逻辑的引用现指向 `../../src/`。若要让扩展重新可加载，需要把 `manifest.json` 与各入口的路径改回扩展根，并重新声明 `side_panel` / `permissions` 等。共享逻辑本体在仓库根的 `src/core/` 与 `src/lib/`，未改动。

**为什么退役**：内容脚本无法注入 Edge 自带的 PDF 查看器；画中画窗口的标题栏与工具栏由浏览器绘制，无法做出桌宠所需的透明无边框观感。
```

- [ ] **Step 5: 修改 `vitest.config.js` 使其覆盖两处测试**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js', 'desktop/test/**/*.test.js'],
  },
});
```

- [ ] **Step 6: 补 `.gitignore`**

在现有 `.gitignore` 末尾追加：

```
desktop/node_modules/
```

（注意：`desktop/.npmrc` 必须提交，否则镜像配置丢失导致 electron 二进制下不下来。）

- [ ] **Step 7: 跑全量测试确认没被归档影响**

```bash
npm test
```

Expected: `10 passed (10)`、`109 passed (109)`（数字与归档前一致）。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor: 归档浏览器扩展，src/ 保留为共享纯逻辑"
```

---

## Task 2: `desktop/src/rules.mjs` — 判定分层

**Files:**
- Create: `desktop/src/rules.mjs`
- Test: `desktop/test/rules.test.js`

**Interfaces:**
- Consumes: 无
- Produces：
  - `DEFAULT_RULES` — 默认规则对象
  - `normalizeProcess(name: string): string` — 小写、保证带 `.exe`
  - `matchDomain(url: string, domain: string): boolean` — 主机相等或其子域
  - `matchKeyword(title: string, keywords: string[]): boolean` — 大小写不敏感子串
  - `judge(sample, rules): {self: boolean, idle: boolean, classification: 'study'|'neutral'|'distract'}`
  - `sample = {process, title, url, idleMs, at}`；`rules = {mode, exactMode, browsers, blockedKeywords, blockedDomains, selfProcesses, watchdogMs}`
  - **语义**：`self` 为真时调用方必须整帧跳过（不调 `step`）。`idle` 为真时调用方把 `idle: true` 传给 `step`（触发超时扣分）。`classification` 直接映射到 `step` 的 `classification` 参数。

- [ ] **Step 1: 写失败测试 `desktop/test/rules.test.js`**

```js
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
```

- [ ] **Step 2: 运行确认失败**

```bash
cd "D:/HRAppStoreDownload/Users/26634/Desktop/Projects/KaoyanFocusCompanion"
npx vitest run desktop/test/rules.test.js
```

Expected: FAIL — 无法解析 `../src/rules.mjs`

- [ ] **Step 3: 实现 `desktop/src/rules.mjs`**

```js
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
```

- [ ] **Step 4: 运行确认通过**

```bash
npx vitest run desktop/test/rules.test.js
```

Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/rules.mjs desktop/test/rules.test.js
git commit -m "feat(desktop): 前台窗口判定分层（进程/标题/URL）"
```

---

## Task 3: `desktop/src/file-store.mjs` — 文件后端

**Files:**
- Create: `desktop/src/file-store.mjs`
- Test: `desktop/test/file-store.test.js`

**Interfaces:**
- Consumes: 无
- Produces：
  - `createFileArea({ load, save }): Area`
    - `load: () => object` — 启动时同步读取整份数据（文件不存在时返回 `{}`）
    - `save: (data) => void` — 落盘
    - `Area` 接口与 `chrome.storage.local` 兼容：`get(key: string): Promise<object>`、`set(obj: object): Promise<void>`
    - 因此 `createStore(area)`（`src/lib/storage.js`）可直接注入，无需改动。
  - `save` 抛错时被吞掉且**不影响计分**（只记录到 `onError`）。

- [ ] **Step 1: 写失败测试 `desktop/test/file-store.test.js`**

```js
import { describe, it, expect, vi } from 'vitest';
import { createFileArea } from '../src/file-store.mjs';

describe('createFileArea', () => {
  it('get 返回 {key: value} 形状，兼容 chrome.storage', async () => {
    const area = createFileArea({ load: () => ({ settings: { a: 1 } }), save: () => {} });
    expect(await area.get('settings')).toEqual({ settings: { a: 1 } });
  });

  it('缺失的 key 返回空对象', async () => {
    const area = createFileArea({ load: () => ({}), save: () => {} });
    expect(await area.get('nope')).toEqual({});
  });

  it('set 合并写入并落盘', async () => {
    const saved = [];
    const area = createFileArea({ load: () => ({ a: 1 }), save: (d) => saved.push({ ...d }) });
    await area.set({ b: 2 });
    await area.set({ a: 9 });
    expect(saved[saved.length - 1]).toEqual({ a: 9, b: 2 });
    expect(await area.get('a')).toEqual({ a: 9 });
  });

  it('load 返回 null / undefined 时按空对象处理', async () => {
    const area = createFileArea({ load: () => null, save: () => {} });
    expect(await area.get('x')).toEqual({});
  });

  it('save 抛错不影响 set 成功', async () => {
    const onError = vi.fn();
    const area = createFileArea({
      load: () => ({}),
      save: () => { throw new Error('disk full'); },
      onError,
    });
    await expect(area.set({ a: 1 })).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalled();
    expect(await area.get('a')).toEqual({ a: 1 });
  });

  it('多次 set 共享同一份内存状态', async () => {
    const area = createFileArea({ load: () => ({}), save: () => {} });
    await area.set({ a: 1 });
    await area.set({ b: 2 });
    expect(await area.get('b')).toEqual({ b: 2 });
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run desktop/test/file-store.test.js
```

Expected: FAIL — 无法解析 `../src/file-store.mjs`

- [ ] **Step 3: 实现 `desktop/src/file-store.mjs`**

```js
/**
 * 把一份内存对象包装成 chrome.storage.local 形状的 area，
 * 使 src/lib/storage.js 的 createStore 可以直接注入，无需改动。
 *
 * set 之后立刻同步落盘；落盘失败只上报，不影响内存状态（计分不能因为磁盘问题中断）。
 */
export function createFileArea({ load, save, onError } = {}) {
  let data = load?.() ?? {};
  if (typeof data !== 'object' || data === null) data = {};

  const report = (error) => {
    if (typeof onError === 'function') onError(error);
  };

  return {
    async get(key) {
      return key in data ? { [key]: data[key] } : {};
    },
    async set(obj) {
      if (obj && typeof obj === 'object') {
        Object.assign(data, obj);
        try {
          save?.(data);
        } catch (error) {
          report(error);
        }
      }
    },
  };
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx vitest run desktop/test/file-store.test.js
```

Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/file-store.mjs desktop/test/file-store.test.js
git commit -m "feat(desktop): 兼容 createStore 的文件存储后端"
```

---

## Task 4: `desktop/src/probe.mjs` — 探针解析与子进程

**Files:**
- Create: `desktop/src/probe.mjs`
- Test: `desktop/test/probe.test.js`

**Interfaces:**
- Consumes: 无
- Produces:
  - `parseProbeLine(line: string): Sample | null` — 纯函数。非法 JSON 或非对象返回 `null`。`Sample = {process, title, url, idleMs, at}`，字段类型强制归一（缺失时 `process`/`title` 为 `''`、`url` 为 `null`、`idleMs`/`at` 为 `0`）。
  - `mergeSample(previous, partial): Sample` — 纯函数。把探针分两次输出（基础探针只有前三项、精确探针只补 `url`）合并成完整样本；`url` 为 `null` 时保留上一次的值。
  - `createProbe({ scriptPath, intervalMs, onSample, onError, spawnImpl }): { stop() }` — 胶水层，可注入 `spawnImpl` 以便测试。用 `spawn('powershell.exe', ['-NoProfile','-File',scriptPath,'-Interval',String(intervalMs)])`，按行读 stdout，逐行 `parseProbeLine` 后回调。

- [ ] **Step 1: 写失败测试 `desktop/test/probe.test.js`**

```js
import { describe, it, expect, vi } from 'vitest';
import { parseProbeLine, mergeSample, createProbe } from '../src/probe.mjs';

describe('parseProbeLine', () => {
  it('解析合法样本', () => {
    const line = '{"title":"数学.pdf - Microsoft Edge","process":"msedge","pid":1,"minimized":false,"idleMs":188,"at":1789219683919}';
    expect(parseProbeLine(line)).toEqual({
      process: 'msedge',
      title: '数学.pdf - Microsoft Edge',
      url: null,
      idleMs: 188,
      at: 1789219683919,
    });
  });

  it('容忍首尾空白与 CR', () => {
    expect(parseProbeLine('  {"process":"x","title":"y","idleMs":1,"at":2}\r\n')?.process).toBe('x');
  });

  it('空行返回 null', () => {
    expect(parseProbeLine('')).toBeNull();
    expect(parseProbeLine('   ')).toBeNull();
    expect(parseProbeLine(undefined)).toBeNull();
  });

  it('非法 JSON 返回 null 而不抛异常', () => {
    expect(parseProbeLine('not json')).toBeNull();
    expect(parseProbeLine('{oops')).toBeNull();
  });

  it('JSON 不是对象时返回 null', () => {
    expect(parseProbeLine('123')).toBeNull();
    expect(parseProbeLine('"str"')).toBeNull();
    expect(parseProbeLine('null')).toBeNull();
  });

  it('字段类型不对时归一为默认值', () => {
    const s = parseProbeLine('{"process":123,"title":null,"idleMs":"abc","at":{}}');
    expect(s).toEqual({ process: '', title: '', url: null, idleMs: 0, at: 0 });
  });

  it('保留 url 字段', () => {
    expect(parseProbeLine('{"process":"msedge","title":"t","url":"https://zhihu.com/x","idleMs":0,"at":1}')?.url)
      .toBe('https://zhihu.com/x');
  });
});

describe('mergeSample', () => {
  it('url 为 null 时保留上一次的值', () => {
    const prev = { process: 'msedge', title: 'a', url: 'https://x.com', idleMs: 0, at: 1 };
    const next = { process: 'msedge', title: 'a', url: null, idleMs: 5, at: 2 };
    expect(mergeSample(prev, next).url).toBe('https://x.com');
  });

  it('url 有新值时覆盖', () => {
    const prev = { process: 'msedge', title: 'a', url: 'https://old.com', idleMs: 0, at: 1 };
    const next = { process: 'msedge', title: 'a', url: 'https://new.com', idleMs: 0, at: 2 };
    expect(mergeSample(prev, next).url).toBe('https://new.com');
  });

  it('进程变化时清空上一轮的 url（避免张冠李戴）', () => {
    const prev = { process: 'msedge', title: 'a', url: 'https://old.com', idleMs: 0, at: 1 };
    const next = { process: 'WINWORD.EXE', title: 'b', url: null, idleMs: 0, at: 2 };
    expect(mergeSample(prev, next).url).toBeNull();
  });

  it('没有上一次时 url 保持 null', () => {
    const next = { process: 'msedge', title: 'a', url: null, idleMs: 0, at: 2 };
    expect(mergeSample(null, next).url).toBeNull();
  });
});

describe('createProbe', () => {
  function fakeChild() {
    const handlers = {};
    return {
      stdout: { on: (ev, fn) => { handlers[ev] = fn; } },
      on: (ev, fn) => { handlers[`child:${ev}`] = fn; },
      kill: vi.fn(),
      emit: (ev, ...args) => handlers[ev]?.(...args),
    };
  }

  it('逐行回调解析后的样本', () => {
    const child = fakeChild();
    const onSample = vi.fn();
    createProbe({
      scriptPath: 'x.ps1',
      intervalMs: 1000,
      onSample,
      spawnImpl: () => child,
    });
    child.emit('data', Buffer.from('{"process":"msedge","title":"a","idleMs":0,"at":1}\n{"process":"msedge","title":"b","idleMs":0,"at":2}\n'));
    expect(onSample).toHaveBeenCalledTimes(2);
    expect(onSample.mock.calls[1][0].title).toBe('b');
  });

  it('跨 chunk 的半行被缓冲', () => {
    const child = fakeChild();
    const onSample = vi.fn();
    createProbe({ scriptPath: 'x.ps1', intervalMs: 1000, onSample, spawnImpl: () => child });
    child.emit('data', Buffer.from('{"process":"msedge","tit'));
    expect(onSample).not.toHaveBeenCalled();
    child.emit('data', Buffer.from('le":"a","idleMs":0,"at":1}\n'));
    expect(onSample).toHaveBeenCalledTimes(1);
    expect(onSample.mock.calls[0][0].title).toBe('a');
  });

  it('stop 杀掉子进程', () => {
    const child = fakeChild();
    const probe = createProbe({ scriptPath: 'x.ps1', intervalMs: 1000, onSample: () => {}, spawnImpl: () => child });
    probe.stop();
    expect(child.kill).toHaveBeenCalled();
  });

  it('子进程报错走 onError', () => {
    const child = fakeChild();
    const onError = vi.fn();
    createProbe({ scriptPath: 'x.ps1', intervalMs: 1000, onSample: () => {}, onError, spawnImpl: () => child });
    child.emit('child:error', new Error('spawn failed'));
    expect(onError).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run desktop/test/probe.test.js
```

Expected: FAIL — 无法解析 `../src/probe.mjs`

- [ ] **Step 3: 实现 `desktop/src/probe.mjs`**

```js
import { spawn as nodeSpawn } from 'node:child_process';

function asString(value) {
  return typeof value === 'string' ? value : '';
}

function asNumber(value) {
  return Number.isFinite(value) ? value : 0;
}

/** 解析探针的一行输出。非法输入返回 null，永不抛异常。 */
export function parseProbeLine(line) {
  const text = String(line ?? '').trim();
  if (text === '') return null;
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return null;
  return {
    process: asString(obj.process),
    title: asString(obj.title),
    url: typeof obj.url === 'string' && obj.url !== '' ? obj.url : null,
    idleMs: asNumber(obj.idleMs),
    at: asNumber(obj.at),
  };
}

/**
 * 合并两次探针的输出。精确探针只在少数帧带上 url，
 * 因此 url 为 null 时沿用上一次；但进程或标题变了就必须丢弃旧 url。
 */
export function mergeSample(previous, next) {
  const prev = previous ?? null;
  const sameWindow = prev && prev.process === next.process && prev.title === next.title;
  return {
    ...next,
    url: next.url ?? (sameWindow ? prev.url : null),
  };
}

/**
 * 拉起常驻的 PowerShell 探针，逐行解析样本。
 * @returns {{stop: () => void}}
 */
export function createProbe({ scriptPath, intervalMs = 1000, onSample, onError, spawnImpl = nodeSpawn }) {
  let buffer = '';
  let stopped = false;

  const child = spawnImpl(
    'powershell.exe',
    ['-NoProfile', '-File', scriptPath, '-Interval', String(intervalMs)],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  child.stdout?.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let index = buffer.indexOf('\n');
    while (index !== -1) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      const sample = parseProbeLine(line);
      if (sample) onSample?.(sample);
      index = buffer.indexOf('\n');
    }
  });

  child.on?.('error', (error) => onError?.(error));
  child.on?.('exit', (code) => {
    if (!stopped) onError?.(new Error(`探针进程退出，code=${code}`));
  });

  return {
    stop() {
      stopped = true;
      try {
        child.kill();
      } catch {
        /* 已经退出 */
      }
    },
  };
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx vitest run desktop/test/probe.test.js
```

Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/probe.mjs desktop/test/probe.test.js
git commit -m "feat(desktop): 前台探针的解析、合并与子进程管理"
```

---

## Task 5: `desktop/src/detect.mjs` — 样本到引擎输入的映射

**Files:**
- Create: `desktop/src/detect.mjs`
- Test: `desktop/test/detect.test.js`

**Interfaces:**
- Consumes: `judge`（Task 2）、`Sample`（Task 4）
- Produces:
  - `toEngineInput(sample, rules): {skip: boolean, input: object|null}`
    - `skip: true` 表示前台是本程序自身，**调用方必须整帧跳过**（不得调用 `step`）
    - 否则 `input = {classification, focused: true, idle}` 可直接传给 `engine.step`（`now` 由调用方补）
  - `pushRecentTitle(list, sample, max = 10): Array<{title, process, at}>` — 纯函数。维护"最近前台窗口"滚动列表（供设置页挑选），按标题去重、新项置顶、超员截断。
  - `selfProcessNames(): string[]` — 返回本程序需要忽略的进程名（`rules.selfProcesses` 与当前可执行文件名）。

- [ ] **Step 1: 写失败测试 `desktop/test/detect.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { toEngineInput, pushRecentTitle } from '../src/detect.mjs';

const R = {
  mode: 'browser',
  exactMode: false,
  browsers: ['msedge.exe'],
  blockedKeywords: ['知乎'],
  blockedDomains: ['zhihu.com'],
  selfProcesses: ['electron.exe'],
  watchdogMs: 10 * 60 * 1000,
};

const sample = (over = {}) => ({
  process: 'msedge.exe', title: '数学.pdf', url: null, idleMs: 0, at: 1, ...over,
});

describe('toEngineInput', () => {
  it('学习内容 → classification=study, focused=true, idle=false', () => {
    expect(toEngineInput(sample(), R)).toEqual({
      skip: false,
      input: { classification: 'study', focused: true, idle: false },
    });
  });

  it('学习外 → classification=distract', () => {
    expect(toEngineInput(sample({ title: '知乎 - 有问题' }), R).input.classification).toBe('distract');
  });

  it('非学习来源 → classification=neutral', () => {
    expect(toEngineInput(sample({ process: 'WINWORD.EXE' }), R).input.classification).toBe('neutral');
  });

  it('空闲 → idle=true 且 classification 仍为 study', () => {
    const r = toEngineInput(sample({ idleMs: 10 * 60 * 1000 }), R);
    expect(r.input).toEqual({ classification: 'study', focused: true, idle: true });
  });

  it('前台是本程序自身 → skip=true 且不产出 input', () => {
    const r = toEngineInput(sample({ process: 'electron.exe' }), R);
    expect(r.skip).toBe(true);
    expect(r.input).toBeNull();
  });

  it('focused 恒为 true（桌面端总有前台窗口）', () => {
    expect(toEngineInput(sample({ process: 'WINWORD.EXE' }), R).input.focused).toBe(true);
  });
});

describe('pushRecentTitle', () => {
  const item = (title, process = 'msedge.exe', at = 1) => ({ title, process, at });

  it('新标题置顶', () => {
    const list = pushRecentTitle([item('a')], sample({ title: 'b', at: 2 }));
    expect(list.map((x) => x.title)).toEqual(['b', 'a']);
  });

  it('重复标题被提到最前而不是重复插入', () => {
    const list = pushRecentTitle([item('a'), item('b')], sample({ title: 'b', at: 3 }));
    expect(list.map((x) => x.title)).toEqual(['b', 'a']);
    expect(list).toHaveLength(2);
  });

  it('空标题不入列表', () => {
    expect(pushRecentTitle([item('a')], sample({ title: '  ' }))).toHaveLength(1);
  });

  it('超出上限时截断尾部', () => {
    let list = [];
    for (let i = 0; i < 15; i += 1) list = pushRecentTitle(list, sample({ title: `t${i}`, at: i }), 10);
    expect(list).toHaveLength(10);
    expect(list[0].title).toBe('t14');
    expect(list[9].title).toBe('t5');
  });

  it('不改动入参数组', () => {
    const original = [item('a')];
    const snapshot = JSON.stringify(original);
    pushRecentTitle(original, sample({ title: 'b' }));
    expect(JSON.stringify(original)).toBe(snapshot);
  });
});
```

- [ ] **Step 2: 运行确认失败**

```bash
npx vitest run desktop/test/detect.test.js
```

Expected: FAIL — 无法解析 `../src/detect.mjs`

- [ ] **Step 3: 实现 `desktop/src/detect.mjs`**

```js
import { judge } from './rules.js';

/**
 * 把前台样本翻译成 engine.step 的输入。
 * 前台是本程序自身时返回 skip，调用方必须整帧跳过——否则点一下桌宠就会打断计时。
 */
export function toEngineInput(sample, rules) {
  const verdict = judge(sample, rules);
  if (verdict.self) return { skip: true, input: null };
  return {
    skip: false,
    input: {
      classification: verdict.classification,
      focused: true,
      idle: verdict.idle,
    },
  };
}

/** 维护"最近前台窗口"滚动列表，供设置页挑选要加入学习外名单的站点 */
export function pushRecentTitle(list, sample, max = 10) {
  const title = String(sample?.title ?? '').trim();
  const current = Array.isArray(list) ? list : [];
  if (title === '') return current.slice();

  const rest = current.filter((entry) => entry.title !== title);
  const next = [{ title, process: sample.process ?? '', at: sample.at ?? 0 }, ...rest];
  return next.slice(0, max);
}
```

- [ ] **Step 4: 运行确认通过**

```bash
npx vitest run desktop/test/detect.test.js
```

Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add desktop/src/detect.mjs desktop/test/detect.test.js
git commit -m "feat(desktop): 样本到引擎输入的映射与最近窗口列表"
```

---

## Task 6: `desktop/main.js` — Electron 主进程

**Files:**
- Create: `desktop/main.js`, `desktop/preload-pet.js`, `desktop/preload-settings.js`
- Modify: `desktop/native/uia-url.ps1`（改造成常驻循环探针）

**Interfaces:**
- Consumes: Task 1–5 全部产物；`src/lib/storage.js` 的 `createStore`/`STORAGE_KEYS`；`src/lib/settings.js` 的 `normalizeSettings`/`defaultSettings`；`src/core/engine.js` 的 `step`/`initialSession`；`src/core/account.js` 的 `applyStep`/`createAccount`；`src/lib/snapshot.js` 的 `buildSnapshot`；`src/core/time.js` 的 `dayKey`
- Produces:
  - 主进程维护并持久化 `{settings, rules, state}`；每次判定后把 `buildSnapshot(...)` 结果广播给桌宠窗口
  - IPC：`pet:get-snapshot`、`pet:toggle-pause`、`pet:open-settings`、`pet:quit`、`settings:get`、`settings:save`、`settings:recent`
  - 桌宠窗口位置持久化到 `state.petBounds`

- [ ] **Step 1: 把 `desktop/native/uia-url.ps1` 改造成常驻循环探针**

现有版本是「跑一次就退出」的验证脚本，且字段形状与基础探针不同。改成同样的常驻循环，只补 `title` 与 `url`（`process`/`idleMs` 由基础探针提供，由 `mergeSample` 合并）。

```powershell
# 精确探针：常驻循环，读前台窗口标题与浏览器地址栏内容。
# 只读：查询无障碍树，不发送输入、不修改设置。
param([int]$Interval = 3000)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class WinFg {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowTextLength(IntPtr h);
  public static string Title(IntPtr hWnd) {
    int len = GetWindowTextLength(hWnd);
    if (len <= 0) return "";
    StringBuilder sb = new StringBuilder(len + 1);
    GetWindowText(hWnd, sb, sb.Capacity);
    return sb.ToString();
  }
}
"@

# 中文系统是「地址和搜索栏」，英文是「Address and search bar」
$ADDRESS_NAMES = @('地址和搜索栏', 'Address and search bar')

while ($true) {
  $hWnd = [WinFg]::GetForegroundWindow()
  $title = [WinFg]::Title($hWnd)
  $url = $null

  if ($hWnd -ne [IntPtr]::Zero) {
    try {
      $root = [System.Windows.Automation.AutomationElement]::FromHandle($hWnd)
      if ($root) {
        foreach ($name in $ADDRESS_NAMES) {
          $cond = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::NameProperty, $name)
          $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $cond)
          if ($el) {
            $vp = $el.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
            $value = $vp.Current.Value
            if ($value) { $url = $value; break }
          }
        }
      }
    } catch { $url = $null }
  }

  [ordered]@{
    title = $title
    url   = $url
    at    = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  } | ConvertTo-Json -Compress

  Start-Sleep -Milliseconds $Interval
}
```

> 首次运行需 2–3 秒唤醒 Chrome/Edge 的无障碍树，这期间 `url` 会是 `null`，`mergeSample` 会保留上一次的值；若一直读不到，判定自动退回标题层。

- [ ] **Step 2: 写 `desktop/preload-pet.js`**

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  onSnapshot: (handler) => {
    ipcRenderer.on('pet:snapshot', (_event, snapshot) => handler(snapshot));
  },
  getSnapshot: () => ipcRenderer.invoke('pet:get-snapshot'),
  togglePause: () => ipcRenderer.invoke('pet:toggle-pause'),
  openSettings: () => ipcRenderer.invoke('pet:open-settings'),
  quit: () => ipcRenderer.invoke('pet:quit'),
  showMenu: () => ipcRenderer.send('pet:show-menu'),
});
```

- [ ] **Step 3: 写 `desktop/preload-settings.js`**

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('settings:get'),
  saveConfig: (payload) => ipcRenderer.invoke('settings:save', payload),
  getRecent: () => ipcRenderer.invoke('settings:recent'),
  close: () => ipcRenderer.invoke('settings:close'),
});
```

- [ ] **Step 4: 写 `desktop/main.js`**

```js
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const { app, BrowserWindow, ipcMain, Menu } = require('electron');

/** 数据文件位置与读写。内联在主进程里，避免多一个模块。 */
function dataFilePath(userDataDir) {
  return path.join(userDataDir, 'kaoyan-focus-state.json');
}

function loadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return {};
  }
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
}

/** 动态加载 ESM 模块。主进程是 CJS，必须转成 file URL 才能 import。 */
const load = (filePath) => import(pathToFileURL(filePath).href);

let petWindow = null;
let settingsWindow = null;
let probe = null;
let paused = false;
let disposed = false;

// —— 以下模块在 ready 后动态 import（核心是 ESM，主进程是 CJS） ——
let store = null;
let normalizeSettings = null;
let defaultSettings = null;
let step = null;
let initialSession = null;
let applyStep = null;
let createAccount = null;
let buildSnapshot = null;
let dayKey = null;
let createProbe = null;
let mergeSample = null;
let toEngineInput = null;
let pushRecentTitle = null;
let DEFAULT_RULES = null;

let session = null;
let account = null;
let daily = {};
let settings = null;
let rules = null;
let recentWindows = [];
let lastSample = null;
let pendingUrl = null;
let urlProbe = null;
let busy = false;

const ROOT = path.join(__dirname, '..'); // 仓库根，含共享的 src/

async function loadModules() {
  const core = (p) => load(path.join(ROOT, 'src', p));
  const own = (p) => load(path.join(__dirname, 'src', p));

  ({ createStore } = await core('lib/storage.js'));
  ({ normalizeSettings, defaultSettings } = await core('lib/settings.js'));
  ({ step, initialSession } = await core('core/engine.js'));
  ({ applyStep, createAccount } = await core('core/account.js'));
  ({ buildSnapshot } = await core('lib/snapshot.js'));
  ({ dayKey } = await core('core/time.js'));

  ({ createFileArea } = await own('file-store.mjs'));
  ({ createProbe, mergeSample } = await own('probe.mjs'));
  ({ toEngineInput, pushRecentTitle } = await own('detect.mjs'));
  ({ DEFAULT_RULES } = await own('rules.mjs'));
}

// —— 窗口 ——

function createPetWindow(savedBounds) {
  petWindow = new BrowserWindow({
    width: 220,
    height: 260,
    x: savedBounds?.x,
    y: savedBounds?.y,
    frame: false,
    transparent: true,
    resizable: false,
    hasShadow: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-pet.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  petWindow.setAlwaysOnTop(true, 'screen-saver');
  petWindow.loadFile(path.join(__dirname, 'pet/index.html'));

  petWindow.on('moved', () => {
    const [x, y] = petWindow.getPosition();
    persistBounds({ x, y });
  });
  petWindow.on('closed', () => { petWindow = null; });
}

function persistBounds(bounds) {
  try {
    const file = dataFilePath(app.getPath('userData'));
    const data = loadJson(file);
    data.petBounds = bounds;
    saveJson(file, data);
  } catch { /* 位置存不下不影响计时 */ }
}

function openSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 560,
    height: 640,
    title: '考研专注养成 · 设置',
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings/index.html'));
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function broadcastSnapshot() {
  if (!petWindow) return;
  if (paused) {
    petWindow.webContents.send('pet:snapshot', { paused: true });
    return;
  }
  const now = Date.now();
  petWindow.webContents.send(
    'pet:snapshot',
    buildSnapshot({ account, daily, settings, session }, now),
  );
}

// —— 计时主循环 ——

async function onSample(rawSample) {
  if (disposed || paused) return;
  if (busy) return;
  busy = true;
  try {
    const sample = mergeSample(lastSample, {
      ...rawSample,
      url: rules.exactMode ? pendingUrl : null,
    });
    lastSample = sample;
    recentWindows = pushRecentTitle(recentWindows, sample);

    const { skip, input } = toEngineInput(sample, rules);
    if (skip) return; // 前台是桌宠自己，整帧跳过

    const now = Date.now();
    const result = step(session, { now, ...input });
    const next = applyStep(account, daily, result, settings);
    session = result.session;
    account = next.account;
    daily = next.daily;

    await store.saveState({ session, account });
    await store.saveDaily(daily);
    broadcastSnapshot();
  } catch (error) {
    console.error('[桌宠] 计时循环出错：', error);
  } finally {
    busy = false;
  }
}

async function start() {
  await loadModules();

  const file = dataFilePath(app.getPath('userData'));
  const raw = loadJson(file);
  const now = Date.now();

  store = createStore(createFileArea({
    load: () => raw,
    save: (data) => saveJson(file, data),
    onError: (error) => console.error('[桌宠] 落盘失败：', error.message),
  }));

  settings = normalizeSettings(raw.settings, now);
  rules = { ...DEFAULT_RULES, ...(raw.rules ?? {}), watchdogMs: settings.watchdogMs };
  daily = raw.daily ?? {};
  const state = raw.state ?? { session: initialSession(now), account: createAccount(dayKey(now)) };
  session = state.session;
  account = state.account;

  createPetWindow(raw.petBounds ?? null);

  probe = createProbe({
    scriptPath: path.join(__dirname, 'native/foreground.ps1'),
    intervalMs: 1000,
    onSample,
    onError: (error) => console.error('[桌宠] 探针错误：', error.message),
  });
  refreshUrlProbe();

  broadcastSnapshot();
}

/**
 * 精确模式才跑 UIA 探针，频率压到 3 秒——它会唤醒浏览器的无障碍树，
 * 查询本身也远比读窗口标题贵。
 */
function refreshUrlProbe() {
  const wanted = rules.exactMode === true;
  if (wanted && !urlProbe) {
    urlProbe = createProbe({
      scriptPath: path.join(__dirname, 'native/uia-url.ps1'),
      intervalMs: 3000,
      onSample: (sample) => { pendingUrl = sample.url; },
      onError: (error) => console.error('[桌宠] 精确探针错误：', error.message),
    });
  } else if (!wanted && urlProbe) {
    urlProbe.stop();
    urlProbe = null;
    pendingUrl = null;
  }
}

// —— IPC ——

ipcMain.handle('pet:get-snapshot', () => {
  if (paused) return { paused: true };
  return buildSnapshot({ account, daily, settings, session }, Date.now());
});

ipcMain.handle('pet:toggle-pause', () => {
  paused = !paused;
  broadcastSnapshot();
  return { paused };
});

ipcMain.handle('pet:open-settings', () => {
  openSettingsWindow();
});

ipcMain.handle('pet:quit', () => {
  app.quit();
});

ipcMain.on('pet:show-menu', () => {
  const menu = Menu.buildFromTemplate([
    { label: paused ? '继续计时' : '暂停计时', click: () => { paused = !paused; broadcastSnapshot(); } },
    { label: '设置…', click: openSettingsWindow },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() },
  ]);
  menu.popup({ window: petWindow });
});

ipcMain.handle('settings:get', () => ({ settings, rules }));

ipcMain.handle('settings:save', async (_event, payload) => {
  settings = normalizeSettings(payload.settings, Date.now());
  rules = { ...DEFAULT_RULES, ...payload.rules, watchdogMs: settings.watchdogMs };
  await store.saveSettings(payload.settings);
  await store.set('rules', rules);
  refreshUrlProbe();
  broadcastSnapshot();
  return { ok: true };
});

ipcMain.handle('settings:recent', () => recentWindows);

ipcMain.handle('settings:close', () => {
  settingsWindow?.close();
});

// —— 生命周期 ——

app.whenReady().then(start).catch((error) => {
  console.error('[桌宠] 启动失败：', error);
  app.quit();
});

app.on('window-all-closed', () => { /* 桌宠关了也不退出，等托盘/菜单 */ });
app.on('before-quit', () => {
  disposed = true;
  probe?.stop();
  urlProbe?.stop();
});
```

- [ ] **Step 5: 语法检查**

```bash
cd "D:/HRAppStoreDownload/Users/26634/Desktop/Projects/KaoyanFocusCompanion/desktop"
for f in main.js preload-pet.js preload-settings.js src/rules.mjs src/file-store.mjs src/probe.mjs src/detect.mjs; do node --check "$f" && echo "OK $f"; done
```

- [ ] **Step 6: Commit**

```bash
git add desktop/main.js desktop/preload-pet.js desktop/preload-settings.js desktop/src/paths.js
git commit -m "feat(desktop): Electron 主进程与计时主循环"
```

---

## Task 7: 桌宠界面 `desktop/pet/`

**Files:**
- Create: `desktop/pet/index.html`, `desktop/pet/pet.css`, `desktop/pet/pet.js`

**Interfaces:**
- Consumes: `window.pet`（preload 暴露）、快照结构（同 `buildSnapshot`）
- Produces: 无（叶子 UI）

**视觉**：沿用清冷山系（`#f7f9fa` / `#2e3a44` / `#5b7fa6` / `#e0a44a`）。窗口透明，只有凤凰与信息条可见。

- [ ] **Step 1: 写 `desktop/pet/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>考研专注养成</title>
    <link rel="stylesheet" href="pet.css" />
  </head>
  <body>
    <div id="stage">
      <div id="phoenix" class="phoenix" data-mood="dozing">&#128035;</div>
      <div id="bubble" class="bubble">
        <div class="row">
          <span id="time" class="time">00:00:00</span>
          <span id="goal" class="dim">今日 0%</span>
        </div>
        <div class="bar"><i id="spirit"></i></div>
        <div id="line1" class="dim"></div>
        <div id="line2" class="dim"></div>
        <div class="mountain">
          <div class="rail"></div>
          <div class="time-mark" id="mark-time"></div>
          <div class="you-mark" id="mark-you"></div>
        </div>
        <div id="line3" class="dim"></div>
      </div>
    </div>
    <script type="module" src="pet.js"></script>
  </body>
</html>
```

- [ ] **Step 2: 写 `desktop/pet/pet.css`**

```css
:root {
  --ink: #2e3a44;
  --dim: #7d8b98;
  --track: #e4eaef;
  --accent: #5b7fa6;
  --warm: #e0a44a;
  --card: rgba(247, 249, 250, 0.94);
  --line: #dde4ea;
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  height: 100%;
  background: transparent;
  overflow: hidden;
  font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  color: var(--ink);
  -webkit-user-select: none;
  user-select: none;
}

#stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  padding: 6px;
}

/* 整只凤凰就是拖拽区 */
.phoenix {
  font-size: 64px;
  line-height: 1;
  margin-top: 6px;
  cursor: grab;
  -webkit-app-region: drag;
  filter: drop-shadow(0 4px 10px rgba(46, 58, 68, 0.28));
  transition: transform 200ms ease;
}
.phoenix:active { cursor: grabbing; }
.phoenix[data-mood="dozing"] { opacity: 0.62; filter: saturate(0.55) drop-shadow(0 4px 10px rgba(46,58,68,.2)); }
.phoenix[data-mood="wilted"] { opacity: 0.4; filter: saturate(0.15); }
.phoenix[data-paused="true"] { filter: grayscale(1) opacity(0.5); }

.bubble {
  width: 100%;
  margin-top: 8px;
  padding: 9px 11px 10px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: 0 4px 14px rgba(46, 58, 68, 0.14);
  -webkit-app-region: no-drag;
}
.bubble[hidden] { display: none; }

.row { display: flex; align-items: baseline; justify-content: space-between; }
.time { font-size: 19px; font-weight: 600; font-variant-numeric: tabular-nums; }
.dim { font-size: 10px; color: var(--dim); }

.bar {
  height: 4px;
  background: var(--track);
  border-radius: 2px;
  overflow: hidden;
  margin: 6px 0 7px;
}
.bar > i { display: block; height: 100%; background: var(--warm); border-radius: 2px; transition: width 400ms ease; }

.mountain { position: relative; height: 12px; margin: 8px 0 3px; }
.mountain .rail { position: absolute; left: 0; right: 0; top: 5px; height: 2px; background: var(--track); }
.mountain .time-mark, .mountain .you-mark {
  position: absolute; top: 0; width: 2px; height: 12px; transform: translateX(-1px);
}
.mountain .time-mark { background: rgba(46, 58, 68, 0.35); }
.mountain .you-mark { background: var(--accent); }
```

- [ ] **Step 3: 写 `desktop/pet/pet.js`**

```js
const MOOD_EMOJI = { alive: '\u{1F426}', dozing: '\u{1F425}', wilted: '\u{1F423}' };
const STATE_TEXT = {
  FOCUSING: '专注中',
  PAUSED_AWAY: '暂停 · 不在学习内容',
  PAUSED_DISTRACTED: '暂停 · 在学习外网站',
  WAITING_ACTIVITY: '打盹中，动一下鼠标就回来',
  IDLE: '未开始',
};

const $ = (id) => document.getElementById(id);

function hhmmss(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function deltaText(hours) {
  const abs = Math.abs(hours);
  const value = abs >= 1 ? abs.toFixed(1) : (abs * 60).toFixed(0);
  return `${hours >= 0 ? '领先' : '欠'} ${value} ${abs >= 1 ? '小时' : '分钟'}`;
}

function render(snapshot) {
  if (!snapshot) return;

  if (snapshot.paused) {
    $('phoenix').dataset.paused = 'true';
    $('line2').textContent = '已暂停';
    return;
  }
  $('phoenix').dataset.paused = 'false';

  const { account, settings, session, stage, mountain, mood, today } = snapshot;
  const goalMs = settings.dailyGoalMs;
  const goalPct = goalMs > 0 ? Math.min(100, Math.round((today.focusMs / goalMs) * 100)) : 0;

  $('phoenix').textContent = MOOD_EMOJI[mood] ?? MOOD_EMOJI.dozing;
  $('phoenix').dataset.mood = mood;

  $('time').textContent = hhmmss(today.focusMs);
  $('goal').textContent = `今日 ${goalPct}%`;
  $('spirit').style.width = `${Math.round(account.spirit)}%`;

  $('line1').textContent = `${settings.companionName} · ${stage.stage.name}`;
  $('line2').textContent = STATE_TEXT[session.status] ?? session.status;
  $('line3').textContent =
    `海拔 ${Math.round(mountain.pYou * 100)}% · ${deltaText(mountain.deltaHours)} · 🔥${account.streak}`;

  $('mark-time').style.left = `${Math.round(mountain.pTime * 100)}%`;
  $('mark-you').style.left = `${Math.round(mountain.pYou * 100)}%`;
}

window.pet.onSnapshot(render);
window.pet.getSnapshot().then(render);

$('phoenix').addEventListener('dblclick', () => {
  const bubble = $('bubble');
  bubble.hidden = !bubble.hidden;
});

document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  window.pet.showMenu();
});
```

- [ ] **Step 4: 语法检查**

```bash
cd "D:/HRAppStoreDownload/Users/26634/Desktop/Projects/KaoyanFocusCompanion/desktop"
node --check pet/pet.js && echo "OK pet.js"
```

- [ ] **Step 5: Commit**

```bash
git add desktop/pet
git commit -m "feat(desktop): 桌宠界面（透明置顶、可拖动、双击折叠）"
```

---

## Task 8: 设置界面 `desktop/settings/` + 启动验证

**Files:**
- Create: `desktop/settings/index.html`, `desktop/settings/settings.css`, `desktop/settings/settings.js`
- Modify: `desktop/package.json`（`start` 脚本已存在）

**Interfaces:**
- Consumes: `window.api`（preload 暴露）
- Produces: 无（叶子 UI）

- [ ] **Step 1: 写 `desktop/settings/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>考研专注养成 · 设置</title>
    <link rel="stylesheet" href="settings.css" />
  </head>
  <body>
    <h1>设置</h1>

    <section class="card">
      <h2>计分口径</h2>
      <label>学习来源
        <select id="mode">
          <option value="browser">只有浏览器在前台才算</option>
          <option value="global">任何窗口在前台都算</option>
        </select>
      </label>
      <label class="check">
        <input type="checkbox" id="exactMode" />
        <span>精确模式：读取浏览器地址栏内容做域名判定</span>
      </label>
      <p class="warn" id="exactWarn">
        精确模式会让 Edge / Chrome 常驻在无障碍模式下（浏览器自身的额外开销），
        控件名与无障碍树结构随浏览器版本变化、可能失效。读不到时会自动退回标题匹配。
      </p>
      <label>空闲多久算离开（分钟）<input type="number" id="watchdogMinutes" min="1" max="120" /></label>
    </section>

    <section class="card">
      <h2>浏览器白名单（进程名）</h2>
      <ul id="browserList" class="rules"></ul>
      <div class="add">
        <input type="text" id="browserInput" placeholder="msedge.exe" />
        <button id="browserAdd">添加</button>
      </div>
    </section>

    <section class="card">
      <h2>学习外网站</h2>
      <p class="hint">命中任一条即停表并记一次走神。域名规则用于精确模式，标题关键词用于普通模式。</p>

      <h3>域名</h3>
      <ul id="domainList" class="rules"></ul>
      <div class="add">
        <input type="text" id="domainInput" placeholder="bilibili.com" />
        <button id="domainAdd">添加</button>
      </div>

      <h3>标题关键词</h3>
      <ul id="keywordList" class="rules"></ul>
      <div class="add">
        <input type="text" id="keywordInput" placeholder="哔哩哔哩" />
        <button id="keywordAdd">添加</button>
      </div>

      <h3>最近出现过的窗口</h3>
      <p class="hint">在你想屏蔽的页面上停一下再切回来，它就会出现在这里。点「加关键词」抓取其中的词。</p>
      <ul id="recentList" class="rules"></ul>
    </section>

    <section class="card">
      <h2>目标</h2>
      <label>考试日期 <input type="date" id="examDate" /></label>
      <label>每日目标（分钟）<input type="number" id="dailyGoalMinutes" min="1" max="1440" /></label>
      <label>每日计入上限（分钟）<input type="number" id="dailyCapMinutes" min="1" max="1440" /></label>
      <label>凤凰名字 <input type="text" id="companionName" maxlength="12" /></label>
    </section>

    <div class="actions">
      <button id="save" class="primary">保存</button>
      <span id="status" class="hint"></span>
    </div>

    <script type="module" src="settings.js"></script>
  </body>
</html>
```

- [ ] **Step 2: 写 `desktop/settings/settings.css`**

```css
:root {
  --bg: #f7f9fa; --ink: #2e3a44; --dim: #7d8b98; --line: #dde4ea; --accent: #5b7fa6;
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 20px 24px 28px; background: var(--bg); color: var(--ink);
  font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
}
h1 { font-size: 18px; font-weight: 600; margin: 0 0 14px; }
h2 { font-size: 13px; font-weight: 600; margin: 0 0 10px; }
h3 { font-size: 11px; font-weight: 600; margin: 14px 0 6px; color: var(--dim); }
.card { background: #fff; border: 1px solid var(--line); border-radius: 6px; padding: 14px; margin-bottom: 14px; }
label { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 9px; font-size: 12px; }
label.check { justify-content: flex-start; }
input, select {
  font: inherit; font-size: 12px; padding: 6px 8px; border: 1px solid var(--line);
  border-radius: 4px; background: #fff; color: inherit; min-width: 170px;
}
button { font: inherit; font-size: 12px; padding: 6px 13px; border: 1px solid var(--line); border-radius: 4px; background: #fff; color: inherit; cursor: pointer; }
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.hint { font-size: 10px; color: var(--dim); line-height: 1.7; margin: 6px 0 0; }
.warn { font-size: 10px; color: #8a6d3b; background: #fdf7e6; border: 1px solid #f0e2bd; border-radius: 4px; padding: 8px 10px; line-height: 1.7; margin: 4px 0 10px; }
.rules { list-style: none; margin: 0; padding: 0; }
.rules li { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 5px 0; border-bottom: 1px solid var(--line); font-size: 12px; }
.rules li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rules li button { border: none; color: var(--accent); padding: 2px 6px; white-space: nowrap; }
.add { display: flex; gap: 8px; margin-top: 8px; }
.add input { flex: 1; min-width: 0; }
.actions { display: flex; align-items: center; gap: 12px; }
```

- [ ] **Step 3: 写 `desktop/settings/settings.js`**

```js
import { dayKey } from '../../src/core/time.js';

const $ = (id) => document.getElementById(id);

let settings = null;
let rules = null;
let recent = [];

function renderList(kind) {
  const list = $(`${kind}List`);
  list.textContent = '';
  for (const [index, value] of rules[kind].entries()) {
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.textContent = value;
    const del = document.createElement('button');
    del.textContent = '删除';
    del.addEventListener('click', () => {
      rules[kind].splice(index, 1);
      renderList(kind);
    });
    li.append(span, del);
    list.append(li);
  }
}

function addRule(kind, inputId) {
  const input = $(inputId);
  const value = input.value.trim();
  if (value === '' || rules[kind].includes(value)) return;
  rules[kind].push(value);
  input.value = '';
  renderList(kind);
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
    btn.textContent = '加关键词';
    btn.addEventListener('click', () => {
      const guess = item.title.split(/[-_|·]/)[0].trim().slice(0, 12);
      if (guess && !rules.blockedKeywords.includes(guess)) {
        rules.blockedKeywords.push(guess);
        renderList('blockedKeywords');
      }
    });
    li.append(span, btn);
    list.append(li);
  }
}

function fill() {
  $('mode').value = rules.mode;
  $('exactMode').checked = rules.exactMode;
  $('watchdogMinutes').value = Math.round(settings.watchdogMs / 60000);
  $('examDate').value = dayKey(settings.examDateMs);
  $('dailyGoalMinutes').value = Math.round(settings.dailyGoalMs / 60000);
  $('dailyCapMinutes').value = Math.round(settings.dailyCapMs / 60000);
  $('companionName').value = settings.companionName;
  renderList('browsers');
  renderList('blockedDomains');
  renderList('blockedKeywords');
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
  $('status').textContent = '已保存';
  setTimeout(() => { $('status').textContent = ''; }, 1500);
}

for (const [kind, addId, inputId] of [
  ['browsers', 'browserAdd', 'browserInput'],
  ['blockedDomains', 'domainAdd', 'domainInput'],
  ['blockedKeywords', 'keywordAdd', 'keywordInput'],
]) {
  $(addId).addEventListener('click', () => addRule(kind, inputId));
  $(inputId).addEventListener('keydown', (event) => {
    if (event.key === 'Enter') $(addId).click();
  });
}

$('save').addEventListener('click', save);

load();
setInterval(async () => {
  recent = await window.api.getRecent();
  renderRecent();
}, 3000);
```

- [ ] **Step 4: 语法检查**

```bash
cd "D:/HRAppStoreDownload/Users/26634/Desktop/Projects/KaoyanFocusCompanion/desktop"
node --check settings/settings.js && echo "OK settings.js"
```

- [ ] **Step 5: 全量测试回归**

```bash
cd "D:/HRAppStoreDownload/Users/26634/Desktop/Projects/KaoyanFocusCompanion"
npm test
```

Expected: 全部 PASS（扩展的 109 个 + desktop 新增的 rules/file-store/probe/detect）

- [ ] **Step 6: 启动桌宠（人工验证）**

```bash
cd "D:/HRAppStoreDownload/Users/26634/Desktop/Projects/KaoyanFocusCompanion/desktop"
npm start
```

**验收清单（逐条勾掉）：**

- [ ] 桌面上出现一只凤凰，**背景透明**、没有窗口边框、没有任务栏项
- [ ] 凤凰浮在 Edge 之上（点开 Edge，凤凰仍在最前面）
- [ ] 拖动凤凰能移动窗口；双击它展开/收起信息条
- [ ] 打开一个本地 PDF 并读 2 分钟 → 计时递增，状态显示「专注中」
- [ ] 打开 bilibili 或知乎 → 状态变为「暂停 · 在学习外网站」
- [ ] 切到记事本等非浏览器程序 → 状态变为「暂停 · 不在学习内容」
- [ ] 保持不动 10 分钟以上 → 成长值减少 10 分钟，状态转为「打盹中」
- [ ] 拖动或用鼠标点凤凰 → **计时不受影响**（自身进程被忽略）
- [ ] 右键凤凰 → 出现菜单，能暂停、打开设置、退出
- [ ] 设置页：改每日目标、加一条标题关键词，保存后重开设置页回填正确
- [ ] 设置页「最近出现过的窗口」列出刚才浏览过的页面标题
- [ ] 关掉设置页与重启桌宠后，凤凰回到上次位置、数据仍在

- [ ] **Step 7: Commit**

```bash
git add desktop/settings desktop/package.json
git commit -m "feat(desktop): 设置界面（口径、白名单、学习外名单、最近窗口）"
git push origin main
```

---

## 完成标准

- [ ] `npm test` 全绿（扩展 109 个 + desktop 新增）
- [ ] 桌宠能在 Edge 之上透明置顶显示，可拖动，双击折叠
- [ ] 浏览器在前台计分、学习外网站停表、非浏览器停表、空闲 10 分钟扣分
- [ ] 点/拖桌宠不打断计时
- [ ] 设置能改且持久化，重启后保留
- [ ] `desktop/` 下无任何网络调用；探针只读
