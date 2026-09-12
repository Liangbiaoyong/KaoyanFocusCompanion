# 已退役：浏览器扩展形态

这一版是项目最初的形式（Edge MV3 扩展 → 画中画悬浮窗），已被 `desktop/` 下的 **Windows 桌宠**取代。

保留原因：其中的测量思路与界面稿仍有参考价值。

## 文件

- `manifest.json`、`background/`、`floating/`、`options/`、`stats/`、`onboarding/`、`diagnostics/`
- 共享逻辑**不在**这里，而在仓库根的 `src/core/` 与 `src/lib/`（未改动，桌宠正在复用）

## 现状

各文件对共享逻辑的引用已改为 `../../src/...`，因此**目录结构自身是自洽的，但已不能直接作为扩展加载**——`manifest.json` 与页面入口的相对路径需要改回扩展根才能复活。

## 为什么退役

1. **内容脚本无法注入 Edge 自带的 PDF 查看器。** 这是硬约束，也意味着"在网页 DOM 里浮一个可拖动的元素"在使用者最需要它的本地 PDF 上根本不可见。
2. **画中画窗口的标题栏与悬停工具栏由浏览器绘制**，CSS 无法触及，做不出桌宠所需的"透明无边框、只有一只凤凰"的观感。
3. 桌宠改由操作系统层面读取前台窗口，反而拿掉了 MV3 的 service worker 回收、`file://` 权限、`allow access to file URLs` 这些麻烦。

## 若要让扩展复活

1. 把 `manifest.json` 与各入口的相对路径改回扩展根
2. 恢复 `side_panel` / `permissions` 等声明（当前 `manifest.json` 已移除侧边栏）
3. 共享逻辑无需改动——`src/core/` 与 `src/lib/` 至今仍被桌宠使用，接口保持稳定
