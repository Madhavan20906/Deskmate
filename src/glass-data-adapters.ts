/**
 * DeskMate: Glass Command Center Data Adapters & Pure View-Model Logic
 *
 * Implements:
 * 1. Pure view-model functions (tasks to list rows, schedule blocks, workload donut,
 * garden progress, greeting, clock, now-marker, focus ring)
 * 2. Pure interaction logic (15m snapping, workday clamp, overlap resolution with push,
 * drag-drop target resolution, 5-step undo stack with 8s timer, arc layout transforms)
 * 3. Seed data mirroring the reference design.
 */

export const WORKDAY_START_MINUTE = 8 * 60; // 08:00 = 480
export const WORKDAY_END_MINUTE = 18 * 60; // 18:00 = 1080
export const WORKDAY_TOTAL_MINUTES = WORKDAY_END_MINUTE - WORKDAY_START_MINUTE; // 600 min (10 hours)
export const DAILY_CAPACITY_MINUTES = 8 * 60; // 480 min (8 hours)

export type PriorityLevel = 'high' | 'medium' | 'low';
export type TaskPriority = PriorityLevel;
export type TaskStatus = 'todo' | 'in_progress' | 'completed';

export interface GlassTask {
 id: string;
 title: string;
 priority: PriorityLevel;
 estimatedMinutes: number;
 scheduledStartMinute: number | null;
 status: TaskStatus;
 completedAt?: number | null;
 description?: string;
 dayNumber?: number; // 16..22 for November dates, defaults to 18
}

export interface TaskRowViewModel {
 id: string;
 title: string;
 priority: PriorityLevel;
 priorityLabel: string; // e.g. "High, 1h 30m"
 priorityColor: string; // e.g. "#EF4444"
 durationFormatted: string; // e.g. "1h 30m"
 isCompleted: boolean;
 scheduledTimeFormatted: string | null; // e.g. "09:00 - 10:30" or null
}

export interface ScheduleBlockViewModel {
 id: string;
 title: string;
 startMinute: number;
 endMinute: number;
 timeRangeFormatted: string; // e.g. "09:00 - 10:30"
 color: string;
 relativeLeftPercent: number; // 0..100% on 08:00 - 18:00
 widthPercent: number; // min 4.5% to preserve legibility
 priority: PriorityLevel;
}

export interface DonutSegment {
 label: string;
 minutes: number;
 percent: number;
 formatted: string;
 color: string;
}

export interface WorkloadDonutViewModel {
 percentage: number; // Scheduled % of 8h capacity, e.g. 63
 scheduledMinutes: number;
 scheduledFormatted: string; // "5h 0m"
 remainingCapacityMinutes: number;
 remainingFormatted: string; // "3h 0m"
 availableCapacityMinutes: number;
 availableFormatted: string; // "8h 0m"
 segments: DonutSegment[];
 isOverloaded: boolean;
}

export interface GardenProgressViewModel {
 level: number;
 stageName: string;
 points: number;
 progress: number; // 0.0 to 1.0
 progressPercent: number; // 0 to 100
 progressLabel: string; // "Keep it growing!"
 streakDays: number;
}

export interface GreetingViewModel {
 greeting: string;
 subtitle: string;
 period: 'morning' | 'afternoon' | 'evening' | 'night';
 userName: string;
}

export interface WeatherData {
 tempC: number;
 tempF: number;
 city: string;
 condition: string;
 isCelsius: boolean;
}

export interface CalendarDayViewModel {
 dayOfWeek: string;
 dayNumber: number;
 isSelected: boolean;
 isToday: boolean;
}

export interface AgendaItemViewModel {
 id: string;
 timeFormatted: string;
 title: string;
 category: 'assignment' | 'api' | 'meeting' | 'research' | 'health';
 isCompleted: boolean;
}

export interface RoutineItem {
 id: string;
 title: string;
 isCompleted: boolean;
}

export interface RoutineGroup {
 id: string;
 title: string;
 icon: string;
 completedCount: number;
 totalCount: number;
 items: RoutineItem[];
}

export interface HabitItem {
 id: string;
 title: string;
 icon: string;
 completedCount: number;
 totalDays: number;
 dots: boolean[];
}

export interface UpcomingDeadline {
 id: string;
 title: string;
 dateFormatted: string;
 icon: string;
 color: string;
}

export interface ClockViewModel {
 timeFormatted: string; // "10:24 AM"
 dateFormatted: string; // "Tue, Nov 18"
 minuteOfDay: number;
}

