export type WorkloadTask = {
  id: string;
  estimatedMinutes: number;
  scheduledStartMinute: number | null;
  status: string;
  effortSize?: 'small' | 'medium' | 'large';
  assignedSlot?: 'morning' | 'afternoon' | 'evening' | null;
};

export type WorkloadOverlap = {
  taskIds: string[];
  startMinute: number;
  endMinute: number;
};

export type WorkloadAnalysis = {
  totalEstimatedMinutes: number;
  scheduledMinutes: number;
  availableWorkingMinutes: number;
  remainingCapacityMinutes: number;
  overloadMinutes: number;
  completedMinutes: number;
  pendingMinutes: number;
  utilization: number;
  balance: 'underloaded' | 'balanced' | 'overloaded';
  overlaps: WorkloadOverlap[];
  overloadReasons: string[];
};

export type TimeRulerSlotName = 'morning' | 'afternoon' | 'evening';

export interface TimeRulerSlotAnalysis {
  name: TimeRulerSlotName;
  label: string;
  timeWindow: string;
  taskCount: number;
  totalMinutes: number;
  maxTasks: number;
  maxMinutes: number;
  isOverloaded: boolean;
  overloadReasons: string[];
  wobbleAngleDeg: number;
  tasks: WorkloadTask[];
}

export interface TimeRulerAnalysis {
  slots: Record<TimeRulerSlotName, TimeRulerSlotAnalysis>;
  totalPlannedMinutes: number;
  isAnySlotOverloaded: boolean;
  overloadedSlots: TimeRulerSlotName[];
  rebalanceSuggestions: Array<{
    taskId: string;
    fromSlot: TimeRulerSlotName;
    toSlot: TimeRulerSlotName;
    reason: string;
  }>;
}

