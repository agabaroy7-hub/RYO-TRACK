import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, isValid, startOfMonth, startOfWeek, subMonths } from 'date-fns';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpRight, Bell, CheckCircle2, CircleDashed, Coins, ExternalLink, Flame, Gauge, LayoutGrid, Link2, MoonStar, Plus, Rocket, Settings2, SlidersHorizontal, Sparkles, SunMedium, Target, Trash2, TrendingUp, Trophy, Zap, X } from 'lucide-react';
import { GOAL_TEMPLATES, WORK_TYPES } from '../shared/catalog';
import type { AppState, DashboardAnalytics, DashboardResponse, DailyStat, GoalTemplate, WorkTrackBridge, WorkType } from '../shared/types';

type DashboardTab = 'overview' | 'goals' | 'log' | 'analytics' | 'wins' | 'settings';
type ThemeMode = 'dark' | 'light';
type OverviewDetail = 'today' | 'pace' | 'forecast' | null;

interface AppSettings {
  theme: ThemeMode;
  compactMode: boolean;
  reducedMotion: boolean;
}

const SETTINGS_STORAGE_KEY = 'ryo-track-settings';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  compactMode: false,
  reducedMotion: false
};

const FALLBACK_STATE: AppState = {
  cashGoal: 250,
  dailyTarget: 10,
  currentXp: 0,
  level: 1,
  levelTitle: 'Rookie',
  totalEarnings: 0,
  totalVideos: 0,
  totalFocusSessions: 0,
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: null,
  achievements: [],
  recentWins: [],
  todayEarnings: 0,
  todayWorkCount: 0,
  todayFocusCount: 0,
  todayXp: 0,
  remainingAmount: 250,
  remainingEdits: 200,
  percentComplete: 0,
  goalCompletedToday: false,
  currentPace: 0,
  forecast: [],
  etaAtCurrentPace: null,
  etaAtTenVideos: null,
  motivationalMessage: 'Start with one log and build the streak.',
  weeklySeries: [],
  monthlySeries: [],
  yearlySeries: []
};

const FALLBACK_ANALYTICS: DashboardAnalytics = {
  earningsDaily: [],
  earningsWeekly: [],
  earningsMonthly: [],
  workCompletedDaily: []
};

function normalizeSettings(value: unknown): AppSettings {
  if (!value || typeof value !== 'object') {
    return DEFAULT_SETTINGS;
  }

  const candidate = value as Partial<AppSettings>;
  return {
    theme: candidate.theme === 'light' ? 'light' : 'dark',
    compactMode: Boolean(candidate.compactMode),
    reducedMotion: Boolean(candidate.reducedMotion)
  };
}

