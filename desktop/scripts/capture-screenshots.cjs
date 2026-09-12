// 用 Electron 自己把界面渲染出来截图，得到的是真实界面而不是手绘示意图。
// 运行：npm run screenshots     输出：docs/screenshots/*.png
//
// 注意：Windows 上连续创建多个透明窗口会把进程弄崩（第一张能出、第二张静默死掉）。
// 所以按"一个窗口出一组图"来组织：加载一次页面，注入不同状态，各截一张。
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow } = require('electron');

const OUT_DIR = path.join(__dirname, '..', '..', 'docs', 'screenshots');
const PRELOAD = path.join(__dirname, 'capture-preload.cjs');

const DESKTOP_BG = "document.body.style.background='linear-gradient(135deg,#22303c 0%,#3b5566 55%,#5d7f92 100%)';";

const GROUPS = [
  {
    page: '../pet/index.html',
    width: 220,
    height: 252,
    transparent: true,
    shots: [
      { name: 'pet', ready: 900 },
      {
        name: 'pet-flipped',
        ready: 600,
        inject: `${DESKTOP_BG}
          document.getElementById('stage').classList.add('flip');`,
      },
      {
        name: 'pet-collapsed',
        height: 140,
        ready: 600,
        inject: `${DESKTOP_BG}
          document.getElementById('stage').classList.remove('flip');
          document.getElementById('bubble').hidden = true;
          document.getElementById('mini').hidden = false;
          document.getElementById('collapse').textContent = '▸';`,
      },
    ],
  },
  {
    page: '../settings/index.html',
    width: 580,
    height: 700,
    transparent: false,
    autoHeight: true,
    shots: [{ name: 'settings', ready: 900 }],
  },
  {
    page: '../stats/index.html',
    width: 560,
    height: 700,
    transparent: false,
    autoHeight: true,
    shots: [{ name: 'stats', ready: 1100 }],
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function loadWithRetry(win, filePath, attempts = 3) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await win.loadFile(filePath);
      return;
    } catch (error) {
      if (i === attempts) throw error;
      await sleep(700);
    }
  }
}

async function shoot(win, shot, group) {
  if (group.transparent && shot.inject === undefined) {
    await win.webContents.executeJavaScript(DESKTOP_BG);
  } else if (shot.inject) {
    await win.webContents.executeJavaScript(shot.inject);
  }

  if (shot.height) win.setContentSize(group.width, shot.height);

  if (group.autoHeight) {
    const height = await win.webContents.executeJavaScript('document.documentElement.scrollHeight');
    win.setContentSize(group.width, Math.ceil(height));
  }

  await sleep(shot.ready ?? 500);

  const image = await win.webContents.capturePage();
  const png = image.toPNG();
  const size = image.getSize();
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${shot.name}.png`), png);
  console.log(`${shot.name.padEnd(16)} ${size.width}x${size.height}  ${(png.length / 1024).toFixed(0)} KB`);
}

// Windows 上频繁创建/销毁透明窗口会把进程弄崩（前一组能出、下一组静默死掉）。
// 因此脚本一次只处理一组，由 npm script 分别拉起，彻底避开窗口反复创建。
const only = process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length);
const selected = only ? GROUPS.filter((g) => g.page.includes(only)) : GROUPS;

app.whenReady()
  .then(async () => {
    let failed = 0;
    for (const group of selected) {
      let win = null;
      try {
        win = new BrowserWindow({
          width: group.width,
          height: group.height,
          show: false,
          frame: !group.transparent,
          transparent: group.transparent,
          paintWhenInitiallyHidden: true,
          webPreferences: {
            preload: PRELOAD,
            contextIsolation: true,
            nodeIntegration: false,
          },
        });
        await loadWithRetry(win, path.join(__dirname, group.page));
        await sleep(800); // 等渲染脚本拿到假数据并画完
        for (const shot of group.shots) await shoot(win, shot, group);
      } catch (error) {
        failed += 1;
        console.error(`${group.page} 失败:`, error.message);
      }
      // 不主动销毁：让进程退出时统一回收，避免 destroy 触发崩溃
    }
    console.log(`已写入 ${OUT_DIR}${failed ? `（${failed} 组失败）` : ''}`);
    app.exit(failed ? 1 : 0);
  })
  .catch((error) => {
    console.error('截图流程失败:', error);
    app.exit(1);
  });
