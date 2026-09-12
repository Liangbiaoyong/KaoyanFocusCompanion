# 考研专注养成扩展 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个 Edge (MV3) 扩展，在用户用浏览器看 PDF 备考时诚实计量专注时长，并把它转化为一只凤凰的成长与一座"上岸山"的进度。

**Architecture:** 严格分层：`src/core/` 是**不依赖任何浏览器 API 的纯函数**（时间切分、站点分类、会话状态机、账户结算、成长派生），全部用 vitest 单元测试覆盖；`src/lib/` 是 storage 与设置归一化；`src/background/service-worker.js` 只做事件接线与持久化，逻辑一行不留。UI（侧边栏 / 设置 / 统计 / 引导）只读 storage，通过 `chrome.storage.onChanged` 重绘。

**Tech Stack:** JavaScript (ESM)、Manifest V3、vitest、无运行时依赖、无网络请求。

**Spec:** `docs/superpowers/specs/2026-09-12-kaoyan-focus-companion-design.md`

## Global Constraints

以下约束适用于**每一个**任务，不再逐条重复：

- Manifest V3，目标浏览器 Microsoft Edge（Chromium 114+）。
- **全部数据存 `chrome.storage.local`，不联网、不上传、无网络权限。**
- `src/core/` 下所有模块**不得 import 任何 `chrome.*` API**，必须能在 node 下跑单元测试。
- **计时以时间戳差为准**，禁止依赖常驻 `setInterval`（MV3 service worker 会被回收）。
- 所有本地日期使用**本地时区**，键格式 `YYYY-MM-DD`。
- 每日结算发生在**本地时间 00:00**。
- 每日计入上限默认 **480 分钟（8 小时）**：超出部分如实计入 `daily`，但不进入 `growthMs` 与精神值。
- 看门狗阈值默认 **10 分钟**；超时从 `growthMs` 扣 **10 分钟**，精神值 −20。
- 站点点分**三档**：`study` / `neutral` / `distract`，**未命中任何规则即为 `neutral`**。
- 阶段由 `growthMs` 决定，**可升可降**；`lifetimeFocusMs` **只增不减**。
- 阶段 12 级阈值（小时）：0 / 0.5 / 2 / 6 / 14 / 26 / 44 / 70 / 105 / 150 / 210 / 300。
- 精神值 0–100，每日 00:00 重置为 50；专注每 2 分钟 +1；超时 −20；切到分心站点 −5。
- 连续天数：达标日 = 当日 `focusMs ≥ dailyGoalMs`；未达标时优先消耗**每月 2 张补签卡**，用尽则 `streak` 归零。
- UI 文案一律中文。
- `growthMs` 下限为 0，永不为负。

**与 spec 文字描述有出入、以本计划为准的约定：**

- storage 按功能分成 5 个 key（`settings` / `state` / `daily` / `siteRules` / `snapshot`），不是 spec §7 里画成单个对象的那一版；字段名一律以本计划为准。
- **不建 `lib/messaging.js`**：UI 与后台之间只通过 `chrome.storage.onChanged` 同步（spec §8 已是这么描述的）。
- Task 9 的 `onInstalled` 会打开 `src/onboarding/index.html`，而该文件在 Task 13 才创建。在 Task 13 之前触发安装流程会打开一个 404 页，属预期，不是 bug。

---

## 文件结构

```
KaoyanFocusCompanion/
  package.json                     # ESM, vitest
  vitest.config.js
  .gitignore                       # node_modules/, .superpowers/
  manifest.json                    # MV3
  src/
    core/
      time.js                      # 本地日键、日边界、按日切分、日数差
      sites.js                     # 站点规则编译与三档分类
      engine.js                    # 会话状态机（纯）
      account.js                   # 计分/上限/精神值/连续天数/日结算（纯）
      growth.js                    # 阶段 / 山 / 精神状态（纯）
    lib/
      settings.js                  # 设置默认值与 ms 归一化
      storage.js                   # chrome.storage 封装（可注入 area 以便测试）
      snapshot.js                  # 把 account/daily/settings 组合成 UI 快照
    background/
      service-worker.js            # 事件接线 + alarms + 持久化（薄）
    sidepanel/
      index.html  panel.js  panel.css
    options/
      index.html  options.js  options.css
    stats/
      index.html  stats.js  stats.css
    onboarding/
      index.html  onboarding.js
    diagnostics/
      index.html  diagnostics.js   # 步骤 0 技术验证用，可留作长期工具
  test/
    time.test.js  sites.test.js  engine.test.js
    account.test.js  growth.test.js
    settings.test.js  storage.test.js  snapshot.test.js  manifest.test.js
```

**视觉稿参考**（配色、圆角、间距、山景与凤凰的构图直接照抄）：
`KaoyanFocusCompanion/.superpowers/brainstorm/1714-1789212326/content/panel-layout.html`（B 卡片）与 `visual-style.html`（B 卡片 = 清冷山系）。

---

## Task 1: 项目脚手架与测试运行器

**Files:**
- Create: `package.json`, `vitest.config.js`, `.gitignore`, `test/scaffold.test.js`

**Interfaces:**
- Consumes: 无
- Produces: `npm test` 可运行；后续所有 `test/*.test.js` 被 vitest 拾取。

- [ ] **Step 1: 初始化 git 仓库**

```bash
cd "D:/HRAppStoreDownload/Users/26634/Desktop/Projects/KaoyanFocusCompanion"
git init
```

（若使用者不希望初始化仓库，跳过本步及后续所有 Commit 步骤，其余不变。）

- [ ] **Step 2: 写 `package.json`**

```json
{
  "name": "kaoyan-focus-companion",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: 写 `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
});
```

- [ ] **Step 4: 写 `.gitignore`**

```
node_modules/
.superpowers/
```

- [ ] **Step 5: 写一个必然通过的脚手架测试 `test/scaffold.test.js`**

```js
import { describe, it, expect } from 'vitest';

describe('脚手架', () => {
  it('vitest 能跑起来', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: 安装并运行**

```bash
npm install --save-dev vitest
npm test
```

Expected: `1 passed`

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.js .gitignore test/scaffold.test.js
git commit -m "chore: 项目脚手架与 vitest 测试运行器"
```

---

## Task 2: 扩展骨架与「步骤 0」技术验证

**Files:**
- Create: `manifest.json`, `src/background/service-worker.js`, `src/sidepanel/index.html`, `src/options/index.html`, `src/diagnostics/index.html`, `src/diagnostics/diagnostics.js`, `test/manifest.test.js`

**Interfaces:**
- Consumes: 无
- Produces: 一个可在 Edge 里"加载解压缩的扩展"的骨架；`manifest.json` 的权限与入口固定，后续任务只增不改这些键。

**背景：** spec 第 9 节列了四个必须**先验证**的假设。本任务把验证做成一个诊断页，人工读结果。

- [ ] **Step 1: 写 `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "考研专注养成",
  "version": "0.1.0",
  "description": "看 PDF 备考时的专注养成伙伴",
  "permissions": ["storage", "tabs", "idle", "alarms", "sidePanel"],
  "background": {
    "service_worker": "src/background/service-worker.js",
    "type": "module"
  },
  "action": { "default_title": "考研专注养成" },
  "side_panel": { "default_path": "src/sidepanel/index.html" },
  "options_page": "src/options/index.html"
}
```

- [ ] **Step 2: 写 `test/manifest.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('../manifest.json', import.meta.url)), 'utf8'),
);

describe('manifest', () => {
  it('是 MV3', () => {
    expect(manifest.manifest_version).toBe(3);
  });

  it('声明了引擎与 UI 所需的最小权限', () => {
    expect(manifest.permissions.sort()).toEqual(
      ['alarms', 'idle', 'sidePanel', 'storage', 'tabs'].sort(),
    );
  });

  it('没有申请任何联网相关权限', () => {
    const forbidden = ['host_permissions', 'webRequest', 'proxy', 'declarativeNetRequest'];
    for (const key of forbidden) expect(manifest[key]).toBeUndefined();
  });

  it('背景脚本是 ESM', () => {
    expect(manifest.background.type).toBe('module');
    expect(manifest.background.service_worker).toBe('src/background/service-worker.js');
  });

  it('侧边栏指向 sidepanel/index.html', () => {
    expect(manifest.side_panel.default_path).toBe('src/sidepanel/index.html');
  });
});
```

- [ ] **Step 3: 运行测试确认通过**

```bash
npm test
```

Expected: 全部 PASS（manifest 存在且符合约束）。

- [ ] **Step 4: 写最小后台 `src/background/service-worker.js`**

```js
chrome.runtime.onInstalled.addListener(() => {
  console.log('[考研专注养成] onInstalled');
});
console.log('[考研专注养成] service worker 启动');
```

- [ ] **Step 5: 写最小侧边栏 `src/sidepanel/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>考研专注养成</title>
  </head>
  <body style="font-family: system-ui; padding: 12px">
    <p>侧边栏骨架</p>
  </body>
</html>
```

- [ ] **Step 6: 写最小设置页 `src/options/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>设置</title>
  </head>
  <body style="font-family: system-ui; padding: 16px">
    <h1>设置</h1>
    <p><a href="../diagnostics/index.html">打开诊断页</a></p>
  </body>
</html>
```

（`href` 相对 `src/options/index.html` 解析，`../diagnostics/` 即扩展根下的 `src/diagnostics/`。）

- [ ] **Step 7: 写诊断页 `src/diagnostics/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>技术验证</title>
  </head>
  <body style="font-family: system-ui; padding: 16px; max-width: 720px">
    <h1>步骤 0 技术验证</h1>
    <button id="run">重新检测</button>
    <pre id="out" style="background:#f4f6f8;padding:12px;white-space:pre-wrap"></pre>
    <script type="module" src="diagnostics.js"></script>
  </body>
</html>
```

- [ ] **Step 8: 写 `src/diagnostics/diagnostics.js`**

```js
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

  // 5. 历史日报（storage 可写）
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
```

- [ ] **Step 9: 人工验证（在 Edge 里）**

1. 打开 `edge://extensions`，开启"开发人员模式"，"加载解压缩的扩展"选 `KaoyanFocusCompanion` 目录。
2. 在扩展详情页找到并**开启"允许访问文件网址"**开关。
3. 在 Edge 里打开一个**本地 PDF**（`file:///…pdf`）。
4. 另一个标签页打开诊断页：地址栏输入 `chrome-extension://<扩展ID>/src/diagnostics/index.html`。
5. 记录 `out` 里的 JSON。

**验收标准（逐条勾掉）：**

- [ ] `sidePanelApi === true`
- [ ] `storageWritable === true`
- [ ] `activeTabUrlReadable === true`
- [ ] 打开本地 PDF 后，`isFileUrl === true` 且 `activeTabUrl` 以 `file:///` 开头 ← **本计划成立的前提**
- [ ] 打开诊断页时 `windowFocused === true`；切到别的应用后重新检测应为 `false`
- [ ] `idleState` 在你有输入时为 `"active"`

**若第 4 条失败**（读不到 `file://` 地址）：停止执行后续任务，回报结果。退路见 spec 第 9 节——(a) 让用户把 PDF 拖进扩展自带的阅读页；(b) 改为手动"开始专注"按钮。两种退路都会改动 Task 3–9 的输入来源，需要先改 spec。

- [ ] **Step 10: Commit**

```bash
git add manifest.json src/ test/manifest.test.js
git commit -m "feat: 扩展骨架与步骤 0 技术验证页"
```

---

## Task 3: `src/core/time.js` — 本地日期与切分

**Files:**
- Create: `src/core/time.js`
- Test: `test/time.test.js`

**Interfaces:**
- Consumes: 无
- Produces（后续任务依赖的精确签名）：
  - `dayKey(ms: number): string` — `YYYY-MM-DD`（本地时区）
  - `parseDayKey(key: string): number` — 该日本地 00:00 的 epoch ms
  - `startOfDay(ms: number): number`
  - `nextDayStart(ms: number): number`
  - `splitByDay(startMs: number, endMs: number): Array<{day: string, ms: number}>` — 半开区间 `[startMs, endMs)` 按本地日切分，空区间返回 `[]`
  - `dayKeysFrom(startMs: number, endMsExclusive: number): string[]` — 从 `startMs` 所在日起、到 `endMsExclusive` 所在日**之前**（不含）的每个日键
  - `daysBetween(aMs: number, bMs: number): number` — 按日边界取整的天数差（`b - a`）

- [ ] **Step 1: 写失败测试 `test/time.test.js`**

