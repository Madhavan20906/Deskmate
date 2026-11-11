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

export interface PlantVariant {
  daysRequired: number;
  name: string;
  description: string;
  colorHex: string;
  isUnlocked: boolean;
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
  restLeaves: number;
  streakFrozen: boolean;
  unlockedVariants: PlantVariant[];
  earnedMilestones: GardenMilestone[];
  days: DailyProductivityPoint[];
  weeklyCompletedTasks: number;
  weeklyFocusMinutes: number;
  weeklyChange: 'up' | 'steady' | 'down';
  weeklySummary: string;
}

const GARDEN_MILESTONES = [
  { name: 'Sprout', points: 20 },
  { name: 'Sapling', points: 100 },
  { name: 'Bloom', points: 250 },
  { name: 'Canopy', points: 500 },
] as const;

export const PLANT_VARIANTS: Omit<PlantVariant, 'isUnlocked'>[] = [
  {
    daysRequired: 3,
    name: 'Morning Clover',
    description: 'A cheerful three-leaf clover that sparkles in the morning light.',
    colorHex: '#53cbb5',
  },
  {
    daysRequired: 7,
    name: 'Jade Bonsai',
    description: 'Resilient and grounded, symbolising 7 days of steady calm.',
    colorHex: '#48b88f',
  },
  {
    daysRequired: 14,
    name: 'Amber Fern',
    description: 'Warm and golden fronds celebrating 2 weeks of sustained deep work.',
    colorHex: '#f4a261',
  },
  {
    daysRequired: 30,
    name: 'Celestial Orchid',
    description: 'Rare and ethereal blossom crowned for a full month of mindful habit.',
    colorHex: '#a084dc',
  },
];

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
  existingRestLeaves = 1,
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
  const validSessions = sessions.filter(
    (session) =>
      session !== null &&
      session !== undefined &&
      Number.isFinite(session.startedAt) &&
      Number.isFinite(session.endedAt) &&
      Number.isFinite(session.actualDurationMs) &&
      session.actualDurationMs >= 0,
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

  // Forgiving streak calculation:
  // If user worked today: streak counts backwards consecutively.
  // If user didn't work today yet: checks yesterday.
  // If 1 day was missed, consumes a "rest leaf" to freeze the streak instead of resetting to 0!
  let streakDays = 0;
  let streakOffset = 0;
  let restLeaves = existingRestLeaves;
  let streakFrozen = false;

  const todayKey = formatLocalDateKey(localDayOffset(now, 0));
  const yesterdayKey = formatLocalDateKey(localDayOffset(now, -1));

  if (!activityDays.has(todayKey)) {
    if (activityDays.has(yesterdayKey)) {
      streakOffset = -1;
    } else if (restLeaves > 0) {
      // Forgive missed day with rest leaf
      restLeaves -= 1;
      streakFrozen = true;
      streakOffset = -2;
    } else {
      streakOffset = -1;
    }
  }

  let graceUsed = false;
  for (let offset = streakOffset; offset >= -60; offset -= 1) {
    const key = formatLocalDateKey(localDayOffset(now, offset));
    if (activityDays.has(key)) {
      streakDays += 1;
    } else if (!graceUsed && restLeaves > 0) {
      // 1 missed rest day allowed in history
      graceUsed = true;
      restLeaves -= 1;
      streakFrozen = true;
    } else {
      break;
    }
  }

  // If there are activity days but streak was 0, grant 1 if there's any active task today
  if (streakDays === 0 && activityDays.has(todayKey)) {
    streakDays = 1;
  }

  // Unlocked plant variants based on streak
  const unlockedVariants: PlantVariant[] = PLANT_VARIANTS.map((v) => ({
    ...v,
    isUnlocked: streakDays >= v.daysRequired,
  }));

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

  const weeklySummary = `${weeklyCompletedTasks} tasks finished, ${weeklyFocusMinutes} focus minutes across 7 days. Garden is currently in ${stage?.name ?? 'Seed'} stage.`;

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
    restLeaves,
    streakFrozen,
    unlockedVariants,
    earnedMilestones,
    days,
    weeklyCompletedTasks,
    weeklyFocusMinutes,
    weeklyChange,
    weeklySummary,
  };
}