function formatMinuteOfDay(minute: number): string {
  const hours = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function getEffortMinutes(effortSize: 'small' | 'medium' | 'large'): number {
  switch (effortSize) {
    case 'small':
      return 30;
    case 'medium':
      return 60;
    case 'large':
      return 120;
  }
}

export function getEffortSize(minutes: number): 'small' | 'medium' | 'large' {
  if (minutes <= 30) return 'small';
  if (minutes <= 60) return 'medium';
  return 'large';
}

/**
 * Maps a minute of day (0-1440) to a Time Ruler slot
 * Morning: 08:00 - 12:00 (480 - 720)
 * Afternoon: 12:00 - 16:00 (720 - 960)
 * Evening: 16:00 - 20:00 (960 - 1200)
 */
export function getSlotForMinute(startMinute: number): TimeRulerSlotName {
  if (startMinute < 720) return 'morning';
  if (startMinute < 960) return 'afternoon';
  return 'evening';
}

/**
 * 3-Slot Time Ruler analysis with overload detection and wobble angles
 */
export function analyzeTimeRuler(
  tasks: WorkloadTask[],
  maxTasksPerSlot = 3,
  maxMinutesPerSlot = 240,
): TimeRulerAnalysis {
  const slotConfigs: Record<
    TimeRulerSlotName,
    { label: string; timeWindow: string; tasks: WorkloadTask[] }
  > = {
    morning: { label: 'Morning', timeWindow: '08:00 - 12:00', tasks: [] },
    afternoon: { label: 'Afternoon', timeWindow: '12:00 - 16:00', tasks: [] },
    evening: { label: 'Evening', timeWindow: '16:00 - 20:00', tasks: [] },
  };

  tasks.forEach((task) => {
    if (task.status === 'completed') return;
    let slot: TimeRulerSlotName | null = task.assignedSlot ?? null;
    if (!slot && typeof task.scheduledStartMinute === 'number') {
      slot = getSlotForMinute(task.scheduledStartMinute);
    }
    if (slot && slotConfigs[slot]) {
      slotConfigs[slot].tasks.push(task);
    }
  });

  const slots = {} as Record<TimeRulerSlotName, TimeRulerSlotAnalysis>;
  const overloadedSlots: TimeRulerSlotName[] = [];
  let totalPlannedMinutes = 0;

  for (const key of ['morning', 'afternoon', 'evening'] as const) {
    const config = slotConfigs[key];
    const slotTasks = config.tasks;
    const taskCount = slotTasks.length;
    const totalMinutes = slotTasks.reduce(
      (sum, t) => sum + (t.estimatedMinutes || getEffortMinutes(t.effortSize ?? 'medium')),
      0,
    );
    totalPlannedMinutes += totalMinutes;

    const reasons: string[] = [];
    if (taskCount > maxTasksPerSlot) {
      reasons.push(`${taskCount} tasks exceed slot capacity of ${maxTasksPerSlot}`);
    }
    if (totalMinutes > maxMinutesPerSlot) {
      reasons.push(`${totalMinutes}m exceeds slot capacity of ${maxMinutesPerSlot}m (4h)`);
    }

    const isOverloaded = reasons.length > 0;
    if (isOverloaded) {
      overloadedSlots.push(key);
    }

    // Physical wobble angle calculation: 0 deg when balanced, up to 14 deg tilt when overloaded
    const overloadFactor = Math.max(
      taskCount / maxTasksPerSlot,
      totalMinutes / maxMinutesPerSlot,
    );
    const wobbleAngleDeg = isOverloaded
      ? Math.min(14, Math.round((overloadFactor - 1) * 12 + 6))
      : 0;

    slots[key] = {
      name: key,
      label: config.label,
      timeWindow: config.timeWindow,
      taskCount,
      totalMinutes,
      maxTasks: maxTasksPerSlot,
      maxMinutes: maxMinutesPerSlot,
      isOverloaded,
      overloadReasons: reasons,
      wobbleAngleDeg,
      tasks: slotTasks,
    };
  }

  // Generate rebalance suggestions if any slot is overloaded
  const rebalanceSuggestions: Array<{
    taskId: string;
    fromSlot: TimeRulerSlotName;
    toSlot: TimeRulerSlotName;
    reason: string;
  }> = [];

  for (const overSlot of overloadedSlots) {
    const candidateTasks = slots[overSlot].tasks;
    const underloadedSlot = (['morning', 'afternoon', 'evening'] as const).find(
      (s) => !slots[s].isOverloaded && slots[s].taskCount < maxTasksPerSlot,
    );

    if (underloadedSlot && candidateTasks.length > 0) {
      const moveable = candidateTasks[candidateTasks.length - 1];
      rebalanceSuggestions.push({
        taskId: moveable.id,
        fromSlot: overSlot,
        toSlot: underloadedSlot,
        reason: `Move to ${slots[underloadedSlot].label} to ease ${slots[overSlot].label} overload`,
      });
    }
  }

  return {
    slots,
    totalPlannedMinutes,
    isAnySlotOverloaded: overloadedSlots.length > 0,
    overloadedSlots,
    rebalanceSuggestions,
  };
}

export function analyzeWorkload(
  tasks: WorkloadTask[],
  workloadCapacityMinutes: number,
  workdayStartMinute: number,
  workdayEndMinute: number,
): WorkloadAnalysis {
  const availableWorkingMinutes = Math.max(
    0,
    Number.isFinite(workloadCapacityMinutes) ? Math.floor(workloadCapacityMinutes) : 0,
  );
  const validWorkday =
    Number.isFinite(workdayStartMinute) &&
    Number.isFinite(workdayEndMinute) &&
    workdayEndMinute > workdayStartMinute;
  const validTasks = tasks.filter(
    (task) =>
      task !== null &&
      task !== undefined &&
      typeof task.id === 'string' &&
      Number.isSafeInteger(task.estimatedMinutes) &&
      task.estimatedMinutes > 0,
  );
  const totalEstimatedMinutes = validTasks.reduce(
    (total, task) => Math.min(Number.MAX_SAFE_INTEGER, total + task.estimatedMinutes),
    0,
  );
  const completedMinutes = validTasks.reduce(
    (total, task) =>
      Math.min(
        Number.MAX_SAFE_INTEGER,
        total + (task.status === 'completed' ? task.estimatedMinutes : 0),
      ),
    0,
  );
  const pendingMinutes = validTasks.reduce(
    (total, task) =>
      Math.min(
        Number.MAX_SAFE_INTEGER,
        total + (task.status !== 'completed' ? task.estimatedMinutes : 0),
      ),
    0,
  );
  const scheduledTasks = validTasks.filter(
    (task) =>
      typeof task.scheduledStartMinute === 'number' &&
      Number.isSafeInteger(task.scheduledStartMinute) &&
      validWorkday &&
      task.scheduledStartMinute >= workdayStartMinute &&
      task.scheduledStartMinute < workdayEndMinute &&
      Number.isSafeInteger(task.scheduledStartMinute + task.estimatedMinutes) &&
      task.scheduledStartMinute + task.estimatedMinutes <= workdayEndMinute,
  );
  const scheduledMinutes = scheduledTasks.reduce(
    (total, task) => Math.min(Number.MAX_SAFE_INTEGER, total + task.estimatedMinutes),
    0,
  );
  const utilization = availableWorkingMinutes === 0
    ? 0
    : scheduledMinutes / availableWorkingMinutes;
  const overlaps: WorkloadOverlap[] = [];

  for (let firstIndex = 0; firstIndex < scheduledTasks.length; firstIndex += 1) {
    const first = scheduledTasks[firstIndex];
    const firstStart = first.scheduledStartMinute as number;
    const firstEnd = firstStart + first.estimatedMinutes;
    for (let secondIndex = firstIndex + 1; secondIndex < scheduledTasks.length; secondIndex += 1) {
      const second = scheduledTasks[secondIndex];
      const secondStart = second.scheduledStartMinute as number;
      const secondEnd = secondStart + second.estimatedMinutes;
      const overlapStart = Math.max(firstStart, secondStart);
      const overlapEnd = Math.min(firstEnd, secondEnd);
      if (overlapStart < overlapEnd) {
        overlaps.push({
          taskIds: [first.id, second.id],
          startMinute: overlapStart,
          endMinute: overlapEnd,
        });
      }
    }
  }

  const overloadReasons: string[] = [];
  const overloadMinutes = Math.max(0, scheduledMinutes - availableWorkingMinutes);
  if (overloadMinutes > 0) {
    overloadReasons.push(
      `Scheduled work exceeds daily capacity by ${overloadMinutes} minutes.`,
    );
  }
  if (overlaps.length > 0) {
    for (const overlap of overlaps) {
      overloadReasons.push(
        `Tasks ${overlap.taskIds.join(' and ')} overlap from ${formatMinuteOfDay(overlap.startMinute)} to ${formatMinuteOfDay(overlap.endMinute)}.`,
      );
    }
  }

  return {
    totalEstimatedMinutes,
    scheduledMinutes,
    availableWorkingMinutes,
    remainingCapacityMinutes: Math.max(0, availableWorkingMinutes - scheduledMinutes),
    overloadMinutes,
    completedMinutes,
    pendingMinutes,
    utilization,
    balance: utilization > 1 || overlaps.length > 0
      ? 'overloaded'
      : utilization >= 0.7
        ? 'balanced'
        : 'underloaded',
    overlaps,
    overloadReasons,
  };
}