export interface NowMarkerViewModel {
 currentMinute: number;
 positionPercent: number; // 0 to 100
 isWithinWorkday: boolean;
 isPastWorkday: boolean;
 timeFormatted: string;
}

export interface FocusRingViewModel {
 remainingSeconds: number;
 totalSeconds: number;
 progress: number; // 0.0 to 1.0
 timeFormatted: string; // "25:00"
 mode: 'pomodoro' | 'short_break' | 'long_break';
 modeLabel: string; // "Pomodoro"
 isRunning: boolean;
}

export function getUserLocalTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
  } catch {
    return 'Asia/Kolkata';
  }
}

export function getCityFromTimezone(tz: string): string {
  if (!tz) return 'Local City';
  const parts = tz.split('/');
  const rawCity = parts[parts.length - 1] || 'City';
  return rawCity.replace(/_/g, ' ');
}

export function mapWeatherCodeToCondition(code: number): string {
  if (code === 0) return 'Clear Sky';
  if (code === 1 || code === 2) return 'Partly Cloudy';
  if (code === 3) return 'Overcast';
  if (code >= 45 && code <= 48) return 'Foggy';
  if (code >= 51 && code <= 55) return 'Drizzle';
  if (code >= 61 && code <= 65) return 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Rain Showers';
  if (code >= 95) return 'Thunderstorm';
  return 'Partly Cloudy';
}

export const SEED_WEATHER: WeatherData = {
  tempC: 28,
  tempF: 82,
  city: 'Chennai',
  condition: 'Partly Cloudy',
  isCelsius: true,
};

export const SEED_CALENDAR_DAYS: CalendarDayViewModel[] = [
 { dayOfWeek: 'Sun', dayNumber: 16, isSelected: false, isToday: false },
 { dayOfWeek: 'Mon', dayNumber: 17, isSelected: false, isToday: false },
 { dayOfWeek: 'Tue', dayNumber: 18, isSelected: true, isToday: true },
 { dayOfWeek: 'Wed', dayNumber: 19, isSelected: false, isToday: false },
 { dayOfWeek: 'Thu', dayNumber: 20, isSelected: false, isToday: false },
 { dayOfWeek: 'Fri', dayNumber: 21, isSelected: false, isToday: false },
 { dayOfWeek: 'Sat', dayNumber: 22, isSelected: false, isToday: false },
];

export const SEED_AGENDA_ITEMS: AgendaItemViewModel[] = [
 { id: 'agenda-1', timeFormatted: '9:00 AM', title: 'ML Assignment', category: 'assignment', isCompleted: true },
 { id: 'agenda-2', timeFormatted: '11:00 AM', title: 'Implement API', category: 'api', isCompleted: false },
 { id: 'agenda-3', timeFormatted: '2:00 PM', title: 'Team Meeting', category: 'meeting', isCompleted: false },
 { id: 'agenda-4', timeFormatted: '3:30 PM', title: 'Research Paper', category: 'research', isCompleted: false },
 { id: 'agenda-5', timeFormatted: '5:00 PM', title: 'Gym / Break', category: 'health', isCompleted: false },
];

export const SEED_ROUTINES: RoutineGroup[] = [
 {
 id: 'routine-morning',
 title: 'Morning Routine',
 icon: 'Sun ',
 completedCount: 3,
 totalCount: 3,
 items: [
 { id: 'm-1', title: 'Hydrate & 5m Stretch', isCompleted: true },
 { id: 'm-2', title: 'Review Top 3 Goals', isCompleted: true },
 { id: 'm-3', title: 'Deep Work Prep', isCompleted: true },
 ],
 },
 {
 id: 'routine-winddown',
 title: 'Wind-down Routine',
 icon: 'Moon',
 completedCount: 0,
 totalCount: 3,
 items: [
 { id: 'w-1', title: 'Clear Inbox & Tabs', isCompleted: false },
 { id: 'w-2', title: 'Log Daily Learnings', isCompleted: false },
 { id: 'w-3', title: 'Plan Tomorrow', isCompleted: false },
 ],
 },
];

export const SEED_HABITS: HabitItem[] = [
 { id: 'habit-plan', title: 'Plan my day', icon: '*', completedCount: 7, totalDays: 7, dots: [true, true, true, true, true, true, true] },
 { id: 'habit-focus', title: 'Focus (>=25m)', icon: '', completedCount: 6, totalDays: 7, dots: [true, true, true, true, true, true, false] },
 { id: 'habit-distraction', title: 'No distractions', icon: '*', completedCount: 5, totalDays: 7, dots: [true, true, true, true, true, false, false] },
];

