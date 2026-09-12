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
    awayPenaltyMinutes: 1,
    awayPenaltyWindowMinutes: 3,
    targetLabel: '考试',
    companionName: '小凤',
  };
}

export function normalizeSettings(raw, now) {
  const d = defaultSettings(now);
  const r = raw ?? {};
  const text = (value, fallback) => (
    typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
  );
  return {
    examDateMs: parseDayKey(r.examDate ?? d.examDate),
    startDateMs: parseDayKey(r.startDate ?? d.startDate),
    dailyGoalMs: (r.dailyGoalMinutes ?? d.dailyGoalMinutes) * MINUTE,
    dailyCapMs: (r.dailyCapMinutes ?? d.dailyCapMinutes) * MINUTE,
    watchdogMs: (r.watchdogMinutes ?? d.watchdogMinutes) * MINUTE,
    awayPenaltyMs: Math.max(0, (r.awayPenaltyMinutes ?? d.awayPenaltyMinutes)) * MINUTE,
    awayPenaltyWindowMs:
      Math.max(0, (r.awayPenaltyWindowMinutes ?? d.awayPenaltyWindowMinutes)) * MINUTE,
    // 目标是"某件有截止日的事"，不一定是考研——名称可自定义
    targetLabel: text(r.targetLabel, d.targetLabel).slice(0, 8),
    companionName: text(r.companionName, d.companionName),
  };
}