```js
import { describe, it, expect } from 'vitest';
import {
  dayKey, parseDayKey, startOfDay, nextDayStart,
  splitByDay, dayKeysFrom, daysBetween,
} from '../src/core/time.js';

// 固定用本地时间构造，避免时区假设
const at = (y, m, d, h = 0, min = 0) => new Date(y, m - 1, d, h, min, 0, 0).getTime();

describe('dayKey', () => {
  it('按本地时区格式化', () => {
    expect(dayKey(at(2026, 9, 12, 20, 30))).toBe('2026-09-12');
  });

  it('补零', () => {
    expect(dayKey(at(2026, 1, 5, 0, 0))).toBe('2026-01-05');
  });
});

describe('parseDayKey', () => {
  it('往返一致', () => {
    const key = '2026-09-12';
    expect(dayKey(parseDayKey(key))).toBe(key);
  });

  it('落在当天 00:00', () => {
    expect(parseDayKey('2026-09-12')).toBe(startOfDay(at(2026, 9, 12, 15, 0)));
  });
});

describe('nextDayStart', () => {
  it('跨月正确', () => {
    expect(nextDayStart(at(2026, 9, 30, 23, 59))).toBe(at(2026, 10, 1));
  });

  it('跨年正确', () => {
    expect(nextDayStart(at(2026, 12, 31, 12, 0))).toBe(at(2027, 1, 1));
  });
});

describe('splitByDay', () => {
  it('空区间返回空数组', () => {
    expect(splitByDay(at(2026, 9, 12, 10, 0), at(2026, 9, 12, 10, 0))).toEqual([]);
    expect(splitByDay(at(2026, 9, 12, 10, 0), at(2026, 9, 12, 9, 0))).toEqual([]);
  });

  it('同一天内不切分', () => {
    const out = splitByDay(at(2026, 9, 12, 10, 0), at(2026, 9, 12, 10, 30));
    expect(out).toEqual([{ day: '2026-09-12', ms: 30 * 60 * 1000 }]);
  });

  it('跨天切分并保持总和', () => {
    const start = at(2026, 9, 12, 23, 30);
    const end = at(2026, 9, 13, 0, 30);
    const out = splitByDay(start, end);
    expect(out).toEqual([
      { day: '2026-09-12', ms: 30 * 60 * 1000 },
      { day: '2026-09-13', ms: 30 * 60 * 1000 },
    ]);
    expect(out.reduce((s, x) => s + x.ms, 0)).toBe(end - start);
  });

  it('跨三天', () => {
    const out = splitByDay(at(2026, 9, 12, 22, 0), at(2026, 9, 14, 2, 0));
    expect(out.map((x) => x.day)).toEqual(['2026-09-12', '2026-09-13', '2026-09-14']);
    expect(out.reduce((s, x) => s + x.ms, 0)).toBe(at(2026, 9, 14, 2, 0) - at(2026, 9, 12, 22, 0));
  });
});

describe('dayKeysFrom', () => {
  it('不含结束日', () => {
    expect(dayKeysFrom(at(2026, 9, 12, 22, 0), at(2026, 9, 14, 1, 0)))
      .toEqual(['2026-09-12', '2026-09-13']);
  });

  it('结束日与起始日同一天时返回空（结束日不含）', () => {
    expect(dayKeysFrom(at(2026, 9, 12, 1, 0), at(2026, 9, 12, 23, 0))).toEqual([]);
  });

  it('相邻一天只返回起始日', () => {
    expect(dayKeysFrom(at(2026, 9, 12, 1, 0), at(2026, 9, 13, 0, 0))).toEqual(['2026-09-12']);
  });
});

describe('daysBetween', () => {
  it('同日为 0', () => {
    expect(daysBetween(at(2026, 9, 12, 1, 0), at(2026, 9, 12, 23, 0))).toBe(0);
  });

  it('跨天按日边界计', () => {
    expect(daysBetween(at(2026, 9, 12, 23, 0), at(2026, 9, 13, 1, 0))).toBe(1);
  });

  it('跨月', () => {
    expect(daysBetween(at(2026, 9, 12), at(2026, 12, 20))).toBe(99);
  });

  it('可为负', () => {
    expect(daysBetween(at(2026, 9, 13), at(2026, 9, 12))).toBe(-1);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run test/time.test.js
```

Expected: FAIL — `Failed to resolve import "../src/core/time.js"`

- [ ] **Step 3: 实现 `src/core/time.js`**

```js
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** 本地时区的 YYYY-MM-DD */
export function dayKey(ms) {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 本地时区的当天 00:00 */
export function startOfDay(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** 本地时区次日 00:00（用 Date 运算，避免固定 86400000 的隐患） */
export function nextDayStart(ms) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** YYYY-MM-DD → 本地 00:00 的 epoch ms */
export function parseDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

/** 把 [startMs, endMs) 按本地日切分为 {day, ms} 列表 */
export function splitByDay(startMs, endMs) {
  if (!(endMs > startMs)) return [];
  const out = [];
  let cursor = startMs;
  while (cursor < endMs) {
    const boundary = nextDayStart(cursor);
    const end = Math.min(endMs, boundary);
    out.push({ day: dayKey(cursor), ms: end - cursor });
    cursor = end;
  }
  return out;
}

/** 从 startMs 所在日起，到 endMsExclusive 所在日之前（不含）的所有日键 */
export function dayKeysFrom(startMs, endMsExclusive) {
  const out = [];
  let cursor = startOfDay(startMs);
  const limit = startOfDay(endMsExclusive);
  while (cursor < limit) {
    out.push(dayKey(cursor));
    cursor = nextDayStart(cursor);
  }
  return out;
}

/** 按日边界计的天数差（b - a） */
export function daysBetween(aMs, bMs) {
  return Math.round((startOfDay(bMs) - startOfDay(aMs)) / MS_PER_DAY);
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run test/time.test.js
```

Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/time.js test/time.test.js
git commit -m "feat(core): 本地日期工具与按日切分"
```

---

## Task 4: `src/core/sites.js` — 站点三档分类

**Files:**
- Create: `src/core/sites.js`
- Test: `test/sites.test.js`

**Interfaces:**
- Consumes: 无
- Produces：
  - `DEFAULT_STUDY_RULES: string[]` — `['file:///*.pdf', '*://*/*.pdf']`
  - `createClassifier(siteRules: {study?: string[], distract?: string[]}): (url: string) => 'study' | 'neutral' | 'distract'`
  - 规则语义（两条）：
    - **PDF 规则**：规则字符串（去空白、转小写后）以 `.pdf` 结尾 → 匹配 URL 的 `pathname` 以 `.pdf` 结尾（忽略查询串与 hash）。`file:///*.pdf` 与 `*://*/*.pdf` 都属此类。
    - **主机规则**：其他规则 → 取 `://` 之后、首个 `/` `?` `#` 之前的主机段，去掉前导 `*.`，匹配该主机本身及其子域。`*://*.xiaohongshu.com/*` → 主机 `xiaohongshu.com`。

- [ ] **Step 1: 写失败测试 `test/sites.test.js`**

```js
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
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run test/sites.test.js
```

Expected: FAIL — 无法解析 `../src/core/sites.js`

- [ ] **Step 3: 实现 `src/core/sites.js`**

```js
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
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run test/sites.test.js
```

Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/sites.js test/sites.test.js
git commit -m "feat(core): 站点规则编译与三档分类"
```

---

## Task 5: `src/core/engine.js` — 会话状态机

**Files:**
- Create: `src/core/engine.js`
- Test: `test/engine.test.js`

**Interfaces:**
- Consumes: 无
- Produces：
  - `STATUS: {IDLE, FOCUSING, PAUSED_AWAY, PAUSED_DISTRACTED, WAITING_ACTIVITY}`（冻结对象）
  - `initialSession(now: number): Session`，`Session = {status: string, startedAt: number|null, lastActivityAt: number|null, lastSettledAt: number}`
  - `step(session: Session, input: Input): StepResult`
    - `Input = {now: number, classification: 'study'|'neutral'|'distract', focused: boolean, idle: boolean}`
    - `StepResult = {session: Session, focusMs: number, fromMs: number, toMs: number, penalties: number, distractions: number}`
    - **不变量**：`focusMs > 0` 时必然等于 `toMs - fromMs`（整段计分）；否则为 `0`。调用方据此把 `[fromMs, toMs)` 按日切分后整段入账。

**语义（务必按此实现）：**

| 旧状态 | 条件 | 新状态 | 计分 | 副作用 |
|---|---|---|---|---|
| `FOCUSING` | `idle` | `WAITING_ACTIVITY` | 整段 `[fromMs, now)` | `penalties = 1` |
| 任意 | `!focused` 或 `classification==='neutral'` | `PAUSED_AWAY` | 仅旧态为 `FOCUSING` 时整段 | — |
| 任意 | `classification==='distract'` 且 `focused` | `PAUSED_DISTRACTED` | 同上 | 从非分心态迁入时 `distractions = 1` |
| 任意 | `classification==='study'` 且 `focused` 且 `!idle` | `FOCUSING` | 同上 | 迁入时重置 `startedAt` / `lastActivityAt` |

`idle` 是唯一的超时依据（来自 `chrome.idle`），`lastActivityAt` 只用于展示。

- [ ] **Step 1: 写失败测试 `test/engine.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { STATUS, initialSession, step } from '../src/core/engine.js';

const MIN = 60 * 1000;
const T0 = new Date(2026, 8, 12, 10, 0, 0, 0).getTime();

const base = { now: T0, classification: 'study', focused: true, idle: false };

describe('initialSession', () => {
  it('从 IDLE 开始', () => {
    const s = initialSession(T0);
    expect(s).toEqual({
      status: STATUS.IDLE, startedAt: null, lastActivityAt: null, lastSettledAt: T0,
    });
  });
});

describe('step — 进入专注', () => {
  it('学习内容 + 有焦点 + 未超时 → FOCUSING，首帧不计分', () => {
    const r = step(initialSession(T0), base);
    expect(r.session.status).toBe(STATUS.FOCUSING);
    expect(r.focusMs).toBe(0);
    expect(r.session.startedAt).toBe(T0);
    expect(r.penalties).toBe(0);
    expect(r.distractions).toBe(0);
  });

  it('连续两次 tick，第二次整段计分', () => {
    const first = step(initialSession(T0), base);
    const second = step(first.session, { ...base, now: T0 + MIN });
    expect(second.focusMs).toBe(MIN);
    expect(second.fromMs).toBe(T0);
    expect(second.toMs).toBe(T0 + MIN);
    expect(second.session.status).toBe(STATUS.FOCUSING);
  });
});

describe('step — 暂停与恢复', () => {
  it('切到中性站点 → PAUSED_AWAY，暂停期间不计分', () => {
    const focusing = step(initialSession(T0), base).session;
    const paused = step(focusing, { ...base, now: T0 + MIN, classification: 'neutral' });
    expect(paused.session.status).toBe(STATUS.PAUSED_AWAY);
    expect(paused.focusMs).toBe(MIN);

    const stillPaused = step(paused.session, { ...base, now: T0 + 5 * MIN, classification: 'neutral' });
    expect(stillPaused.focusMs).toBe(0);

    const resumed = step(stillPaused.session, { ...base, now: T0 + 6 * MIN });
    expect(resumed.session.status).toBe(STATUS.FOCUSING);
    expect(resumed.focusMs).toBe(0);
  });

  it('Edge 失去焦点 → PAUSED_AWAY', () => {
    const focusing = step(initialSession(T0), base).session;
    const r = step(focusing, { ...base, now: T0 + MIN, focused: false });
    expect(r.session.status).toBe(STATUS.PAUSED_AWAY);
    expect(r.focusMs).toBe(MIN);
  });

  it('Edge 失焦且是分心站点时，走分心而非离开', () => {
    const focusing = step(initialSession(T0), base).session;
    const r = step(focusing, { ...base, now: T0 + MIN, focused: false, classification: 'distract' });
    expect(r.session.status).toBe(STATUS.PAUSED_AWAY);
    expect(r.distractions).toBe(0);
  });
});

describe('step — 走神', () => {
  it('切到分心站点记一次走神，且暂停期间不再重复记', () => {
    const focusing = step(initialSession(T0), base).session;
    const d1 = step(focusing, { ...base, now: T0 + MIN, classification: 'distract' });
    expect(d1.session.status).toBe(STATUS.PAUSED_DISTRACTED);
    expect(d1.distractions).toBe(1);
    expect(d1.focusMs).toBe(MIN);

    const d2 = step(d1.session, { ...base, now: T0 + 2 * MIN, classification: 'distract' });
    expect(d2.distractions).toBe(0);
    expect(d2.focusMs).toBe(0);
  });

  it('回到学习内容后再次分心，再记一次', () => {
    const focusing = step(initialSession(T0), base).session;
    const d1 = step(focusing, { ...base, now: T0 + MIN, classification: 'distract' });
    const back = step(d1.session, { ...base, now: T0 + 2 * MIN });
    const d2 = step(back.session, { ...base, now: T0 + 3 * MIN, classification: 'distract' });
    expect(d2.distractions).toBe(1);
  });
});