export const SEED_DEADLINES: UpcomingDeadline[] = [
 { id: 'dl-1', title: 'Project Submission', dateFormatted: 'Fri, Nov 21', icon: '', color: '#EF4444' },
 { id: 'dl-2', title: 'Research Paper (Draft)', dateFormatted: 'Sun, Nov 23', icon: '', color: '#F59E0B' },
 { id: 'dl-3', title: 'API Integration', dateFormatted: 'Mon, Nov 24', icon: '', color: '#3B82F6' },
];


export function generateSeedTasksForCurrentWeek(referenceDate: Date = new Date()): GlassTask[] {
  const startOfWeek = new Date(referenceDate);
  startOfWeek.setDate(referenceDate.getDate() - referenceDate.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const getDay = (offset: number) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + offset);
    return d.getDate();
  };

  return [
    // Sunday (offset 0)
    {
      id: 'seed-task-sun-arch',
      title: 'Weekly Architecture Review',
      priority: 'medium',
      estimatedMinutes: 60,
      scheduledStartMinute: 10 * 60,
      status: 'completed',
      dayNumber: getDay(0),
    },
    {
      id: 'seed-task-sun-gym',
      title: 'Gym & Core Fitness',
      priority: 'low',
      estimatedMinutes: 45,
      scheduledStartMinute: 16 * 60 + 30,
      status: 'completed',
      dayNumber: getDay(0),
    },
    // Monday (offset 1)
    {
      id: 'seed-task-mon-pipe',
      title: 'Data Pipeline Optimization',
      priority: 'high',
      estimatedMinutes: 90,
      scheduledStartMinute: 9 * 60,
      status: 'completed',
      dayNumber: getDay(1),
    },
    {
      id: 'seed-task-mon-sync',
      title: 'Sprint Planning & Sync',
      priority: 'medium',
      estimatedMinutes: 60,
      scheduledStartMinute: 11 * 60 + 30,
      status: 'completed',
      dayNumber: getDay(1),
    },
    {
      id: 'seed-task-mon-rev',
      title: 'Peer Code Reviews',
      priority: 'medium',
      estimatedMinutes: 45,
      scheduledStartMinute: 14 * 60,
      status: 'completed',
      dayNumber: getDay(1),
    },
    // Tuesday (offset 2)
    {
      id: 'seed-task-tue-arch',
      title: 'Deep Work: Core Architecture',
      priority: 'high',
      estimatedMinutes: 90,
      scheduledStartMinute: 9 * 60,
      status: 'todo',
      dayNumber: getDay(2),
    },
    {
      id: 'seed-task-tue-api',
      title: 'API Integration & Tests',
      priority: 'medium',
      estimatedMinutes: 75,
      scheduledStartMinute: 11 * 60,
      status: 'todo',
      dayNumber: getDay(2),
    },
    {
      id: 'seed-task-tue-sync',
      title: 'Team Sync & Standup',
      priority: 'medium',
      estimatedMinutes: 45,
      scheduledStartMinute: 13 * 60 + 30,
      status: 'todo',
      dayNumber: getDay(2),
    },
    {
      id: 'seed-task-tue-feat',
      title: 'Feature Development Sprint',
      priority: 'high',
      estimatedMinutes: 75,
      scheduledStartMinute: 14 * 60 + 45,
      status: 'todo',
      dayNumber: getDay(2),
    },
    {
      id: 'seed-task-tue-qa',
      title: 'Code Review & QA Check',
      priority: 'low',
      estimatedMinutes: 60,
      scheduledStartMinute: 16 * 60 + 30,
      status: 'todo',
      dayNumber: getDay(2),
    },
    // Wednesday (offset 3)
    {
      id: 'seed-task-wed-db',
      title: 'Database Migration Review',
      priority: 'high',
      estimatedMinutes: 90,
      scheduledStartMinute: 9 * 60,
      status: 'todo',
      dayNumber: getDay(3),
    },
    {
      id: 'seed-task-wed-demo',
      title: 'Cross-Team Architecture Demo',
      priority: 'medium',
      estimatedMinutes: 45,
      scheduledStartMinute: 11 * 60,
      status: 'todo',
      dayNumber: getDay(3),
    },
    {
      id: 'seed-task-wed-sec',
      title: 'Security & Permissions Audit',
      priority: 'high',
      estimatedMinutes: 75,
      scheduledStartMinute: 14 * 60,
      status: 'todo',
      dayNumber: getDay(3),
    },
    // Thursday (offset 4)
    {
      id: 'seed-task-thu-perf',
      title: 'Performance Profiling',
      priority: 'high',
      estimatedMinutes: 90,
      scheduledStartMinute: 9 * 60 + 30,
      status: 'todo',
      dayNumber: getDay(4),
    },
    {
      id: 'seed-task-thu-ui',
      title: 'UI Polish & Component Library',
      priority: 'medium',
      estimatedMinutes: 90,
      scheduledStartMinute: 14 * 60,
      status: 'todo',
      dayNumber: getDay(4),
    },
    // Friday (offset 5)
    {
      id: 'seed-task-fri-prod',
      title: 'Production Deployment',
      priority: 'high',
      estimatedMinutes: 90,
      scheduledStartMinute: 9 * 60,
      status: 'todo',
      dayNumber: getDay(5),
    },
    {
      id: 'seed-task-fri-qa',
      title: 'QA Sign-off & Regression Tests',
      priority: 'high',
      estimatedMinutes: 60,
      scheduledStartMinute: 11 * 60 + 30,
      status: 'todo',
      dayNumber: getDay(5),
    },
    {
      id: 'seed-task-fri-demo',
      title: 'Weekly Demo & Sprint Retro',
      priority: 'medium',
      estimatedMinutes: 60,
      scheduledStartMinute: 14 * 60 + 30,
      status: 'todo',
      dayNumber: getDay(5),
    },
    // Saturday (offset 6)
    {
      id: 'seed-task-sat-retro',
      title: 'Weekly Retro & Brainstorming',
      priority: 'low',
      estimatedMinutes: 60,
      scheduledStartMinute: 10 * 60,
      status: 'todo',
      dayNumber: getDay(6),
    },
    {
      id: 'seed-task-sat-read',
      title: 'Research Reading & Exploration',
      priority: 'low',
      estimatedMinutes: 60,
      scheduledStartMinute: 14 * 60,
      status: 'todo',
      dayNumber: getDay(6),
    },
  ];
}

