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