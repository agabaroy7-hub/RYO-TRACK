import type { AchievementDefinition, GoalTemplate, LevelDefinition, WorkType } from './types';

export const LEVELS: LevelDefinition[] = [
  { level: 1, title: 'Rookie', minXp: 0, maxXp: 99 },
  { level: 2, title: 'Creator', minXp: 100, maxXp: 249 },
  { level: 3, title: 'Editor', minXp: 250, maxXp: 499 },
  { level: 4, title: 'Operator', minXp: 500, maxXp: 899 },
  { level: 5, title: 'Agency Builder', minXp: 900, maxXp: 1499 },
  { level: 6, title: 'Content Machine', minXp: 1500, maxXp: 999999 }
];

export const WORK_TYPES: Record<WorkType, { label: string; amount: number; xp: number; icon: string; accent: string }> = {
  video: { label: 'Video', amount: 1.25, xp: 25, icon: '🎬', accent: 'from-emerald-400 to-cyan-400' },
  carousel: { label: 'Carousel', amount: 1.25, xp: 25, icon: '🧩', accent: 'from-cyan-400 to-blue-400' },
  focus: { label: 'Focus Sprint', amount: 5, xp: 75, icon: '⚡', accent: 'from-emerald-300 to-lime-300' }
};

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'first-video', title: 'First Video', description: 'Log your first completed video.', icon: '🏆', unlockRule: { type: 'videos', value: 1 } },
  { id: 'first-25', title: 'First $25', description: 'Cross $25 in lifetime earnings.', icon: '🏆', unlockRule: { type: 'earnings', value: 25 } },
  { id: 'first-100', title: 'First $100', description: 'Cross $100 in lifetime earnings.', icon: '🏆', unlockRule: { type: 'earnings', value: 100 } },
  { id: 'seven-day-streak', title: '7 Day Streak', description: 'Keep the chain alive for a week.', icon: '🔥', unlockRule: { type: 'streak', value: 7 } },
  { id: 'hundred-videos', title: '100 Videos Logged', description: 'Push volume like a machine.', icon: '🏆', unlockRule: { type: 'videos', value: 100 } },
  { id: 'five-hundred-earned', title: '$500 Earned', description: 'Reach half a grand in revenue.', icon: '💸', unlockRule: { type: 'earnings', value: 500 } },
  { id: 'thirty-day-streak', title: '30 Day Streak', description: 'Show up for a full month.', icon: '⚙️', unlockRule: { type: 'streak', value: 30 } },
  { id: 'xp-elite', title: 'XP Elite', description: 'Hit 1,500 XP.', icon: '✨', unlockRule: { type: 'xp', value: 1500 } }
];

export const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    id: 'template-sprint',
    name: 'Sprint',
    description: 'Short burst with a tight daily rhythm.',
    cashGoal: 150,
    dailyTarget: 8,
    kind: 'builtin'
  },
  {
    id: 'template-standard',
    name: 'Standard',
    description: 'Balanced target for a steady editing week.',
    cashGoal: 300,
    dailyTarget: 10,
    kind: 'builtin'
  },
  {
    id: 'template-grind',
    name: 'Grind',
    description: 'Aggressive pace for pushing output hard.',
    cashGoal: 750,
    dailyTarget: 15,
    kind: 'builtin'
  }
];