import fs from 'node:fs';
import path from 'node:path';
import initSqlJs, { Database as SqlJsDatabase, SqlJsStatic } from 'sql.js';
import { ACHIEVEMENTS, GOAL_TEMPLATES, WORK_TYPES } from '../../src/shared/catalog';
import { buildForecasts, buildRecentWin, calculateEta, calculateMotivation, calculateStreak, deriveAnalytics, getAchievementStates, getLevelInfo, toDateKey } from '../../src/shared/engine';
import type { AchievementState, AppState, DailyStat, DashboardResponse, GoalTemplate, GoalTemplateInput, WorkLogInput, RecentWin } from '../../src/shared/types';

type AppStateRow = {
  id: number;
  cash_goal: number;
  daily_target: number;
  current_xp: number;
  level: number;
  total_earnings: number;
  total_videos: number;
  total_focus_sessions: number;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  updated_at: string;
};

type GoalTemplateRow = {
  id: string;
  name: string;
  description: string;
  cash_goal: number;
  daily_target: number;
  created_at: string;
};

export class WorkTrackService {
  private readonly dbPath: string;
  private sql!: SqlJsStatic;
  private db!: SqlJsDatabase;

  constructor(userDataPath: string) {
    this.dbPath = path.join(userDataPath, 'worktrack.db');
  }

  async init() {
    this.sql = await initSqlJs({
      locateFile: (file: string) => require.resolve(`sql.js/dist/${file}`)
    });

    this.db = fs.existsSync(this.dbPath) && fs.statSync(this.dbPath).size > 0
      ? new this.sql.Database(fs.readFileSync(this.dbPath))
      : new this.sql.Database();

    this.db.run(`
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        cash_goal REAL NOT NULL,
        daily_target REAL NOT NULL,
        current_xp INTEGER NOT NULL,
        level INTEGER NOT NULL,
        total_earnings REAL NOT NULL,
        total_videos INTEGER NOT NULL,
        total_focus_sessions INTEGER NOT NULL,
        current_streak INTEGER NOT NULL,
        longest_streak INTEGER NOT NULL,
        last_active_date TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS work_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        link TEXT,
        amount REAL NOT NULL,
        xp INTEGER NOT NULL,
        timestamp TEXT NOT NULL,
        progress_from REAL NOT NULL,
        progress_to REAL NOT NULL
      );

      CREATE TABLE IF NOT EXISTS daily_stats (
        date_key TEXT PRIMARY KEY,
        earnings REAL NOT NULL,
        work_count INTEGER NOT NULL,
        focus_count INTEGER NOT NULL,
        xp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS achievements (
        id TEXT PRIMARY KEY,
        unlocked_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS goal_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        cash_goal REAL NOT NULL,
        daily_target REAL NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    this.ensureWorkLogLinkColumn();

    const existing = this.queryOne<{ count: number }>('SELECT COUNT(*) AS count FROM app_state');
    if (!existing || existing.count === 0) {
      this.run(
        `
        INSERT INTO app_state (
          id, cash_goal, daily_target, current_xp, level, total_earnings, total_videos, total_focus_sessions,
          current_streak, longest_streak, last_active_date, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
        [1, 250, 10, 0, 1, 0, 0, 0, 0, 0, null, new Date().toISOString()]
      );
    }

    this.persist();
  }

  getDashboard(): DashboardResponse {
    this.ensureDayTransition();
    return this.buildDashboard();
  }

