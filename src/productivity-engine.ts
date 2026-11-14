export interface TaskItem {
  id: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  estimatedMinutes: number;
  scheduledStartMinute: number | null;
  status: 'todo' | 'in-progress' | 'completed';
  createdAt: number;
  completedAt: number | null;
}

export interface RecommendationResult {
  task: TaskItem | null;
  rationale: string;
}

export interface ScheduledPlanResult {
  assignments: Array<{ taskId: string; startMinute: number }>;
  overflowCount: number;
}

export interface OverlapConflict {
  taskA: TaskItem;
  taskB: TaskItem;
}

/**
 * Recommends the next best task based on:
 * 1. Currently active in-progress task (finish what you started)
 * 2. Task scheduled for current hour/time
 * 3. Priority (high > med > low) combined with quick-win momentum (shorter tasks)
 */
export function recommendWhatNext(
  tasks: TaskItem[],
  currentMinuteOfDay?: number,
): RecommendationResult {
  const pending = tasks.filter((t) => t.status !== 'completed');
  if (pending.length === 0) {
    return {
      task: null,
      rationale: 'All tasks completed for today! Take a restful break.',
    };
  }

  // Check 1: In-progress sprint
  const inProgress = pending.find((t) => t.status === 'in-progress');
  if (inProgress) {
    return {
      task: inProgress,
      rationale: `Active sprint in progress: continue "${inProgress.title}"`,
    };
  }

  // Check 2: Task scheduled for right now
  if (typeof currentMinuteOfDay === 'number') {
    const activeScheduled = pending.find(
      (t) =>
        t.scheduledStartMinute !== null &&
        currentMinuteOfDay >= t.scheduledStartMinute &&
        currentMinuteOfDay < t.scheduledStartMinute + t.estimatedMinutes,
    );
    if (activeScheduled) {
      return {
        task: activeScheduled,
        rationale: `Scheduled for right now: "${activeScheduled.title}"`,
      };
    }
  }

  // Check 3: Score remaining pending tasks
  let bestTask: TaskItem = pending[0];
  let bestScore = -1;
  let bestRationale = '';

  for (const t of pending) {
    let score = 0;
    let rationale = '';

    // Priority points
    if (t.priority === 'high') {
      score += 300;
      rationale = 'High-priority focus item to move the needle';
    } else if (t.priority === 'medium') {
      score += 200;
      rationale = 'Balanced medium-priority task';
    } else {
      score += 100;
      rationale = 'Quick low-friction task';
    }

    // Momentum bonus for short tasks (under 30 min)
    if (t.estimatedMinutes <= 25) {
      score += 40;
      rationale = `Quick ${t.estimatedMinutes}m win to build momentum`;
    }

    // Proximity bonus if scheduled today
    if (t.scheduledStartMinute !== null) {
      score += 20;
    }

    if (score > bestScore) {
      bestScore = score;
      bestTask = t;
      bestRationale = rationale;
    }
  }

  return {
    task: bestTask,
    rationale: bestRationale || `Recommended next: "${bestTask.title}"`,
  };
}

/**
 * Packs uncompleted tasks into workday hours (09:00–18:00) with 10-minute rest breaks.
 */
export function planDaySchedule(
  tasks: TaskItem[],
  workdayStartMinute = 540, // 09:00
  workdayEndMinute = 1080,  // 18:00
  breakMinutes = 10,
): ScheduledPlanResult {
  const pending = tasks.filter((t) => t.status !== 'completed');

  // Sort by priority (high > med > low), then duration (shorter first)
  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const sorted = [...pending].sort((a, b) => {
    const priDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priDiff !== 0) return priDiff;
    return a.estimatedMinutes - b.estimatedMinutes;
  });

  const assignments: Array<{ taskId: string; startMinute: number }> = [];
  let currentMinute = workdayStartMinute;
  let overflowCount = 0;

  for (const task of sorted) {
    if (currentMinute + task.estimatedMinutes <= workdayEndMinute) {
      assignments.push({ taskId: task.id, startMinute: currentMinute });
      currentMinute += task.estimatedMinutes + breakMinutes;
    } else {
      overflowCount += 1;
    }
  }

  return { assignments, overflowCount };
}

/**
 * Finds all overlapping pairs among scheduled tasks.
 */
export function detectOverlaps(tasks: TaskItem[]): OverlapConflict[] {
  const scheduled = tasks.filter(
    (t): t is TaskItem & { scheduledStartMinute: number } =>
      t.status !== 'completed' && typeof t.scheduledStartMinute === 'number',
  );

  const conflicts: OverlapConflict[] = [];

  for (let i = 0; i < scheduled.length; i++) {
    for (let j = i + 1; j < scheduled.length; j++) {
      const a = scheduled[i];
      const b = scheduled[j];
      const aEnd = a.scheduledStartMinute + a.estimatedMinutes;
      const bEnd = b.scheduledStartMinute + b.estimatedMinutes;

      if (a.scheduledStartMinute < bEnd && b.scheduledStartMinute < aEnd) {
        conflicts.push({ taskA: a, taskB: b });
      }
    }
  }

  return conflicts;
}

/**
 * Resolves schedule overlaps by shifting conflicting tasks forward sequentially.
 */
export function fixScheduleOverlaps(
  tasks: TaskItem[],
  workdayEndMinute = 1080,
  bufferMinutes = 5,
): Array<{ taskId: string; startMinute: number }> {
  const scheduled = tasks
    .filter(
      (t): t is TaskItem & { scheduledStartMinute: number } =>
        t.status !== 'completed' && typeof t.scheduledStartMinute === 'number',
    )
    .sort((a, b) => a.scheduledStartMinute - b.scheduledStartMinute);

  if (scheduled.length <= 1) return [];

  const adjustments: Array<{ taskId: string; startMinute: number }> = [];
  let prevEnd = scheduled[0].scheduledStartMinute + scheduled[0].estimatedMinutes;

  for (let i = 1; i < scheduled.length; i++) {
    const current = scheduled[i];
    if (current.scheduledStartMinute < prevEnd) {
      // Conflict: shift start to prevEnd + buffer
      const newStart = prevEnd + bufferMinutes;
      if (newStart + current.estimatedMinutes <= workdayEndMinute) {
        adjustments.push({ taskId: current.id, startMinute: newStart });
        prevEnd = newStart + current.estimatedMinutes;
      }
    } else {
      prevEnd = Math.max(prevEnd, current.scheduledStartMinute + current.estimatedMinutes);
    }
  }

  return adjustments;
}

/**
 * Formats minute of day to HH:MM format.
 */
export function formatMinuteTime(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