export const SEED_TASKS: GlassTask[] = [
  {
    id: 'seed-task-ml',
    title: 'Finish ML assignment',
    priority: 'high',
    estimatedMinutes: 90,
    scheduledStartMinute: 9 * 60, // 09:00 to 10:30
    status: 'todo',
    dayNumber: 18,
  },
  {
    id: 'seed-task-api',
    title: 'Implement API',
    priority: 'medium',
    estimatedMinutes: 90,
    scheduledStartMinute: 11 * 60, // 11:00 to 12:30
    status: 'todo',
    dayNumber: 18,
  },
  {
    id: 'seed-task-meeting',
    title: 'Team meeting',
    priority: 'low',
    estimatedMinutes: 30,
    scheduledStartMinute: 14 * 60, // 14:00 to 14:30
    status: 'todo',
    dayNumber: 18,
  },
  {
    id: 'seed-task-review',
    title: 'Code review',
    priority: 'medium',
    estimatedMinutes: 45,
    scheduledStartMinute: 14 * 60 + 45, // 14:45 to 15:30
    status: 'todo',
    dayNumber: 18,
  },
  {
    id: 'seed-task-paper',
    title: 'Read research paper',
    priority: 'medium',
    estimatedMinutes: 60,
    scheduledStartMinute: 15 * 60 + 45, // 15:45 to 16:45
    status: 'todo',
    dayNumber: 18,
  },
  {
    id: 'seed-task-gym',
    title: 'Gym / Health sprint',
    priority: 'low',
    estimatedMinutes: 45,
    scheduledStartMinute: 17 * 60, // 17:00 to 17:45
    status: 'todo',
    dayNumber: 18,
  },
  {
    id: 'seed-task-docs',
    title: 'Update documentation',
    priority: 'low',
    estimatedMinutes: 45,
    scheduledStartMinute: null, // unscheduled
    status: 'todo',
    dayNumber: 18,
  },
  {
    id: 'seed-task-weekly',
    title: 'Weekly planning prep',
    priority: 'medium',
    estimatedMinutes: 30,
    scheduledStartMinute: null, // unscheduled
    status: 'todo',
    dayNumber: 18,
  },
];

export const PRIORITY_COLORS: Record<PriorityLevel, string> = {
 high: '#EF4444',
 medium: '#F59E0B',
 low: '#3B82F6',
};