function loadAppSettings(): AppSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_SETTINGS;
  }

  try {
    return normalizeSettings(JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null'));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function getWeekDays(date: Date) {
  return eachDayOfInterval({ start: startOfWeek(date, { weekStartsOn: 1 }), end: endOfWeek(date, { weekStartsOn: 1 }) });
}

function formatCalendarShortDay(date: Date) {
  return format(date, 'EEE');
}

function formatCalendarLabel(date: Date) {
  return isValid(date) ? format(date, 'MMMM yyyy') : 'Calendar';
}

function getMonthDays(date: Date) {
  return eachDayOfInterval({ start: startOfMonth(date), end: endOfMonth(date) });
}

function buildChartSeries(data: Array<Record<string, number | string>>, valueKey: string) {
  const parsed = data
    .map((entry) => ({
      date: String(entry.date),
      value: Number(entry[valueKey] ?? 0)
    }))
    .filter((entry) => Number.isFinite(entry.value))
    .sort((left, right) => left.date.localeCompare(right.date));

  if (parsed.length === 0) {
    const today = new Date();
    return Array.from({ length: 7 }, (_, index) => ({
      date: format(addDays(today, index - 6), 'yyyy-MM-dd'),
      value: 0
    }));
  }

  const lastDate = new Date(parsed[parsed.length - 1].date);
  if (Number.isNaN(lastDate.getTime())) {
    return parsed;
  }

  const source = new Map(parsed.map((entry) => [entry.date, entry.value]));
  const span = Math.max(7, parsed.length);
  const series: Array<{ date: string; value: number }> = [];

  for (let offset = span - 1; offset >= 0; offset -= 1) {
    const date = new Date(lastDate);
    date.setDate(date.getDate() - offset);
    const dateKey = date.toISOString().slice(0, 10);
    series.push({
      date: dateKey,
      value: source.get(dateKey) ?? 0
    });
  }

  return series;
}

const previewDashboard: DashboardResponse = {
  state: FALLBACK_STATE,
  analytics: FALLBACK_ANALYTICS,
  goalTemplates: GOAL_TEMPLATES
};

const PREVIEW_WORKTRACK: WorkTrackBridge = {
  getDashboard: async () => previewDashboard,
  logWork: async () => previewDashboard,
  updateGoals: async () => previewDashboard,
  createGoalTemplate: async () => previewDashboard,
  applyGoalTemplate: async () => previewDashboard,
  deleteGoalTemplate: async () => previewDashboard,
  resetDay: async () => previewDashboard,
  resetEverything: async () => previewDashboard
};

export default function App() {
  const [dashboard, setDashboard] = useState<DashboardResponse>({ state: FALLBACK_STATE, analytics: FALLBACK_ANALYTICS, goalTemplates: GOAL_TEMPLATES });
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
  const [settings, setSettings] = useState<AppSettings>(() => loadAppSettings());
  const [isCalendarPopupOpen, setIsCalendarPopupOpen] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(() => new Date());
  const [isLogPopupOpen, setIsLogPopupOpen] = useState(false);
  const [isResetPopupOpen, setIsResetPopupOpen] = useState(false);
  const [isGoalPopupOpen, setIsGoalPopupOpen] = useState(false);
  const [isGoalDetailOpen, setIsGoalDetailOpen] = useState(false);
  const [selectedGoalTemplate, setSelectedGoalTemplate] = useState<GoalTemplate | null>(null);
  const [overviewDetail, setOverviewDetail] = useState<OverviewDetail>(null);
  const [logForm, setLogForm] = useState({
    type: 'video' as WorkType,
    name: '',
    link: '',
    price: ''
  });
  const [goalForm, setGoalForm] = useState({
    name: '',
    description: '',
    cashGoal: '',
    dailyTarget: ''
  });
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [logError, setLogError] = useState('');
  const [goalError, setGoalError] = useState('');
  const [resetError, setResetError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const bridge = typeof window !== 'undefined' && window.worktrack ? window.worktrack : PREVIEW_WORKTRACK;
  const isPreviewMode = bridge === PREVIEW_WORKTRACK;

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.density = settings.compactMode ? 'compact' : 'comfortable';
    document.documentElement.dataset.reducedMotion = settings.reducedMotion ? 'true' : 'false';
  }, [settings]);

  useEffect(() => {
    let isMounted = true;

    void bridge.getDashboard()
      .then((response) => {
        if (isMounted) {
          setDashboard(response);
        }
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [bridge]);

  const state = dashboard.state;
  const analytics = dashboard.analytics;
  const goalTemplates = dashboard.goalTemplates;
  const activeGoalTemplate = useMemo(() => goalTemplates.find((template) => template.cashGoal === state.cashGoal && template.dailyTarget === state.dailyTarget) ?? null, [goalTemplates, state.cashGoal, state.dailyTarget]);
  const tabs: Array<{ id: DashboardTab; label: string; description: string; icon: ReactNode }> = [
    { id: 'overview', label: 'Overview', description: 'Summary', icon: <Rocket className="h-4 w-4" /> },
    { id: 'goals', label: 'Goals', description: 'Plan', icon: <Target className="h-4 w-4" /> },
    { id: 'log', label: 'Log', description: 'Add work', icon: <Plus className="h-4 w-4" /> },
    { id: 'analytics', label: 'Analytics', description: 'Charts', icon: <TrendingUp className="h-4 w-4" /> },
    { id: 'wins', label: 'Wins', description: 'Recent items', icon: <Trophy className="h-4 w-4" /> },
    { id: 'settings', label: 'Settings', description: 'Appearance', icon: <Settings2 className="h-4 w-4" /> }
  ];

  const xps = useMemo(() => Math.min(100, (state.currentXp % 100)), [state.currentXp]);
  const todayDate = useMemo(() => new Date(), [dashboard.state.lastActiveDate, activeTab]);
  const weekDays = useMemo(() => getWeekDays(todayDate), [todayDate]);
  const monthDays = useMemo(() => getMonthDays(selectedCalendarDate), [selectedCalendarDate]);
  const weeklyActivityByDate = useMemo(() => new Map(state.weeklySeries.map((entry) => [entry.date, entry])), [state.weeklySeries]);
  const monthlyActivityByDate = useMemo(() => new Map(state.monthlySeries.map((entry) => [entry.date, entry])), [state.monthlySeries]);
  const selectedCalendarKey = format(selectedCalendarDate, 'yyyy-MM-dd');
  const selectedCalendarActivity = monthlyActivityByDate.get(selectedCalendarKey) ?? weeklyActivityByDate.get(selectedCalendarKey) ?? null;
  const winCardVariants = settings.reducedMotion
    ? {
        hidden: { opacity: 0 },
        show: { opacity: 1 }
      }
    : {
        hidden: { opacity: 0, y: 20, scale: 0.97 },
        show: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: {
            type: 'spring',
            stiffness: 180,
            damping: 18
          }
        }
      };

  const openLogPopup = (type: WorkType = 'video') => {
    setLogForm({
      type,
      name: WORK_TYPES[type].label,
      link: '',
      price: WORK_TYPES[type].amount.toFixed(2)
    });
    setLogError('');
    setIsLogPopupOpen(true);
  };

  const closeOverviewDetail = () => setOverviewDetail(null);
  const openCalendarPopup = (date: Date = todayDate) => {
    setSelectedCalendarDate(date);
    setIsCalendarPopupOpen(true);
  };
  const closeCalendarPopup = () => setIsCalendarPopupOpen(false);

  const openGoalPopup = (template?: GoalTemplate) => {
    const defaultDescription = activeGoalTemplate?.kind === 'custom' ? activeGoalTemplate.description : '';
    setGoalForm({
      name: template?.kind === 'custom' ? template.name : activeGoalTemplate?.kind === 'custom' ? activeGoalTemplate.name : 'Custom Goal',
      description: template?.description ?? defaultDescription,
      cashGoal: String(template?.cashGoal ?? state.cashGoal),
      dailyTarget: String(template?.dailyTarget ?? state.dailyTarget)
    });
    setGoalError('');
    setIsGoalPopupOpen(true);
  };

  const openGoalDetail = (template: GoalTemplate) => {
    setSelectedGoalTemplate(template);
    setIsGoalDetailOpen(true);
  };

  const closeGoalDetail = () => {
    setIsGoalDetailOpen(false);
    setSelectedGoalTemplate(null);
  };

  const resetAppearanceDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  const parseGoalForm = () => {
    const name = goalForm.name.trim();
    const description = goalForm.description.trim();
    const cashGoal = Number.parseFloat(goalForm.cashGoal);
    const dailyTarget = Number.parseFloat(goalForm.dailyTarget);

    if (!name) {
      setGoalError('Give the goal a name.');
      return null;
    }

    if (!Number.isFinite(cashGoal) || cashGoal <= 0) {
      setGoalError('Enter a valid cash goal.');
      return null;
    }

    if (!Number.isFinite(dailyTarget) || dailyTarget <= 0) {
      setGoalError('Enter a valid daily target.');
      return null;
    }

    return { name, description, cashGoal, dailyTarget };
  };

  const applyGoalValues = async () => {
    const values = parseGoalForm();
    if (!values) {
      return;
    }

    setIsSubmitting(true);
    setGoalError('');

    try {
      const response = await window.worktrack.updateGoals({ cashGoal: values.cashGoal, dailyTarget: values.dailyTarget });
      setDashboard(response);
      setIsGoalPopupOpen(false);
    } catch {
      setGoalError('Unable to update this goal right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveGoalTemplate = async () => {
    const values = parseGoalForm();
    if (!values) {
      return;
    }

    setIsSubmitting(true);
    setGoalError('');

    try {
      const response = await window.worktrack.createGoalTemplate(values);
      setDashboard(response);
      setIsGoalPopupOpen(false);
    } catch {
      setGoalError('Unable to save this template right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const applyTemplate = async (templateId: string) => {
    try {
      const response = await window.worktrack.applyGoalTemplate(templateId);
      setDashboard(response);
    } catch {
      setGoalError('Unable to apply this template right now.');
    }
  };

  const deleteTemplate = async (templateId: string) => {
    try {
      const response = await window.worktrack.deleteGoalTemplate(templateId);
      setDashboard(response);
    } catch {
      setGoalError('Unable to delete this template right now.');
    }
  };

  const overviewDetails = {
    today: {
      title: 'Today',
      icon: <Coins className="h-5 w-5 text-emerald-300" />,
      summary: `You've logged $${state.todayEarnings.toFixed(2)} today across ${state.todayWorkCount} items.`,
      detail: state.todayWorkCount > 0
        ? `Keep stacking small wins. Today's logs are already contributing to streak, XP, and your daily target.`
        : 'No logs yet today. The first entry will immediately move the meter and warm up the streak.',
      stats: [
        { label: 'Today earnings', value: `$${state.todayEarnings.toFixed(2)}` },
        { label: 'Today logs', value: `${state.todayWorkCount}` },
        { label: 'Today XP', value: `${state.todayXp}` }
      ]
    },
    pace: {
      title: 'Current Pace',
      icon: <ArrowUpRight className="h-5 w-5 text-emerald-300" />,
      summary: `Your current pace is $${state.currentPace.toFixed(2)} per task.`,
      detail: state.etaAtCurrentPace
        ? `At this pace, you'd finish the remaining balance in about ${state.etaAtCurrentPace} days.`
        : 'There is not enough activity yet to calculate a reliable pace. Add a few logs and this will start moving.',
      stats: [
        { label: 'Current pace', value: `$${state.currentPace.toFixed(2)}/task` },
        { label: 'Remaining', value: `$${state.remainingAmount.toFixed(2)}` },
        { label: 'Estimated days left', value: state.etaAtCurrentPace ? `${state.etaAtCurrentPace}` : 'No data' }
      ]
    },
    forecast: {
      title: 'Forecast',
      icon: <TrendingUp className="h-5 w-5 text-emerald-300" />,
      summary: `Your 30-day projection is $${state.forecast[1]?.value.toFixed(2) ?? '0.00'}.`,
      detail: 'This forecast expands your current pace into 7, 30, 90, and 365-day views so you can see momentum before it lands.',
      stats: [
        { label: '7 days', value: `$${state.forecast[0]?.value.toFixed(2) ?? '0.00'}` },
        { label: '30 days', value: `$${state.forecast[1]?.value.toFixed(2) ?? '0.00'}` },
        { label: '90 days', value: `$${state.forecast[2]?.value.toFixed(2) ?? '0.00'}` }
      ]
    }
  } as const;

  const submitCustomLog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const name = logForm.name.trim();
    const link = logForm.link.trim();
    const amount = Number.parseFloat(logForm.price);

    if (!name) {
      setLogError('Add a name for the item.');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      setLogError('Enter a valid price you got.');
      return;
    }

    if (link) {
      try {
        new URL(link);
      } catch {
        setLogError('Enter a valid link, or leave it blank.');
        return;
      }
    }

    setIsSubmitting(true);
    setLogError('');

    try {
      const response = await window.worktrack.logWork({
        type: logForm.type,
        title: name,
        amount,
        xp: WORK_TYPES[logForm.type].xp,
        link: link || undefined
      });
      setDashboard(response);
      setIsLogPopupOpen(false);
      setLogForm({ type: 'video', name: '', link: '', price: '' });
    } catch {
      setLogError('Unable to save this item right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitResetEverything = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (resetConfirmText.trim().toUpperCase() !== 'RESET') {
      setResetError('Type RESET to confirm.');
      return;
    }

    setIsSubmitting(true);
    setResetError('');

    try {
      const response = await window.worktrack.resetEverything();
      setDashboard(response);
      setIsResetPopupOpen(false);
      setResetConfirmText('');
    } catch {
      setResetError('Unable to reset right now.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="app-shell flex min-h-screen items-center justify-center bg-aurora px-6 text-white" data-theme={settings.theme} data-density={settings.compactMode ? 'compact' : 'comfortable'} data-reduced-motion={settings.reducedMotion ? 'true' : 'false'}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 180, damping: 18 }}
          className="flex w-full max-w-md flex-col items-center rounded-[32px] border border-white/10 bg-panel/90 px-8 py-10 text-center shadow-glass backdrop-blur-xl"
        >
          <TaskFlowMark size="xl" />
          <div className="mt-3 text-2xl font-semibold text-white">Loading RYO TRACK</div>
          <div className="mt-2 text-sm text-slate-300">Preparing your dashboard, goals, and activity data.</div>
          <div className="mt-8 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-green-400 to-lime-300"
              initial={{ x: '-30%' }}
              animate={{ x: ['-30%', '100%'] }}
              transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
              style={{ width: '30%' }}
            />
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="app-shell min-h-screen bg-aurora text-white" data-theme={settings.theme} data-density={settings.compactMode ? 'compact' : 'comfortable'} data-reduced-motion={settings.reducedMotion ? 'true' : 'false'}>
      <div className="mx-auto max-w-[1600px] px-4 py-4 md:px-6 lg:px-8">
        <header className="mb-5 flex items-center justify-between rounded-[24px] border border-white/10 bg-panel/90 px-4 py-3 shadow-glass backdrop-blur-xl">
          <TaskFlowMark size="md" showWordmark={false} />
          {isPreviewMode ? <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-slate-300">Browser Preview</div> : null}
          <div className="grid grid-cols-3 gap-2 text-sm md:min-w-[300px]">
            <StatChip label="Revenue" value={`$${state.totalEarnings.toFixed(2)}`} accent="money" icon={<Coins className="h-4 w-4 text-emerald-300" />} />
            <StatChip label="Level" value={`${state.level}`} accent="orange" />
            <StatChip label="Streak" value={`${state.currentStreak}d`} accent="gold" />
          </div>
        </header>

        <div className="sticky top-4 z-30 mb-5 rounded-[24px] border border-white/10 bg-panel/80 p-2 shadow-glass backdrop-blur-xl">
          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <motion.button
                  key={tab.id}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.99 }}
                  onClick={() => setActiveTab(tab.id)}
                  className={`rounded-2xl border px-4 py-3 text-left transition ${active ? 'border-greenGlow/40 bg-greenGlow/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl border transition ${active ? 'border-emerald-300/30 bg-emerald-300/15 text-emerald-200' : 'border-white/10 bg-white/5 text-slate-300'}`}>
                      {tab.icon}
                    </span>
                    <div>
                      <div className="text-xs uppercase tracking-[0.32em] text-slate-400">{tab.description}</div>
                      <div className={`mt-1 text-sm font-semibold ${active ? 'text-white' : 'text-slate-200'}`}>{tab.label}</div>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>

        <section className={`${activeTab === 'overview' ? '' : 'hidden'} grid gap-4 xl:grid-cols-[1.5fr_1fr]`}>
          <GlassCard className="overflow-hidden border-greenGlow/20">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
              <div className="max-w-xl">
                <SectionTag icon={<TrendingUp className="h-4 w-4" />} label="Goal Progress" />
                <div className="mt-4 flex flex-wrap items-end gap-3 text-5xl font-semibold tracking-tight">
                  <motion.span
                    key={state.totalEarnings.toFixed(2)}
                    initial={{ opacity: 0, y: 12, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 180, damping: 16 }}
                    className="inline-flex items-center gap-3 text-emerald-300"
                  >
                    <motion.span animate={{ y: [0, -2, 0] }} transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }} className="inline-flex rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-2 text-emerald-300">
                      <Coins className="h-8 w-8" />
                    </motion.span>
                    ${state.totalEarnings.toFixed(2)}
                  </motion.span>
                  <span className="text-slate-500">/</span>
                  <span className="text-white">${state.cashGoal.toFixed(2)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-300">
                  <Pill>{state.percentComplete.toFixed(1)}% complete</Pill>
                  <Pill>{state.remainingEdits} edits remaining</Pill>
                  <Pill>
                    <span className="inline-flex items-center gap-1 text-emerald-200">
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      ${state.remainingAmount.toFixed(2)} remaining
                    </span>
                  </Pill>
                </div>
                <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/8">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${state.percentComplete}%` }} transition={{ type: 'spring', stiffness: 80, damping: 18 }} className="h-full rounded-full bg-gradient-to-r from-emerald-400 via-green-400 to-lime-300" />
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  <MetricCard label="Today" value={`$${state.todayEarnings.toFixed(2)}`} icon={<Coins className="h-4 w-4" />} valueClassName="text-emerald-300" onClick={() => setOverviewDetail('today')} />
                  <MetricCard label="Earn pace" value={`$${state.currentPace.toFixed(2)}`} icon={<ArrowUpRight className="h-4 w-4" />} valueClassName="text-emerald-200 whitespace-nowrap" onClick={() => setOverviewDetail('pace')} dense />
                  <MetricCard label="Forecast" value={`$${state.forecast[1]?.value.toFixed(2) ?? '0.00'}`} icon={<TrendingUp className="h-4 w-4" />} valueClassName="text-emerald-200" onClick={() => setOverviewDetail('forecast')} />
                </div>

              </div>

              <div className="grid gap-4 sm:grid-cols-2 lg:min-w-[360px] lg:grid-cols-1">
                <GlassBadge title="Daily Target" value={`$${state.todayEarnings.toFixed(2)} / $${state.dailyTarget.toFixed(2)}`} highlight={state.goalCompletedToday ? 'Completed' : `${Math.min(100, (state.todayEarnings / state.dailyTarget) * 100 || 0).toFixed(1)}%`} />
                <GlassBadge title="XP Progress" value={`Level ${state.level} · ${state.levelTitle}`} highlight={`${state.currentXp % 100} / 100 XP`} />
              </div>
            </div>
          </GlassCard>

          <GlassCard className="space-y-5 cursor-pointer transition hover:border-greenGlow/30" onClick={() => openCalendarPopup()}>
            <SectionTag icon={<Flame className="h-4 w-4" />} label="Visual Streak" />
            <div className="grid grid-cols-7 gap-2 text-center text-xs uppercase tracking-[0.28em] text-slate-400">
              {weekDays.map((day) => (
                <span key={day.toISOString()}>{formatCalendarShortDay(day)}</span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-2">
              {weekDays.map((day) => {
                const dayKey = format(day, 'yyyy-MM-dd');
                const entry = weeklyActivityByDate.get(dayKey) ?? null;
                const hasActivity = Boolean(entry && entry.workCount > 0);
                const isCurrentDay = isToday(day);

                return (
                  <button
                    key={dayKey}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      openCalendarPopup(day);
                    }}
                    className={`rounded-2xl border p-4 text-center transition ${isCurrentDay ? 'border-emerald-300/50 bg-emerald-300/10' : 'border-white/10 bg-white/5 hover:border-greenGlow/30'}`}
                  >
                    <div className="text-xs text-slate-400">{format(day, 'MM-dd')}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.28em] text-slate-500">{isCurrentDay ? 'Today' : formatCalendarShortDay(day)}</div>
                    <div className="mt-2 flex items-center justify-center text-2xl">
                      {hasActivity ? <CheckCircle2 className="h-6 w-6 text-emerald-300" /> : <CircleDashed className="h-6 w-6 text-slate-500" />}
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400">{entry ? `${entry.workCount} logs` : 'No logs'}</div>
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm text-slate-300">
              <MetricCard label="Current streak" value={`${state.currentStreak} days`} helper="Keep the chain alive" />
              <MetricCard label="Longest streak" value={`${state.longestStreak} days`} helper="Best run ever" />
            </div>
          </GlassCard>
        </section>

        <AnimatePresence>
          {overviewDetail ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md"
              onClick={closeOverviewDetail}
            >
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                onClick={(event) => event.stopPropagation()}
                className="surface-modal w-full max-w-xl rounded-[30px] border border-white/10 bg-[#08111f] p-6 shadow-2xl"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-emerald-100">
                      {overviewDetails[overviewDetail].icon}
                      Details
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold text-white">{overviewDetails[overviewDetail].title}</h2>
                    <p className="mt-2 text-sm text-slate-300">{overviewDetails[overviewDetail].summary}</p>
                  </div>
                  <button type="button" onClick={closeOverviewDetail} className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-white/20 hover:text-white">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-6 space-y-4">
                  <p className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed text-slate-200">{overviewDetails[overviewDetail].detail}</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {overviewDetails[overviewDetail].stats.map((stat) => (
                      <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                        <div className="text-xs uppercase tracking-[0.3em] text-slate-400">{stat.label}</div>
                        <div className="mt-2 text-xl font-semibold text-emerald-300">{stat.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {isCalendarPopupOpen ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md"
              onClick={closeCalendarPopup}
            >
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 16, scale: 0.98 }}
                transition={{ type: 'spring', stiffness: 220, damping: 24 }}
                onClick={(event) => event.stopPropagation()}
                className="surface-modal w-full max-w-4xl rounded-[30px] border border-white/10 bg-[#08111f] p-5 shadow-2xl"
              >
                <div className="flex flex-col gap-4 border-b border-white/10 pb-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold text-white">{formatCalendarLabel(selectedCalendarDate)}</h2>
                    <p className="mt-1 text-sm text-slate-300">A minimal month view with today marked and the selected day shown on the side.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => setSelectedCalendarDate((current) => subMonths(current, 1))} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:text-white">
                      Previous month
                    </button>
                    <button type="button" onClick={() => setSelectedCalendarDate(new Date())} className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-100 transition hover:border-emerald-400/40 hover:bg-emerald-400/15">
                      Jump to today
                    </button>
                    <button type="button" onClick={() => setSelectedCalendarDate((current) => addMonths(current, 1))} className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:text-white">
                      Next month
                    </button>
                    <button type="button" onClick={closeCalendarPopup} className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-white/20 hover:text-white">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_280px]">
                  <div className="rounded-[24px] border border-white/10 bg-white/5 p-3">
                    <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] uppercase tracking-[0.24em] text-slate-400">
                      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => (
                        <span key={day}>{day}</span>
                      ))}
                    </div>
                    <div className="mt-2 grid grid-cols-7 gap-1.5">
                      {monthDays.map((day) => {
                        const dayKey = format(day, 'yyyy-MM-dd');
                        const entry = weeklyActivityByDate.get(dayKey) ?? monthlyActivityByDate.get(dayKey) ?? null;
                        const inCurrentMonth = isSameMonth(day, selectedCalendarDate);
                        const currentDay = isToday(day);
                        const selectedDay = isSameDay(day, selectedCalendarDate);

                        return (
                          <button
                            key={dayKey}
                            type="button"
                            onClick={() => setSelectedCalendarDate(day)}
                            className={`min-h-[76px] rounded-2xl border p-2.5 text-left transition ${selectedDay ? 'border-emerald-300/45 bg-emerald-300/10' : 'border-white/10 bg-transparent hover:border-white/20 hover:bg-white/5'} ${inCurrentMonth ? '' : 'opacity-35'} ${currentDay ? 'ring-1 ring-emerald-300/35' : ''}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-sm font-medium text-white">{format(day, 'd')}</div>
                              <span className={`h-1.5 w-1.5 rounded-full ${entry ? 'bg-emerald-300' : 'bg-transparent'}`} />
                            </div>
                            <div className="mt-2 text-[10px] leading-tight text-slate-400">
                              {currentDay ? 'Today' : entry ? `${entry.workCount} logs` : 'No logs'}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-[24px] border border-white/10 bg-white/5 p-4">
                    <div>
                      <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Selected day</div>
                      <div className="mt-2 text-lg font-semibold text-white">{format(selectedCalendarDate, 'EEEE, MMM d')}</div>
                      <div className="mt-1 text-sm text-slate-300">{isToday(selectedCalendarDate) ? 'Today' : 'Selected date'}</div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <MiniStat label="Earnings" value={`$${selectedCalendarActivity?.earnings.toFixed(2) ?? '0.00'}`} />
                      <MiniStat label="Logs" value={`${selectedCalendarActivity?.workCount ?? 0}`} />
                      <MiniStat label="Focus" value={`${selectedCalendarActivity?.focusCount ?? 0}`} />
                      <MiniStat label="XP" value={`${selectedCalendarActivity?.xp ?? 0}`} />
                    </div>

                    <div className="border-t border-white/10 pt-3 text-sm text-slate-300">
                      {isToday(selectedCalendarDate)
                        ? 'This is the real-world current day.'
                        : selectedCalendarActivity
                          ? 'This day has logged activity.'
                          : 'No activity logged for this day.'}
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3 text-xs leading-relaxed text-slate-400">
                      The calendar now stays minimal on purpose: the grid shows the month, the dot shows activity, and the side panel shows the selected day.
                    </div>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        <section className={`${activeTab === 'log' ? '' : 'hidden'} mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]`}>
          <GlassCard>
            <SectionTag icon={<Zap className="h-4 w-4" />} label="Quick Log" />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-300">Log a finished item with its name, link, and price.</p>
              <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => openLogPopup()} className="inline-flex items-center gap-2 rounded-full border border-greenGlow/30 bg-greenGlow/10 px-4 py-2 text-sm font-medium text-green-100 transition hover:border-greenGlow/50">
                <Plus className="h-4 w-4" />
                Add item
              </motion.button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {(['video', 'carousel', 'focus'] as WorkType[]).map((type) => (
                <motion.button whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }} key={type} onClick={() => openLogPopup(type)} className="group rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 to-white/5 p-5 text-left shadow-glow transition hover:border-greenGlow/40">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Log</div>
                      <div className="mt-2 text-2xl font-semibold text-white">+ {WORK_TYPES[type].label}</div>
                    </div>
                    <div className="rounded-2xl bg-black/30 px-3 py-2 text-lg">{WORK_TYPES[type].icon}</div>
                  </div>
                  <div className="mt-4 text-sm text-slate-300">${WORK_TYPES[type].amount.toFixed(2)} • {WORK_TYPES[type].xp} XP</div>
                </motion.button>
              ))}
            </div>
          </GlassCard>

          <GlassCard>
            <SectionTag icon={<Trophy className="h-4 w-4" />} label="XP and Level" />
            <div className="mt-4 rounded-[24px] border border-white/10 bg-black/20 p-5">
              <div className="text-sm uppercase tracking-[0.32em] text-slate-400">Level {state.level}</div>
              <div className="mt-2 text-3xl font-semibold text-white">{state.levelTitle}</div>
              <div className="mt-2 text-sm text-slate-300">{state.currentXp} XP earned</div>
              <div className="mt-5 h-3 overflow-hidden rounded-full bg-white/8">
                <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-lime-300" animate={{ width: `${xps}%` }} transition={{ type: 'spring', stiffness: 90, damping: 18 }} />
              </div>
              <div className="mt-2 text-right text-xs tracking-[0.3em] text-slate-400">{state.currentXp % 100} / 100 XP</div>
            </div>
            <div className="mt-4 grid gap-3">
              <AnimatePresence>
                {state.achievements.map((achievement) => (
                  <motion.div key={achievement.id} layout className={`rounded-2xl border p-4 ${achievement.unlocked ? 'border-emerald-400/30 bg-emerald-400/10' : 'border-white/10 bg-white/5'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-lg">{achievement.icon} {achievement.title}</div>
                        <div className="mt-1 text-sm text-slate-300">{achievement.description}</div>
                      </div>
                      <div className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.3em] ${achievement.unlocked ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/5 text-slate-400'}`}>
                        {achievement.unlocked ? 'Unlocked' : 'Locked'}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </GlassCard>
        </section>

        <section className={`${activeTab === 'analytics' ? '' : 'hidden'} mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]`}>
          <GlassCard>
            <SectionTag icon={<TrendingUp className="h-4 w-4" />} label="Performance Analytics" />
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <ChartPanel title="Daily earnings" data={analytics.earningsDaily} valueKey="earnings" color="#ff9a3d" />
              <ChartPanel title="Weekly earnings" data={analytics.earningsWeekly} valueKey="earnings" color="#ffb24d" />
              <ChartPanel title="Monthly earnings" data={analytics.earningsMonthly} valueKey="earnings" color="#ffc86b" />
              <ChartPanel title="Work completed" data={analytics.workCompletedDaily} valueKey="workCount" color="#ff8f1f" />
            </div>
          </GlassCard>

          <div className="grid gap-4">
            <GlassCard>
              <SectionTag icon={<Rocket className="h-4 w-4" />} label="Revenue Forecasting" />
              <div className="mt-4 grid gap-3 text-sm">
                <MetricCard label="Current pace" value={`$${state.currentPace.toFixed(2)}/task`} helper="Rolling average per task" />
                {state.forecast.map((entry) => (
                  <div key={entry.label} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <span className="text-slate-300">{entry.label}</span>
                    <span className="font-semibold text-white">${entry.value.toFixed(2)}</span>
                  </div>
                ))}
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-slate-300">
                  If you log 15 videos/day, you would earn <span className="font-semibold text-white">$18.75/day</span> and <span className="font-semibold text-white">$562.50/month</span>.
                </div>
              </div>
            </GlassCard>

            <GlassCard>
              <SectionTag icon={<Flame className="h-4 w-4" />} label="Motivation Engine" />
              <div className="mt-4 rounded-[24px] border border-greenGlow/20 bg-gradient-to-br from-greenGlow/10 to-emerald-400/10 p-5 text-lg leading-relaxed text-white">{state.motivationalMessage}</div>
            </GlassCard>
          </div>
        </section>

        <section className={`${activeTab === 'wins' ? '' : 'hidden'} mt-4 grid gap-4 xl:grid-cols-[1fr_0.9fr]`}>
          <GlassCard className="flex max-h-[calc(100vh-16rem)] flex-col overflow-hidden">
            <SectionTag icon={<Zap className="h-4 w-4" />} label="Recent Wins" />
            <div className="mt-4 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 overscroll-contain">
              <AnimatePresence initial={false}>
                {state.recentWins.map((win) => (
                  <motion.div
                    key={win.id}
                    variants={winCardVariants}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ amount: 0.4, once: true }}
                    exit={{ opacity: 0, y: -10 }}
                    whileHover={settings.reducedMotion ? undefined : { y: -2, scale: 1.01 }}
                    className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-white">{win.title}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.3em] text-slate-400">{new Date(win.timestamp).toLocaleString()}</div>
                        {win.link ? (
                          <a href={win.link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-emerald-200 transition hover:text-emerald-100">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Open item
                          </a>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <motion.div
                          key={win.amount.toFixed(2)}
                          initial={{ opacity: 0, y: 8, scale: 0.96 }}
                          className="inline-flex items-center gap-2 font-semibold text-emerald-300"
                        >
                          <Coins className="h-4 w-4 text-emerald-300" />
                          +${win.amount.toFixed(2)}
                        </motion.div>
                        <div className="mt-3 flex items-center justify-end gap-3">
                          <div className="text-xs text-slate-400">Goal {win.progressFrom.toFixed(1)}% → {win.progressTo.toFixed(1)}%</div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </GlassCard>

          <GlassCard>
            <SectionTag icon={<Flame className="h-4 w-4" />} label="Motivation Engine" />
            <div className="mt-4 rounded-[24px] border border-greenGlow/20 bg-gradient-to-br from-greenGlow/10 to-emerald-400/10 p-5 text-lg leading-relaxed text-white">{state.motivationalMessage}</div>
          </GlassCard>
        </section>

        <section className={`${activeTab === 'goals' ? '' : 'hidden'} mt-4 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]`}>
          <GlassCard className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <SectionTag icon={<Target className="h-4 w-4" />} label="Goal Studio" />
              <button type="button" onClick={() => openGoalPopup()} className="inline-flex items-center gap-2 rounded-full border border-greenGlow/30 bg-greenGlow/10 px-4 py-2 text-sm font-medium text-green-100 transition hover:border-greenGlow/50">
                <Plus className="h-4 w-4" />
                Custom
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <MetricCard label="Goal" value={`$${state.cashGoal.toFixed(0)}`} icon={<Coins className="h-4 w-4" />} valueClassName="text-emerald-300" />
              <MetricCard label="Daily" value={`${state.dailyTarget}`} icon={<Target className="h-4 w-4" />} valueClassName="text-emerald-200" />
              <MetricCard label="Active" value={activeGoalTemplate ? activeGoalTemplate.name : 'Custom'} icon={<Sparkles className="h-4 w-4" />} valueClassName="text-emerald-200" />
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              {goalTemplates.map((template) => {
                const active = template.cashGoal === state.cashGoal && template.dailyTarget === state.dailyTarget;
                return (
                  <motion.button
                    key={template.id}
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.99 }}
                    type="button"
                    onClick={() => openGoalDetail(template)}
                    className={`rounded-2xl border p-4 text-left transition ${active ? 'border-emerald-300/40 bg-emerald-300/10' : 'border-white/10 bg-black/20 hover:border-white/20'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className={`flex h-9 w-9 items-center justify-center rounded-xl border ${active ? 'border-emerald-300/30 bg-emerald-300/15 text-emerald-200' : 'border-white/10 bg-white/5 text-slate-300'}`}>
                          <Target className="h-4 w-4" />
                        </span>
                        <div>
                          <div className="text-sm font-semibold text-white">{template.name}</div>
                          <div className="text-xs uppercase tracking-[0.28em] text-slate-400">{template.kind === 'builtin' ? 'Preset' : 'Saved'}</div>
                        </div>
                      </div>
                      <div className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.35em] ${active ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/5 text-slate-300'}`}>
                        {active ? 'Active now' : 'Not active'}
                      </div>
                    </div>
                    <div className="mt-3 text-sm text-slate-300">{template.description}</div>
                  </motion.button>
                );
              })}
            </div>
          </GlassCard>

          <GlassCard className="space-y-4">
            <SectionTag icon={<Sparkles className="h-4 w-4" />} label="Quick Info" />
            <div className="grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Active</div>
                <div className="mt-2 text-xl font-semibold text-white">{activeGoalTemplate ? activeGoalTemplate.name : 'Custom values'}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Cash</div>
                <div className="mt-2 text-xl font-semibold text-emerald-300">${state.cashGoal.toFixed(0)}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Per day</div>
                <div className="mt-2 text-xl font-semibold text-emerald-300">{state.dailyTarget}</div>
              </div>
            </div>
          </GlassCard>
        </section>

        <section className={`${activeTab === 'settings' ? '' : 'hidden'} mt-4 grid gap-4 xl:grid-cols-[1fr_0.9fr]`}>
          <GlassCard>
            <SectionTag icon={<Trophy className="h-4 w-4" />} label="Settings" />
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setSettings((current) => ({ ...current, theme: 'light' }))}
                className={`rounded-3xl border p-4 text-left transition ${settings.theme === 'light' ? 'border-emerald-300/40 bg-emerald-300/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${settings.theme === 'light' ? 'border-emerald-300/30 bg-emerald-300/15 text-emerald-200' : 'border-white/10 bg-white/5 text-slate-300'}`}>
                    <SunMedium className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-white">Light mode</div>
                    <div className="mt-1 text-sm text-slate-300">Bright surfaces and softer contrast.</div>
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setSettings((current) => ({ ...current, theme: 'dark' }))}
                className={`rounded-3xl border p-4 text-left transition ${settings.theme === 'dark' ? 'border-emerald-300/40 bg-emerald-300/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}
              >
                <div className="flex items-center gap-3">
                  <span className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${settings.theme === 'dark' ? 'border-emerald-300/30 bg-emerald-300/15 text-emerald-200' : 'border-white/10 bg-white/5 text-slate-300'}`}>
                    <MoonStar className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-white">Dark mode</div>
                    <div className="mt-1 text-sm text-slate-300">Keeps the original studio look.</div>
                  </div>
                </div>
              </button>
            </div>

            <div className="grid gap-3">
              <ToggleSetting
                icon={<LayoutGrid className="h-4 w-4" />}
                title="Compact layout"
                description="Reduces card padding and tightens the dashboard density."
                checked={settings.compactMode}
                onToggle={() => setSettings((current) => ({ ...current, compactMode: !current.compactMode }))}
              />
              <ToggleSetting
                icon={<SlidersHorizontal className="h-4 w-4" />}
                title="Reduced motion"
                description="Minimizes hover transitions and visual motion across the UI."
                checked={settings.reducedMotion}
                onToggle={() => setSettings((current) => ({ ...current, reducedMotion: !current.reducedMotion }))}
              />
            </div>
          </GlassCard>

          <div className="space-y-4">
            <GlassCard className="space-y-4">
              <SectionTag icon={<Bell className="h-4 w-4" />} label="Quick Summary" />
              <div className="grid gap-3">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Theme</div>
                  <div className="mt-2 text-xl font-semibold text-white">{settings.theme === 'light' ? 'Light' : 'Dark'}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Density</div>
                  <div className="mt-2 text-xl font-semibold text-white">{settings.compactMode ? 'Compact' : 'Comfortable'}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Motion</div>
                  <div className="mt-2 text-xl font-semibold text-white">{settings.reducedMotion ? 'Reduced' : 'Full'}</div>
                </div>
              </div>
              <div className="rounded-[24px] border border-greenGlow/20 bg-gradient-to-br from-greenGlow/10 to-emerald-400/10 p-5 text-sm leading-relaxed text-white">
                The settings page now controls the app theme, layout behavior, and motion preferences from one place.
              </div>
              <button
                type="button"
                onClick={resetAppearanceDefaults}
                className="inline-flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:text-white"
              >
                <Gauge className="h-4 w-4" />
                Reset appearance defaults
              </button>
            </GlassCard>

          </div>
        </section>
      </div>

      <AnimatePresence>
        {isGoalDetailOpen && selectedGoalTemplate ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md" onClick={closeGoalDetail}>
            <motion.div
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
              onClick={(event) => event.stopPropagation()}
              className="surface-modal w-full max-w-2xl rounded-[30px] border border-white/10 bg-[#08111f] p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-emerald-100">
                    <Sparkles className="h-3.5 w-3.5" />
                    Goal details
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold text-white">{selectedGoalTemplate.name}</h2>
                  <p className="mt-2 text-sm text-slate-300">{selectedGoalTemplate.description}</p>
                </div>
                <button type="button" onClick={closeGoalDetail} className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-white/20 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Cash goal</div>
                  <div className="mt-2 text-3xl font-semibold text-emerald-300">${selectedGoalTemplate.cashGoal.toFixed(0)}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                  <div className="text-xs uppercase tracking-[0.35em] text-slate-400">Daily target</div>
                  <div className="mt-2 text-3xl font-semibold text-emerald-300">{selectedGoalTemplate.dailyTarget}</div>
                </div>
              </div>

              <div className="mt-4 flex items-center gap-2 text-sm text-slate-300">
                <span className={`inline-flex h-2.5 w-2.5 rounded-full ${activeGoalTemplate?.id === selectedGoalTemplate.id ? 'bg-emerald-300' : 'bg-slate-500'}`} />
                {activeGoalTemplate?.id === selectedGoalTemplate.id ? 'Active now' : 'Not active'}
                <span className="text-slate-500">•</span>
                {selectedGoalTemplate.kind === 'builtin' ? 'Preset' : 'Saved'}
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-300">
                {selectedGoalTemplate.description}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                <button type="button" onClick={closeGoalDetail} className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:text-white">
                  Close
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await applyTemplate(selectedGoalTemplate.id);
                    closeGoalDetail();
                  }}
                  className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-5 py-2.5 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400/40 hover:bg-emerald-400/15"
                >
                  Apply goal
                </button>
                <button type="button" onClick={() => openGoalPopup(selectedGoalTemplate)} className="rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110">
                  Edit or save as custom
                </button>
                {selectedGoalTemplate.kind === 'custom' ? (
                  <button type="button" onClick={() => void deleteTemplate(selectedGoalTemplate.id)} className="rounded-full border border-red-400/20 bg-red-400/10 px-5 py-2.5 text-sm font-semibold text-red-100 transition hover:border-red-400/40 hover:bg-red-400/15">
                    Delete
                  </button>
                ) : null}
              </div>
            </motion.div>
          </motion.div>
        ) : null}

        {isGoalPopupOpen ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md" onClick={() => setIsGoalPopupOpen(false)}>
            <motion.form
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
              onSubmit={(event) => {
                event.preventDefault();
                void applyGoalValues();
              }}
              onClick={(event) => event.stopPropagation()}
              className="surface-modal w-full max-w-lg rounded-[30px] border border-white/10 bg-[#08111f] p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-emerald-100">
                    <Target className="h-3.5 w-3.5" />
                    Goal setup
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold text-white">Create a custom goal</h2>
                  <p className="mt-2 text-sm text-slate-300">Use this to change your live target or save a reusable template.</p>
                </div>
                <button type="button" onClick={() => setIsGoalPopupOpen(false)} className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-white/20 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 grid gap-4">
                <label className="grid gap-2 text-sm text-slate-200">
                  Goal name
                  <input value={goalForm.name} onChange={(event) => setGoalForm((current) => ({ ...current, name: event.target.value }))} placeholder="Big March Push" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-greenGlow/40" />
                </label>

                <label className="grid gap-2 text-sm text-slate-200">
                  Notes
                  <input value={goalForm.description} onChange={(event) => setGoalForm((current) => ({ ...current, description: event.target.value }))} placeholder="A focused 2-week run with higher output." className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-greenGlow/40" />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm text-slate-200">
                    Cash goal
                    <input value={goalForm.cashGoal} onChange={(event) => setGoalForm((current) => ({ ...current, cashGoal: event.target.value }))} placeholder="300" type="number" min="0" step="0.01" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-greenGlow/40" />
                  </label>

                  <label className="grid gap-2 text-sm text-slate-200">
                    Daily target
                    <input value={goalForm.dailyTarget} onChange={(event) => setGoalForm((current) => ({ ...current, dailyTarget: event.target.value }))} placeholder="10" type="number" min="0" step="1" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-greenGlow/40" />
                  </label>
                </div>
              </div>

              {goalError ? <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{goalError}</div> : null}

              <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                <button type="button" onClick={() => setIsGoalPopupOpen(false)} className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:text-white">
                  Cancel
                </button>
                <button type="button" disabled={isSubmitting} onClick={() => void saveGoalTemplate()} className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-5 py-2.5 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400/40 hover:bg-emerald-400/15 disabled:cursor-not-allowed disabled:opacity-70">
                  {isSubmitting ? 'Saving...' : 'Save as template'}
                </button>
                <button type="submit" disabled={isSubmitting} className="rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70">
                  {isSubmitting ? 'Applying...' : 'Apply goal'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isLogPopupOpen ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md" onClick={() => setIsLogPopupOpen(false)}>
            <motion.form
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
              onSubmit={(event) => void submitCustomLog(event)}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-lg rounded-[30px] border border-white/10 bg-[#08111f] p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-greenGlow/20 bg-greenGlow/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-green-100">
                    <Link2 className="h-3.5 w-3.5" />
                    Add item
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold text-white">Log the item you made</h2>
                  <p className="mt-2 text-sm text-slate-300">Add the name, the link, and the price you got paid.</p>
                </div>
                <button type="button" onClick={() => setIsLogPopupOpen(false)} className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-white/20 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 grid gap-4">
                <label className="grid gap-2 text-sm text-slate-200">
                  Type
                  <select value={logForm.type} onChange={(event) => setLogForm((current) => ({ ...current, type: event.target.value as WorkType }))} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-greenGlow/40">
                    {Object.entries(WORK_TYPES).map(([key, value]) => (
                      <option key={key} value={key} className="bg-[#08111f]">
                        {value.icon} {value.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm text-slate-200">
                  Name
                  <input value={logForm.name} onChange={(event) => setLogForm((current) => ({ ...current, name: event.target.value }))} placeholder="Instagram carousel, promo video, landing page..." className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-greenGlow/40" />
                </label>

                <label className="grid gap-2 text-sm text-slate-200">
                  Link
                  <input value={logForm.link} onChange={(event) => setLogForm((current) => ({ ...current, link: event.target.value }))} placeholder="https://..." type="url" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-greenGlow/40" />
                </label>

                <label className="grid gap-2 text-sm text-slate-200">
                  Price got
                  <input value={logForm.price} onChange={(event) => setLogForm((current) => ({ ...current, price: event.target.value }))} placeholder="1.25" type="number" min="0" step="0.01" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-greenGlow/40" />
                </label>
              </div>

              {logError ? <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-100">{logError}</div> : null}

              <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                <button type="button" onClick={() => setIsLogPopupOpen(false)} className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:text-white">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="rounded-full bg-gradient-to-r from-emerald-400 to-lime-300 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70">
                  {isSubmitting ? 'Saving...' : 'Save item'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {isResetPopupOpen ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6 backdrop-blur-md" onClick={() => setIsResetPopupOpen(false)}>
            <motion.form
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 220, damping: 24 }}
              onSubmit={(event) => void submitResetEverything(event)}
              onClick={(event) => event.stopPropagation()}
              className="surface-modal surface-modal-danger w-full max-w-lg rounded-[30px] border border-red-400/20 bg-[#12070b] p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-green-400/20 bg-green-400/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-green-100">
                    Reset
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold text-white">Reset everything</h2>
                  <p className="mt-2 text-sm text-slate-300">This clears all logs, wins, stats, achievements, and progress, then starts fresh.</p>
                </div>
                <button type="button" onClick={() => setIsResetPopupOpen(false)} className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:border-white/20 hover:text-white">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 grid gap-4">
                <label className="grid gap-2 text-sm text-slate-200">
                  Type RESET to confirm
                  <input value={resetConfirmText} onChange={(event) => setResetConfirmText(event.target.value)} placeholder="RESET" className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-green-400/40" />
                </label>
              </div>

              {resetError ? <div className="mt-4 rounded-2xl border border-green-400/20 bg-green-400/10 px-4 py-3 text-sm text-green-100">{resetError}</div> : null}

              <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
                <button type="button" onClick={() => setIsResetPopupOpen(false)} className="rounded-full border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-medium text-slate-200 transition hover:border-white/20 hover:text-white">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="rounded-full bg-gradient-to-r from-emerald-500 to-lime-400 px-5 py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70">
                  {isSubmitting ? 'Resetting...' : 'Reset everything'}
                </button>
              </div>
            </motion.form>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function TaskFlowMark({ size = 'md', showWordmark = true }: { size?: 'md' | 'xl'; showWordmark?: boolean }) {
  const dimensions = size === 'xl' ? 'h-44 w-44' : 'h-14 w-14';
  const wordmarkSize = size === 'xl' ? 'text-4xl' : 'text-xl';

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="0 0 512 512"
        aria-hidden="true"
        className={`${dimensions} select-none drop-shadow-[0_14px_28px_rgba(0,0,0,0.24)]`}
      >
        <defs>
          <linearGradient id="taskflowMarkBg" x1="82" y1="72" x2="430" y2="432" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1fd26b" />
            <stop offset="100%" stopColor="#0ea84f" />
          </linearGradient>
          <linearGradient id="taskflowMarkSheen" x1="120" y1="112" x2="410" y2="390" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.04" />
          </linearGradient>
        </defs>
        <rect x="40" y="40" width="432" height="432" rx="88" fill="url(#taskflowMarkBg)" />
        <rect x="40" y="40" width="432" height="432" rx="88" fill="url(#taskflowMarkSheen)" />
        <path d="M138 351V161C138 145 151 132 167 132H238C274 132 303 160 303 195C303 229 277 257 243 260H205L300 351" stroke="#f7fff9" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M215 260L320 351L406 187" stroke="#f7fff9" strokeWidth="34" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M187 187H240" stroke="#f7fff9" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.92" />
        <circle cx="360" cy="164" r="34" stroke="#f7fff9" strokeWidth="18" fill="none" />
        <path d="M360 146V126" stroke="#f7fff9" strokeWidth="14" strokeLinecap="round" />
        <path d="M360 164L374 176" stroke="#f7fff9" strokeWidth="14" strokeLinecap="round" />
      </svg>
      {showWordmark ? <div className={`mt-3 font-semibold tracking-[0.2em] text-green-400 ${wordmarkSize}`}>RYO TRACK</div> : null}
    </div>
  );
}

function GlassCard({ children, className = '', onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) {
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`glass-card rounded-[32px] border border-white/10 bg-panel/80 p-5 text-left shadow-glass backdrop-blur-xl ${className}`}>
        {children}
      </button>
    );
  }

  return <div className={`glass-card rounded-[32px] border border-white/10 bg-panel/80 p-5 shadow-glass backdrop-blur-xl ${className}`}>{children}</div>;
}

function SectionTag({ icon, label }: { icon: React.ReactNode; label: string }) {
  return <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.3em] text-slate-300">{icon}{label}</div>;
}

function StatChip({ label, value, accent, icon }: { label: string; value: string; accent: 'money' | 'amber' | 'orange' | 'gold'; icon?: React.ReactNode }) {
  const accentClass = accent === 'money' ? 'text-emerald-300' : accent === 'amber' ? 'text-emerald-300' : accent === 'orange' ? 'text-emerald-300' : 'text-lime-300';
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.32em] text-slate-400">{label}</div>
      <div className={`mt-1 flex items-center gap-2 text-xl font-semibold ${accentClass}`}>
        {icon ? <span className="shrink-0">{icon}</span> : null}
        <motion.span key={value} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 180, damping: 16 }}>
          {value}
        </motion.span>
      </div>
    </div>
  );
}

function MetricCard({ label, value, helper, icon, valueClassName = 'text-white', onClick, dense = false }: { label: string; value: string; helper?: string; icon?: React.ReactNode; valueClassName?: string; onClick?: () => void; dense?: boolean }) {
  const cardClassName = `flex min-h-[${dense ? '116px' : '132px'}] flex-col rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition ${onClick ? 'cursor-pointer hover:border-greenGlow/40 hover:bg-white/7' : ''}`;
  const iconBadgeClassName = `inline-flex shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300 ${dense ? 'h-8 w-8' : 'h-9 w-9'}`;
  const valueRowClassName = `mt-2 flex items-center gap-3 ${dense ? 'items-center' : 'items-start'}`;
  return (
    <>
      {onClick ? (
        <button type="button" onClick={onClick} className={cardClassName}>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">{label}</div>
          <div className={valueRowClassName}>
            {icon ? <span className={iconBadgeClassName}>{icon}</span> : null}
            <div className={`min-w-0 flex-1 text-[clamp(1.05rem,1.55vw,1.55rem)] font-semibold leading-tight tracking-tight ${valueClassName}`}>
              <motion.span key={value} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 180, damping: 16 }} className="block break-words">
                {value}
              </motion.span>
            </div>
          </div>
          {helper ? <div className="mt-1 text-sm text-slate-300">{helper}</div> : null}
        </button>
      ) : (
        <div className={cardClassName}>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-400">{label}</div>
          <div className="mt-2 flex items-start gap-3">
            {icon ? <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-emerald-400/20 bg-emerald-400/10 text-emerald-300">{icon}</span> : null}
            <div className={`min-w-0 flex-1 text-[clamp(1.05rem,1.55vw,1.55rem)] font-semibold leading-tight tracking-tight ${valueClassName}`}>
              <motion.span key={value} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 180, damping: 16 }} className="block break-words">
                {value}
              </motion.span>
            </div>
          </div>
          {helper ? <div className="mt-1 text-sm text-slate-300">{helper}</div> : null}
        </div>
      )}
    </>
  );
}

function GlassBadge({ title, value, highlight }: { title: string; value: string; highlight: string }) {
  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
      <div className="text-xs uppercase tracking-[0.3em] text-slate-400">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
      <div className="mt-3 inline-flex rounded-full border border-greenGlow/30 bg-greenGlow/10 px-3 py-1 text-xs uppercase tracking-[0.3em] text-green-100">{highlight}</div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/10 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.28em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs uppercase tracking-[0.25em] text-slate-200">{children}</span>;
}

function ChartPanel({ title, data, valueKey, color }: { title: string; data: Array<Record<string, number | string>>; valueKey: string; color: string }) {
  const gradientId = `${title.replace(/\s+/g, '')}Bars`;
  const chartData = buildChartSeries(data, valueKey).map((entry) => ({
    ...entry,
    value: Math.max(0, entry.value)
  }));
  const chartValues = chartData.map((entry) => entry.value);
  const maxValue = Math.max(1, ...chartValues);
  const minValue = 0;

  return (
    <div className="rounded-[24px] border border-white/10 bg-black/20 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
      <div className="mb-3 text-sm uppercase tracking-[0.28em] text-slate-400">{title}</div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 12, right: 12, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.9} />
                <stop offset="100%" stopColor={color} stopOpacity={0.45} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.08)" vertical={false} />
            <XAxis
              dataKey="date"
              stroke="#8795b3"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: 'rgba(135,149,179,0.45)' }}
              minTickGap={24}
            />
            <YAxis
              stroke="#8795b3"
              fontSize={11}
              tickLine={false}
              axisLine={{ stroke: 'rgba(135,149,179,0.45)' }}
              width={34}
              domain={[minValue, maxValue]}
            />
            <Tooltip
              cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
              contentStyle={{
                background: '#0b1220',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 16,
                color: '#fff',
                boxShadow: '0 18px 50px rgba(0,0,0,0.35)'
              }}
              labelStyle={{ color: '#c9d4ea' }}
              itemStyle={{ color: '#fff' }}
            />
            <Bar
              dataKey="value"
              fill={`url(#${gradientId})`}
              radius={[10, 10, 0, 0]}
              maxBarSize={36}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ToggleSetting({ icon, title, description, checked, onToggle }: { icon: React.ReactNode; title: string; description: string; checked: boolean; onToggle: () => void }) {
  return (
    <button type="button" onClick={onToggle} className={`flex items-center justify-between gap-4 rounded-3xl border p-4 text-left transition ${checked ? 'border-emerald-300/40 bg-emerald-300/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${checked ? 'border-emerald-300/30 bg-emerald-300/15 text-emerald-200' : 'border-white/10 bg-white/5 text-slate-300'}`}>
          {icon}
        </span>
        <div>
          <div className="text-sm font-semibold text-white">{title}</div>
          <div className="mt-1 max-w-xl text-sm text-slate-300">{description}</div>
        </div>
      </div>
      <div className={`flex h-7 w-12 shrink-0 items-center rounded-full border px-1 transition ${checked ? 'justify-end border-emerald-300/40 bg-emerald-300/20' : 'justify-start border-white/10 bg-white/10'}`}>
        <span className={`h-5 w-5 rounded-full transition ${checked ? 'bg-white' : 'bg-slate-300'}`} />
      </div>
    </button>
  );
}
