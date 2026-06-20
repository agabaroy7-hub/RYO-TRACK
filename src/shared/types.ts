export type WorkType = 'video' | 'carousel' | 'focus';

export interface WorkLogInput {
  type: WorkType;
  title: string;
  amount: number;
  xp: number;
  link?: string;
  createdAt?: string;
}

export interface DailyStat {
  date: string;
  earnings: number;
  workCount: number;
  focusCount: number;
  xp: number;
}

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlockRule: {
    type: 'videos' | 'earnings' | 'streak' | 'focus' | 'xp';
    value: number;
  };
}

export interface AchievementState extends AchievementDefinition {
  unlocked: boolean;
  unlockedAt?: string;
}

export interface LevelDefinition {
  level: number;
  title: string;
  minXp: number;
  maxXp: number;
}

export interface ForecastProjection {
  label: string;
  value: number;
}

export interface GoalTemplate {
  id: string;
  name: string;
  description: string;
  cashGoal: number;
  dailyTarget: number;
  kind: 'builtin' | 'custom';
  createdAt?: string;
}

export interface RecentWin {
  id: number;
  title: string;
  amount: number;
  progressFrom: number;
  progressTo: number;
  timestamp: string;
  type: WorkType;
  link?: string | null;
}

export interface AppState {
  cashGoal: number;
  dailyTarget: number;
  currentXp: number;
  level: number;
  levelTitle: string;
  totalEarnings: number;
  totalVideos: number;
  totalFocusSessions: number;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string | null;
  achievements: AchievementState[];
  recentWins: RecentWin[];
  todayEarnings: number;
  todayWorkCount: number;
  todayFocusCount: number;
  todayXp: number;
  remainingAmount: number;
  remainingEdits: number;
  percentComplete: number;
  goalCompletedToday: boolean;
  currentPace: number;
  forecast: ForecastProjection[];
  etaAtCurrentPace: number | null;
  etaAtTenVideos: number | null;
  motivationalMessage: string;
  weeklySeries: DailyStat[];
  monthlySeries: DailyStat[];
  yearlySeries: DailyStat[];
}

export interface DashboardAnalytics {
  earningsDaily: DailyStat[];
  earningsWeekly: DailyStat[];
  earningsMonthly: DailyStat[];
  workCompletedDaily: DailyStat[];
}

export interface DashboardResponse {
  state: AppState;
  analytics: DashboardAnalytics;
  goalTemplates: GoalTemplate[];
}

export interface GoalTemplateInput {
  name: string;
  description?: string;
  cashGoal: number;
  dailyTarget: number;
}

export interface WorkTrackBridge {
  getDashboard(): Promise<DashboardResponse>;
  logWork(input: WorkLogInput): Promise<DashboardResponse>;
  updateGoals(input: Partial<Pick<AppState, 'cashGoal' | 'dailyTarget'>>): Promise<DashboardResponse>;
  createGoalTemplate(input: GoalTemplateInput): Promise<DashboardResponse>;
  applyGoalTemplate(templateId: string): Promise<DashboardResponse>;
  deleteGoalTemplate(templateId: string): Promise<DashboardResponse>;
  resetDay(): Promise<DashboardResponse>;
  resetEverything(): Promise<DashboardResponse>;
}