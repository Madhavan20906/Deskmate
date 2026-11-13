export interface ProductivityTask {
  id: string;
  status: string;
  completedAt: number | null;
}

export interface ProductivitySession {
  id: string;
  startedAt: number;
  endedAt: number;
  actualDurationMs: number;
  status: 'completed' | 'stopped' | 'active';
}

export interface DailyProductivityPoint {
  dateKey: string;
  label: string;
  completedTasks: number;
  focusMinutes: number;
}

export interface GardenMilestone {
  name: string;
  points: number;
  earnedAt: number;
}

export interface JarDayHistory {
  dateKey: string;
  label: string;
  tokens: number;
  completedTasks: number;
}

export interface ProductivityInsights {
  completedTasks: number;
  totalTasks: number;
  completionRate: number;
  gardenPoints: number;
  gardenStage: string;
  gardenProgress: number;
  nextMilestone: string;
  nextMilestonePoints: number | null;
  streakDays: number;
  earnedMilestones: GardenMilestone[];
  days: DailyProductivityPoint[];
  weeklyCompletedTasks: number;
  weeklyFocusMinutes: number;
  weeklyChange: 'up' | 'steady' | 'down';
  todayJarTokens: number;
  todayJarGoal: number;
  weekJarHistory: JarDayHistory[];
  welcomeBackLine: string;
}

const GARDEN_MILESTONES = [
  { name: 'Sprout', points: 20 },
  { name: 'Sapling', points: 100 },
  { name: 'Bloom', points: 250 },
  { name: 'Canopy', points: 500 },
] as const;

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function localDayOffset(now: Date, offset: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
}

function formatLocalDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function calculateProductivityInsights(
  tasks: ProductivityTask[],
  sessions: ProductivitySession[],
  nowTimestamp = Date.now(),
): ProductivityInsights {
  const now = new Date(nowTimestamp);
  const validTasks = tasks.filter((task) => task !== null && task !== undefined);
  const completedTasks = validTasks.filter((task) => task.status === 'completed').length;
  const totalTasks = validTasks.length;
  const taskEvents = validTasks.flatMap((task) =>
    typeof task.completedAt === 'number' && Number.isFinite(task.completedAt)
      ? [{ kind: 'task' as const, at: task.completedAt }]
      : [],
  );
  const validSessions = sessions.filter((session) =>
    session !== null && session !== undefined &&
    Number.isFinite(session.startedAt) && Number.isFinite(session.endedAt) &&
    Number.isFinite(session.actualDurationMs) && session.actualDurationMs >= 0,
  );
  const earnedEvents = [
    ...taskEvents.map((event) => ({ ...event, points: 20 })),
    ...validSessions
      .filter((session) => session.status === 'completed' && session.actualDurationMs >= 5 * 60_000)
      .map((session) => ({ kind: 'focus' as const, at: session.endedAt, points: 10 })),
  ].sort((first, second) => first.at - second.at);
  const gardenPoints = earnedEvents.reduce((total, event) => total + event.points, 0);
  const stage = [...GARDEN_MILESTONES].reverse().find((milestone) => gardenPoints >= milestone.points);
  const next = GARDEN_MILESTONES.find((milestone) => gardenPoints < milestone.points);
  const priorThreshold = stage?.points ?? 0;
  const gardenProgress = next === undefined
    ? 1
    : Math.max(0, Math.min(1, (gardenPoints - priorThreshold) / (next.points - priorThreshold)));
  let earnedPoints = 0;
  const earnedMilestones: GardenMilestone[] = [];
  for (const event of earnedEvents) {
    earnedPoints += event.points;
    for (const milestone of GARDEN_MILESTONES) {
      if (
        earnedPoints >= milestone.points &&
        !earnedMilestones.some((earned) => earned.name === milestone.name)
      ) {
        earnedMilestones.push({ ...milestone, earnedAt: event.at });
      }
    }
  }

  const activityDays = new Set<string>();
  for (const event of taskEvents) activityDays.add(localDateKey(event.at));
  for (const session of validSessions) {
    if (session.actualDurationMs >= 5 * 60_000) activityDays.add(localDateKey(session.endedAt));
  }
  let streakDays = 0;
  let streakOffset = 0;
  if (!activityDays.has(formatLocalDateKey(localDayOffset(now, 0)))) streakOffset = -1;
  for (let offset = streakOffset; activityDays.has(formatLocalDateKey(localDayOffset(now, offset))); offset -= 1) {
    streakDays += 1;
  }

  const byDay = new Map<string, DailyProductivityPoint>();
  for (let offset = -13; offset <= 0; offset += 1) {
    const date = localDayOffset(now, offset);
    const dateKey = formatLocalDateKey(date);
    byDay.set(dateKey, {
      dateKey,
      label: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date).toUpperCase(),
      completedTasks: 0,
      focusMinutes: 0,
    });
  }
  for (const task of validTasks) {
    if (task.completedAt === null || !Number.isFinite(task.completedAt)) continue;
    const point = byDay.get(localDateKey(task.completedAt));
    if (point !== undefined) point.completedTasks += 1;
  }
  for (const session of validSessions) {
    const point = byDay.get(localDateKey(session.startedAt));
    if (point !== undefined) point.focusMinutes += session.actualDurationMs / 60_000;
  }
  const days = Array.from(byDay.values()).slice(-7).map((point) => ({
    ...point,
    focusMinutes: Math.round(point.focusMinutes),
  }));
  const weeklyCompletedTasks = days.reduce((total, point) => total + point.completedTasks, 0);
  const weeklyFocusMinutes = days.reduce((total, point) => total + point.focusMinutes, 0);
  const currentWeekScore = weeklyCompletedTasks * 20 + weeklyFocusMinutes;
  const previousDays = Array.from(byDay.values()).slice(0, 7);
  const previousWeekScore = previousDays.reduce(
    (total, point) => total + point.completedTasks * 20 + Math.round(point.focusMinutes),
    0,
  );
  const weeklyChange = currentWeekScore > previousWeekScore
    ? 'up'
    : currentWeekScore < previousWeekScore
      ? 'down'
      : 'steady';

  const todayKey = formatLocalDateKey(localDayOffset(now, 0));
  const todayPoint = byDay.get(todayKey);
  const todayJarTokens = Math.floor((todayPoint?.focusMinutes ?? 0) / 25) + (todayPoint?.completedTasks ?? 0);
  const todayJarGoal = 4; // 4 focus tokens standard goal

  const weekJarHistory: JarDayHistory[] = days.map((day) => ({
    dateKey: day.dateKey,
    label: day.label,
    tokens: Math.floor(day.focusMinutes / 25) + day.completedTasks,
    completedTasks: day.completedTasks,
  }));

  const welcomeBackLine = streakDays > 1
    ? `Welcome back! ${streakDays}-day streak active - let's fill today's jar!`
    : streakDays === 1
      ? "Welcome back! Yesterday's momentum is yours - let's grow today's garden!"
      : "Welcome back! A fresh day awaits - start a sprint to plant your first seed.";

  return {
    completedTasks,
    totalTasks,
    completionRate: totalTasks === 0 ? 0 : completedTasks / totalTasks,
    gardenPoints,
    gardenStage: stage?.name ?? 'Seed',
    gardenProgress,
    nextMilestone: next?.name ?? 'Canopy grown',
    nextMilestonePoints: next?.points ?? null,
    streakDays,
    earnedMilestones,
    days,
    weeklyCompletedTasks,
    weeklyFocusMinutes,
    weeklyChange,
    todayJarTokens,
    todayJarGoal,
    weekJarHistory,
    welcomeBackLine,
  };
}
