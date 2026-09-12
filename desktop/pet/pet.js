// 凤凰的形象随成长阶段变化，精神状态只调制明暗与饱和度。
// 这样"养成"才看得见——你不是在看一个固定的图标变色。
const STAGE_GLYPHS = [
  '\u{1F95A}', // 0  蛋
  '\u{1F95A}', // 1  裂纹蛋
  '\u{1F423}', // 2  雏鸟
  '\u{1F424}', // 3  幼鸟
  '\u{1F425}', // 4  学飞
  '\u{1F426}', // 5  飞鸟
  '\u{1F426}', // 6  彩羽
  '\u{1F99C}', // 7  灵鸟
  '\u{1F9A9}', // 8  火羽鸟
  '\u{1F985}', // 9  半凰
  '\u{1F985}', // 10 火凰
  '\u{1F985}', // 11 凤凰
];

const STATE_TEXT = {
  FOCUSING: '专注中',
  PAUSED_AWAY: '暂停 · 不在学习内容',
  PAUSED_DISTRACTED: '暂停 · 在学习外网站',
  WAITING_ACTIVITY: '打盹中，动一下鼠标就回来',
  IDLE: '未开始',
};

// 收起时用的极短说法 + 圆点配色
const MINI_VIEW = {
  FOCUSING: { dot: 'focus', text: '学习中' },
  PAUSED_AWAY: { dot: 'off', text: '暂停' },
  PAUSED_DISTRACTED: { dot: 'doze', text: '走神' },
  WAITING_ACTIVITY: { dot: 'doze', text: '打盹' },
  IDLE: { dot: 'off', text: '未开始' },
};

const HEIGHT = { expanded: 252, collapsed: 140 };

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
  return `${hours >= 0 ? '领先' : '欠'} ${value}${abs >= 1 ? 'h' : 'm'}`;
}

function setMini(dot, text, timeText) {
  $('miniDot').className = `dot ${dot}`;
  $('miniState').textContent = text;
  if (timeText !== undefined) $('miniTime').textContent = timeText;
}

function applyLayout() {
  const collapsed = $('bubble').hidden;
  $('mini').hidden = !collapsed;
  $('collapse').textContent = collapsed ? '▸' : '▾';
  window.pet.setHeight(collapsed ? HEIGHT.collapsed : HEIGHT.expanded);
}

function render(snapshot) {
  if (!snapshot) {
    $('state').textContent = '还没收到数据';
    setMini('off', '等待中', '--:--:--');
    return;
  }

  const phoenix = $('phoenix');

  if (snapshot.paused) {
    phoenix.dataset.paused = 'true';
    $('state').textContent = '已暂停（点 ⋯ 继续）';
    setMini('off', '已暂停');
    return;
  }
  phoenix.dataset.paused = 'false';

  const { account, settings, session, stage, mountain, mood, today } = snapshot;
  const goalMs = settings.dailyGoalMs;
  const goalPct = goalMs > 0 ? Math.min(100, Math.round((today.focusMs / goalMs) * 100)) : 0;
  const clock = hhmmss(today.focusMs);

  phoenix.textContent = STAGE_GLYPHS[stage.index] ?? STAGE_GLYPHS[0];
  phoenix.dataset.mood = mood;

  $('time').textContent = clock;
  $('goal').textContent = `今日 ${goalPct}%`;
  $('spirit').style.width = `${Math.round(account.spirit)}%`;
  $('stageName').textContent = `${settings.companionName} · ${stage.stage.name}`;
  $('streak').textContent = `\u{1F525} ${account.streak} 天`;
  $('state').textContent = STATE_TEXT[session.status] ?? session.status;

  $('markTime').style.left = `${Math.round(mountain.pTime * 100)}%`;
  $('markYou').style.left = `${Math.round(mountain.pYou * 100)}%`;
  $('altitude').textContent =
    `海拔 ${Math.round(mountain.pYou * 100)}% · ${deltaText(mountain.deltaHours)} · 距考试 ${mountain.daysLeft} 天`;

  const mini = MINI_VIEW[session.status] ?? { dot: 'off', text: session.status };
  setMini(mini.dot, mini.text, clock);
}

window.pet.onSnapshot(render);
window.pet.getSnapshot().then(render);

// 折叠开关放在 tools 里（no-drag），不放拖拽区——拖拽区收不到点击
$('collapse').addEventListener('click', () => {
  $('bubble').hidden = !$('bubble').hidden;
  applyLayout();
});

$('menu').addEventListener('click', () => {
  window.pet.showMenu();
});

applyLayout();
