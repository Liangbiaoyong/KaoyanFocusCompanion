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
      ['alarms', 'idle', 'storage', 'tabs'].sort(),
    );
  });

  it('没有申请任何联网相关权限', () => {
    const forbidden = ['host_permissions', 'webRequest', 'proxy', 'declarativeNetRequest'];
    for (const key of forbidden) expect(manifest[key]).toBeUndefined();
  });

  it('不再声明侧边栏（已改为画中画悬浮窗）', () => {
    expect(manifest.side_panel).toBeUndefined();
    expect(manifest.permissions).not.toContain('sidePanel');
  });

  it('action 不设 default_popup，保证 action.onClicked 能触发', () => {
    expect(manifest.action.default_popup).toBeUndefined();
    expect(manifest.action.popup).toBeUndefined();
  });

  it('背景脚本是 ESM', () => {
    expect(manifest.background.type).toBe('module');
    expect(manifest.background.service_worker).toBe('src/background/service-worker.js');
  });

  it('设置页入口存在', () => {
    expect(manifest.options_page).toBe('src/options/index.html');
  });
});
