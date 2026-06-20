import { ACHIEVEMENTS, LEVELS, WORK_TYPES } from './catalog';
import type { AchievementState, DailyStat, DashboardAnalytics, ForecastProjection, LevelDefinition, RecentWin, WorkLogInput } from './types';

export const DEFAULT_CASH_GOAL = 250;
export const DEFAULT_DAILY_TARGET = 10;

export function toDateKey(value: Date | string) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

export function getLevelInfo(xp: number): { level: LevelDefinition; progress: number; nextXp: number | null } {
  const level = LEVELS.find((entry) => xp >= entry.minXp && xp <= entry.maxXp) ?? LEVELS[LEVELS.length - 1];
  const next = LEVELS.find((entry) => entry.level === level.level + 1) ?? null;
  const progress = next ? Math.min(100, ((xp - level.minXp) / (next.minXp - level.minXp)) * 100) : 100;
  return { level, progress, nextXp: next?.minXp ?? null };
}

export function getAchievementStates(totals: { totalVideos: number; totalEarnings: number; currentStreak: number; currentXp: number }, existing: AchievementState[]): AchievementState[] {
  return ACHIEVEMENTS.map((achievement) => {
    const prior = existing.find((entry) => entry.id === achievement.id);
    const unlocked = evaluateAchievement(achievement.unlockRule.type, achievement.unlockRule.value, totals);
    return {
      ...achievement,
      unlocked,
      unlockedAt: unlocked ? prior?.unlockedAt ?? new Date().toISOString() : prior?.unlockedAt
    };
  });
}

function evaluateAchievement(type: AchievementState['unlockRule']['type'], value: number, totals: { totalVideos: number; totalEarnings: number; currentStreak: number; currentXp: number }) {
  switch (type) {
    case 'videos':
      return totals.totalVideos >= value;
    case 'earnings':
      return totals.totalEarnings >= value;
    case 'streak':
      return totals.currentStreak >= value;
    case 'xp':
      return totals.currentXp >= value;
    default:
      return false;
  }
}

export function buildForecasts(currentPace: number): ForecastProjection[] {
  return [
    { label: '7 Days', value: currentPace * 7 },
    { label: '30 Days', value: currentPace * 30 },
    { label: '90 Days', value: currentPace * 90 },
    { label: '1 Year', value: currentPace * 365 }
  ];
}

export function calculateEta(remainingAmount: number, pace: number) {
  if (pace <= 0) {
    return null;
  }
  return Math.ceil(remainingAmount / pace);
}

export function buildStreakDates(history: DailyStat[], today = new Date()) {
  const set = new Set(history.map((entry) => entry.date));
  const dates: { label: string; completed: boolean }[] = [];
  for (let offset = 6; offset >= 0; offset -= 1) {
    const day = startOfDay(today);
    day.setDate(day.getDate() - offset);
    const key = toDateKey(day);
    dates.push({ label: day.toLocaleDateString('en-US', { weekday: 'short' })[0], completed: set.has(key) });
  }
  return dates;
}

export function calculateStreak(history: DailyStat[], today = new Date()) {
  const active = [...new Set(history.map((entry) => entry.date))].sort();
  if (!active.length) {
    return { currentStreak: 0, longestStreak: 0 };
  }

  let longest = 1;
  let streak = 1;
  for (let index = 1; index < active.length; index += 1) {
    const previous = new Date(active[index - 1]);
    const current = new Date(active[index]);
    const gap = differenceInCalendarDays(current, previous);
    if (gap === 1) {
      streak += 1;
      longest = Math.max(longest, streak);
    } else {
      streak = 1;
    }
  }

  const latest = new Date(active[active.length - 1]);
  const latestGap = differenceInCalendarDays(startOfDay(today), startOfDay(latest));
  const currentStreak = latestGap <= 1 ? streak : 0;

  return { currentStreak, longestStreak: Math.max(longest, currentStreak) };
}

export function calculateMotivation(state: { remainingAmount: number; todayWorkCount: number; dailyTarget: number; currentStreak: number; weeklyProgressAhead: boolean; forecast: ForecastProjection[] }) {
  if (state.remainingAmount <= 5) {
    return "You're almost there. One more log and the goal gets visibly smaller.";
  }
  if (state.todayWorkCount < state.dailyTarget) {
    return `You're ${Math.max(1, Math.ceil(state.dailyTarget - state.todayWorkCount))} edit${state.dailyTarget - state.todayWorkCount === 1 ? '' : 's'} away from today's target.`;
  }
  if (state.currentStreak >= 3) {
    return `${state.currentStreak}-day streak. Keep the chain alive.`;
  }
  if (state.weeklyProgressAhead) {
    return "You're ahead of your weekly pace. Protect the momentum.";
  }
  return `You're projected to earn $${state.forecast[1]?.value.toFixed(0) ?? '0'} this month if this pace holds.`;
}

export function buildRecentWin(log: WorkLogInput, previousCompletion: number, nextCompletion: number): RecentWin {
  return {
    id: Date.now(),
    title: `${WORK_TYPES[log.type].icon} ${log.title}`,
    amount: log.amount,
    progressFrom: previousCompletion,
    progressTo: nextCompletion,
    timestamp: new Date(log.createdAt ?? new Date().toISOString()).toISOString(),
    type: log.type,
    link: log.link
  };
}

export function deriveAnalytics(history: DailyStat[]): DashboardAnalytics {
  const sorted = [...history].sort((left, right) => left.date.localeCompare(right.date));
  const today = new Date();
  const filterRange = (days: number) => {
    const threshold = new Date(today);
    threshold.setDate(threshold.getDate() - (days - 1));
    return sorted.filter((entry) => new Date(entry.date) >= startOfDay(threshold));
  };

  return {
    earningsDaily: filterRange(14),
    earningsWeekly: filterRange(30),
    earningsMonthly: filterRange(90),
    workCompletedDaily: filterRange(30)
  };
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function differenceInCalendarDays(left: Date, right: Date) {
  const leftStart = startOfDay(left).getTime();
  const rightStart = startOfDay(right).getTime();
  return Math.round((leftStart - rightStart) / 86400000);
}