export const BLOCK_COLORS = [
 '#7C5CFF', // Violet
 '#3B82F6', // Blue
 '#F59E0B', // Amber
 '#22C55E', // Green
 '#EC4899', // Pink
 '#06B6D4', // Cyan
];

export function formatMinutesDuration(minutes: number): string {
 const h = Math.floor(minutes / 60);
 const m = minutes % 60;
 if (h === 0) return `${m}m`;
 if (m === 0) return `${h}h`;
 return `${h}h ${m}m`;
}

export function formatTimeOfDay(minute: number): string {
 const clamped = Math.max(0, Math.min(24 * 60 - 1, minute));
 const h24 = Math.floor(clamped / 60);
 const m = clamped % 60;
 return `${String(h24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatTime12Hour(date: Date): string {
 let hours = date.getHours();
 const minutes = date.getMinutes();
 const ampm = hours >= 12 ? 'PM' : 'AM';
 hours = hours % 12;
 hours = hours ? hours : 12;
 return `${hours}:${String(minutes).padStart(2, '0')} ${ampm}`;
}

export function formatDateLabel(date: Date): string {
 const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
 const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
 return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

// ----------------------------------------------------------------------------
// 1.1 Pure View-Model Functions
// ----------------------------------------------------------------------------

export function tasksToRowViewModels(tasks: GlassTask[]): TaskRowViewModel[] {
 return tasks.map((task) => {
 const isCompleted = task.status === 'completed';
 const durationFormatted = formatMinutesDuration(task.estimatedMinutes);
 const capitalizedPriority = task.priority.charAt(0).toUpperCase() + task.priority.slice(1);
 const priorityLabel = `${capitalizedPriority}, ${durationFormatted}`;
 const priorityColor = PRIORITY_COLORS[task.priority] || '#3B82F6';

 let scheduledTimeFormatted: string | null = null;
 if (task.scheduledStartMinute !== null) {
 const endMinute = task.scheduledStartMinute + task.estimatedMinutes;
 scheduledTimeFormatted = `${formatTimeOfDay(task.scheduledStartMinute)} - ${formatTimeOfDay(endMinute)}`;
 }

 return {
 id: task.id,
 title: task.title,
 priority: task.priority,
 priorityLabel,
 priorityColor,
 durationFormatted,
 isCompleted,
 scheduledTimeFormatted,
 };
 });
}

export function shortenScheduleTitle(title: string): string {
 const t = title.trim();
 if (/listening|thinking/i.test(t)) return 'Focus Sprint';
 if (/architecture/i.test(t)) return 'Core Arch';
 if (/deep work|deep focus/i.test(t)) return 'Deep Work';
 if (/research|paper/i.test(t)) return 'Research';
 if (/meeting|sync|standup/i.test(t)) return 'Team Sync';
 if (/api/i.test(t)) return 'API Integration';
 if (/code review|refactor/i.test(t)) return 'Code Review';
 if (/ml|assignment|model/i.test(t)) return 'ML Sprint';
 if (/report|documentation/i.test(t)) return 'Tech Report';
 if (/gym|health|workout/i.test(t)) return 'Gym & Health';
 if (/deploy|production/i.test(t)) return 'Deploy';
 if (/qa|test/i.test(t)) return 'QA Tests';
 if (/retro|demo/i.test(t)) return 'Retro & Demo';
 return t.length > 18 ? t.slice(0, 16) + '...' : t;
}

export function tasksToScheduleBlocks(tasks: GlassTask[]): ScheduleBlockViewModel[] {
 const scheduled = tasks.filter(
 (t) => t.scheduledStartMinute !== null && typeof t.scheduledStartMinute === 'number',
 );

 scheduled.sort((a, b) => (a.scheduledStartMinute as number) - (b.scheduledStartMinute as number));

 return scheduled.map((task, index) => {
 const startMinute = task.scheduledStartMinute as number;
 const endMinute = startMinute + task.estimatedMinutes;
 const duration = task.estimatedMinutes;

 let relativeLeftPercent: number;
 if (startMinute < WORKDAY_START_MINUTE) {
 relativeLeftPercent = 0;
 } else if (startMinute >= WORKDAY_END_MINUTE) {
 relativeLeftPercent = Math.min(94, 88 + (index % 3) * 2);
 } else {
 relativeLeftPercent = ((startMinute - WORKDAY_START_MINUTE) / WORKDAY_TOTAL_MINUTES) * 100;
 }

 const rawWidthPercent = (duration / WORKDAY_TOTAL_MINUTES) * 100;
 const widthPercent = Math.max(4.5, Math.min(100 - relativeLeftPercent, rawWidthPercent));

 const timeRangeFormatted = `${formatTimeOfDay(startMinute)} to ${formatTimeOfDay(endMinute)}`;
 const color = BLOCK_COLORS[index % BLOCK_COLORS.length];

 return {
 id: task.id,
 title: task.title,
 startMinute,
 endMinute,
 timeRangeFormatted,
 color,
 relativeLeftPercent,
 widthPercent,
 priority: task.priority,
 };
 });
}

export function calculateWorkloadDonut(
 tasks: GlassTask[],
 capacityMinutes: number = DAILY_CAPACITY_MINUTES,
): WorkloadDonutViewModel {
 const scheduledMinutes = tasks
 .filter((t) => t.scheduledStartMinute !== null && t.status !== 'completed')
 .reduce((sum, t) => sum + t.estimatedMinutes, 0);

 const completedMinutes = tasks
 .filter((t) => t.status === 'completed')
 .reduce((sum, t) => sum + t.estimatedMinutes, 0);

 const remainingCapacityMinutes = Math.max(0, capacityMinutes - scheduledMinutes - completedMinutes);
 const percentage = Math.round((scheduledMinutes / capacityMinutes) * 100);

 const segments: DonutSegment[] = [
 {
 label: 'Scheduled',
 minutes: scheduledMinutes,
 percent: Math.min(100, Math.round((scheduledMinutes / capacityMinutes) * 100)),
 formatted: formatMinutesDuration(scheduledMinutes),
 color: '#7C5CFF', // Violet
 },
 {
 label: 'Remaining',
 minutes: remainingCapacityMinutes,
 percent: Math.max(0, Math.round((remainingCapacityMinutes / capacityMinutes) * 100)),
 formatted: formatMinutesDuration(remainingCapacityMinutes),
 color: '#3B82F6', // Blue
 },
 {
 label: 'Completed',
 minutes: completedMinutes,
 percent: Math.round((completedMinutes / capacityMinutes) * 100),
 formatted: formatMinutesDuration(completedMinutes),
 color: '#22C55E', // Green
 },
 ];

 return {
 percentage,
 scheduledMinutes,
 scheduledFormatted: formatMinutesDuration(scheduledMinutes),
 remainingCapacityMinutes,
 remainingFormatted: formatMinutesDuration(remainingCapacityMinutes),
 availableCapacityMinutes: capacityMinutes,
 availableFormatted: formatMinutesDuration(capacityMinutes),
 segments,
 isOverloaded: scheduledMinutes > capacityMinutes,
 };
}

export function calculateGardenProgress(points: number, streakDays = 1): GardenProgressViewModel {
 // Levels: Level 1 (0-50), Level 2 (51-150), Level 3 (151-300), Level 4 (301-500), Level 5 (501+)
 const tiers = [
 { level: 1, min: 0, max: 50, stage: 'Sprout' },
 { level: 2, min: 50, max: 150, stage: 'Seedling' },
 { level: 3, min: 150, max: 300, stage: 'Sapling' },
 { level: 4, min: 300, max: 500, stage: 'Bloom' },
 { level: 5, min: 500, max: 1000, stage: 'Canopy' },
 ];

 const currentTier = tiers.find((t) => points >= t.min && points < t.max) || tiers[tiers.length - 1];
 const span = currentTier.max - currentTier.min;
 const progressInTier = Math.max(0, Math.min(1, (points - currentTier.min) / span));

 return {
 level: currentTier.level,
 stageName: currentTier.stage,
 points,
 progress: progressInTier,
 progressPercent: Math.round(progressInTier * 100),
 progressLabel: 'Keep it growing!',
 streakDays,
 };
}

export function generateGreetingSubtitle(tasks: GlassTask[] = SEED_TASKS, targetDay?: number): string {
  const dayTasks = targetDay !== undefined
    ? tasks.filter((t) => (t.dayNumber ?? targetDay) === targetDay)
    : tasks;
  const count = dayTasks.length;
  const highPriorityCount = dayTasks.filter((t) => t.priority === 'high').length;
  const totalMinutes = dayTasks.reduce((sum, t) => sum + (t.status !== 'completed' ? t.estimatedMinutes : 0), 0);
  const plannedHours = formatMinutesDuration(totalMinutes);
  return `You have ${count} tasks today - ${highPriorityCount} high priority - ${plannedHours} planned`;
}

export function generateGreeting(
  date: Date,
  userName = '',
  tasks: GlassTask[] = SEED_TASKS,
  targetDay?: number,
): GreetingViewModel {
  const hour = date.getHours();
  let greeting: string;
  let period: 'morning' | 'afternoon' | 'evening' | 'night';

  if (hour >= 5 && hour < 12) {
    greeting = userName ? `Good Morning, ${userName}` : 'Good Morning';
    period = 'morning';
  } else if (hour >= 12 && hour < 17) {
    greeting = userName ? `Good Afternoon, ${userName}` : 'Good Afternoon';
    period = 'afternoon';
  } else if (hour >= 17 && hour < 22) {
    greeting = userName ? `Good Evening, ${userName}` : 'Good Evening';
    period = 'evening';
  } else {
    greeting = userName ? `Good Night, ${userName}` : 'Good Night';
    period = 'night';
  }

  const subtitle = generateGreetingSubtitle(tasks, targetDay);

  return {
    greeting,
    subtitle,
    period,
    userName,
  };
}

export function getClockViewModel(date: Date): ClockViewModel {
 return {
 timeFormatted: formatTime12Hour(date),
 dateFormatted: formatDateLabel(date),
 minuteOfDay: date.getHours() * 60 + date.getMinutes(),
 };
}

export function calculateNowMarker(currentMinute: number): NowMarkerViewModel {
 const isWithinWorkday = currentMinute >= WORKDAY_START_MINUTE && currentMinute <= WORKDAY_END_MINUTE;
 const isPastWorkday = currentMinute > WORKDAY_END_MINUTE;
 const clampedMinute = Math.max(WORKDAY_START_MINUTE, Math.min(WORKDAY_END_MINUTE, currentMinute));
 const positionPercent = ((clampedMinute - WORKDAY_START_MINUTE) / WORKDAY_TOTAL_MINUTES) * 100;

 return {
 currentMinute,
 positionPercent,
 isWithinWorkday,
 isPastWorkday,
 timeFormatted: formatTimeOfDay(currentMinute),
 };
}

export function calculateFocusRing(
 remainingSeconds: number,
 totalSeconds = 25 * 60,
 mode: 'pomodoro' | 'short_break' | 'long_break' = 'pomodoro',
 isRunning = false,
): FocusRingViewModel {
 const safeRemaining = Math.max(0, remainingSeconds);
 const progress = totalSeconds > 0 ? (totalSeconds - safeRemaining) / totalSeconds : 1;
 const m = Math.floor(safeRemaining / 60);
 const s = safeRemaining % 60;
 const timeFormatted = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

 const modeLabels = {
 pomodoro: 'Pomodoro',
 short_break: 'Short Break',
 long_break: 'Long Break',
 };

 return {
 remainingSeconds: safeRemaining,
 totalSeconds,
 progress,
 timeFormatted,
 mode,
 modeLabel: modeLabels[mode],
 isRunning,
 };
}

// ----------------------------------------------------------------------------
// 1.2 Pure Interaction Logic
// ----------------------------------------------------------------------------

export function snapTo15(minute: number): number {
 const snapped = Math.round(minute / 15) * 15;
 return Math.max(WORKDAY_START_MINUTE, Math.min(WORKDAY_END_MINUTE, snapped));
}

export function clampWorkdayRange(
 startMinute: number,
 durationMinutes: number,
): { startMinute: number; endMinute: number; durationMinutes: number } {
 const safeDuration = Math.max(15, Math.min(DAILY_CAPACITY_MINUTES, durationMinutes));
 const safeStart = Math.max(WORKDAY_START_MINUTE, Math.min(WORKDAY_END_MINUTE - safeDuration, snapTo15(startMinute)));
 const endMinute = safeStart + safeDuration;
 return { startMinute: safeStart, endMinute, durationMinutes: safeDuration };
}

/**
 * Resolves overlapping tasks when a task is moved/dropped:
 * - Sorts tasks by start time
 * - Pushes later tasks forward so no collisions occur
 * - Clamps against 18:00 cutoff; tasks pushed past 18:00 become unscheduled overflow
 */
export function resolveOverlapAndPush(
 tasks: GlassTask[],
 droppedTaskId: string,
 newStartMinute: number,
): { tasks: GlassTask[]; conflictsPushed: number } {
 const updatedTasks = tasks.map((t) => ({ ...t }));
 const targetTask = updatedTasks.find((t) => t.id === droppedTaskId);
 if (!targetTask) return { tasks, conflictsPushed: 0 };

 const snappedStart = snapTo15(newStartMinute);
 targetTask.scheduledStartMinute = snappedStart;

 // Collect scheduled tasks excluding the dropped task
 const scheduled = updatedTasks
 .filter((t) => t.id !== droppedTaskId && t.scheduledStartMinute !== null)
 .sort((a, b) => (a.scheduledStartMinute as number) - (b.scheduledStartMinute as number));

 let conflictsPushed = 0;
 let cursor = targetTask.scheduledStartMinute + targetTask.estimatedMinutes;

 for (const other of scheduled) {
 const otherStart = other.scheduledStartMinute as number;
 // Check if other overlaps with the target task or preceding pushed tasks
 if (otherStart < cursor) {
 conflictsPushed++;
 const pushedStart = snapTo15(cursor);
 if (pushedStart + other.estimatedMinutes <= WORKDAY_END_MINUTE) {
 other.scheduledStartMinute = pushedStart;
 cursor = pushedStart + other.estimatedMinutes;
 } else {
 // Overflow past 18:00 -> un-schedule to tray
 other.scheduledStartMinute = null;
 }
 } else {
 cursor = otherStart + other.estimatedMinutes;
 }
 }

 return { tasks: updatedTasks, conflictsPushed };
}

export interface DropTargetDef {
 id: 'timeline' | 'list' | 'trash' | 'sticky_note';
 bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
}

export function resolveDragDropTarget(
 pos: { x: number; y: number; z: number },
 targets: DropTargetDef[],
): DropTargetDef | null {
 for (const target of targets) {
 const b = target.bounds;
 if (
 pos.x >= b.minX &&
 pos.x <= b.maxX &&
 pos.y >= b.minY &&
 pos.y <= b.maxY &&
 pos.z >= b.minZ &&
 pos.z <= b.maxZ
 ) {
 return target;
 }
 }
 return null;
}

export interface UndoItem<T> {
 state: T;
 actionDescription: string;
 timestamp: number;
}

export class UndoStack<T> {
 private stack: UndoItem<T>[] = [];
 private readonly maxSteps: number;

 constructor(maxSteps = 5) {
 this.maxSteps = maxSteps;
 }

 push(state: T, actionDescription: string): void {
 if (this.stack.length >= this.maxSteps) {
 this.stack.shift();
 }
 this.stack.push({
 state: JSON.parse(JSON.stringify(state)),
 actionDescription,
 timestamp: Date.now(),
 });
 }

 pop(): UndoItem<T> | null {
 return this.stack.pop() || null;
 }

 peek(): UndoItem<T> | null {
 return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
 }

 isAvailable(withinMs = 8000): boolean {
 const top = this.peek();
 if (!top) return false;
 return Date.now() - top.timestamp <= withinMs;
 }

 size(): number {
 return this.stack.length;
 }

 clear(): void {
 this.stack = [];
 }
}

/**
 * 3D Arc layout coordinates for the 3 columns:
 * Left column: yaw -26 deg
 * Centre column: yaw 0 deg
 * Right column: yaw +26 deg
 * All at radius 0.80m, height 1.30m, 5 deg backward pitch tilt
 */
export function computeArcTransform(
 columnIndex: -1 | 0 | 1,
 radius = 0.80,
 centerHeight = 1.30,
 pitchDeg = -5,
): { position: [number, number, number]; rotationDeg: [number, number, number] } {
 const yawAngles = {
 '-1': 26, // Left panel faces right toward user (+26 deg yaw)
 '0': 0, // Centre panel faces front
 '1': -26, // Right panel faces left toward user (-26 deg yaw)
 };

 const yawDeg = yawAngles[columnIndex.toString() as '-1' | '0' | '1'];
 const yawRad = (yawDeg * Math.PI) / 180;

 // Cylinder position: x = -radius * sin(yawRad), z = -radius * cos(yawRad)
 // When yaw is +26 deg (left), x = -0.8 * sin(26) ~= -0.35m, z ~= -0.72m
 // When yaw is 0 deg (centre), x = 0, z = -0.80m
 // When yaw is -26 deg (right), x = +0.8 * sin(26) ~= +0.35m, z ~= -0.72m
 const x = -Math.sin(yawRad) * radius;
 const z = -Math.cos(yawRad) * radius;

 return {
 position: [Number(x.toFixed(3)), centerHeight, Number(z.toFixed(3))],
 rotationDeg: [pitchDeg, yawDeg, 0],
 };
}