describe('step — 看门狗', () => {
  it('专注中 idle → 扣一次分并进入 WAITING_ACTIVITY', () => {
    const focusing = step(initialSession(T0), base).session;
    const r = step(focusing, { ...base, now: T0 + MIN, idle: true });
    expect(r.session.status).toBe(STATUS.WAITING_ACTIVITY);
    expect(r.penalties).toBe(1);
    expect(r.focusMs).toBe(MIN);
  });

  it('WAITING_ACTIVITY 期间不计分、不重复扣分', () => {
    const focusing = step(initialSession(T0), base).session;
    const timedOut = step(focusing, { ...base, now: T0 + MIN, idle: true }).session;
    const later = step(timedOut, { ...base, now: T0 + 20 * MIN, idle: true });
    expect(later.penalties).toBe(0);
    expect(later.focusMs).toBe(0);
    expect(later.session.status).toBe(STATUS.WAITING_ACTIVITY);
  });

  it('idle 解除后恢复 FOCUSING', () => {
    const focusing = step(initialSession(T0), base).session;
    const timedOut = step(focusing, { ...base, now: T0 + MIN, idle: true }).session;
    const resumed = step(timedOut, { ...base, now: T0 + 21 * MIN, idle: false });
    expect(resumed.session.status).toBe(STATUS.FOCUSING);
    expect(resumed.focusMs).toBe(0);
  });

  it('非专注状态下 idle 不扣分', () => {
    const paused = step(initialSession(T0), { ...base, classification: 'neutral' }).session;
    const r = step(paused, { ...base, now: T0 + MIN, classification: 'neutral', idle: true });
    expect(r.penalties).toBe(0);
    expect(r.focusMs).toBe(0);
  });

  it('idle 且已切到分心站点时，判为分心而非超时', () => {
    const focusing = step(initialSession(T0), base).session;
    const r = step(focusing, { ...base, now: T0 + MIN, classification: 'distract', idle: true });
    expect(r.penalties).toBe(1);
    expect(r.session.status).toBe(STATUS.PAUSED_DISTRACTED);
    expect(r.distractions).toBe(1);
  });
});

