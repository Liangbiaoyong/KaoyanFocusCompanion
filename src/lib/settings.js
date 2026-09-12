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