  logWork(input: WorkLogInput): DashboardResponse {
    const state = this.getState();
    const timestamp = input.createdAt ?? new Date().toISOString();
    const dateKey = toDateKey(timestamp);
    const previousCompletion = state.total_earnings / Math.max(1, state.cash_goal) * 100;

    const nextState = {
      ...state,
      total_earnings: state.total_earnings + input.amount,
      total_videos: state.total_videos + (input.type === 'focus' ? 0 : 1),
      total_focus_sessions: state.total_focus_sessions + (input.type === 'focus' ? 1 : 0),
      current_xp: state.current_xp + input.xp,
      last_active_date: dateKey
    };

    this.run(`
      INSERT INTO work_log (type, title, link, amount, xp, timestamp, progress_from, progress_to)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [input.type, input.title, input.link ?? null, input.amount, input.xp, timestamp, previousCompletion, (nextState.total_earnings / Math.max(1, nextState.cash_goal)) * 100]);

    this.upsertDailyStat(dateKey, input);
    this.persistState(nextState, timestamp);

    return this.buildDashboard();
  }

  updateGoals(input: Partial<Pick<AppState, 'cashGoal' | 'dailyTarget'>>): DashboardResponse {
    const state = this.getState();
    const nextState = {
      ...state,
      cash_goal: input.cashGoal ?? state.cash_goal,
      daily_target: input.dailyTarget ?? state.daily_target
    };
    this.persistState(nextState, new Date().toISOString());
    return this.buildDashboard();
  }

  createGoalTemplate(input: GoalTemplateInput): DashboardResponse {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const name = input.name.trim() || 'Custom Goal';
    const description = input.description?.trim() || `Hit $${input.cashGoal.toFixed(2)} with a daily target of ${input.dailyTarget}.`;

    this.run(
      `
      INSERT INTO goal_templates (id, name, description, cash_goal, daily_target, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `,
      [id, name, description, input.cashGoal, input.dailyTarget, now]
    );

    this.persistState({ ...this.getState(), cash_goal: input.cashGoal, daily_target: input.dailyTarget }, now);
    return this.buildDashboard();
  }

  applyGoalTemplate(templateId: string): DashboardResponse {
    const template = this.getGoalTemplates().find((entry) => entry.id === templateId);
    if (!template) {
      return this.buildDashboard();
    }

    const now = new Date().toISOString();
    this.persistState({ ...this.getState(), cash_goal: template.cashGoal, daily_target: template.dailyTarget }, now);
    return this.buildDashboard();
  }

  deleteGoalTemplate(templateId: string): DashboardResponse {
    const customTemplate = this.queryOne<{ id: string }>('SELECT id FROM goal_templates WHERE id = ?', [templateId]);
    if (customTemplate) {
      this.run('DELETE FROM goal_templates WHERE id = ?', [templateId]);
    }

    return this.buildDashboard();
  }

  resetDay(): DashboardResponse {
    this.ensureDayTransition(true);
    return this.buildDashboard();
  }

  resetEverything(): DashboardResponse {
    this.run('DELETE FROM work_log');
    this.run('DELETE FROM daily_stats');
    this.run('DELETE FROM achievements');
    this.run('DELETE FROM app_state WHERE id = 1');
    this.run(
      `
      INSERT INTO app_state (
        id, cash_goal, daily_target, current_xp, level, total_earnings, total_videos, total_focus_sessions,
        current_streak, longest_streak, last_active_date, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [1, 250, 10, 0, 1, 0, 0, 0, 0, 0, null, new Date().toISOString()]
    );
    this.persist();
    return this.buildDashboard();
  }

  private buildDashboard(): DashboardResponse {
    const state = this.getState();
    const history = this.getHistory();
    const streak = calculateStreak(history);
    if (streak.currentStreak !== state.current_streak || streak.longestStreak > state.longest_streak) {
      const longestStreak = Math.max(state.longest_streak, streak.longestStreak);
      this.run('UPDATE app_state SET current_streak = ?, longest_streak = ? WHERE id = 1', [streak.currentStreak, longestStreak]);
      Object.assign(state, { current_streak: streak.currentStreak, longest_streak: longestStreak });
    }

    const unlockedAchievements = this.getAchievements(state);
    const recentWins = this.getRecentWins();
    const levelInfo = getLevelInfo(state.current_xp);
    const todayKey = toDateKey(new Date());
    const today = history.find((entry) => entry.date === todayKey) ?? { date: todayKey, earnings: 0, workCount: 0, focusCount: 0, xp: 0 };
    const remainingAmount = Math.max(0, state.cash_goal - state.total_earnings);
    const currentPace = today.earnings > 0 ? today.earnings : history.length > 0 ? history.reduce((sum, entry) => sum + entry.earnings, 0) / history.length : 0;
    const forecast = buildForecasts(currentPace);
    const motivation = calculateMotivation({
      remainingAmount,
      todayWorkCount: today.workCount,
      dailyTarget: state.daily_target,
      currentStreak: streak.currentStreak,
      weeklyProgressAhead: history.slice(-7).reduce((sum, entry) => sum + entry.earnings, 0) > state.daily_target * 7,
      forecast
    });

    return {
      state: {
        cashGoal: state.cash_goal,
        dailyTarget: state.daily_target,
        currentXp: state.current_xp,
        level: levelInfo.level.level,
        levelTitle: levelInfo.level.title,
        totalEarnings: state.total_earnings,
        totalVideos: state.total_videos,
        totalFocusSessions: state.total_focus_sessions,
        currentStreak: streak.currentStreak,
        longestStreak: Math.max(state.longest_streak, streak.longestStreak),
        lastActiveDate: state.last_active_date,
        achievements: unlockedAchievements,
        recentWins,
        todayEarnings: today.earnings,
        todayWorkCount: today.workCount,
        todayFocusCount: today.focusCount,
        todayXp: today.xp,
        remainingAmount,
        remainingEdits: Math.ceil(remainingAmount / WORK_TYPES.video.amount),
        percentComplete: state.cash_goal <= 0 ? 0 : Math.min(100, (state.total_earnings / state.cash_goal) * 100),
        goalCompletedToday: today.earnings >= state.daily_target,
        currentPace,
        forecast,
        etaAtCurrentPace: calculateEta(remainingAmount, currentPace),
        etaAtTenVideos: calculateEta(remainingAmount, WORK_TYPES.video.amount * 10),
        motivationalMessage: motivation,
        weeklySeries: history.slice(-7),
        monthlySeries: history.slice(-30),
        yearlySeries: history.slice(-365)
      },
      analytics: deriveAnalytics(history),
      goalTemplates: this.getGoalTemplates()
    };
  }

  private ensureDayTransition(forceReset = false) {
    const state = this.getState();
    const todayKey = toDateKey(new Date());
    if (forceReset || (state.last_active_date && state.last_active_date !== todayKey)) {
      this.run('UPDATE app_state SET last_active_date = ? WHERE id = 1', [todayKey]);
    }
  }

  private getState(): AppStateRow {
    return this.queryOne<AppStateRow>('SELECT * FROM app_state WHERE id = 1') as AppStateRow;
  }

  private getHistory(): DailyStat[] {
    return this.queryAll<DailyStat>('SELECT date_key AS date, earnings, work_count AS workCount, focus_count AS focusCount, xp FROM daily_stats ORDER BY date_key ASC');
  }

  private getRecentWins(): RecentWin[] {
    return this.queryAll<RecentWin>('SELECT id, type, title, link, amount, timestamp, progress_from AS progressFrom, progress_to AS progressTo FROM work_log ORDER BY id DESC LIMIT 12');
  }

  private getGoalTemplates(): GoalTemplate[] {
    const customTemplates = this.queryAll<GoalTemplateRow>('SELECT id, name, description, cash_goal, daily_target, created_at FROM goal_templates ORDER BY created_at DESC').map((template) => ({
      id: template.id,
      name: template.name,
      description: template.description,
      cashGoal: template.cash_goal,
      dailyTarget: template.daily_target,
      kind: 'custom' as const,
      createdAt: template.created_at
    }));

    return [...GOAL_TEMPLATES, ...customTemplates];
  }

  private ensureWorkLogLinkColumn() {
    const columns = this.queryAll<{ name: string }>('PRAGMA table_info(work_log)');
    if (!columns.some((column) => column.name === 'link')) {
      this.run('ALTER TABLE work_log ADD COLUMN link TEXT');
    }
  }

  private getAchievements(state: AppStateRow): AchievementState[] {
    const unlocked = new Map(this.queryAll<{ id: string; unlockedAt: string }>('SELECT id, unlocked_at AS unlockedAt FROM achievements').map((row) => [row.id, row.unlockedAt]));
    const definitions = getAchievementStates(
      {
        totalVideos: state.total_videos,
        totalEarnings: state.total_earnings,
        currentStreak: state.current_streak,
        currentXp: state.current_xp
      },
      ACHIEVEMENTS.map((achievement) => ({ ...achievement, unlocked: unlocked.has(achievement.id), unlockedAt: unlocked.get(achievement.id) }))
    );

    for (const achievement of definitions) {
      if (achievement.unlocked && !unlocked.has(achievement.id)) {
        this.run('INSERT OR IGNORE INTO achievements (id, unlocked_at) VALUES (?, ?)', [achievement.id, new Date().toISOString()]);
      }
    }

    return definitions;
  }

  private upsertDailyStat(dateKey: string, input: WorkLogInput) {
    const existing = this.queryOne<{ date_key: string }>('SELECT date_key FROM daily_stats WHERE date_key = ?', [dateKey]);
    if (existing) {
      this.run('UPDATE daily_stats SET earnings = earnings + ?, work_count = work_count + 1, focus_count = focus_count + ?, xp = xp + ? WHERE date_key = ?', [input.amount, input.type === 'focus' ? 1 : 0, input.xp, dateKey]);
      return;
    }

    this.run('INSERT INTO daily_stats (date_key, earnings, work_count, focus_count, xp) VALUES (?, ?, ?, ?, ?)', [dateKey, input.amount, 1, input.type === 'focus' ? 1 : 0, input.xp]);
  }

  private persistState(state: AppStateRow, updatedAt: string) {
    this.run(`
      UPDATE app_state
      SET cash_goal = ?, daily_target = ?, current_xp = ?, level = ?, total_earnings = ?, total_videos = ?, total_focus_sessions = ?, current_streak = ?, longest_streak = ?, last_active_date = ?, updated_at = ?
      WHERE id = 1
    `, [
      state.cash_goal,
      state.daily_target,
      state.current_xp,
      state.level,
      state.total_earnings,
      state.total_videos,
      state.total_focus_sessions,
      state.current_streak,
      state.longest_streak,
      state.last_active_date,
      updatedAt
    ]);

    this.persist();
  }

  private run(sql: string, params: Array<string | number | null> = []) {
    this.db.run(sql, params);
  }

  private queryOne<T>(sql: string, params: Array<string | number | null> = []) {
    const statement = this.db.prepare(sql);
    statement.bind(params);
    if (!statement.step()) {
      statement.free();
      return undefined;
    }

    const row = statement.getAsObject() as T;
    statement.free();
    return row;
  }

  private queryAll<T>(sql: string, params: Array<string | number | null> = []) {
    const statement = this.db.prepare(sql);
    statement.bind(params);
    const rows: T[] = [];
    while (statement.step()) {
      rows.push(statement.getAsObject() as T);
    }
    statement.free();
    return rows;
  }

  private persist() {
    fs.writeFileSync(this.dbPath, Buffer.from(this.db.export()));
  }
}