describe('step — 不变量', () => {
  it('focusMs 非零时必等于区间长度', () => {
    const focusing = step(initialSession(T0), base).session;
    const r = step(focusing, { ...base, now: T0 + 7 * MIN + 123 });
    expect(r.focusMs).toBe(r.toMs - r.fromMs);
  });

  it('不改动入参对象', () => {
    const s = initialSession(T0);
    const snapshot = JSON.stringify(s);
    step(s, base);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('时间倒流时不产生负计分', () => {
    const focusing = step(initialSession(T0), base).session;
    const r = step(focusing, { ...base, now: T0 - MIN });
    expect(r.focusMs).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run test/engine.test.js
```

Expected: FAIL — 无法解析 `../src/core/engine.js`

- [ ] **Step 3: 实现 `src/core/engine.js`**

```js
export const STATUS = Object.freeze({
  IDLE: 'IDLE',
  FOCUSING: 'FOCUSING',
  PAUSED_AWAY: 'PAUSED_AWAY',
  PAUSED_DISTRACTED: 'PAUSED_DISTRACTED',
  WAITING_ACTIVITY: 'WAITING_ACTIVITY',
});

export function initialSession(now = 0) {
  return {
    status: STATUS.IDLE,
    startedAt: null,
    lastActivityAt: null,
    lastSettledAt: now,
  };
}

/**
 * 推进时间到 input.now 并按当前上下文重算状态。纯函数，不改动入参。
 * @param {object} session
 * @param {{now:number, classification:string, focused:boolean, idle:boolean}} input
 */
export function step(session, input) {
  const { now, classification, focused, idle } = input;
  const s = { ...session };
  const fromMs = s.lastSettledAt;

  const wasFocusing = s.status === STATUS.FOCUSING;
  const focusMs = wasFocusing ? Math.max(0, now - fromMs) : 0;
  s.lastSettledAt = now;

  // 超时只在专注中判一次
  const penalties = wasFocusing && idle ? 1 : 0;

  let target;
  if (!focused || classification === 'neutral') {
    target = STATUS.PAUSED_AWAY;
  } else if (classification === 'distract') {
    target = STATUS.PAUSED_DISTRACTED;
  } else {
    target = STATUS.FOCUSING;
  }

  // 超时后必须等到有新的活动（idle 解除）才可能恢复专注
  if (target === STATUS.FOCUSING && idle) target = STATUS.WAITING_ACTIVITY;

  const distractions =
    target === STATUS.PAUSED_DISTRACTED && s.status !== STATUS.PAUSED_DISTRACTED ? 1 : 0;

  if (target === STATUS.FOCUSING) {
    if (s.status !== STATUS.FOCUSING) s.startedAt = now;
    s.lastActivityAt = now;
  } else {
    s.startedAt = null;
  }
  s.status = target;

  return { session: s, focusMs, fromMs, toMs: now, penalties, distractions };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run test/engine.test.js
```

Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/engine.js test/engine.test.js
git commit -m "feat(core): 专注会话状态机"
```

---

## Task 6: `src/core/account.js` — 计分、上限、精神值、连续天数

**Files:**
- Create: `src/core/account.js`
- Test: `test/account.test.js`

**Interfaces:**
- Consumes: `dayKey`, `splitByDay`, `dayKeysFrom`, `parseDayKey`（Task 3）
- Produces：
  - 常量：`PENALTY_MS = 600000`、`SPIRIT_PER_MS = 120000`、`SPIRIT_START = 50`、`SPIRIT_MAX = 100`、`SPIRIT_PENALTY = 20`、`SPIRIT_DISTRACTION = 5`、`MAKEUP_PER_MONTH = 2`
  - `createAccount(todayKey: string): Account`，`Account = {growthMs, lifetimeFocusMs, todayFocusMs, todayDate, spirit, spiritCarryMs, streak, bestStreak, makeupUsed, makeupMonth}`
  - `emptyDay(): DailyRecord`，`DailyRecord = {focusMs, distractions, spiritEnd, metGoal}`
  - `applyStep(account, daily, result, settings): {account, daily}` — `result` 来自 Task 5 的 `step`；`settings` 需含 `dailyCapMs`、`dailyGoalMs`
  - `settleDay(account, daily, dayKey, settings): void` — 就地结算某一天（更新 `streak` / `bestStreak` / 补签卡）
  - **语义**：`growthMs` 与精神值只吃"未超上限"的部分；`lifetimeFocusMs` 如实累加全部；`growthMs` 下限 0。

- [ ] **Step 1: 写失败测试 `test/account.test.js`**

```js
import { describe, it, expect } from 'vitest';
import {
  createAccount, emptyDay, applyStep, settleDay,
  PENALTY_MS, SPIRIT_START, SPIRIT_PENALTY, SPIRIT_DISTRACTION, MAKEUP_PER_MONTH,
} from '../src/core/account.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const at = (y, m, d, h = 0) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();

const settings = {
  dailyCapMs: 8 * HOUR,
  dailyGoalMs: 5 * HOUR,
};

/** 造一个从 T0 起、持续 ms 毫秒的专注 step 结果 */
function focusResult(fromMs, ms, extra = {}) {
  return { focusMs: ms, fromMs, toMs: fromMs + ms, penalties: 0, distractions: 0, ...extra };
}

describe('createAccount', () => {
  it('初始为零值', () => {
    const a = createAccount('2026-09-12');
    expect(a.growthMs).toBe(0);
    expect(a.lifetimeFocusMs).toBe(0);
    expect(a.todayFocusMs).toBe(0);
    expect(a.todayDate).toBe('2026-09-12');
    expect(a.spirit).toBe(SPIRIT_START);
    expect(a.streak).toBe(0);
    expect(a.bestStreak).toBe(0);
    expect(a.makeupMonth).toBe('2026-09');
  });
});

describe('applyStep — 计分', () => {
  it('专注毫秒进入增长与累计', () => {
    const a = createAccount('2026-09-12');
    const t = at(2026, 9, 12, 10);
    const { account, daily } = applyStep(a, {}, focusResult(t, 10 * MIN), settings);
    expect(account.growthMs).toBe(10 * MIN);
    expect(account.lifetimeFocusMs).toBe(10 * MIN);
    expect(account.todayFocusMs).toBe(10 * MIN);
    expect(daily['2026-09-12'].focusMs).toBe(10 * MIN);
  });

  it('focusMs 为 0 时不产生任何变化', () => {
    const a = createAccount('2026-09-12');
    const t = at(2026, 9, 12, 10);
    const r = applyStep(a, {}, { focusMs: 0, fromMs: t, toMs: t, penalties: 0, distractions: 0 }, settings);
    expect(r.account.growthMs).toBe(0);
    expect(r.daily).toEqual({});
  });

  it('不改动入参', () => {
    const a = createAccount('2026-09-12');
    const snap = JSON.stringify(a);
    applyStep(a, {}, focusResult(at(2026, 9, 12, 10), 5 * MIN), settings);
    expect(JSON.stringify(a)).toBe(snap);
  });
});

describe('applyStep — 跨天切分', () => {
  it('跨天时按日分别入账', () => {
    const a = createAccount('2026-09-12');
    const start = at(2026, 9, 12, 23);
    const { account, daily } = applyStep(a, {}, focusResult(start, 2 * HOUR), settings);
    expect(daily['2026-09-12'].focusMs).toBe(1 * HOUR);
    expect(daily['2026-09-13'].focusMs).toBe(1 * HOUR);
    expect(account.growthMs).toBe(2 * HOUR);
    expect(account.lifetimeFocusMs).toBe(2 * HOUR);
  });

  it('跨天时结算旧日并重置今日与精神值', () => {
    const a = createAccount('2026-09-12');
    a.todayFocusMs = 1 * HOUR;
    a.spirit = 90;
    const start = at(2026, 9, 13, 10);
    const { account, daily } = applyStep(a, {}, focusResult(start, MIN), settings);
    expect(daily['2026-09-12'].spiritEnd).toBe(90);
    expect(daily['2026-09-12'].metGoal).toBe(false);
    expect(account.todayDate).toBe('2026-09-13');
    expect(account.todayFocusMs).toBe(MIN);
    expect(account.spirit).toBe(SPIRIT_START);
  });

  it('隔了多天没打开，每一天都被结算（连续天数归零）', () => {
    const a = createAccount('2026-09-12');
    a.streak = 7;
    a.bestStreak = 7;
    const start = at(2026, 9, 16, 10);
    const { account, daily } = applyStep(a, {}, focusResult(start, 10 * MIN), settings);
    expect(Object.keys(daily).sort()).toEqual(['2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16']);
    expect(account.streak).toBe(0);
    expect(account.bestStreak).toBe(7);
  });
});

describe('applyStep — 每日上限', () => {
  it('超出上限的部分不进增长值但仍进累计', () => {
    const a = createAccount('2026-09-12');
    a.growthMs = 0;
    const t = at(2026, 9, 12, 0);
    // 一次 10 小时，上限 8 小时
    const { account, daily } = applyStep(a, {}, focusResult(t, 10 * HOUR), settings);
    expect(daily['2026-09-12'].focusMs).toBe(10 * HOUR);
    expect(account.growthMs).toBe(8 * HOUR);
    expect(account.lifetimeFocusMs).toBe(10 * HOUR);
    expect(account.todayFocusMs).toBe(10 * HOUR);
  });

  it('跨过上限的那一帧只计到上限', () => {
    const a = createAccount('2026-09-12');
    const t = at(2026, 9, 12, 0);
    const first = applyStep(a, {}, focusResult(t, 7 * HOUR), settings);
    const second = applyStep(first.account, first.daily, focusResult(t + 7 * HOUR, 3 * HOUR), settings);
    expect(second.account.growthMs).toBe(8 * HOUR);
    expect(second.account.lifetimeFocusMs).toBe(10 * HOUR);
  });
});

describe('applyStep — 精神值', () => {
  it('每 2 分钟 +1', () => {
    const a = createAccount('2026-09-12');
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, 10 * MIN), settings);
    expect(account.spirit).toBe(SPIRIT_START + 5);
  });

  it('分帧累加不丢零头', () => {
    const a = createAccount('2026-09-12');
    const t = at(2026, 9, 12, 10);
    let acc = a;
    let daily = {};
    for (let i = 0; i < 4; i += 1) {
      const r = applyStep(acc, daily, focusResult(t + i * MIN, MIN), settings);
      acc = r.account; daily = r.daily;
    }
    expect(acc.spirit).toBe(SPIRIT_START + 2);
  });

  it('上限 100', () => {
    const a = createAccount('2026-09-12');
    a.spirit = 99;
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, 10 * MIN), settings);
    expect(account.spirit).toBe(100);
  });

  it('超时扣 20 且下限为 0', () => {
    const a = createAccount('2026-09-12');
    a.spirit = 10;
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, MIN, { penalties: 1 }), settings);
    expect(account.spirit).toBe(0);
  });

  it('走神扣 5 并记入当日', () => {
    const a = createAccount('2026-09-12');
    const t = at(2026, 9, 12, 10);
    const { account, daily } = applyStep(a, {}, focusResult(t, 0, { distractions: 2 }), settings);
    expect(account.spirit).toBe(SPIRIT_START - 2 * SPIRIT_DISTRACTION);
    expect(daily['2026-09-12'].distractions).toBe(2);
  });
});

describe('applyStep — 惩罚', () => {
  it('超时从增长值扣 10 分钟，下限为 0', () => {
    const a = createAccount('2026-09-12');
    a.growthMs = 3 * MIN;
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, 0, { penalties: 1 }), settings);
    expect(account.growthMs).toBe(0);
    expect(account.todayFocusMs).toBe(0);
  });

  it('惩罚不削减累计专注', () => {
    const a = createAccount('2026-09-12');
    a.lifetimeFocusMs = 50 * HOUR;
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, 0, { penalties: 1 }), settings);
    expect(account.lifetimeFocusMs).toBe(50 * HOUR);
    expect(account.growthMs).toBe(0);
  });

  it('扣分额度为 PENALTY_MS', () => {
    const a = createAccount('2026-09-12');
    a.growthMs = 5 * HOUR;
    const t = at(2026, 9, 12, 10);
    const { account } = applyStep(a, {}, focusResult(t, 0, { penalties: 1 }), settings);
    expect(account.growthMs).toBe(5 * HOUR - PENALTY_MS);
  });
});

describe('settleDay', () => {
  it('达标则连续天数 +1 并刷新最长记录', () => {
    const a = createAccount('2026-09-12');
    a.streak = 3;
    const daily = { '2026-09-12': { ...emptyDay(), focusMs: 6 * HOUR } };
    settleDay(a, daily, '2026-09-12', settings);
    expect(a.streak).toBe(4);
    expect(a.bestStreak).toBe(4);
    expect(daily['2026-09-12'].metGoal).toBe(true);
  });

  it('未达标记为 metGoal=false', () => {
    const a = createAccount('2026-09-12');
    const daily = { '2026-09-12': { ...emptyDay(), focusMs: 1 * HOUR } };
    settleDay(a, daily, '2026-09-12', settings);
    expect(daily['2026-09-12'].metGoal).toBe(false);
  });

  it('未达标时消耗补签卡，连续天数保持', () => {
    const a = createAccount('2026-09-12');
    a.streak = 5;
    const daily = { '2026-09-12': { ...emptyDay(), focusMs: 0 } };
    settleDay(a, daily, '2026-09-12', settings);
    expect(a.makeupUsed).toBe(1);
    expect(a.streak).toBe(5);
  });

  it('补签卡用尽后连续天数归零', () => {
    const a = createAccount('2026-09-12');
    a.streak = 5;
    a.bestStreak = 5;
    a.makeupUsed = MAKEUP_PER_MONTH;
    const daily = { '2026-09-12': { ...emptyDay(), focusMs: 0 } };
    settleDay(a, daily, '2026-09-12', settings);
    expect(a.streak).toBe(0);
    expect(a.bestStreak).toBe(5);
  });

  it('跨月重置补签卡额度', () => {
    const a = createAccount('2026-09-30');
    a.makeupMonth = '2026-09';
    a.makeupUsed = 2;
    const daily = { '2026-10-01': { ...emptyDay(), focusMs: 0 } };
    settleDay(a, daily, '2026-10-01', settings);
    expect(a.makeupMonth).toBe('2026-10');
    expect(a.makeupUsed).toBe(1);
  });

  it('对没有记录的日期也能结算（视为 0 分钟）', () => {
    const a = createAccount('2026-09-12');
    const daily = {};
    settleDay(a, daily, '2026-09-13', settings);
    expect(daily['2026-09-13'].metGoal).toBe(false);
    expect(daily['2026-09-13'].focusMs).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run test/account.test.js
```

Expected: FAIL — 无法解析 `../src/core/account.js`

- [ ] **Step 3: 实现 `src/core/account.js`**

```js
import { dayKey, splitByDay, dayKeysFrom, parseDayKey } from './time.js';

export const PENALTY_MS = 10 * 60 * 1000;
export const SPIRIT_PER_MS = 2 * 60 * 1000;
export const SPIRIT_START = 50;
export const SPIRIT_MAX = 100;
export const SPIRIT_PENALTY = 20;
export const SPIRIT_DISTRACTION = 5;
export const MAKEUP_PER_MONTH = 2;

export function emptyDay() {
  return { focusMs: 0, distractions: 0, spiritEnd: null, metGoal: false };
}

export function createAccount(todayKey) {
  return {
    growthMs: 0,
    lifetimeFocusMs: 0,
    todayFocusMs: 0,
    todayDate: todayKey,
    spirit: SPIRIT_START,
    spiritCarryMs: 0,
    streak: 0,
    bestStreak: 0,
    makeupUsed: 0,
    makeupMonth: todayKey.slice(0, 7),
  };
}

/** 把一段专注毫秒记入某一天，返回其中"未超上限"的部分 */
function creditDay(a, daily, day, ms, settings) {
  const rec = daily[day] ?? emptyDay();
  const before = rec.focusMs;
  const after = before + ms;
  rec.focusMs = after;
  daily[day] = rec;

  const cap = settings.dailyCapMs;
  const creditable = Math.max(0, Math.min(after, cap) - Math.min(before, cap));

  a.growthMs += creditable;
  a.lifetimeFocusMs += ms;

  a.spiritCarryMs += creditable;
  const gain = Math.floor(a.spiritCarryMs / SPIRIT_PER_MS);
  if (gain > 0) {
    a.spiritCarryMs -= gain * SPIRIT_PER_MS;
    a.spirit = Math.min(SPIRIT_MAX, a.spirit + gain);
  }
}

/**
 * 就地结算某一天：写 spiritEnd / metGoal，推进 streak 与补签卡。
 * 会修改传入的 account 与 daily。
 */
export function settleDay(a, daily, day, settings) {
  if (!day) return;
  const rec = daily[day] ?? emptyDay();
  rec.spiritEnd = a.spirit;
  rec.metGoal = rec.focusMs >= settings.dailyGoalMs;
  daily[day] = rec;

  if (rec.metGoal) {
    a.streak += 1;
  } else {
    const month = day.slice(0, 7);
    if (a.makeupMonth !== month) {
      a.makeupMonth = month;
      a.makeupUsed = 0;
    }
    if (a.makeupUsed < MAKEUP_PER_MONTH) {
      a.makeupUsed += 1;
    } else {
      a.streak = 0;
    }
  }
  a.bestStreak = Math.max(a.bestStreak, a.streak);
}

/**
 * 应用一次 engine.step 的结果。纯函数，不改动入参。
 */
export function applyStep(account, daily, result, settings) {
  const a = { ...account };
  const d = { ...daily };

  // 推进到某一天：先结算被甩在后面的日子，再重置今日与精神值。
  // 必须"先计分、后结算"，否则跨过午夜的那一段会记进已结算的日子，
  // 导致 metGoal 算错、新一天的精神值被重置冲掉。
  const advanceTo = (day) => {
    if (day <= a.todayDate) return;
    for (const key of dayKeysFrom(parseDayKey(a.todayDate), parseDayKey(day))) {
      settleDay(a, d, key, settings);
    }
    a.todayDate = day;
    a.spirit = SPIRIT_START;
    a.spiritCarryMs = 0;
  };

  if (result.focusMs > 0) {
    for (const slice of splitByDay(result.fromMs, result.toMs)) {
      advanceTo(slice.day);
      creditDay(a, d, slice.day, slice.ms, settings);
    }
  }

  const today = dayKey(result.toMs);
  advanceTo(today);

  if (result.distractions > 0) {
    const rec = d[today] ?? emptyDay();
    rec.distractions += result.distractions;
    d[today] = rec;
    a.spirit = Math.max(0, a.spirit - result.distractions * SPIRIT_DISTRACTION);
  }

  if (result.penalties > 0) {
    a.growthMs = Math.max(0, a.growthMs - result.penalties * PENALTY_MS);
    a.spirit = Math.max(0, a.spirit - result.penalties * SPIRIT_PENALTY);
  }

  a.todayFocusMs = d[a.todayDate]?.focusMs ?? 0;
  return { account: a, daily: d };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run test/account.test.js
```

Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/account.js test/account.test.js
git commit -m "feat(core): 账户结算、每日上限、精神值与连续天数"
```

---

## Task 7: `src/core/growth.js` — 阶段、山、精神状态

**Files:**
- Create: `src/core/growth.js`
- Test: `test/growth.test.js`

**Interfaces:**
- Consumes: `daysBetween`（Task 3）
- Produces：
  - `STAGES: Array<{name: string, hours: number}>` — 12 级
  - `stageFor(growthMs): {index: number, stage: object, next: object|null, progress: number, hours: number}`（`progress ∈ [0,1]`，满级为 `1`）
  - `mountain({lifetimeFocusMs, settings, now}): {pYou, pTime, deltaHours, daysLeft, totalDays, elapsedDays}`，`settings` 需含 `examDateMs`、`startDateMs`、`dailyGoalMs`
  - `spiritMood(spirit): 'alive' | 'dozing' | 'wilted'`（`≥60` / `25..59` / `<25`）

**山的算法（照 spec 5.2）：** `daysLeft = max(1, daysBetween(now, examDateMs))`；`totalDays = max(1, daysBetween(startDateMs, examDateMs))`；`elapsedDays = max(0, totalDays - daysLeft)`；`pYouRaw = lifetimeFocusMs / (daysLeft * dailyGoalMs)`；`pTime = elapsedDays / totalDays`；`deltaHours = (pYouRaw - pTime) * daysLeft * dailyGoalMs / 3600000`。`pYou` / `pTime` 展示时截断到 `[0,1]`。

- [ ] **Step 1: 写失败测试 `test/growth.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { STAGES, stageFor, mountain, spiritMood } from '../src/core/growth.js';

const HOUR = 3600000;
const at = (y, m, d, h = 0) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();

describe('STAGES', () => {
  it('12 级且阈值严格递增', () => {
    expect(STAGES).toHaveLength(12);
    for (let i = 1; i < STAGES.length; i += 1) {
      expect(STAGES[i].hours).toBeGreaterThan(STAGES[i - 1].hours);
    }
  });

  it('阈值与 spec 一致', () => {
    expect(STAGES.map((s) => s.hours)).toEqual([0, 0.5, 2, 6, 14, 26, 44, 70, 105, 150, 210, 300]);
  });

  it('首级为蛋，末级为凤凰', () => {
    expect(STAGES[0].name).toBe('蛋');
    expect(STAGES[11].name).toBe('凤凰');
  });
});

describe('stageFor', () => {
  it('0 小时是第 1 级', () => {
    expect(stageFor(0).index).toBe(0);
    expect(stageFor(0).stage.name).toBe('蛋');
  });

  it('恰好到阈值即升级', () => {
    expect(stageFor(2 * HOUR).index).toBe(2);
    expect(stageFor(2 * HOUR).stage.name).toBe('雏鸟');
  });

  it('差 1 毫秒不到阈值仍是上一级', () => {
    expect(stageFor(2 * HOUR - 1).index).toBe(1);
  });

  it('progress 在级内线性', () => {
    const r = stageFor(1 * HOUR); // 0.5h → 2h 区间的中点
    expect(r.index).toBe(1);
    expect(r.progress).toBeCloseTo(1 / 3, 5);
  });

  it('满级 progress 为 1 且 next 为 null', () => {
    const r = stageFor(500 * HOUR);
    expect(r.index).toBe(11);
    expect(r.next).toBeNull();
    expect(r.progress).toBe(1);
  });

  it('负数视为 0', () => {
    expect(stageFor(-5).index).toBe(0);
  });
});

describe('mountain', () => {
  const settings = {
    startDateMs: at(2026, 9, 12),
    examDateMs: at(2026, 12, 20),
    dailyGoalMs: 5 * HOUR,
  };

  it('刚起步时两条线都在起点', () => {
    const r = mountain({ lifetimeFocusMs: 0, settings, now: at(2026, 9, 12, 12) });
    expect(r.pYou).toBe(0);
    expect(r.pTime).toBeCloseTo(0, 5);
    expect(r.totalDays).toBe(99);
    expect(r.daysLeft).toBe(99);
  });

  it('时间过半时 pTime 约 0.5', () => {
    const r = mountain({ lifetimeFocusMs: 0, settings, now: at(2026, 10, 30) });
    expect(r.pTime).toBeGreaterThan(0.45);
    expect(r.pTime).toBeLessThan(0.55);
  });

  it('落后时 deltaHours 为负', () => {
    const r = mountain({ lifetimeFocusMs: 10 * HOUR, settings, now: at(2026, 10, 30) });
    expect(r.deltaHours).toBeLessThan(0);
  });

  it('领先时 deltaHours 为正', () => {
    const now = at(2026, 10, 30);
    const r = mountain({ lifetimeFocusMs: 1000 * HOUR, settings, now });
    expect(r.deltaHours).toBeGreaterThan(0);
    expect(r.pYou).toBe(1); // 截断
  });

  it('考试当天不除零', () => {
    const r = mountain({ lifetimeFocusMs: 0, settings, now: at(2026, 12, 20, 9) });
    expect(Number.isFinite(r.pYou)).toBe(true);
    expect(r.daysLeft).toBe(1);
    expect(r.pTime).toBe(1);
  });

  it('考试日已过也不除零', () => {
    const r = mountain({ lifetimeFocusMs: 0, settings, now: at(2027, 1, 10) });
    expect(Number.isFinite(r.pYou)).toBe(true);
    expect(r.daysLeft).toBe(1);
  });
});

describe('spiritMood', () => {
  it('分档正确', () => {
    expect(spiritMood(100)).toBe('alive');
    expect(spiritMood(60)).toBe('alive');
    expect(spiritMood(59)).toBe('dozing');
    expect(spiritMood(25)).toBe('dozing');
    expect(spiritMood(24)).toBe('wilted');
    expect(spiritMood(0)).toBe('wilted');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run test/growth.test.js
```

Expected: FAIL — 无法解析 `../src/core/growth.js`

- [ ] **Step 3: 实现 `src/core/growth.js`**

```js
import { daysBetween } from './time.js';

export const STAGES = [
  { name: '蛋', hours: 0 },
  { name: '裂纹蛋', hours: 0.5 },
  { name: '雏鸟', hours: 2 },
  { name: '幼鸟', hours: 6 },
  { name: '学飞', hours: 14 },
  { name: '飞鸟', hours: 26 },
  { name: '彩羽', hours: 44 },
  { name: '灵鸟', hours: 70 },
  { name: '火羽鸟', hours: 105 },
  { name: '半凰', hours: 150 },
  { name: '火凰', hours: 210 },
  { name: '凤凰', hours: 300 },
];

const clamp01 = (x) => Math.min(1, Math.max(0, x));

export function stageFor(growthMs) {
  const hours = Math.max(0, growthMs) / 3600000;
  let index = 0;
  for (let i = 0; i < STAGES.length; i += 1) {
    if (hours >= STAGES[i].hours) index = i;
  }
  const stage = STAGES[index];
  const next = STAGES[index + 1] ?? null;
  const span = next ? next.hours - stage.hours : 0;
  const progress = next ? clamp01((hours - stage.hours) / span) : 1;
  return { index, stage, next, progress, hours };
}

export function mountain({ lifetimeFocusMs, settings, now }) {
  const totalDays = Math.max(1, daysBetween(settings.startDateMs, settings.examDateMs));
  const rawDaysLeft = daysBetween(now, settings.examDateMs);
  const daysLeft = Math.max(1, rawDaysLeft);
  // 独立按日边界算已过天数并截断：考试当天与考后都应显示 pTime = 1
  const elapsedDays = Math.min(totalDays, Math.max(0, totalDays - rawDaysLeft));

  const targetMs = daysLeft * settings.dailyGoalMs;
  const pYouRaw = targetMs > 0 ? lifetimeFocusMs / targetMs : 1;
  const pTimeRaw = elapsedDays / totalDays;
  const deltaHours = ((pYouRaw - pTimeRaw) * targetMs) / 3600000;

  return {
    pYou: clamp01(pYouRaw),
    pTime: clamp01(pTimeRaw),
    deltaHours,
    daysLeft,
    totalDays,
    elapsedDays,
  };
}

export function spiritMood(spirit) {
  if (spirit >= 60) return 'alive';
  if (spirit >= 25) return 'dozing';
  return 'wilted';
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run test/growth.test.js
```

Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/growth.js test/growth.test.js
git commit -m "feat(core): 凤凰阶段、山的进度与精神状态"
```

---

## Task 8: `src/lib/settings.js` 与 `src/lib/storage.js`

**Files:**
- Create: `src/lib/settings.js`, `src/lib/storage.js`
- Test: `test/settings.test.js`, `test/storage.test.js`

**Interfaces:**
- Consumes: `dayKey`, `parseDayKey`（Task 3）；`DEFAULT_STUDY_RULES`（Task 4）
- Produces：
  - `MINUTE = 60000`、`HOUR = 3600000`
  - `defaultSettings(now): RawSettings`（`RawSettings = {examDate, startDate, dailyGoalMinutes, dailyCapMinutes, watchdogMinutes, companionName}`）
  - `normalizeSettings(raw, now): Settings`（`Settings = {examDateMs, startDateMs, dailyGoalMs, dailyCapMs, watchdogMs, companionName}`）
  - `createStore(area): Store`，`Store` 方法：`get(key, fallback)`、`set(key, value)`、`loadSettings(now)`、`saveSettings(raw)`、`loadState()`、`saveState(state)`、`loadDaily()`、`saveDaily(daily)`、`loadSiteRules()`、`saveSiteRules(rules)`、`loadSnapshot()`、`saveSnapshot(data)`
  - `STORAGE_KEYS = {settings, state, daily, siteRules, snapshot}`

- [ ] **Step 1: 写失败测试 `test/settings.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { MINUTE, HOUR, defaultSettings, normalizeSettings } from '../src/lib/settings.js';
import { dayKey, parseDayKey } from '../src/core/time.js';

const NOW = new Date(2026, 8, 12, 15, 0).getTime();

describe('默认设置', () => {
  it('起算日就是今天', () => {
    expect(defaultSettings(NOW).startDate).toBe('2026-09-12');
  });

  it('默认值与 spec 一致', () => {
    const d = defaultSettings(NOW);
    expect(d.dailyGoalMinutes).toBe(300);
    expect(d.dailyCapMinutes).toBe(480);
    expect(d.watchdogMinutes).toBe(10);
  });

  it('常量正确', () => {
    expect(MINUTE).toBe(60000);
    expect(HOUR).toBe(3600000);
  });
});

describe('normalizeSettings', () => {
  it('把分钟换算为毫秒', () => {
    const s = normalizeSettings({ dailyGoalMinutes: 240, dailyCapMinutes: 600, watchdogMinutes: 5 }, NOW);
    expect(s.dailyGoalMs).toBe(4 * HOUR);
    expect(s.dailyCapMs).toBe(10 * HOUR);
    expect(s.watchdogMs).toBe(5 * MINUTE);
  });

  it('日期键换算为本地 00:00 毫秒', () => {
    const s = normalizeSettings({ examDate: '2026-12-20', startDate: '2026-09-12' }, NOW);
    expect(s.examDateMs).toBe(parseDayKey('2026-12-20'));
    expect(dayKey(s.startDateMs)).toBe('2026-09-12');
  });

  it('缺失字段回落到默认', () => {
    const s = normalizeSettings({}, NOW);
    const d = defaultSettings(NOW);
    expect(dayKey(s.startDateMs)).toBe(d.startDate);
    expect(s.dailyGoalMs).toBe(d.dailyGoalMinutes * MINUTE);
    expect(s.companionName).toBe(d.companionName);
  });

  it('null / undefined 不抛异常', () => {
    expect(() => normalizeSettings(null, NOW)).not.toThrow();
    expect(() => normalizeSettings(undefined, NOW)).not.toThrow();
  });

  it('名字为空时回落默认', () => {
    expect(normalizeSettings({ companionName: '' }, NOW).companionName).toBe('小凤');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run test/settings.test.js
```

Expected: FAIL — 无法解析 `../src/lib/settings.js`

- [ ] **Step 3: 实现 `src/lib/settings.js`**

```js
import { dayKey, parseDayKey } from '../core/time.js';

export const MINUTE = 60000;
export const HOUR = 3600000;

export function defaultSettings(now) {
  return {
    examDate: '2026-12-20',
    startDate: dayKey(now),
    dailyGoalMinutes: 300,
    dailyCapMinutes: 480,
    watchdogMinutes: 10,
    companionName: '小凤',
  };
}

export function normalizeSettings(raw, now) {
  const d = defaultSettings(now);
  const r = raw ?? {};
  const name = typeof r.companionName === 'string' && r.companionName.trim() !== ''
    ? r.companionName.trim()
    : d.companionName;
  return {
    examDateMs: parseDayKey(r.examDate ?? d.examDate),
    startDateMs: parseDayKey(r.startDate ?? d.startDate),
    dailyGoalMs: (r.dailyGoalMinutes ?? d.dailyGoalMinutes) * MINUTE,
    dailyCapMs: (r.dailyCapMinutes ?? d.dailyCapMinutes) * MINUTE,
    watchdogMs: (r.watchdogMinutes ?? d.watchdogMinutes) * MINUTE,
    companionName: name,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run test/settings.test.js
```

Expected: 全部 PASS

- [ ] **Step 5: 写失败测试 `test/storage.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { createStore, STORAGE_KEYS } from '../src/lib/storage.js';
import { DEFAULT_STUDY_RULES } from '../src/core/sites.js';

const NOW = new Date(2026, 8, 12, 15, 0).getTime();

/** 内存版 storage area，接口与 chrome.storage.local 一致 */
function fakeArea(initial = {}) {
  let data = { ...initial };
  return {
    async get(key) {
      if (typeof key === 'string') return key in data ? { [key]: data[key] } : {};
      return { ...data };
    },
    async set(obj) {
      data = { ...data, ...obj };
    },
    snapshot: () => ({ ...data }),
  };
}

describe('createStore', () => {
  it('get 缺省时返回 fallback', async () => {
    const store = createStore(fakeArea());
    expect(await store.get('nope', 42)).toBe(42);
  });

  it('set 后能读回', async () => {
    const store = createStore(fakeArea());
    await store.set('x', { a: 1 });
    expect(await store.get('x', null)).toEqual({ a: 1 });
  });

  it('站点规则缺省为内置 PDF 规则', async () => {
    const store = createStore(fakeArea());
    const rules = await store.loadSiteRules();
    expect(rules.study).toEqual(DEFAULT_STUDY_RULES);
    expect(rules.distract).toEqual([]);
  });

  it('设置读写往返', async () => {
    const store = createStore(fakeArea());
    await store.saveSettings({ dailyGoalMinutes: 240 });
    const s = await store.loadSettings(NOW);
    expect(s.dailyGoalMs).toBe(240 * 60000);
  });

  it('state / daily / snapshot 各自独立存取', async () => {
    const store = createStore(fakeArea());
    await store.saveState({ a: 1 });
    await store.saveDaily({ '2026-09-12': { focusMs: 1 } });
    await store.saveSnapshot({ b: 2 });
    expect(await store.loadState()).toEqual({ a: 1 });
    expect(await store.loadDaily()).toEqual({ '2026-09-12': { focusMs: 1 } });
    expect(await store.loadSnapshot()).toEqual({ b: 2 });
  });

  it('写入使用约定的 storage key', async () => {
    const area = fakeArea();
    const store = createStore(area);
    await store.saveState({ a: 1 });
    await store.saveDaily({});
    await store.saveSiteRules({ study: [], distract: [] });
    expect(Object.keys(area.snapshot()).sort()).toEqual(
      [STORAGE_KEYS.state, STORAGE_KEYS.daily, STORAGE_KEYS.siteRules].sort(),
    );
  });

  it('daily 缺省为空对象', async () => {
    const store = createStore(fakeArea());
    expect(await store.loadDaily()).toEqual({});
  });
});
```

- [ ] **Step 6: 运行测试确认失败**

```bash
npx vitest run test/storage.test.js
```

Expected: FAIL — 无法解析 `../src/lib/storage.js`

- [ ] **Step 7: 实现 `src/lib/storage.js`**

```js
import { normalizeSettings } from './settings.js';
import { DEFAULT_STUDY_RULES } from '../core/sites.js';

export const STORAGE_KEYS = {
  settings: 'settings',
  state: 'state',
  daily: 'daily',
  siteRules: 'siteRules',
  snapshot: 'snapshot',
};

/**
 * @param {{get: Function, set: Function}} area  chrome.storage.local 或测试替身
 */
export function createStore(area) {
  const get = async (key, fallback) => {
    const obj = await area.get(key);
    return obj[key] ?? fallback;
  };
  const set = (key, value) => area.set({ [key]: value });

  return {
    get,
    set,
    async loadSettings(now) {
      return normalizeSettings(await get(STORAGE_KEYS.settings, null), now);
    },
    saveSettings(raw) {
      return set(STORAGE_KEYS.settings, raw);
    },
    loadState() {
      return get(STORAGE_KEYS.state, null);
    },
    saveState(state) {
      return set(STORAGE_KEYS.state, state);
    },
    loadDaily() {
      return get(STORAGE_KEYS.daily, {});
    },
    saveDaily(daily) {
      return set(STORAGE_KEYS.daily, daily);
    },
    async loadSiteRules() {
      const rules = await get(STORAGE_KEYS.siteRules, null);
      return {
        study: rules?.study ?? DEFAULT_STUDY_RULES,
        distract: rules?.distract ?? [],
      };
    },
    saveSiteRules(rules) {
      return set(STORAGE_KEYS.siteRules, rules);
    },
    loadSnapshot() {
      return get(STORAGE_KEYS.snapshot, null);
    },
    saveSnapshot(data) {
      return set(STORAGE_KEYS.snapshot, data);
    },
  };
}
```

- [ ] **Step 8: 运行全部测试确认通过**

```bash
npm test
```

Expected: 全部 PASS

- [ ] **Step 9: Commit**

```bash
git add src/lib/settings.js src/lib/storage.js test/settings.test.js test/storage.test.js
git commit -m "feat(lib): 设置归一化与可注入的 storage 封装"
```

---

## Task 9: `src/lib/snapshot.js` + `src/background/service-worker.js`

**Files:**
- Create: `src/lib/snapshot.js`, rewrite `src/background/service-worker.js`
- Test: `test/snapshot.test.js`

**Interfaces:**
- Consumes: Task 3–8 的全部产物
- Produces：
  - `buildSnapshot({account, daily, settings, session}, now): Snapshot`
    `Snapshot = {account, settings, session, stage, mountain, mood, today, updatedAt}`
  - service worker：把 `chrome.*` 事件换算成 `engine.step` 的 `Input`，调用 `step` → `applyStep` → 写回 storage，并写一份 `snapshot` 供 UI 直接读。
  - 广播：所有 UI 通过 `chrome.storage.onChanged` 订阅 `STORAGE_KEYS.snapshot`。

**service worker 的输入换算（唯一需要"接线"的地方）：**

```
classification ← createClassifier(siteRules)(activeTab.url)
focused        ← windows.getLastFocused() 的 focused === true 且 state !== 'minimized'
idle           ← (await chrome.idle.queryState(watchdogSeconds)) !== 'active'
now            ← Date.now()
```

- [ ] **Step 1: 写失败测试 `test/snapshot.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { buildSnapshot } from '../src/lib/snapshot.js';
import { createAccount, emptyDay } from '../src/core/account.js';
import { initialSession } from '../src/core/engine.js';

const HOUR = 3600000;
const at = (y, m, d, h = 0) => new Date(y, m - 1, d, h, 0, 0, 0).getTime();

const settings = {
  examDateMs: at(2026, 12, 20),
  startDateMs: at(2026, 9, 12),
  dailyGoalMs: 5 * HOUR,
  dailyCapMs: 8 * HOUR,
  watchdogMs: 10 * 60000,
  companionName: '小凤',
};

describe('buildSnapshot', () => {
  it('组合出 UI 需要的全部字段', () => {
    const now = at(2026, 10, 30, 12);
    const a = createAccount('2026-10-30');
    a.growthMs = 3 * HOUR;
    a.lifetimeFocusMs = 120 * HOUR;
    a.spirit = 80;
    const s = buildSnapshot(
      { account: a, daily: { '2026-10-30': { ...emptyDay(), focusMs: 2 * HOUR } }, settings, session: initialSession(now) },
      now,
    );
    expect(s.stage.stage.name).toBe('雏鸟');
    expect(s.mood).toBe('alive');
    expect(s.today.focusMs).toBe(2 * HOUR);
    expect(s.mountain.daysLeft).toBeGreaterThan(0);
    expect(s.settings.companionName).toBe('小凤');
    expect(s.updatedAt).toBe(now);
  });

  it('当天没有记录时用空记录兜底', () => {
    const now = at(2026, 9, 12, 12);
    const s = buildSnapshot(
      { account: createAccount('2026-09-12'), daily: {}, settings, session: initialSession(now) },
      now,
    );
    expect(s.today).toEqual(emptyDay());
  });

  it('不抛异常且不改动入参', () => {
    const now = at(2026, 9, 12, 12);
    const arg = { account: createAccount('2026-09-12'), daily: {}, settings, session: initialSession(now) };
    const snap = JSON.stringify(arg);
    expect(() => buildSnapshot(arg, now)).not.toThrow();
    expect(JSON.stringify(arg)).toBe(snap);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

```bash
npx vitest run test/snapshot.test.js
```

Expected: FAIL — 无法解析 `../src/lib/snapshot.js`

- [ ] **Step 3: 实现 `src/lib/snapshot.js`**

```js
import { stageFor, mountain, spiritMood } from '../core/growth.js';
import { emptyDay } from '../core/account.js';

/**
 * 把持久化的原始状态组合成 UI 直接可渲染的快照。纯函数。
 */
export function buildSnapshot({ account, daily, settings, session }, now) {
  return {
    account,
    settings,
    session,
    stage: stageFor(account.growthMs),
    mountain: mountain({ lifetimeFocusMs: account.lifetimeFocusMs, settings, now }),
    mood: spiritMood(account.spirit),
    today: daily?.[account.todayDate] ?? emptyDay(),
    updatedAt: now,
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
npx vitest run test/snapshot.test.js
```

Expected: 全部 PASS

- [ ] **Step 5: 实现 `src/background/service-worker.js`**

```js
import { createStore, STORAGE_KEYS } from '../lib/storage.js';
import { createClassifier } from '../core/sites.js';
import { initialSession, step } from '../core/engine.js';
import { createAccount, applyStep } from '../core/account.js';
import { buildSnapshot } from '../lib/snapshot.js';
import { dayKey } from '../core/time.js';

const store = createStore(chrome.storage.local);

let classifier = createClassifier({ study: [], distract: [] });
let settingsCache = null;
let rulesLoaded = false;

async function ensureLoaded(now) {
  if (!settingsCache) settingsCache = await store.loadSettings(now);
  if (!rulesLoaded) {
    classifier = createClassifier(await store.loadSiteRules());
    rulesLoaded = true;
  }
  return settingsCache;
}

async function readInput(settings, now) {
  let classification = 'neutral';
  let focused = false;

  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    classification = classifier(tab?.url ?? '');
  } catch { /* 无窗口时按中性处理 */ }

  try {
    const win = await chrome.windows.getLastFocused();
    focused = win?.focused === true && win?.state !== 'minimized';
  } catch { /* 无窗口 */ }

  let idle = false;
  try {
    const seconds = Math.max(15, Math.round(settings.watchdogMs / 1000));
    idle = (await chrome.idle.queryState(seconds)) !== 'active';
  } catch { /* idle 不可用时按未超时处理，避免误扣 */ }

  return { now, classification, focused, idle };
}

async function tick() {
  const now = Date.now();
  const settings = await ensureLoaded(now);

  const raw = (await store.loadState()) ?? {
    session: initialSession(now),
    account: createAccount(dayKey(now)),
  };
  const daily = await store.loadDaily();

  const result = step(raw.session, await readInput(settings, now));
  const next = applyStep(raw.account, daily, result, settings);

  await store.saveState({ session: result.session, account: next.account });
  await store.saveDaily(next.daily);
  await store.saveSnapshot(
    buildSnapshot({ account: next.account, daily: next.daily, settings, session: result.session }, now),
  );
}

function kick() {
  // 事件可能并发触发，串行化避免读到半写状态
  tickQueue = tickQueue.then(tick, tick);
}
let tickQueue = Promise.resolve();

chrome.alarms.create('tick', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'tick') kick();
});

for (const evt of [chrome.tabs.onActivated, chrome.tabs.onUpdated, chrome.windows.onFocusChanged]) {
  evt.addListener(() => kick());
}

chrome.idle.onStateChanged.addListener(() => kick());

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[STORAGE_KEYS.settings]) {
    store.loadSettings(Date.now()).then((s) => {
      settingsCache = s;
      chrome.idle.setDetectionInterval(Math.max(15, Math.round(s.watchdogMs / 1000)));
      kick();
    });
  }
  if (changes[STORAGE_KEYS.siteRules]) {
    store.loadSiteRules().then((rules) => { classifier = createClassifier(rules); });
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  const now = Date.now();
  const state = await store.loadState();
  if (!state) {
    await store.saveState({ session: initialSession(now), account: createAccount(dayKey(now)) });
  }
  const settings = await store.loadSettings(now);
  settingsCache = settings;
  chrome.idle.setDetectionInterval(Math.max(15, Math.round(settings.watchdogMs / 1000)));
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/onboarding/index.html') });
  }
});

// 冷启动时把状态与配置装载进来
(async () => {
  const now = Date.now();
  const settings = await ensureLoaded(now);
  chrome.idle.setDetectionInterval(Math.max(15, Math.round(settings.watchdogMs / 1000)));
  kick();
})();
```

> 说明：`settingsCache` 是"上次读到的设置"，改设置时通过上面的 `storage.onChanged` 刷新，并立刻 `kick()` 一次，让看门狗阈值与目标立刻生效。

- [ ] **Step 6: 人工验证**

1. `edge://extensions` → 重新加载扩展。
2. 打开本地 PDF，等 2 分钟。
3. 点扩展图标旁的"检查视图 service worker"，在 Console 跑：

```js
chrome.storage.local.get().then((d) => console.log(d.snapshot));
```

Expected: `snapshot.account.todayFocusMs` 大于 0，且 `snapshot.session.status === 'FOCUSING'`。

4. 切到小红书（若已加入分心名单）或任一中性站点，2 分钟后再看。
   Expected: `session.status` 变为 `PAUSED_*`，`todayFocusMs` 停止增长。
5. 走开 10 分钟以上再回来。
   Expected: 回来后 `account.growthMs` 比走开前少 600000，`session.status === 'WAITING_ACTIVITY'`，直到你动一下鼠标才回到 `FOCUSING`。

- [ ] **Step 7: Commit**

```bash
git add src/lib/snapshot.js src/background/service-worker.js test/snapshot.test.js
git commit -m "feat: 后台接线、快照生成与事件驱动计时"
```

---

## Task 10: 侧边栏面板

**Files:**
- Create: `src/sidepanel/index.html`, `src/sidepanel/panel.css`, `src/sidepanel/panel.js`
- 修改：`manifest.json` 无需改动（`side_panel.default_path` 已指向该文件）

**Interfaces:**
- Consumes: `STORAGE_KEYS`、`buildSnapshot` 产出的 snapshot 结构（Task 8/9）
- Produces: 无（叶子 UI）

**视觉：** 照抄 `.superpowers/brainstorm/1714-1789212326/content/panel-layout.html` 的 B 卡片（场景融合式）与 `visual-style.html` 的 B 卡片（清冷山系）。把其中写死的数字换成 `panel.js` 写入的实时值。

**必需 DOM id（`panel.js` 只认这些 id，改名必须同步）：**

| id | 内容 |
|---|---|
| `sky` | 山景容器；用 CSS 变量 `--p-you` / `--p-time` 控制两条线 |
| `companion` | 凤凰；`textContent` 放表情字符，`data-mood` 放 `alive`/`dozing`/`wilted` |
| `flag` | 山巅旗 |
| `altitude` | `海拔 {pYou}% · 距考试 {daysLeft} 天` |
| `today-time` | `01:23:45` |
| `today-goal` | `今日 {pct}%` |
| `spirit-bar` | 精神值条，`style.width = spirit%` |
| `companion-line` | `{名字} · 精神值 {spirit}` |
| `stage-line` | `{阶段名} · {stageProgress}%` |
| `streak-line` | `🔥 连续 {streak} 天` |
| `total-line` | `累计 {hours}h` |
| `state-line` | 当前状态中文：专注中 / 暂停 / 打盹中 / 等待活动 |
| `delta-line` | `领先 {x} 小时` 或 `欠 {x} 小时` |

- [ ] **Step 1: 写 `src/sidepanel/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>考研专注养成</title>
    <link rel="stylesheet" href="panel.css" />
  </head>
  <body>
    <main id="sky" class="scene">
      <div class="mountain back"></div>
      <div class="mountain front"></div>
      <div id="flag" class="flag">&#127937;</div>
      <div id="companion" class="companion" data-mood="dozing">&#128035;</div>
      <div class="lines">
        <div class="line time"></div>
        <div class="line you"></div>
      </div>
      <div id="altitude" class="altitude"></div>
    </main>

    <section class="panel">
      <div class="row-primary">
        <span id="today-time" class="big-time">00:00:00</span>
        <span id="today-goal" class="dim">今日 0%</span>
      </div>

      <div class="spirit">
        <div class="track"><div id="spirit-bar" class="fill"></div></div>
        <div id="companion-line" class="dim"></div>
      </div>

      <div class="meta">
        <div id="stage-line" class="dim"></div>
        <div id="state-line" class="dim"></div>
        <div id="delta-line" class="dim"></div>
      </div>

      <div class="foot">
        <span id="streak-line"></span>
        <span id="total-line"></span>
      </div>
    </section>

    <script type="module" src="panel.js"></script>
  </body>
</html>
```

- [ ] **Step 2: 写 `src/sidepanel/panel.css`**（清冷山系）

```css
:root {
  --bg: #f7f9fa;
  --ink: #2e3a44;
  --dim: #7d8b98;
  --line: #dde4ea;
  --track: #e4eaef;
  --rock-back: #c3d0da;
  --rock-front: #a7b8c5;
  --accent: #5b7fa6;
  --sky-top: #e9eef3;
  --sky-bottom: #f7f9fa;
  --p-you: 0;
  --p-time: 0;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
}

.scene {
  position: relative;
  height: 200px;
  overflow: hidden;
  background: linear-gradient(var(--sky-top), var(--sky-bottom));
}

.mountain {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  width: 0;
  height: 0;
}
.mountain.back {
  border-left: 160px solid transparent;
  border-right: 160px solid transparent;
  border-bottom: 180px solid var(--rock-back);
}
.mountain.front {
  border-left: 108px solid transparent;
  border-right: 108px solid transparent;
  border-bottom: 126px solid var(--rock-front);
}

.flag {
  position: absolute;
  left: 50%;
  bottom: 178px;
  transform: translateX(-50%);
  font-size: 14px;
}

/* 凤凰站在"你当前海拔"处：用 --p-you 驱动垂直位置 */
.companion {
  position: absolute;
  left: 32%;
  bottom: calc(20px + var(--p-you) * 130px);
  font-size: 30px;
  transition: bottom 600ms ease;
}
.companion[data-mood="dozing"] { opacity: 0.55; filter: saturate(0.5); }
.companion[data-mood="wilted"] { opacity: 0.35; filter: saturate(0.15); }

/* 两条进度线：时间线（虚）与你的线（实） */
.lines { position: absolute; inset: 0; }
.line {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
}
.line.time {
  border-top: 1px dashed rgba(46, 58, 68, 0.35);
  bottom: calc(20px + var(--p-time) * 130px);
}
.line.you {
  background: var(--accent);
  opacity: 0.75;
  bottom: calc(20px + var(--p-you) * 130px);
}

.altitude {
  position: absolute;
  left: 9px;
  bottom: 9px;
  font-size: 10px;
  color: #63735c;
}

.panel { padding: 12px 13px 14px; }

.row-primary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.big-time { font-size: 26px; font-weight: 600; letter-spacing: 1px; font-variant-numeric: tabular-nums; }
.dim { font-size: 10px; color: var(--dim); }

.spirit { margin-top: 10px; }
.track { height: 4px; background: var(--track); overflow: hidden; }
.fill { height: 100%; width: 0; background: var(--accent); transition: width 400ms ease; }

.meta { margin-top: 12px; display: grid; gap: 4px; }

.foot {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--line);
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--dim);
}
```

- [ ] **Step 3: 写 `src/sidepanel/panel.js`**

```js
import { STORAGE_KEYS } from '../lib/storage.js';

const MOOD_EMOJI = { alive: '\u{1F426}', dozing: '\u{1F425}', wilted: '\u{1F423}' };
const STATE_TEXT = {
  FOCUSING: '专注中',
  PAUSED_AWAY: '暂停（不在学习内容）',
  PAUSED_DISTRACTED: '暂停（在分心站点）',
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

function render(snap) {
  if (!snap) return;
  const { account, settings, session, stage, mountain, mood, today } = snap;

  const goalMs = settings.dailyGoalMs;
  const goalPct = goalMs > 0 ? Math.min(100, Math.round((today.focusMs / goalMs) * 100)) : 0;

  $('today-time').textContent = hhmmss(today.focusMs);
  $('today-goal').textContent = `今日 ${goalPct}%`;

  $('companion').textContent = MOOD_EMOJI[mood] ?? MOOD_EMOJI.dozing;
  $('companion').dataset.mood = mood;

  $('spirit-bar').style.width = `${account.spirit}%`;
  $('companion-line').textContent = `${settings.companionName} · 精神值 ${Math.round(account.spirit)}`;

  const stagePct = Math.round(stage.progress * 100);
  $('stage-line').textContent = stage.next
    ? `${stage.stage.name} · ${stagePct}%（下一阶段 ${stage.next.name}）`
    : `${stage.stage.name} · 已满级`;

  $('state-line').textContent = STATE_TEXT[session.status] ?? session.status;

  const d = mountain.deltaHours;
  const abs = Math.abs(d);
  const hours = abs >= 1 ? abs.toFixed(1) : (abs * 60).toFixed(0);
  const unit = abs >= 1 ? '小时' : '分钟';
  $('delta-line').textContent = d >= 0 ? `领先 ${hours} ${unit}` : `欠 ${hours} ${unit}`;

  $('altitude').textContent = `海拔 ${Math.round(mountain.pYou * 100)}% · 距考试 ${mountain.daysLeft} 天`;
  $('streak-line').textContent = `\u{1F525} 连续 ${account.streak} 天`;
  $('total-line').textContent = `累计 ${(account.lifetimeFocusMs / 3600000).toFixed(0)}h`;

  document.documentElement.style.setProperty('--p-you', String(mountain.pYou));
  document.documentElement.style.setProperty('--p-time', String(mountain.pTime));
}

async function refresh() {
  const obj = await chrome.storage.local.get(STORAGE_KEYS.snapshot);
  render(obj[STORAGE_KEYS.snapshot]);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[STORAGE_KEYS.snapshot]) {
    render(changes[STORAGE_KEYS.snapshot].newValue);
  }
});

refresh();
```

- [ ] **Step 4: 人工验证**

1. 重新加载扩展，打开侧边栏（扩展图标右键 → 在侧边栏中打开，或 `edge://settings` 侧边栏设置里加入）。
2. 打开一个本地 PDF 并保持 3 分钟。
   Expected：`today-time` 递增，`state-line` = 专注中，凤凰位置随 `--p-you` 上移。
3. 切到中性网页 1 分钟。
   Expected：`state-line` 变为暂停，`today-time` 不再涨。
4. 手动改 storage 验证渲染边界：

```js
chrome.storage.local.get('settings').then(({settings}) => {
  settings.dailyGoalMinutes = 1;   // 1 分钟目标，立刻看到"达标"
  chrome.storage.local.set({ settings });
});
```

Expected：面板在 1 秒内重绘（`storage.onChanged` 生效），`today-goal` 变 100%。

- [ ] **Step 5: Commit**

```bash
git add src/sidepanel/
git commit -m "feat(ui): 侧边栏面板（清冷山系，凤凰 + 双线进度）"
```

---

## Task 11: 设置页

**Files:**
- Create: `src/options/index.html`, `src/options/options.css`, `src/options/options.js`
- Modify: 覆盖 Task 2 中的占位 `src/options/index.html`

**Interfaces:**
- Consumes: `createStore`、`STORAGE_KEYS`、`DEFAULT_STUDY_RULES`
- Produces: 无（叶子 UI）

- [ ] **Step 1: 写 `src/options/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>考研专注养成 · 设置</title>
    <link rel="stylesheet" href="options.css" />
  </head>
  <body>
    <h1>设置</h1>

    <section class="card">
      <h2>目标</h2>
      <label>考试日期 <input type="date" id="examDate" /></label>
      <label>每日目标（分钟）<input type="number" id="dailyGoalMinutes" min="1" max="1440" /></label>
      <label>每日计入上限（分钟）<input type="number" id="dailyCapMinutes" min="1" max="1440" /></label>
      <label>看门狗阈值（分钟）<input type="number" id="watchdogMinutes" min="1" max="120" /></label>
      <label>伙伴名字 <input type="text" id="companionName" maxlength="12" /></label>
      <p class="hint" id="startDateHint"></p>
    </section>

    <section class="card">
      <h2>站点规则</h2>
      <p class="hint">学习名单里的站点会计分；分心名单里的站点会停表并记一次走神；其余一律视为中性（只停表）。规则可以是 <code>example.com</code>（含子域）或 <code>*.pdf</code>。</p>

      <h3>学习</h3>
      <ul id="studyList" class="rules"></ul>
      <div class="add">
        <input type="text" id="studyInput" placeholder="example.com 或 *.pdf" />
        <button id="studyAdd">添加</button>
      </div>

      <h3>分心</h3>
      <ul id="distractList" class="rules"></ul>
      <div class="add">
        <input type="text" id="distractInput" placeholder="xiaohongshu.com" />
        <button id="distractAdd">添加</button>
      </div>
    </section>

    <section class="card">
      <h2>诊断</h2>
      <p class="hint">
        <a href="../diagnostics/index.html" target="_blank">打开技术验证页</a>（用于确认能否读取本地 PDF 地址）
      </p>
    </section>

    <div class="actions">
      <button id="save" class="primary">保存</button>
      <span id="status" class="hint"></span>
    </div>

    <script type="module" src="options.js"></script>
  </body>
</html>
```

- [ ] **Step 2: 写 `src/options/options.css`**

```css
:root {
  --bg: #f7f9fa; --ink: #2e3a44; --dim: #7d8b98;
  --line: #dde4ea; --accent: #5b7fa6;
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 24px; background: var(--bg); color: var(--ink);
  font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  max-width: 680px;
}
h1 { font-size: 20px; font-weight: 600; margin: 0 0 16px; }
h2 { font-size: 14px; font-weight: 600; margin: 0 0 12px; }
h3 { font-size: 12px; font-weight: 600; margin: 16px 0 8px; color: var(--dim); }
.card {
  background: #fff; border: 1px solid var(--line); border-radius: 6px;
  padding: 16px; margin-bottom: 16px;
}
label { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 10px; font-size: 13px; }
input {
  font: inherit; padding: 6px 8px; border: 1px solid var(--line);
  border-radius: 4px; background: #fff; color: inherit; min-width: 180px;
}
button {
  font: inherit; padding: 6px 14px; border: 1px solid var(--line);
  border-radius: 4px; background: #fff; color: inherit; cursor: pointer;
}
button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.hint { font-size: 11px; color: var(--dim); line-height: 1.6; }
.rules { list-style: none; margin: 0; padding: 0; }
.rules li {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 13px;
}
.rules li button { border: none; color: var(--dim); padding: 2px 6px; }
.add { display: flex; gap: 8px; margin-top: 8px; }
.add input { flex: 1; }
.actions { display: flex; align-items: center; gap: 12px; }
```

- [ ] **Step 3: 写 `src/options/options.js`**

```js
import { createStore, STORAGE_KEYS } from '../lib/storage.js';
import { defaultSettings, normalizeSettings } from '../lib/settings.js';
import { dayKey } from '../core/time.js';
import { DEFAULT_STUDY_RULES } from '../core/sites.js';

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
```

- [ ] **Step 4: 人工验证**

1. 打开扩展设置页（扩展详情 → 扩展选项）。
2. 改"每日目标"为 60、加一条学习规则 `bilibili.com`、加一条分心规则 `xiaohongshu.com`，保存。
3. 在 service worker 控制台验证：

```js
chrome.storage.local.get(['settings','siteRules']).then(console.log);
```

Expected：`settings.dailyGoalMinutes === 60`，`siteRules.study` 含 `bilibili.com`，`siteRules.distract` 含 `xiaohongshu.com`。
4. 刷新设置页，表单回填正确；删除一条规则后再保存，storage 同步减少。
5. 把考试日期改成比起算日更早，点保存。
   Expected：显示"考试日期必须晚于起算日"，且不写入。

- [ ] **Step 5: Commit**

```bash
git add src/options/
git commit -m "feat(ui): 设置页（目标、站点三档、诊断入口）"
```

---

## Task 12: 统计页

**Files:**
- Create: `src/stats/index.html`, `src/stats/stats.css`, `src/stats/stats.js`
- Modify: `manifest.json` 无需改动（设置页有入口链接；也可用 `chrome-extension://<id>/src/stats/index.html` 直达）

**Interfaces:**
- Consumes: `STORAGE_KEYS.daily`、`STORAGE_KEYS.snapshot`
- Produces: 无（叶子 UI）

**展示内容（spec 6.3）：** 最近 30 天每日专注时长柱状图、走神热点（按天数分布）、累计专注、达标天数、最长连续。

- [ ] **Step 1: 写 `src/stats/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>考研专注养成 · 统计</title>
    <link rel="stylesheet" href="stats.css" />
  </head>
  <body>
    <h1>统计</h1>

    <section class="card">
      <h2>最近 30 天</h2>
      <div id="bars" class="bars"></div>
      <p class="hint" id="barsHint"></p>
    </section>

    <section class="card">
      <h2>走神记录</h2>
      <ul id="distractions" class="list"></ul>
    </section>

    <section class="card">
      <h2>总计</h2>
      <ul id="totals" class="list"></ul>
    </section>

    <script type="module" src="stats.js"></script>
  </body>
</html>
```

- [ ] **Step 2: 写 `src/stats/stats.css`**

```css
:root {
  --bg: #f7f9fa; --ink: #2e3a44; --dim: #7d8b98;
  --line: #dde4ea; --accent: #5b7fa6; --track: #e4eaef;
}
* { box-sizing: border-box; }
body {
  margin: 0; padding: 24px; background: var(--bg); color: var(--ink);
  font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
  max-width: 760px;
}
h1 { font-size: 20px; font-weight: 600; margin: 0 0 16px; }
h2 { font-size: 14px; font-weight: 600; margin: 0 0 12px; }
.card { background: #fff; border: 1px solid var(--line); border-radius: 6px; padding: 16px; margin-bottom: 16px; }
.bars { display: flex; align-items: flex-end; gap: 3px; height: 140px; }
.bar { flex: 1; background: var(--accent); opacity: 0.85; border-radius: 2px 2px 0 0; min-height: 2px; }
.bar.empty { background: var(--track); }
.bar.miss { background: #d9a3a3; }
.list { list-style: none; margin: 0; padding: 0; }
.list li {
  display: flex; justify-content: space-between;
  padding: 6px 0; border-bottom: 1px solid var(--line); font-size: 13px;
}
.hint { font-size: 11px; color: var(--dim); margin: 10px 0 0; }
```

- [ ] **Step 3: 写 `src/stats/stats.js`**

```js
import { STORAGE_KEYS } from '../lib/storage.js';
import { dayKey } from '../core/time.js';

const $ = (id) => document.getElementById(id);
const DAYS = 30;

function lastNDays(now, n) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const ms = new Date(now).setHours(0, 0, 0, 0) - i * 86400000;
    out.push(dayKey(ms));
  }
  return out;
}

function render(daily, snapshot) {
  const now = Date.now();
  const days = lastNDays(now, DAYS);
  const goalMs = snapshot?.settings?.dailyGoalMs ?? 0;

  const bars = $('bars');
  bars.textContent = '';
  let maxMs = 1;
  for (const d of days) maxMs = Math.max(maxMs, daily[d]?.focusMs ?? 0);

  let metDays = 0;
  for (const d of days) {
    const rec = daily[d];
    const ms = rec?.focusMs ?? 0;
    const el = document.createElement('div');
    el.className = 'bar';
    if (ms === 0) el.classList.add('empty');
    else if (goalMs > 0 && ms < goalMs) el.classList.add('miss');
    el.style.height = `${Math.max(2, (ms / maxMs) * 100)}%`;
    el.title = `${d}：${(ms / 3600000).toFixed(1)} 小时`;
    bars.append(el);
    if (goalMs > 0 && ms >= goalMs) metDays += 1;
  }

  const totalMs = days.reduce((s, d) => s + (daily[d]?.focusMs ?? 0), 0);
  $('barsHint').textContent =
    `30 天合计 ${(totalMs / 3600000).toFixed(1)} 小时 · 达标 ${metDays} 天 · 日均 ${(totalMs / 3600000 / DAYS).toFixed(1)} 小时`;

  const dist = $('distractions');
  dist.textContent = '';
  const rows = days
    .map((d) => ({ d, n: daily[d]?.distractions ?? 0 }))
    .filter((r) => r.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 10);
  if (rows.length === 0) {
    const li = document.createElement('li');
    li.textContent = '最近 30 天没有走神记录';
    dist.append(li);
  }
  for (const r of rows) {
    const li = document.createElement('li');
    const a = document.createElement('span');
    a.textContent = r.d;
    const b = document.createElement('span');
    b.textContent = `${r.n} 次`;
    li.append(a, b);
    dist.append(li);
  }

  const totals = $('totals');
  totals.textContent = '';
  const items = [
    ['累计专注', `${((snapshot?.account?.lifetimeFocusMs ?? 0) / 3600000).toFixed(0)} 小时`],
    ['当前阶段', snapshot?.stage?.stage?.name ?? '—'],
    ['当前连续', `${snapshot?.account?.streak ?? 0} 天`],
    ['最长连续', `${snapshot?.account?.bestStreak ?? 0} 天`],
    ['距考试', `${snapshot?.mountain?.daysLeft ?? '—'} 天`],
    [snapshot?.mountain?.deltaHours >= 0 ? '进度领先' : '进度欠账',
      `${Math.abs(snapshot?.mountain?.deltaHours ?? 0).toFixed(1)} 小时`],
  ];
  for (const [k, v] of items) {
    const li = document.createElement('li');
    const a = document.createElement('span');
    a.textContent = k;
    const b = document.createElement('span');
    b.textContent = v;
    li.append(a, b);
    totals.append(li);
  }
}

async function refresh() {
  const obj = await chrome.storage.local.get([STORAGE_KEYS.daily, STORAGE_KEYS.snapshot]);
  render(obj[STORAGE_KEYS.daily] ?? {}, obj[STORAGE_KEYS.snapshot]);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local') refresh();
});

refresh();
```

- [ ] **Step 4: 人工验证**

1. 用下面的脚本灌入几天的假数据：

```js
chrome.storage.local.get('daily').then(({ daily = {} }) => {
  const now = new Date();
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(now.getTime() - i * 86400000);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    daily[key] = { focusMs: i % 3 === 0 ? 0 : (3 + (i % 5)) * 3600000, distractions: i % 4, spiritEnd: 70, metGoal: i % 3 !== 0 };
  }
  chrome.storage.local.set({ daily });
});
```

2. 打开 `chrome-extension://<扩展ID>/src/stats/index.html`。
   Expected：30 根柱子，0 值的是灰色、未达标的是浅红、达标的是蓝；"走神记录"按次数降序；"总计"六项都有值。

- [ ] **Step 5: Commit**

```bash
git add src/stats/
git commit -m "feat(ui): 统计页（30 天趋势、走神记录、总计）"
```

---

## Task 13: 首次引导

**Files:**
- Create: `src/onboarding/index.html`, `src/onboarding/onboarding.js`
- Modify：`manifest.json` 无需改动（Task 9 已在 `onInstalled` 里 `chrome.tabs.create` 指向该页）

**Interfaces:**
- Consumes: `createStore`、`defaultSettings`、`normalizeSettings`
- Produces: 无（叶子 UI）

**引导四步：** 考试日期 → 每日目标 → 给凤凰起名 → 开启文件访问权限（附诊断按钮与侧边栏打开说明）。

- [ ] **Step 1: 写 `src/onboarding/index.html`**

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <title>欢迎 · 考研专注养成</title>
    <style>
      :root { --bg:#f7f9fa; --ink:#2e3a44; --dim:#7d8b98; --line:#dde4ea; --accent:#5b7fa6; }
      * { box-sizing: border-box; }
      body {
        margin:0; padding:48px 24px; background:var(--bg); color:var(--ink);
        font-family: system-ui, -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
      }
      .wrap { max-width: 560px; margin: 0 auto; }
      h1 { font-size: 22px; font-weight: 600; margin: 0 0 8px; }
      p.lead { color: var(--dim); font-size: 13px; line-height: 1.8; margin: 0 0 28px; }
      .step { background:#fff; border:1px solid var(--line); border-radius:6px; padding:16px; margin-bottom:12px; }
      .step h2 { font-size: 13px; font-weight: 600; margin: 0 0 10px; }
      label { display:block; font-size: 12px; color: var(--dim); margin-bottom: 6px; }
      input {
        font: inherit; padding: 8px 10px; border:1px solid var(--line);
        border-radius:4px; width: 100%; color: inherit; background:#fff;
      }
      button {
        font: inherit; padding: 9px 18px; border-radius:4px; cursor:pointer;
        background: var(--accent); border:1px solid var(--accent); color:#fff;
      }
      button.ghost { background:#fff; color: var(--ink); border-color: var(--line); }
      .row { display:flex; gap:10px; margin-top: 12px; align-items:center; }
      .hint { font-size: 11px; color: var(--dim); line-height:1.7; }
      .done { color: #4b7a52; font-weight:600; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>欢迎</h1>
      <p class="lead">
        你专注读 PDF，凤凰就长大；你走神，它就打盹。山巅是考试那天，海拔是你攒下的专注。
        三步设好，就能开始。
      </p>

      <div class="step">
        <h2>1 · 考试日期</h2>
        <label for="examDate">你的考试日</label>
        <input type="date" id="examDate" />
      </div>

      <div class="step">
        <h2>2 · 每日目标</h2>
        <label for="dailyGoalMinutes">每天打算专注多少分钟</label>
        <input type="number" id="dailyGoalMinutes" min="1" max="1440" value="300" />
      </div>

      <div class="step">
        <h2>3 · 给凤凰起个名字</h2>
        <label for="companionName">它叫什么</label>
        <input type="text" id="companionName" maxlength="12" value="小凤" />
      </div>

      <div class="step">
        <h2>4 · 开启文件访问权限</h2>
        <p class="hint">
          扩展需要读取本地 PDF 的地址才能计时。请在 <code>edge://extensions</code> 里打开本扩展的详情页，
          开启"<strong>允许访问文件网址</strong>"，然后回来点下面的按钮确认。
        </p>
        <div class="row">
          <button class="ghost" id="openExtensions">去扩展页</button>
          <button class="ghost" id="checkAccess">检查是否已开启</button>
          <span id="accessStatus" class="hint"></span>
        </div>
      </div>

      <div class="row">
        <button id="finish">完成，开始</button>
        <span id="saveStatus" class="hint"></span>
      </div>
    </div>
    <script type="module" src="onboarding.js"></script>
  </body>
</html>
```

- [ ] **Step 2: 写 `src/onboarding/onboarding.js`**

```js
import { createStore } from '../lib/storage.js';
import { defaultSettings, normalizeSettings } from '../lib/settings.js';

const store = createStore(chrome.storage.local);
const $ = (id) => document.getElementById(id);

async function checkFileAccess() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    const url = tab?.url ?? '';
    const ok = url.startsWith('file://');
    $('accessStatus').textContent = ok
      ? '已开启（正在读取一个本地文件）'
      : '还不能读取本地文件地址，请确认已开启"允许访问文件网址"并在 Edge 里打开一个本地 PDF';
    $('accessStatus').className = ok ? 'hint done' : 'hint';
  } catch {
    $('accessStatus').textContent = '检测失败，请手动确认权限';
  }
}

$('openExtensions').addEventListener('click', () => {
  chrome.tabs.create({ url: 'edge://extensions' });
});

$('checkAccess').addEventListener('click', checkFileAccess);

$('finish').addEventListener('click', async () => {
  const examDate = $('examDate').value;
  const dailyGoalMinutes = Number($('dailyGoalMinutes').value);
  const companionName = $('companionName').value.trim() || '小凤';

  if (!examDate) {
    $('saveStatus').textContent = '请先选考试日期';
    return;
  }

  const now = Date.now();
  const existing = await store.get('settings', null);
  const raw = {
    ...defaultSettings(now),
    ...(existing ?? {}),
    examDate,
    dailyGoalMinutes,
    companionName,
  };
  const normalized = normalizeSettings(raw, now);
  if (normalized.examDateMs <= normalized.startDateMs) {
    $('saveStatus').textContent = '考试日期必须晚于今天';
    return;
  }

  await store.saveSettings(raw);
  $('saveStatus').textContent = '已保存';
  $('saveStatus').className = 'hint done';
  $('finish').disabled = true;
  setTimeout(() => window.close(), 800);
});

(async () => {
  const now = Date.now();
  const existing = await store.get('settings', null);
  const raw = { ...defaultSettings(now), ...(existing ?? {}) };
  $('examDate').value = raw.examDate;
  $('dailyGoalMinutes').value = raw.dailyGoalMinutes;
  $('companionName').value = raw.companionName;
  checkFileAccess();
})();
```

- [ ] **Step 3: 人工验证**

1. 在 `edge://extensions` 里移除并重新添加扩展（或点"更新"，`onInstalled` 的 `reason` 需为 `install` 才会自动开页；也可直接访问 `chrome-extension://<扩展ID>/src/onboarding/index.html`）。
2. 填日期与目标，点完成。
   Expected：写入 `settings`，页面提示"已保存"并自动关闭。
3. 打开侧边栏。
   Expected：标题栏显示"距考试 N 天"，`companion-line` 里是刚起的名字。
4. 点"检查是否已开启"并在 Edge 里打开一个本地 PDF 再点一次。
   Expected：状态文案在两态之间正确切换。
5. 考试日期填今天或更早，点完成。
   Expected：提示"考试日期必须晚于今天"且不写入。

- [ ] **Step 4: 全量测试回归**

```bash
npm test
```

Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add src/onboarding/
git commit -m "feat(ui): 首次引导"
```

---

## 完成标准

全部 13 个任务完成后，以下每条都应成立：

- [ ] `npm test` 全绿
- [ ] 在 Edge 里加载扩展，打开本地 PDF 能开始计时（`file://` 假设成立）或已按退路方案改设计
- [ ] 侧边栏在专注时的计时与凤凰状态正确变化
- [ ] 走开 10 分钟以上会扣 10 分钟成长值，动一下鼠标后恢复
- [ ] 切到分心站点会停表并记一次走神
- [ ] 改设置后侧边栏 1 秒内重绘
- [ ] 统计页能看到 30 天趋势与走神记录
- [ ] `chrome.storage.local` 里没有任何网络相关字段；扩展未申请联网权限
